// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

interface I_IIITPToken {
    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) external returns (bool);

    function transfer(address to, uint256 amount) external returns (bool);

    function balanceOf(address account) external view returns (uint256);
}

/**
 * @title IIITPDice
 * @notice On-chain dice game for IIITPChain.
 *
 * Modes:
 *   OVER  — bet the roll will be > target (1-5)
 *   UNDER — bet the roll will be < target (2-6)
 *   EXACT — bet the exact number (1-6), 5x payout
 *
 * Randomness: keccak256(blockhash, sender, nonce) — pseudo-random,
 * fine for a testnet campus game. Replace with Chainlink VRF for production.
 *
 * House edge: 5% (500 bps). Max bet capped by house balance / 10.
 */
contract IIITPDice is AccessControl, Pausable, ReentrancyGuard {
    bytes32 public constant MANAGER_ROLE = keccak256("MANAGER_ROLE");

    I_IIITPToken public immutable token;

    enum BetType {
        OVER,
        UNDER,
        EXACT
    }

    struct RollResult {
        uint256 roll; // 1-6
        uint256 wager;
        uint256 payout; // 0 if lost
        BetType betType;
        uint8 target;
        bool won;
        uint256 timestamp;
    }

    uint256 public minBet = 1 ether; // 1 I3TP
    uint256 public maxBetBps = 1000; // 10% of house balance
    uint256 public houseEdgeBps = 500; // 5%
    uint256 public totalWagered;
    uint256 public totalPaidOut;
    uint256 public totalRolls;

    mapping(address => uint256) public nonces;
    mapping(address => RollResult[]) public rollHistory;
    mapping(address => uint256) public totalWon;
    mapping(address => uint256) public totalLost;

    event Rolled(
        address indexed player,
        uint256 roll,
        BetType betType,
        uint8 target,
        uint256 wager,
        uint256 payout,
        bool won
    );
    event HouseFunded(address indexed by, uint256 amount);
    event HouseWithdrawn(address indexed to, uint256 amount);
    event ConfigUpdated(
        uint256 minBet,
        uint256 maxBetBps,
        uint256 houseEdgeBps
    );

    constructor(address tokenAddress) {
        token = I_IIITPToken(tokenAddress);
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MANAGER_ROLE, msg.sender);
    }

    // ── Admin ─────────────────────────────────────────────────────

    function fundHouse(uint256 amount) external onlyRole(MANAGER_ROLE) {
        require(
            token.transferFrom(msg.sender, address(this), amount),
            "Transfer failed"
        );
        emit HouseFunded(msg.sender, amount);
    }

    function withdrawHouse(
        uint256 amount
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(token.transfer(msg.sender, amount), "Transfer failed");
        emit HouseWithdrawn(msg.sender, amount);
    }

    function setConfig(
        uint256 _minBet,
        uint256 _maxBetBps,
        uint256 _houseEdgeBps
    ) external onlyRole(MANAGER_ROLE) {
        require(_houseEdgeBps <= 2000, "Edge too high");
        require(_maxBetBps <= 5000, "Max bet too high");
        minBet = _minBet;
        maxBetBps = _maxBetBps;
        houseEdgeBps = _houseEdgeBps;
        emit ConfigUpdated(_minBet, _maxBetBps, _houseEdgeBps);
    }

    function pause() external onlyRole(MANAGER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(MANAGER_ROLE) {
        _unpause();
    }

    // ── Core ──────────────────────────────────────────────────────

    /**
     * @param wager     Amount of I3TP to bet
     * @param betType   OVER(0) | UNDER(1) | EXACT(2)
     * @param target    For OVER: roll > target (1-5).
     *                  For UNDER: roll < target (2-6).
     *                  For EXACT: roll == target (1-6).
     */
    function roll(
        uint256 wager,
        BetType betType,
        uint8 target
    ) external whenNotPaused nonReentrant returns (uint256 rollResult) {
        // Validate bet
        require(wager >= minBet, "Below min bet");
        uint256 houseBal = token.balanceOf(address(this));
        uint256 maxBet = (houseBal * maxBetBps) / 10000;
        require(wager <= maxBet, "Exceeds max bet");

        // Validate target
        if (betType == BetType.OVER)
            require(target >= 1 && target <= 5, "Target 1-5 for OVER");
        if (betType == BetType.UNDER)
            require(target >= 2 && target <= 6, "Target 2-6 for UNDER");
        if (betType == BetType.EXACT)
            require(target >= 1 && target <= 6, "Target 1-6 for EXACT");

        // Take wager
        require(
            token.transferFrom(msg.sender, address(this), wager),
            "Payment failed"
        );

        // Generate roll
        uint256 nonce = nonces[msg.sender]++;
        rollResult = _rand(msg.sender, nonce);

        // Calculate payout
        bool won;
        uint256 payout;

        if (betType == BetType.OVER) won = rollResult > target;
        if (betType == BetType.UNDER) won = rollResult < target;
        if (betType == BetType.EXACT) won = rollResult == target;

        if (won) {
            uint256 multiplierBps;
            if (betType == BetType.EXACT) {
                multiplierBps = 50000; // 5x
            } else {
                // OVER/UNDER: odds based on winning sides
                uint256 winningSides = betType == BetType.OVER
                    ? uint256(6 - target)
                    : uint256(target - 1);
                // payout = wager * 6 / winningSides, minus house edge
                multiplierBps = (6 * 10000) / winningSides;
            }
            uint256 gross = (wager * multiplierBps) / 10000;
            uint256 edge = (gross * houseEdgeBps) / 10000;
            payout = gross - edge;

            // Cap payout to house balance
            if (payout > token.balanceOf(address(this))) {
                payout = token.balanceOf(address(this));
            }
            require(token.transfer(msg.sender, payout), "Payout failed");
            totalWon[msg.sender] += payout;
            totalPaidOut += payout;
        } else {
            totalLost[msg.sender] += wager;
        }

        totalWagered += wager;
        totalRolls++;

        RollResult memory result = RollResult(
            rollResult,
            wager,
            payout,
            betType,
            target,
            won,
            block.timestamp
        );
        rollHistory[msg.sender].push(result);

        emit Rolled(
            msg.sender,
            rollResult,
            betType,
            target,
            wager,
            payout,
            won
        );
    }

    // ── Pseudo-random ─────────────────────────────────────────────

    function _rand(
        address player,
        uint256 nonce
    ) internal view returns (uint256) {
        bytes32 hash = keccak256(
            abi.encodePacked(
                blockhash(block.number - 1),
                block.timestamp,
                player,
                nonce
            )
        );
        return (uint256(hash) % 6) + 1;
    }

    // ── Views ─────────────────────────────────────────────────────

    function getHistory(
        address player
    ) external view returns (RollResult[] memory) {
        return rollHistory[player];
    }

    function getHistoryPaged(
        address player,
        uint256 from,
        uint256 count
    ) external view returns (RollResult[] memory) {
        RollResult[] storage hist = rollHistory[player];
        uint256 len = hist.length;
        if (from >= len) return new RollResult[](0);
        uint256 end = from + count > len ? len : from + count;
        RollResult[] memory result = new RollResult[](end - from);
        for (uint256 i = from; i < end; i++) result[i - from] = hist[i];
        return result;
    }

    function houseBalance() external view returns (uint256) {
        return token.balanceOf(address(this));
    }

    function maxBetAmount() external view returns (uint256) {
        return (token.balanceOf(address(this)) * maxBetBps) / 10000;
    }

    function getStats()
        external
        view
        returns (
            uint256 rolls,
            uint256 wagered,
            uint256 paidOut,
            uint256 houseProfit
        )
    {
        rolls = totalRolls;
        wagered = totalWagered;
        paidOut = totalPaidOut;
        houseProfit = wagered > paidOut ? wagered - paidOut : 0;
    }
}
