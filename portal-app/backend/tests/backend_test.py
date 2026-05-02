"""
Backend tests for IIIT Pune Web3 Portal API.
Covers health, contracts, seed, proposals, nfts, profiles, tx, nodes, nft buy.
"""
import os
import time
import pytest
import requests
from pathlib import Path

# Load REACT_APP_BACKEND_URL from frontend/.env
FRONTEND_ENV = Path(__file__).resolve().parents[2] / "frontend" / ".env"
BASE_URL = None
if FRONTEND_ENV.exists():
    for line in FRONTEND_ENV.read_text().splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
            break
assert BASE_URL, "REACT_APP_BACKEND_URL must be set"

API = f"{BASE_URL}/api"
TS = int(time.time())


@pytest.fixture(scope="session")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ---------- Health ----------
class TestHealth:
    def test_root(self, client):
        r = client.get(f"{API}/")
        assert r.status_code == 200
        d = r.json()
        assert d["chain"] == "Sepolia"
        assert d["chain_id"] == 11155111
        assert "IIIT" in d.get("message", "")


# ---------- Contracts ----------
class TestContracts:
    def test_contracts(self, client):
        r = client.get(f"{API}/contracts")
        assert r.status_code == 200
        d = r.json()
        assert d["chain_id"] == 11155111
        assert d["network"] == "sepolia"
        addrs = d["addresses"]
        expected = {
            "IIITPToken": "0x74c91A0c96aF5d53722a9Cacc030510354CAE6B7",
            "IIITPFaucet": "0xF1D6C079B8C822C7546263F31f40510aE2111f3B",
            "IIITPStaking": "0x13398691c8caf4C08bdE2ddCBa297135E29599Ac",
            "LiquidityPool": "0xA6491f5514Ead2eF13E99f81eeB4816Ad9774b7C",
            "NodeRegistry": "0xD1E7F51D4a38d84D4676b1C5fafb869b54B0CDaB",
            "Voting": "0x6EaB50256f67e52A038d13Ce4D9C896287f156E3",
        }
        for k, v in expected.items():
            assert addrs.get(k) == v


# ---------- Seed (idempotent) ----------
class TestSeed:
    def test_seed_first(self, client):
        r = client.post(f"{API}/seed")
        assert r.status_code == 200
        d = r.json()
        assert d["ok"] is True
        assert "inserted" in d

    def test_seed_idempotent(self, client):
        r = client.post(f"{API}/seed")
        assert r.status_code == 200
        d = r.json()
        # On 2nd call collections are non-empty so 0 inserted
        assert d["inserted"]["proposals"] == 0
        assert d["inserted"]["nfts"] == 0


# ---------- Proposals ----------
class TestProposals:
    def test_list_after_seed(self, client):
        r = client.get(f"{API}/proposals")
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        assert len(items) >= 3
        assert all("title" in p and "proposal_id" in p for p in items)

    def test_create_proposal(self, client):
        payload = {
            "proposal_id": 9000 + TS % 1000,
            "title": "TEST_Proposal",
            "description": "TEST proposal desc",
            "category": "general",
            "creator_wallet": "0xTESTcreator",
        }
        r = client.post(f"{API}/proposals", json=payload)
        assert r.status_code == 200
        d = r.json()
        assert d["title"] == "TEST_Proposal"
        assert d["proposal_id"] == payload["proposal_id"]


# ---------- NFTs ----------
class TestNFTs:
    def test_list_nfts(self, client):
        r = client.get(f"{API}/nfts")
        assert r.status_code == 200
        items = r.json()
        assert len(items) >= 4
        assert all("token_id" in n for n in items)

    def test_create_and_buy_nft(self, client):
        token_id = 50000 + TS % 10000
        payload = {
            "token_id": token_id,
            "title": "TEST_NFT",
            "description": "test",
            "image_url": "https://example.com/x.jpg",
            "price_eth": "0.01",
            "seller_wallet": "0xTESTseller",
        }
        r = client.post(f"{API}/nfts", json=payload)
        assert r.status_code == 200
        # Buy
        r2 = client.post(f"{API}/nfts/{token_id}/buy", params={"buyer_wallet": "0xBUYER"})
        assert r2.status_code == 200
        assert r2.json()["ok"] is True
        # Second buy must be 404
        r3 = client.post(f"{API}/nfts/{token_id}/buy", params={"buyer_wallet": "0xBUYER2"})
        assert r3.status_code == 404


# ---------- Profiles ----------
class TestProfiles:
    def test_upsert_and_get(self, client):
        wallet = f"0xTESTwallet{TS}"
        r = client.post(f"{API}/profiles", json={
            "wallet": wallet, "role": "teacher", "name": "Test Prof"
        })
        assert r.status_code == 200
        d = r.json()
        assert d["wallet"] == wallet.lower()
        assert d["role"] == "teacher"
        assert d["name"] == "Test Prof"
        # GET
        r2 = client.get(f"{API}/profiles/{wallet}")
        assert r2.status_code == 200
        d2 = r2.json()
        assert d2["wallet"] == wallet.lower()
        assert d2["role"] == "teacher"

    def test_auto_create_default(self, client):
        wallet = f"0xTESTauto{TS}"
        r = client.get(f"{API}/profiles/{wallet}")
        assert r.status_code == 200
        d = r.json()
        assert d["wallet"] == wallet.lower()
        assert d["role"] == "student"  # default


# ---------- Tx logs ----------
class TestTx:
    def test_log_and_list(self, client):
        wallet = f"0xTESTtx{TS}"
        for i in range(2):
            r = client.post(f"{API}/tx", json={
                "wallet": wallet,
                "tx_hash": f"0xhash{i}{TS}",
                "type": "stake",
                "summary": f"TEST stake {i}",
            })
            assert r.status_code == 200
            assert r.json()["chain_id"] == 11155111
        # Per-wallet
        r2 = client.get(f"{API}/tx/{wallet}")
        assert r2.status_code == 200
        items = r2.json()
        assert len(items) >= 2
        # sort desc check
        ts = [x["timestamp"] for x in items]
        assert ts == sorted(ts, reverse=True)
        # Global
        r3 = client.get(f"{API}/tx")
        assert r3.status_code == 200
        assert isinstance(r3.json(), list)


# ---------- Nodes ----------
class TestNodes:
    def test_register_and_list(self, client):
        wallet = f"0xTESTnode{TS}"
        r = client.post(f"{API}/nodes", json={
            "wallet": wallet,
            "node_alias": f"TEST_node_{TS}",
            "region": "asia-south1",
            "endpoint": "https://node.example.com",
        })
        assert r.status_code == 200
        d = r.json()
        assert d["wallet"] == wallet.lower()
        assert d["status"] == "active"
        # List
        r2 = client.get(f"{API}/nodes")
        assert r2.status_code == 200
        items = r2.json()
        assert any(n["wallet"] == wallet.lower() for n in items)



# ---------- Games ----------
class TestGames:
    def test_submit_score_and_history(self, client):
        wallet = f"0xTESTgame{TS}"
        # submit two scores
        for i, (game, score, reward) in enumerate([("trivia", 80, 50), ("predict", 100, 75)]):
            r = client.post(f"{API}/games/score", json={
                "wallet": wallet,
                "game_id": game,
                "score": score,
                "reward": reward,
            })
            assert r.status_code == 200, r.text
            d = r.json()
            assert d["wallet"] == wallet.lower()
            assert d["game_id"] == game
            assert d["score"] == score
            assert d["reward"] == reward
        # History
        r2 = client.get(f"{API}/games/scores/{wallet}")
        assert r2.status_code == 200
        items = r2.json()
        assert len(items) >= 2
        # sorted desc by timestamp
        ts = [x["timestamp"] for x in items]
        assert ts == sorted(ts, reverse=True)

    def test_leaderboard_aggregation(self, client):
        wallet = f"0xTESTLB{TS}"
        # Add scores that should aggregate
        for reward in [40, 60]:
            r = client.post(f"{API}/games/score", json={
                "wallet": wallet,
                "game_id": "click",
                "score": 10,
                "reward": reward,
            })
            assert r.status_code == 200
        r2 = client.get(f"{API}/games/leaderboard", params={"limit": 100})
        assert r2.status_code == 200
        rows = r2.json()
        assert isinstance(rows, list)
        # Find our wallet aggregated
        match = [x for x in rows if x["wallet"] == wallet.lower()]
        assert len(match) == 1
        assert match[0]["total_reward"] >= 100
        assert match[0]["wins"] >= 2
        # Ensure sorted desc by total_reward
        totals = [x["total_reward"] for x in rows]
        assert totals == sorted(totals, reverse=True)
