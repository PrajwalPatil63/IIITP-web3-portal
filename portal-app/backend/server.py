from fastapi import FastAPI, APIRouter, HTTPException
from contextlib import asynccontextmanager
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
import uuid
from datetime import datetime, timezone


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]


@asynccontextmanager
async def lifespan(app_: FastAPI):
    # startup
    yield
    # shutdown
    client.close()


app = FastAPI(title="IIIT Pune Web3 Portal API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

api_router = APIRouter(prefix="/api")


def utcnow_iso():
    return datetime.now(timezone.utc).isoformat()


# ---------- Models ----------
class Profile(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    wallet: str
    role: str = "student"  # student | teacher | admin
    name: Optional[str] = None
    department: Optional[str] = None
    avatar_url: Optional[str] = None
    created_at: str = Field(default_factory=utcnow_iso)


class ProfileUpsert(BaseModel):
    wallet: str
    role: Optional[str] = None
    name: Optional[str] = None
    department: Optional[str] = None
    avatar_url: Optional[str] = None


class ProposalMeta(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    proposal_id: int
    title: str
    description: str
    category: str = "general"  # academic | infra | events | general
    creator_wallet: str
    created_at: str = Field(default_factory=utcnow_iso)


class ProposalCreate(BaseModel):
    proposal_id: int
    title: str
    description: str
    category: str = "general"
    creator_wallet: str


class NFTListing(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    token_id: int
    title: str
    description: str
    image_url: str
    price_eth: str
    seller_wallet: str
    collection: str = "IIIT Pune Genesis"
    attributes: List[dict] = []
    sold: bool = False
    created_at: str = Field(default_factory=utcnow_iso)


class NFTCreate(BaseModel):
    token_id: int
    title: str
    description: str
    image_url: str
    price_eth: str
    seller_wallet: str
    collection: Optional[str] = "IIIT Pune Genesis"
    attributes: Optional[List[dict]] = []


class TxLog(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    wallet: str
    tx_hash: str
    type: str  # stake, unstake, swap, vote, mint, faucet, register-node
    summary: str
    chain_id: int = 11155111
    timestamp: str = Field(default_factory=utcnow_iso)


class TxLogCreate(BaseModel):
    wallet: str
    tx_hash: str
    type: str
    summary: str


class GameScore(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    wallet: str
    game_id: str  # trivia | predict | click | trace
    score: int
    reward: int  # earned IITP
    timestamp: str = Field(default_factory=utcnow_iso)


class GameScoreCreate(BaseModel):
    wallet: str
    game_id: str
    score: int
    reward: int


class NodeReg(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    wallet: str
    node_alias: str
    region: str
    endpoint: Optional[str] = ""
    status: str = "active"
    registered_at: str = Field(default_factory=utcnow_iso)


class NodeRegCreate(BaseModel):
    wallet: str
    node_alias: str
    region: str
    endpoint: Optional[str] = ""


# ---------- Routes ----------
@api_router.get("/")
async def root():
    return {"message": "IIIT Pune Web3 Portal API", "chain": "Sepolia", "chain_id": 11155111}


@api_router.get("/contracts")
async def get_contracts():
    """Returns deployed contract addresses on Sepolia."""
    return {
        "chain_id": 11155111,
        "network": "sepolia",
        "addresses": {
            "IIITPToken": "0x74c91A0c96aF5d53722a9Cacc030510354CAE6B7",
            "IIITPFaucet": "0xF1D6C079B8C822C7546263F31f40510aE2111f3B",
            "IIITPStaking": "0x13398691c8caf4C08bdE2ddCBa297135E29599Ac",
            "LiquidityPool": "0xA6491f5514Ead2eF13E99f81eeB4816Ad9774b7C",
            "NodeRegistry": "0xD1E7F51D4a38d84D4676b1C5fafb869b54B0CDaB",
            "Voting": "0x6EaB50256f67e52A038d13Ce4D9C896287f156E3",
            "IIITPBadge": "0x0BcBFF2E42B9C2f28350ed6f70EC73328e4D7811",
            "IIITPDice": "0x4839d8240ae83a5ecb27DaE3b620C5B0aea9c094",
            "IIITPMarket": "0x0BDB946c261De4778B735E6DAbd876a5dd022b2e",
        },
    }


# Profiles
@api_router.post("/profiles", response_model=Profile)
async def upsert_profile(payload: ProfileUpsert):
    wallet = payload.wallet.lower()
    existing = await db.profiles.find_one({"wallet": wallet}, {"_id": 0})
    if existing:
        update = {k: v for k, v in payload.model_dump().items() if v is not None and k != "wallet"}
        if update:
            await db.profiles.update_one({"wallet": wallet}, {"$set": update})
        merged = {**existing, **update}
        return Profile(**merged)
    profile = Profile(wallet=wallet, **{k: v for k, v in payload.model_dump().items() if k != "wallet" and v is not None})
    await db.profiles.insert_one(profile.model_dump())
    return profile


@api_router.get("/profiles/{wallet}", response_model=Profile)
async def get_profile(wallet: str):
    doc = await db.profiles.find_one({"wallet": wallet.lower()}, {"_id": 0})
    if not doc:
        # Auto-create default student profile
        profile = Profile(wallet=wallet.lower())
        await db.profiles.insert_one(profile.model_dump())
        return profile
    return Profile(**doc)


# Proposals (off-chain metadata mirroring on-chain proposals)
@api_router.post("/proposals", response_model=ProposalMeta)
async def create_proposal_meta(payload: ProposalCreate):
    meta = ProposalMeta(**payload.model_dump())
    await db.proposals.insert_one(meta.model_dump())
    return meta


@api_router.get("/proposals", response_model=List[ProposalMeta])
async def list_proposals():
    docs = await db.proposals.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return [ProposalMeta(**d) for d in docs]


# NFT Listings
@api_router.post("/nfts", response_model=NFTListing)
async def create_nft(payload: NFTCreate):
    nft = NFTListing(**payload.model_dump())
    await db.nfts.insert_one(nft.model_dump())
    return nft


@api_router.get("/nfts", response_model=List[NFTListing])
async def list_nfts():
    docs = await db.nfts.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return [NFTListing(**d) for d in docs]


@api_router.post("/nfts/{token_id}/buy")
async def buy_nft(token_id: int, buyer_wallet: str):
    res = await db.nfts.update_one(
        {"token_id": token_id, "sold": False},
        {"$set": {"sold": True, "buyer_wallet": buyer_wallet.lower()}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="NFT not found or already sold")
    return {"ok": True}


# Tx logs
@api_router.post("/tx", response_model=TxLog)
async def log_tx(payload: TxLogCreate):
    data = payload.model_dump()
    data["wallet"] = data["wallet"].lower()
    entry = TxLog(**data)
    await db.tx_logs.insert_one(entry.model_dump())
    return entry


@api_router.get("/tx/{wallet}", response_model=List[TxLog])
async def list_tx(wallet: str, limit: int = 50):
    docs = (
        await db.tx_logs.find({"wallet": wallet.lower()}, {"_id": 0})
        .sort("timestamp", -1)
        .to_list(limit)
    )
    return [TxLog(**d) for d in docs]


@api_router.get("/tx", response_model=List[TxLog])
async def list_all_tx(limit: int = 100):
    docs = await db.tx_logs.find({}, {"_id": 0}).sort("timestamp", -1).to_list(limit)
    return [TxLog(**d) for d in docs]


# Node registrations (off-chain mirror)
@api_router.post("/nodes", response_model=NodeReg)
async def register_node_meta(payload: NodeRegCreate):
    data = payload.model_dump()
    data["wallet"] = data["wallet"].lower()
    node = NodeReg(**data)
    await db.nodes.insert_one(node.model_dump())
    return node


@api_router.get("/nodes", response_model=List[NodeReg])
async def list_nodes():
    docs = await db.nodes.find({}, {"_id": 0}).sort("registered_at", -1).to_list(500)
    return [NodeReg(**d) for d in docs]


# Game scores
@api_router.post("/games/score", response_model=GameScore)
async def submit_score(payload: GameScoreCreate):
    data = payload.model_dump()
    data["wallet"] = data["wallet"].lower()
    entry = GameScore(**data)
    await db.game_scores.insert_one(entry.model_dump())
    return entry


@api_router.get("/games/leaderboard")
async def leaderboard(limit: int = 20):
    pipeline = [
        {"$group": {"_id": "$wallet", "total_reward": {"$sum": "$reward"}, "wins": {"$sum": 1}}},
        {"$sort": {"total_reward": -1}},
        {"$limit": limit},
    ]
    rows = await db.game_scores.aggregate(pipeline).to_list(limit)
    return [
        {"wallet": r["_id"], "total_reward": r["total_reward"], "wins": r["wins"]}
        for r in rows
    ]


@api_router.get("/games/scores/{wallet}", response_model=List[GameScore])
async def my_scores(wallet: str, limit: int = 50):
    docs = (
        await db.game_scores.find({"wallet": wallet.lower()}, {"_id": 0})
        .sort("timestamp", -1)
        .to_list(limit)
    )
    return [GameScore(**d) for d in docs]


# Seed defaults
@api_router.post("/seed")
async def seed_defaults():
    """Seed default proposals and NFT listings if collections are empty."""
    inserted = {"proposals": 0, "nfts": 0}

    if await db.proposals.count_documents({}) == 0:
        sample_proposals = [
            ProposalMeta(
                proposal_id=1,
                title="Upgrade Campus Wi-Fi to Wi-Fi 7",
                description="Allocate 8 ETH from treasury to upgrade dorm and lab routers to Wi-Fi 7 by next semester.",
                category="infra",
                creator_wallet="0x000000000000000000000000000000000000dEaD",
            ),
            ProposalMeta(
                proposal_id=2,
                title="Introduce Web3 Elective for All Branches",
                description="Add a 3-credit elective on Solidity, ZK proofs and DeFi engineering open across CSE/ECE/CCE.",
                category="academic",
                creator_wallet="0x000000000000000000000000000000000000dEaD",
            ),
            ProposalMeta(
                proposal_id=3,
                title="Hackathon: IIITP DeFi Open 2026",
                description="Sponsor a 48-hour on-chain hackathon with 5,000 IIITP token prize pool and mentor sessions.",
                category="events",
                creator_wallet="0x000000000000000000000000000000000000dEaD",
            ),
        ]
        await db.proposals.insert_many([p.model_dump() for p in sample_proposals])
        inserted["proposals"] = len(sample_proposals)

    if await db.nfts.count_documents({}) == 0:
        sample_nfts = [
            NFTListing(
                token_id=1,
                title="Convocation 2026 — Founders Edition",
                description="Limited Genesis NFT commemorating the 2026 IIIT Pune convocation.",
                image_url="https://images.pexels.com/photos/1148820/pexels-photo-1148820.jpeg",
                price_eth="0.05",
                seller_wallet="0x000000000000000000000000000000000000dEaD",
                attributes=[{"trait_type": "Edition", "value": "Founders"}, {"trait_type": "Year", "value": "2026"}],
            ),
            NFTListing(
                token_id=2,
                title="Pune Skyline Cyber Pass",
                description="Cyberpunk Pune skyline pass — unlocks campus events.",
                image_url="https://images.pexels.com/photos/9967912/pexels-photo-9967912.jpeg",
                price_eth="0.025",
                seller_wallet="0x000000000000000000000000000000000000dEaD",
                attributes=[{"trait_type": "Type", "value": "Access Pass"}],
            ),
            NFTListing(
                token_id=3,
                title="Genesis Node Operator Badge",
                description="Awarded to early node operators of the IIITP testnet.",
                image_url="https://images.pexels.com/photos/30547584/pexels-photo-30547584.jpeg",
                price_eth="0.1",
                seller_wallet="0x000000000000000000000000000000000000dEaD",
                attributes=[{"trait_type": "Tier", "value": "Genesis"}],
            ),
            NFTListing(
                token_id=4,
                title="Ethereum Validator Sticker",
                description="Animated holographic sticker — proof of validator dedication.",
                image_url="https://images.pexels.com/photos/14911398/pexels-photo-14911398.jpeg",
                price_eth="0.015",
                seller_wallet="0x000000000000000000000000000000000000dEaD",
                attributes=[{"trait_type": "Rarity", "value": "Rare"}],
            ),
        ]
        await db.nfts.insert_many([n.model_dump() for n in sample_nfts])
        inserted["nfts"] = len(sample_nfts)

    return {"ok": True, "inserted": inserted}


app.include_router(api_router)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)
