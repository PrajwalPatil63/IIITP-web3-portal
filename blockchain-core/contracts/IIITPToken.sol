// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Snapshot.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

/**
 * @title IIITPToken
 * @notice Native ERC-20 token for the IIITPChain platform.
 *
 * Roles:
 *   DEFAULT_ADMIN_ROLE — deployer; can grant/revoke all roles
 *   MINTER_ROLE        — can mint new tokens (given to Faucet & Staking contracts)
 *   PAUSER_ROLE        — can pause all transfers (admin safety switch)
 *   SNAPSHOT_ROLE      — can take balance snapshots (used by Voting contract later)
 *
 * Supply:
 *   Initial mint: 10,000,000 I3TP to deployer (treasury)
 *   Hard cap:     100,000,000 I3TP
 */
contract IIITPToken is ERC20, ERC20Burnable, ERC20Snapshot, AccessControl, Pausable {

    // ── Roles ────────────────────────────────────────────
    bytes32 public constant MINTER_ROLE   = keccak256("MINTER_ROLE");
    bytes32 public constant PAUSER_ROLE   = keccak256("PAUSER_ROLE");
    bytes32 public constant SNAPSHOT_ROLE = keccak256("SNAPSHOT_ROLE");

    // ── Supply cap ───────────────────────────────────────
    uint256 public constant MAX_SUPPLY = 100_000_000 * 10 ** 18;

    // ── Events ───────────────────────────────────────────
    event RoleGrantedByAdmin(bytes32 indexed role, address indexed account);

    // ── Constructor ──────────────────────────────────────
    constructor(address treasury) ERC20("IIITPToken", "I3TP") {
        require(treasury != address(0), "IIITPToken: zero treasury");

        // Grant all roles to deployer
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MINTER_ROLE,        msg.sender);
        _grantRole(PAUSER_ROLE,        msg.sender);
        _grantRole(SNAPSHOT_ROLE,      msg.sender);

        // Initial treasury mint: 10M I3TP
        _mint(treasury, 10_000_000 * 10 ** 18);
    }

    // ── Minting ──────────────────────────────────────────
    /**
     * @notice Mint new I3TP tokens. Enforces hard cap.
     * @param to     Recipient address
     * @param amount Amount in wei (18 decimals)
     */
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        require(totalSupply() + amount <= MAX_SUPPLY, "IIITPToken: cap exceeded");
        _mint(to, amount);
    }

    // ── Snapshot ─────────────────────────────────────────
    /**
     * @notice Take a snapshot of all balances.
     *         Used by the Voting contract to prevent double-voting.
     * @return snapshotId The ID of the new snapshot.
     */
    function snapshot() external onlyRole(SNAPSHOT_ROLE) returns (uint256) {
        return _snapshot();
    }

    // ── Pause ────────────────────────────────────────────
    function pause()   external onlyRole(PAUSER_ROLE) { _pause(); }
    function unpause() external onlyRole(PAUSER_ROLE) { _unpause(); }

    // ── Role helpers (for easy frontend calls) ────────────
    function grantMinter(address account)   external onlyRole(DEFAULT_ADMIN_ROLE) {
        grantRole(MINTER_ROLE, account);
    }
    function grantSnapshotter(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        grantRole(SNAPSHOT_ROLE, account);
    }

    // ── Overrides ────────────────────────────────────────
    function _beforeTokenTransfer(address from, address to, uint256 amount)
        internal override(ERC20, ERC20Snapshot) whenNotPaused
    {
        super._beforeTokenTransfer(from, to, amount);
    }

    function supportsInterface(bytes4 interfaceId)
        public view override(AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
