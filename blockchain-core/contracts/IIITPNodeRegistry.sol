// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "./IIITPToken.sol";

/**
 * @title IIITPNodeRegistry
 * @notice Register your device as a validator node on IIITPChain.
 *
 * Mechanics:
 *   - Users stake NODE_STAKE I3TP to register a node
 *   - Each node has: nodeId, owner, metadata (name/IP/specs), status
 *   - Active nodes earn NODE_REWARD per epoch (admin-triggered)
 *   - Nodes can be deregistered by owner (stake returned)
 *   - Admin can slash misbehaving nodes (burn their stake)
 *   - Node count is capped at MAX_NODES
 */
contract IIITPNodeRegistry is ReentrancyGuard, AccessControl {

    // ── Roles ────────────────────────────────────────────
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    // ── Token ─────────────────────────────────────────────
    IIITPToken public immutable token;

    // ── Config ────────────────────────────────────────────
    uint256 public nodeStakeRequired = 500  * 10 ** 18;   // 500 I3TP to register
    uint256 public nodeRewardPerEpoch = 10  * 10 ** 18;   // 10 I3TP per epoch
    uint256 public maxNodes           = 100;

    // ── Node struct ───────────────────────────────────────
    enum NodeStatus { INACTIVE, ACTIVE, SLASHED }

    struct Node {
        uint256    nodeId;
        address    owner;
        string     name;          // human-readable name e.g. "Prajwal's Laptop"
        string     nodeType;      // "validator" | "rpc" | "archive"
        uint256    registeredAt;
        uint256    lastRewardAt;
        uint256    totalRewards;
        uint256    stake;
        NodeStatus status;
    }

    // ── State ─────────────────────────────────────────────
    uint256 public nextNodeId = 1;
    uint256 public activeNodeCount;

    mapping(uint256 => Node)    public nodes;           // nodeId => Node
    mapping(address => uint256) public ownerToNodeId;   // one node per address
    uint256[] public activeNodeIds;

    // ── Events ────────────────────────────────────────────
    event NodeRegistered(uint256 indexed nodeId, address indexed owner, string name);
    event NodeDeregistered(uint256 indexed nodeId, address indexed owner);
    event NodeSlashed(uint256 indexed nodeId, address indexed owner, uint256 slashedAmount);
    event EpochRewardsDistributed(uint256 epoch, uint256 totalRewarded, uint256 nodeCount);
    event NodeStakeUpdated(uint256 newStake);
    event NodeRewardUpdated(uint256 newReward);

    // ── Constructor ──────────────────────────────────────
    constructor(address tokenAddress) {
        require(tokenAddress != address(0), "NodeRegistry: zero token");
        token = IIITPToken(tokenAddress);

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(OPERATOR_ROLE,      msg.sender);
    }

    // ── Register ──────────────────────────────────────────
    /**
     * @notice Register your device as a node.
     * @param name     Display name for your node
     * @param nodeType "validator" | "rpc" | "archive"
     */
    function registerNode(string calldata name, string calldata nodeType) external nonReentrant {
        require(ownerToNodeId[msg.sender] == 0, "NodeRegistry: already registered");
        require(activeNodeCount < maxNodes,      "NodeRegistry: max nodes reached");
        require(bytes(name).length > 0,          "NodeRegistry: empty name");

        token.transferFrom(msg.sender, address(this), nodeStakeRequired);

        uint256 nodeId = nextNodeId++;

        nodes[nodeId] = Node({
            nodeId:       nodeId,
            owner:        msg.sender,
            name:         name,
            nodeType:     nodeType,
            registeredAt: block.timestamp,
            lastRewardAt: block.timestamp,
            totalRewards: 0,
            stake:        nodeStakeRequired,
            status:       NodeStatus.ACTIVE
        });

        ownerToNodeId[msg.sender] = nodeId;
        activeNodeIds.push(nodeId);
        activeNodeCount++;

        emit NodeRegistered(nodeId, msg.sender, name);
    }

    // ── Deregister ────────────────────────────────────────
    /**
     * @notice Unregister your node and reclaim your stake.
     */
    function deregisterNode() external nonReentrant {
        uint256 nodeId = ownerToNodeId[msg.sender];
        require(nodeId != 0,                              "NodeRegistry: not registered");
        require(nodes[nodeId].status == NodeStatus.ACTIVE, "NodeRegistry: node not active");

        Node storage node = nodes[nodeId];
        node.status = NodeStatus.INACTIVE;

        uint256 stakeToReturn = node.stake;
        node.stake = 0;

        ownerToNodeId[msg.sender] = 0;
        _removeFromActiveList(nodeId);
        activeNodeCount--;

        require(token.transfer(msg.sender, stakeToReturn), "NodeRegistry: transfer failed");

        emit NodeDeregistered(nodeId, msg.sender);
    }

    // ── Distribute epoch rewards (operator) ──────────────
    /**
     * @notice Distribute rewards to all active nodes for the current epoch.
     *         Called by operator (automated or manual).
     * @param epochNumber For event tracking only
     */
    function distributeEpochRewards(uint256 epochNumber)
        external onlyRole(OPERATOR_ROLE) nonReentrant
    {
        uint256 count = activeNodeIds.length;
        require(count > 0, "NodeRegistry: no active nodes");

        uint256 totalRewarded = 0;

        for (uint256 i = 0; i < count; i++) {
            uint256 nodeId = activeNodeIds[i];
            Node storage node = nodes[nodeId];

            if (node.status == NodeStatus.ACTIVE) {
                token.mint(node.owner, nodeRewardPerEpoch);
                node.totalRewards += nodeRewardPerEpoch;
                node.lastRewardAt  = block.timestamp;
                totalRewarded     += nodeRewardPerEpoch;
            }
        }

        emit EpochRewardsDistributed(epochNumber, totalRewarded, count);
    }

    // ── Slash ─────────────────────────────────────────────
    /**
     * @notice Slash a misbehaving node — burns their stake.
     */
    function slashNode(uint256 nodeId) external onlyRole(DEFAULT_ADMIN_ROLE) {
        Node storage node = nodes[nodeId];
        require(node.status == NodeStatus.ACTIVE, "NodeRegistry: not active");

        uint256 slashAmount = node.stake;
        node.stake  = 0;
        node.status = NodeStatus.SLASHED;

        ownerToNodeId[node.owner] = 0;
        _removeFromActiveList(nodeId);
        activeNodeCount--;

        token.burn(slashAmount);

        emit NodeSlashed(nodeId, node.owner, slashAmount);
    }

    // ── View helpers ──────────────────────────────────────
    function getNode(uint256 nodeId) external view returns (Node memory) {
        return nodes[nodeId];
    }

    function getMyNode() external view returns (Node memory) {
        uint256 nodeId = ownerToNodeId[msg.sender];
        require(nodeId != 0, "NodeRegistry: not registered");
        return nodes[nodeId];
    }

    function getActiveNodes() external view returns (Node[] memory) {
        Node[] memory result = new Node[](activeNodeIds.length);
        for (uint256 i = 0; i < activeNodeIds.length; i++) {
            result[i] = nodes[activeNodeIds[i]];
        }
        return result;
    }

    function isActiveNode(address user) external view returns (bool) {
        uint256 nodeId = ownerToNodeId[user];
        return nodeId != 0 && nodes[nodeId].status == NodeStatus.ACTIVE;
    }

    // ── Internal ──────────────────────────────────────────
    function _removeFromActiveList(uint256 nodeId) internal {
        for (uint256 i = 0; i < activeNodeIds.length; i++) {
            if (activeNodeIds[i] == nodeId) {
                activeNodeIds[i] = activeNodeIds[activeNodeIds.length - 1];
                activeNodeIds.pop();
                break;
            }
        }
    }

    // ── Admin ─────────────────────────────────────────────
    function setNodeStakeRequired(uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        nodeStakeRequired = amount;
        emit NodeStakeUpdated(amount);
    }

    function setNodeRewardPerEpoch(uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        nodeRewardPerEpoch = amount;
        emit NodeRewardUpdated(amount);
    }

    function setMaxNodes(uint256 max) external onlyRole(DEFAULT_ADMIN_ROLE) {
        maxNodes = max;
    }
}
