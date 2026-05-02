// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "./IIITPToken.sol";

/**
 * @title IIITPStaking
 * @notice Stake I3TP tokens to earn rewards.
 *
 * Mechanics:
 *   - Users stake any amount of I3TP for a chosen lock duration
 *   - Three tiers: FLEXIBLE (0 days), STANDARD (30 days), LONG (90 days)
 *   - APY per tier: 5% / 12% / 25%
 *   - Teachers who stake >= TEACHER_THRESHOLD get TEACHER role on-chain
 *   - Rewards are minted fresh (Staking must hold MINTER_ROLE)
 *   - Early unstake from locked tiers incurs 10% penalty (burned)
 */
contract IIITPStaking is ReentrancyGuard, Pausable, AccessControl {

    // ── Roles ────────────────────────────────────────────
    bytes32 public constant MANAGER_ROLE = keccak256("MANAGER_ROLE");

    // ── Token ────────────────────────────────────────────
    IIITPToken public immutable token;

    // ── Tiers ────────────────────────────────────────────
    enum Tier { FLEXIBLE, STANDARD, LONG }

    struct TierConfig {
        uint256 lockDuration;   // seconds
        uint256 apyBps;         // basis points (100 bps = 1%)
    }

    mapping(Tier => TierConfig) public tiers;

    // ── Teacher threshold ─────────────────────────────────
    uint256 public teacherThreshold = 1_000 * 10 ** 18; // 1000 I3TP

    // ── Stake position ────────────────────────────────────
    struct StakePosition {
        uint256 amount;
        uint256 stakedAt;
        uint256 unlockAt;
        Tier    tier;
        bool    active;
    }

    // user => array of positions
    mapping(address => StakePosition[]) public positions;

    // total staked across all users
    uint256 public totalStaked;

    // teacher status granted by staking
    mapping(address => bool) public isTeacherByStaking;

    // ── Events ───────────────────────────────────────────
    event Staked(address indexed user, uint256 positionId, uint256 amount, Tier tier);
    event Unstaked(address indexed user, uint256 positionId, uint256 amount, uint256 reward, uint256 penalty);
    event RewardClaimed(address indexed user, uint256 positionId, uint256 reward);
    event TeacherStatusGranted(address indexed user);
    event TeacherStatusRevoked(address indexed user);
    event TeacherThresholdUpdated(uint256 newThreshold);

    // ── Constructor ──────────────────────────────────────
    constructor(address tokenAddress) {
        require(tokenAddress != address(0), "Staking: zero token");
        token = IIITPToken(tokenAddress);

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MANAGER_ROLE,       msg.sender);

        // Configure tiers
        tiers[Tier.FLEXIBLE] = TierConfig({ lockDuration: 0,          apyBps: 500  });   // 5%
        tiers[Tier.STANDARD] = TierConfig({ lockDuration: 30 days,    apyBps: 1200 });   // 12%
        tiers[Tier.LONG]     = TierConfig({ lockDuration: 90 days,    apyBps: 2500 });   // 25%
    }

    // ── Stake ─────────────────────────────────────────────
    /**
     * @notice Stake `amount` I3TP into a tier.
     * @param amount Amount to stake (in wei)
     * @param tier   0=FLEXIBLE, 1=STANDARD, 2=LONG
     */
    function stake(uint256 amount, Tier tier) external nonReentrant whenNotPaused {
        require(amount > 0, "Staking: zero amount");

        token.transferFrom(msg.sender, address(this), amount);

        TierConfig memory cfg = tiers[tier];
        uint256 unlockAt = block.timestamp + cfg.lockDuration;

        positions[msg.sender].push(StakePosition({
            amount:    amount,
            stakedAt:  block.timestamp,
            unlockAt:  unlockAt,
            tier:      tier,
            active:    true
        }));

        totalStaked += amount;

        _updateTeacherStatus(msg.sender);

        emit Staked(msg.sender, positions[msg.sender].length - 1, amount, tier);
    }

    // ── Unstake ───────────────────────────────────────────
    /**
     * @notice Unstake a position and claim rewards.
     *         Early unstake from locked tiers incurs 10% penalty on principal.
     * @param positionId Index in positions[msg.sender]
     */
    function unstake(uint256 positionId) external nonReentrant whenNotPaused {
        StakePosition storage pos = positions[msg.sender][positionId];
        require(pos.active, "Staking: not active");

        pos.active = false;
        totalStaked -= pos.amount;

        uint256 reward  = _calculateReward(pos);
        uint256 penalty = 0;

        bool earlyExit = block.timestamp < pos.unlockAt;

        if (earlyExit && pos.tier != Tier.FLEXIBLE) {
            penalty = pos.amount * 10 / 100;  // 10% penalty
            token.burn(penalty);
        }

        uint256 returnAmount = pos.amount - penalty;

        // Return principal
        require(token.transfer(msg.sender, returnAmount), "Staking: transfer failed");

        // Mint reward (no reward on early exit)
        if (!earlyExit && reward > 0) {
            token.mint(msg.sender, reward);
        }

        _updateTeacherStatus(msg.sender);

        emit Unstaked(msg.sender, positionId, returnAmount, earlyExit ? 0 : reward, penalty);
    }

    // ── Claim reward only (FLEXIBLE tier) ────────────────
    /**
     * @notice Claim accrued reward for a FLEXIBLE position without unstaking.
     */
    function claimReward(uint256 positionId) external nonReentrant whenNotPaused {
        StakePosition storage pos = positions[msg.sender][positionId];
        require(pos.active, "Staking: not active");
        require(pos.tier == Tier.FLEXIBLE, "Staking: use unstake for locked tiers");

        uint256 reward = _calculateReward(pos);
        require(reward > 0, "Staking: no reward");

        // Reset stakedAt so rewards don't double-count
        pos.stakedAt = block.timestamp;

        token.mint(msg.sender, reward);

        emit RewardClaimed(msg.sender, positionId, reward);
    }

    // ── View functions ────────────────────────────────────
    function getPositions(address user) external view returns (StakePosition[] memory) {
        return positions[user];
    }

    function getPositionCount(address user) external view returns (uint256) {
        return positions[user].length;
    }

    function pendingReward(address user, uint256 positionId) external view returns (uint256) {
        StakePosition storage pos = positions[user][positionId];
        if (!pos.active) return 0;
        return _calculateReward(pos);
    }

    function totalStakedByUser(address user) external view returns (uint256 total) {
        for (uint256 i = 0; i < positions[user].length; i++) {
            if (positions[user][i].active) {
                total += positions[user][i].amount;
            }
        }
    }

    // ── Internal ──────────────────────────────────────────
    function _calculateReward(StakePosition storage pos) internal view returns (uint256) {
        uint256 duration  = block.timestamp - pos.stakedAt;
        uint256 apyBps    = tiers[pos.tier].apyBps;
        // reward = amount * apyBps * duration / (365 days * 10000)
        return pos.amount * apyBps * duration / (365 days * 10_000);
    }

    function _updateTeacherStatus(address user) internal {
        uint256 total = 0;
        for (uint256 i = 0; i < positions[user].length; i++) {
            if (positions[user][i].active) {
                total += positions[user][i].amount;
            }
        }

        bool qualifies = total >= teacherThreshold;
        if (qualifies && !isTeacherByStaking[user]) {
            isTeacherByStaking[user] = true;
            emit TeacherStatusGranted(user);
        } else if (!qualifies && isTeacherByStaking[user]) {
            isTeacherByStaking[user] = false;
            emit TeacherStatusRevoked(user);
        }
    }

    // ── Admin ─────────────────────────────────────────────
    function setTeacherThreshold(uint256 threshold) external onlyRole(MANAGER_ROLE) {
        teacherThreshold = threshold;
        emit TeacherThresholdUpdated(threshold);
    }

    function setTierAPY(Tier tier, uint256 apyBps) external onlyRole(MANAGER_ROLE) {
        tiers[tier].apyBps = apyBps;
    }

    function pause()   external onlyRole(DEFAULT_ADMIN_ROLE) { _pause(); }
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) { _unpause(); }
}
