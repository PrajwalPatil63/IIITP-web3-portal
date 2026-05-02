// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./IIITPToken.sol";

/**
 * @title IIITPFaucet
 * @notice Drips IITP tokens to students and teachers for testing.
 *
 * Rules:
 *   - Each address can claim once every COOLDOWN seconds (default: 24 hours)
 *   - Students get STUDENT_DRIP tokens per claim
 *   - Teachers (whitelisted by owner) get TEACHER_DRIP tokens per claim
 *   - Owner can adjust drip amounts and cooldown
 *   - This contract must hold MINTER_ROLE on IIITPToken
 */
contract IIITPFaucet is Ownable, ReentrancyGuard {
    // ── Config ───────────────────────────────────────────
    IIITPToken public token;

    uint256 public studentDrip = 100 * 10 ** 18; // 100 IITP per claim
    uint256 public teacherDrip = 500 * 10 ** 18; // 500 IITP per claim
    uint256 public cooldown = 24 hours;

    // ── State ────────────────────────────────────────────
    mapping(address => uint256) public lastClaim;
    mapping(address => bool) public isTeacher;

    // ── Events ───────────────────────────────────────────
    event Claimed(address indexed user, uint256 amount, bool teacher);
    event TeacherSet(address indexed account, bool status);
    event DripUpdated(uint256 studentDrip, uint256 teacherDrip);
    event CooldownUpdated(uint256 newCooldown);

    // ── Constructor ──────────────────────────────────────
    constructor(address tokenAddress) {
        require(tokenAddress != address(0), "Faucet: zero token");
        token = IIITPToken(tokenAddress);
    }

    // ── Claim ────────────────────────────────────────────
    /**
     * @notice Claim IITP tokens. Can be called once per cooldown period.
     */
    function claim() external nonReentrant {
        address user = msg.sender;

        require(
            block.timestamp >= lastClaim[user] + cooldown,
            "Faucet: cooldown active"
        );

        lastClaim[user] = block.timestamp;

        uint256 amount = isTeacher[user] ? teacherDrip : studentDrip;
        token.mint(user, amount);

        emit Claimed(user, amount, isTeacher[user]);
    }

    // ── View helpers ─────────────────────────────────────
    /**
     * @notice Seconds remaining until `user` can claim again. 0 if ready.
     */
    function timeUntilNextClaim(address user) external view returns (uint256) {
        uint256 nextTime = lastClaim[user] + cooldown;
        if (block.timestamp >= nextTime) return 0;
        return nextTime - block.timestamp;
    }

    /**
     * @notice Whether `user` can claim right now.
     */
    function canClaim(address user) external view returns (bool) {
        return block.timestamp >= lastClaim[user] + cooldown;
    }

    // ── Admin ────────────────────────────────────────────
    function setTeacher(address account, bool status) external onlyOwner {
        isTeacher[account] = status;
        emit TeacherSet(account, status);
    }

    function setTeacherBatch(
        address[] calldata accounts,
        bool status
    ) external onlyOwner {
        for (uint256 i = 0; i < accounts.length; i++) {
            isTeacher[accounts[i]] = status;
            emit TeacherSet(accounts[i], status);
        }
    }

    function setDrip(
        uint256 _studentDrip,
        uint256 _teacherDrip
    ) external onlyOwner {
        studentDrip = _studentDrip;
        teacherDrip = _teacherDrip;
        emit DripUpdated(_studentDrip, _teacherDrip);
    }

    function setCooldown(uint256 _cooldown) external onlyOwner {
        cooldown = _cooldown;
        emit CooldownUpdated(_cooldown);
    }
}
