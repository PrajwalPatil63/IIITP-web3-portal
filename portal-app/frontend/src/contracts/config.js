// IIIT Pune Web3 Portal — Sepolia Contract Configuration
// ABIs match the EXACT deployed Solidity contracts on Sepolia.
import TokenArtifact from "../abis/IIITPToken.json";
import FaucetArtifact from "../abis/IIITPFaucet.json";
import StakingArtifact from "../abis/IIITPStaking.json";
import LiquidityArtifact from "../abis/IIITPLiquidityPool.json";
import NodeArtifact from "../abis/IIITPNodeRegistry.json";
import VotingArtifact from "../abis/IIITPVoting.json";
import BadgeArtifact from "../abis/IIITPBadge.json";
import DiceArtifact from "../abis/IIITPDice.json";
import MarketArtifact from "../abis/IIITPMarket.json";
export const CHAIN_ID = 11155111;
export const CHAIN_ID_HEX = "0xaa36a7";
export const NETWORK_NAME = "Sepolia";
export const EXPLORER_URL = "https://sepolia.etherscan.io";

export const ADDRESSES = {
    IIITPToken: "0x08757A4fC8e83C7f1b660a6549b5DDCA237A6A2a",
    IIITPFaucet: "0x18dEA72C62Ad92Cc434A6680D38ba43669FC4a62",
    IIITPStaking: "0xF375E5529294786FBe78d3830958B42F3dD53066",
    LiquidityPool: "0x2537Eb0Ff445FE11b1d55338ed52D193eE6b37eC",
    NodeRegistry: "0xd7fFe60EAA65daEe440dcd0fF7B2E630ebCcC534",
    Voting: "0x905295A2231072535255Ea164A55e6e1C9447c0c",
    IIITPBadge: "0xfA25e7059BdFC21E65F5F4E9C827D2E9Ff08a3C0",
    IIITPDice: "0x6350607E8eb0A783eC43f62993D0c98540F32F7B",
    IIITPMarket: "0x05Ad211720c2a7790155Fb0b53a46Cc442fb4193",
};

export const ADMIN_WALLETS = [
    "0x6d290aeae04ed087bfa96370a723b800fdf02e89",
];

// Target reference price: 1000 IITP = 0.01 Sepolia ETH
export const TARGET_IITP_PER_ETH = 100_000; // 1 ETH = 100,000 IITP
export const TARGET_ETH_PER_IITP = 0.00001;

export const TIERS = [
    { id: 0, key: "FLEXIBLE", label: "Flexible", lockLabel: "No lock", apy: "5%" },
    { id: 1, key: "STANDARD", label: "Standard", lockLabel: "30 days", apy: "12%" },
    { id: 2, key: "LONG", label: "Long", lockLabel: "90 days", apy: "25%" },
];

export const PROPOSAL_CATEGORIES = ["governance", "treasury", "technical", "academic"];
export const PROPOSAL_STATUS = ["PENDING", "ACTIVE", "PASSED", "REJECTED", "EXECUTED"];
export const VOTE_CHOICE = { AGAINST: 0, FOR: 1, ABSTAIN: 2 };
export const VOTE_CHOICE_LABELS = ["AGAINST", "FOR", "ABSTAIN"];

export const DICE_BET = { OVER: 0, UNDER: 1, EXACT: 2 };
export const DICE_BET_LABELS = ["OVER", "UNDER", "EXACT"];

export const BADGE_TIERS = ["COMMON", "RARE", "EPIC", "LEGENDARY"];
export const BADGE_TIER_COLORS = {
    COMMON: "text-slate-300 border-slate-400/40",
    RARE: "text-cyan-300 border-cyan-400/60",
    EPIC: "text-pink-400 border-pink-400/60",
    LEGENDARY: "text-cyber-yellow border-cyber-yellow/60",
};

export const NODE_STATUS = ["INACTIVE", "ACTIVE", "SLASHED"];

// ---------- ABIs ----------

export const ERC20_ABI = [
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
    "function totalSupply() view returns (uint256)",
    "function balanceOf(address) view returns (uint256)",
    "function balanceOfAt(address account, uint256 snapshotId) view returns (uint256)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function transfer(address to, uint256 amount) returns (bool)",
    "function mint(address to, uint256 amount)",
    "function burn(uint256 amount)",
    "event Transfer(address indexed from, address indexed to, uint256 value)",
    "event Approval(address indexed owner, address indexed spender, uint256 value)",
];

export const FAUCET_ABI = [
    "function studentDrip() view returns (uint256)",
    "function teacherDrip() view returns (uint256)",
    "function cooldown() view returns (uint256)",
    "function lastClaim(address) view returns (uint256)",
    "function isTeacher(address) view returns (bool)",
    "function claim()",
    "function timeUntilNextClaim(address user) view returns (uint256)",
    "function canClaim(address user) view returns (bool)",
    "function setTeacher(address account, bool status)",
    "function setDrip(uint256 _studentDrip, uint256 _teacherDrip)",
    "function setCooldown(uint256 _cooldown)",
    "event Claimed(address indexed user, uint256 amount, bool teacher)",
];

export const STAKING_ABI = [
    "function totalStaked() view returns (uint256)",
    "function teacherThreshold() view returns (uint256)",
    "function isTeacherByStaking(address) view returns (bool)",
    "function tiers(uint8) view returns (uint256 lockDuration, uint256 apyBps)",
    "function stake(uint256 amount, uint8 tier)",
    "function unstake(uint256 positionId)",
    "function claimReward(uint256 positionId)",
    "function getPositions(address user) view returns (tuple(uint256 amount, uint256 stakedAt, uint256 unlockAt, uint8 tier, bool active)[])",
    "function getPositionCount(address user) view returns (uint256)",
    "function pendingReward(address user, uint256 positionId) view returns (uint256)",
    "function totalStakedByUser(address user) view returns (uint256)",
    "function setTeacherThreshold(uint256 threshold)",
    "function setTierAPY(uint8 tier, uint256 apyBps)",
    "event Staked(address indexed user, uint256 positionId, uint256 amount, uint8 tier)",
    "event Unstaked(address indexed user, uint256 positionId, uint256 amount, uint256 reward, uint256 penalty)",
];

export const LP_ABI = [
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function totalSupply() view returns (uint256)",
    "function balanceOf(address) view returns (uint256)",
    "function reserveToken() view returns (uint256)",
    "function reserveETH() view returns (uint256)",
    "function getReserves() view returns (uint256 reserveToken, uint256 reserveETH)",
    "function getTokenPrice() view returns (uint256 ethPerToken)",
    "function getAmountOutTokenForETH(uint256 tokenIn) view returns (uint256)",
    "function getAmountOutETHForToken(uint256 ethIn) view returns (uint256)",
    "function addLiquidity(uint256 tokenAmount) payable",
    "function removeLiquidity(uint256 lpAmount)",
    "function swapTokenForETH(uint256 tokenIn, uint256 minEthOut)",
    "function swapETHForToken(uint256 minTokenOut) payable",
];

export const NODE_REGISTRY_ABI = [
    "function nodeStakeRequired() view returns (uint256)",
    "function nodeRewardPerEpoch() view returns (uint256)",
    "function maxNodes() view returns (uint256)",
    "function activeNodeCount() view returns (uint256)",
    "function ownerToNodeId(address) view returns (uint256)",
    "function registerNode(string name, string nodeType)",
    "function deregisterNode()",
    "function getNode(uint256 nodeId) view returns (tuple(uint256 nodeId, address owner, string name, string nodeType, uint256 registeredAt, uint256 lastRewardAt, uint256 totalRewards, uint256 stake, uint8 status))",
    "function getActiveNodes() view returns (tuple(uint256 nodeId, address owner, string name, string nodeType, uint256 registeredAt, uint256 lastRewardAt, uint256 totalRewards, uint256 stake, uint8 status)[])",
    "function isActiveNode(address user) view returns (bool)",
    "function distributeEpochRewards(uint256 epochNumber)",
    "function slashNode(uint256 nodeId)",
    "function setNodeStakeRequired(uint256 amount)",
    "function setNodeRewardPerEpoch(uint256 amount)",
    "function setMaxNodes(uint256 max)",
];

// New Voting contract with role-weighted formula
export const VOTING_ABI = [
    "function wToken() view returns (uint256)",
    "function wStake() view returns (uint256)",
    "function wNode() view returns (uint256)",
    "function wRole() view returns (uint256)",
    "function quorumBps() view returns (uint256)",
    "function passBps() view returns (uint256)",
    "function votingDuration() view returns (uint256)",
    "function minProposerStake() view returns (uint256)",
    "function proposalCount() view returns (uint256)",
    "function createProposal(string title, string description, string category) returns (uint256)",
    "function castVote(uint256 proposalId, uint8 choice)",
    "function finalizeProposal(uint256 proposalId)",
    "function executeProposal(uint256 proposalId)",
    "function calculateVotingWeight(address voter, uint256 snapshotId) view returns (uint256)",
    "function getProposal(uint256 proposalId) view returns (tuple(uint256 id, address proposer, string title, string description, string category, uint256 snapshotId, uint256 startTime, uint256 endTime, uint256 forVotes, uint256 againstVotes, uint256 abstainVotes, uint256 totalVoters, uint8 status))",
    "function getAllProposals() view returns (tuple(uint256 id, address proposer, string title, string description, string category, uint256 snapshotId, uint256 startTime, uint256 endTime, uint256 forVotes, uint256 againstVotes, uint256 abstainVotes, uint256 totalVoters, uint8 status)[])",
    "function getActiveProposals() view returns (tuple(uint256 id, address proposer, string title, string description, string category, uint256 snapshotId, uint256 startTime, uint256 endTime, uint256 forVotes, uint256 againstVotes, uint256 abstainVotes, uint256 totalVoters, uint8 status)[])",
    "function getVoteRecord(uint256 proposalId, address voter) view returns (tuple(bool hasVoted, uint8 choice, uint256 weight))",
    "event ProposalCreated(uint256 indexed id, address indexed proposer, string title, uint256 snapshotId)",
    "event VoteCast(uint256 indexed proposalId, address indexed voter, uint8 choice, uint256 weight)",
    "event ProposalFinalized(uint256 indexed id, uint8 status, uint256 forVotes, uint256 againstVotes)",
];

export const DICE_ABI = [
    "function minBet() view returns (uint256)",
    "function maxBetBps() view returns (uint256)",
    "function houseEdgeBps() view returns (uint256)",
    "function totalWagered() view returns (uint256)",
    "function totalPaidOut() view returns (uint256)",
    "function totalRolls() view returns (uint256)",
    "function houseBalance() view returns (uint256)",
    "function maxBetAmount() view returns (uint256)",
    "function totalWon(address) view returns (uint256)",
    "function totalLost(address) view returns (uint256)",
    "function roll(uint256 wager, uint8 betType, uint8 target) returns (uint256)",
    "function getHistory(address player) view returns (tuple(uint256 roll, uint256 wager, uint256 payout, uint8 betType, uint8 target, bool won, uint256 timestamp)[])",
    "function getStats() view returns (uint256 rolls, uint256 wagered, uint256 paidOut, uint256 houseProfit)",
    "event Rolled(address indexed player, uint256 roll, uint8 betType, uint8 target, uint256 wager, uint256 payout, bool won)",
];

export const BADGE_ABI = [
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function balanceOf(address) view returns (uint256)",
    "function ownerOf(uint256) view returns (address)",
    "function tokenURI(uint256) view returns (string)",
    "function totalMinted() view returns (uint256)",
    "function getBadgeTypeCount() view returns (uint256)",
    "function getAllBadgeTypes() view returns (tuple(string name, string category, uint8 tier, uint256 mintPrice, uint256 maxSupply, uint256 minted, bool active)[])",
    "function hasMinted(address user, uint256 badgeTypeId) view returns (bool)",
    "function badgeTypes(uint256) view returns (string name, string category, uint8 tier, uint256 mintPrice, uint256 maxSupply, uint256 minted, bool active)",
    "function badgeMeta(uint256) view returns (uint256 badgeTypeId, uint256 mintedAt, address mintedBy)",
    "function getOwnedTokens(address owner) view returns (uint256[])",
    "function mint(uint256 badgeTypeId, string uri) returns (uint256)",
    "function airdrop(address to, uint256 badgeTypeId, string uri) returns (uint256)",
    "function createBadgeType(string name, string category, uint8 tier, uint256 mintPrice, uint256 maxSupply) returns (uint256)",
    "event BadgeMinted(uint256 indexed tokenId, uint256 indexed badgeTypeId, address indexed to)",
];

export const MARKET_ABI = [
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function totalMinted() view returns (uint256)",
    "function mintFee() view returns (uint256)",
    "function platformFeeBps() view returns (uint256)",
    "function isTeacher(address account) view returns (bool)",
    "function nftInfo(uint256) view returns (address creator, uint256 mintedAt, string imageURI, string name)",
    "function listings(uint256) view returns (address seller, uint256 price, bool active)",
    "function ownerOf(uint256) view returns (address)",
    "function balanceOf(address) view returns (uint256)",
    "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
    "function getOwnedTokens(address owner) view returns (uint256[])",
    "function getAllListings() view returns (uint256[] tokenIds, address[] sellers, uint256[] prices, string[] imageURIs, string[] names)",
    "function mint(string imageURI, string name) returns (uint256)",
    "function list(uint256 tokenId, uint256 price)",
    "function delist(uint256 tokenId)",
    "function buy(uint256 tokenId)",
    "function approve(address to, uint256 tokenId)",
    "function getApproved(uint256 tokenId) view returns (address)",
    "function setApprovalForAll(address operator, bool approved)",
    "function isApprovedForAll(address owner, address operator) view returns (bool)",
    "function setTeacher(address account, bool status)",
    "function setMintFee(uint256 fee)",
    "event Minted(uint256 indexed tokenId, address indexed creator, string imageURI, string name, bool teacherMint)",
    "event Listed(uint256 indexed tokenId, address indexed seller, uint256 price)",
    "event Sold(uint256 indexed tokenId, address indexed seller, address indexed buyer, uint256 price)",
];
export const CONTRACTS = {
    IIITPToken: { address: ADDRESSES.IIITPToken, abi: TokenArtifact.abi },
    IIITPFaucet: { address: ADDRESSES.IIITPFaucet, abi: FaucetArtifact.abi },
    IIITPStaking: { address: ADDRESSES.IIITPStaking, abi: StakingArtifact.abi },
    LiquidityPool: { address: ADDRESSES.LiquidityPool, abi: LiquidityArtifact.abi },
    NodeRegistry: { address: ADDRESSES.NodeRegistry, abi: NodeArtifact.abi },
    Voting: { address: ADDRESSES.Voting, abi: VotingArtifact.abi },
    IIITPBadge: { address: ADDRESSES.IIITPBadge, abi: BadgeArtifact.abi },
    IIITPDice: { address: ADDRESSES.IIITPDice, abi: DiceArtifact.abi },
    IIITPMarket: { address: ADDRESSES.IIITPMarket, abi: MarketArtifact.abi },
};