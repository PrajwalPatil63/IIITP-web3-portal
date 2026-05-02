// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./IIITPToken.sol";
import "./IIITPStaking.sol";
import "./IIITPNodeRegistry.sol";

/**
 * @title IIITPVoting
 * @notice Custom weighted governance voting system for IIITPChain.
 *
 * ══════════════════════════════════════════════════════════════
 *  CUSTOM VOTING WEIGHT FORMULA (Prajwal's formula):
 *
 *  W(voter) = (T * wT) + (S * wS) + (N * wN) + (R * wR)
 *
 *  Where:
 *    T  = token balance at snapshot           weight wT = 40%
 *    S  = staked amount                       weight wS = 30%
 *    N  = isActiveNode ? NODE_BONUS : 0       weight wN = 20%
 *    R  = role bonus (teacher=2x, student=1x) weight wR = 10%
 *
 *  All components normalized to 1e18 scale.
 *  Result: higher participation in the ecosystem = more voting power.
 * ══════════════════════════════════════════════════════════════
 *
 * Proposal lifecycle:
 *   PENDING → ACTIVE (after startTime) → ENDED (after endTime) → EXECUTED / REJECTED
 *
 * Rules:
 *   - Only token holders can vote (balance > 0 at snapshot)
 *   - One vote per address per proposal
 *   - Quorum: 5% of total supply must participate
 *   - Pass threshold: >50% weighted votes FOR
 */
contract IIITPVoting is AccessControl, ReentrancyGuard {
    // ── Roles ─────────────────────────────────────────────
    bytes32 public constant PROPOSER_ROLE = keccak256("PROPOSER_ROLE");
    bytes32 public constant EXECUTOR_ROLE = keccak256("EXECUTOR_ROLE");

    // ── Contracts ─────────────────────────────────────────
    IIITPToken public immutable token;
    IIITPStaking public immutable staking;
    IIITPNodeRegistry public immutable nodeRegistry;

    // ── Formula weights (basis points, sum = 10000) ───────
    uint256 public wToken = 4000; // 40%
    uint256 public wStake = 3000; // 30%
    uint256 public wNode = 2000; // 20%
    uint256 public wRole = 1000; // 10%

    uint256 public constant NODE_BONUS = 1000 * 10 ** 18; // bonus for node operators
    uint256 public constant TEACHER_BONUS = 2; // teacher multiplier
    uint256 public constant STUDENT_BONUS = 1; // student multiplier

    // ── Governance config ─────────────────────────────────
    uint256 public quorumBps = 500; // 5% of total supply
    uint256 public passBps = 5000; // 50% of votes FOR to pass
    uint256 public votingDuration = 3 days;
    uint256 public minProposerStake = 100 * 10 ** 18; // must stake to propose

    // ── Proposal ──────────────────────────────────────────
    enum ProposalStatus {
        PENDING,
        ACTIVE,
        PASSED,
        REJECTED,
        EXECUTED
    }
    enum VoteChoice {
        AGAINST,
        FOR,
        ABSTAIN
    }

    struct Proposal {
        uint256 id;
        address proposer;
        string title;
        string description;
        string category; // "governance" | "treasury" | "technical" | "academic"
        uint256 snapshotId; // token snapshot at creation
        uint256 startTime;
        uint256 endTime;
        uint256 forVotes;
        uint256 againstVotes;
        uint256 abstainVotes;
        uint256 totalVoters;
        ProposalStatus status;
    }

    struct VoteRecord {
        bool hasVoted;
        VoteChoice choice;
        uint256 weight;
    }

    // ── State ─────────────────────────────────────────────
    uint256 public proposalCount;
    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => mapping(address => VoteRecord)) public voteRecords;

    // ── Events ────────────────────────────────────────────
    event ProposalCreated(
        uint256 indexed id,
        address indexed proposer,
        string title,
        uint256 snapshotId
    );
    event VoteCast(
        uint256 indexed proposalId,
        address indexed voter,
        VoteChoice choice,
        uint256 weight
    );
    event ProposalFinalized(
        uint256 indexed id,
        ProposalStatus status,
        uint256 forVotes,
        uint256 againstVotes
    );
    event ProposalExecuted(uint256 indexed id);
    event WeightsUpdated(
        uint256 wToken,
        uint256 wStake,
        uint256 wNode,
        uint256 wRole
    );

    // ── Constructor ──────────────────────────────────────
    constructor(
        address tokenAddress,
        address stakingAddress,
        address nodeRegistryAddress
    ) {
        require(tokenAddress != address(0), "Voting: zero token");
        require(stakingAddress != address(0), "Voting: zero staking");
        require(nodeRegistryAddress != address(0), "Voting: zero registry");

        token = IIITPToken(tokenAddress);
        staking = IIITPStaking(stakingAddress);
        nodeRegistry = IIITPNodeRegistry(nodeRegistryAddress);

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(PROPOSER_ROLE, msg.sender);
        _grantRole(EXECUTOR_ROLE, msg.sender);
    }

    // ── Create Proposal ───────────────────────────────────
    /**
     * @notice Create a new governance proposal.
     * @param title       Short title
     * @param description Full description
     * @param category    "governance" | "treasury" | "technical" | "academic"
     */
    function createProposal(
        string calldata title,
        string calldata description,
        string calldata category
    ) external nonReentrant returns (uint256) {
        require(
            staking.totalStakedByUser(msg.sender) >= minProposerStake ||
                hasRole(PROPOSER_ROLE, msg.sender),
            "Voting: insufficient stake to propose"
        );
        require(bytes(title).length > 0, "Voting: empty title");
        require(bytes(description).length > 0, "Voting: empty description");

        // Take token snapshot for vote weight calculation
        uint256 snapshotId = token.snapshot();

        uint256 proposalId = ++proposalCount;

        proposals[proposalId] = Proposal({
            id: proposalId,
            proposer: msg.sender,
            title: title,
            description: description,
            category: category,
            snapshotId: snapshotId,
            startTime: block.timestamp,
            endTime: block.timestamp + votingDuration,
            forVotes: 0,
            againstVotes: 0,
            abstainVotes: 0,
            totalVoters: 0,
            status: ProposalStatus.ACTIVE
        });

        emit ProposalCreated(proposalId, msg.sender, title, snapshotId);
        return proposalId;
    }

    // ── Cast Vote ─────────────────────────────────────────
    /**
     * @notice Cast a vote on an active proposal.
     * @param proposalId The proposal to vote on
     * @param choice     0=AGAINST, 1=FOR, 2=ABSTAIN
     */
    function castVote(
        uint256 proposalId,
        VoteChoice choice
    ) external nonReentrant {
        Proposal storage prop = proposals[proposalId];

        require(prop.status == ProposalStatus.ACTIVE, "Voting: not active");
        require(block.timestamp <= prop.endTime, "Voting: ended");
        require(
            !voteRecords[proposalId][msg.sender].hasVoted,
            "Voting: already voted"
        );

        uint256 weight = calculateVotingWeight(msg.sender, prop.snapshotId);
        require(weight > 0, "Voting: no voting power");

        voteRecords[proposalId][msg.sender] = VoteRecord({
            hasVoted: true,
            choice: choice,
            weight: weight
        });

        if (choice == VoteChoice.FOR) prop.forVotes += weight;
        else if (choice == VoteChoice.AGAINST) prop.againstVotes += weight;
        else prop.abstainVotes += weight;

        prop.totalVoters++;

        emit VoteCast(proposalId, msg.sender, choice, weight);
    }

    // ── Finalize ──────────────────────────────────────────
    /**
     * @notice Finalize a proposal after voting ends.
     *         Anyone can call this once endTime has passed.
     */
    function finalizeProposal(uint256 proposalId) external {
        Proposal storage prop = proposals[proposalId];

        require(prop.status == ProposalStatus.ACTIVE, "Voting: not active");
        require(block.timestamp > prop.endTime, "Voting: not ended yet");

        uint256 totalSupply = token.totalSupply();
        uint256 totalVoted = prop.forVotes +
            prop.againstVotes +
            prop.abstainVotes;
        uint256 quorumNeeded = (totalSupply * quorumBps) / 10_000;

        if (totalVoted < quorumNeeded) {
            prop.status = ProposalStatus.REJECTED;
        } else {
            uint256 totalDecisive = prop.forVotes + prop.againstVotes;
            bool passed = totalDecisive > 0 &&
                (prop.forVotes * 10_000) / totalDecisive >= passBps;
            prop.status = passed
                ? ProposalStatus.PASSED
                : ProposalStatus.REJECTED;
        }

        emit ProposalFinalized(
            proposalId,
            prop.status,
            prop.forVotes,
            prop.againstVotes
        );
    }

    // ── Execute ───────────────────────────────────────────
    function executeProposal(
        uint256 proposalId
    ) external onlyRole(EXECUTOR_ROLE) {
        Proposal storage prop = proposals[proposalId];
        require(prop.status == ProposalStatus.PASSED, "Voting: not passed");
        prop.status = ProposalStatus.EXECUTED;
        emit ProposalExecuted(proposalId);
    }

    // ── Weight Calculation (THE FORMULA) ─────────────────
    /**
     * @notice Calculate voting weight for a voter.
     *
     *   W = (tokenBal * wToken + stakedBal * wStake + nodeBal * wNode + roleBonus * wRole) / 10000
     *
     * @param voter      Address to calculate weight for
     * @param snapshotId Token snapshot at proposal creation
     */
    function calculateVotingWeight(
        address voter,
        uint256 snapshotId
    ) public view returns (uint256) {
        // T: token balance at snapshot
        uint256 tokenBal = token.balanceOfAt(voter, snapshotId);

        // S: currently staked amount
        uint256 stakedBal = staking.totalStakedByUser(voter);

        // N: node bonus if active validator
        uint256 nodeBal = nodeRegistry.isActiveNode(voter) ? NODE_BONUS : 0;

        // R: role bonus — teacher gets 2x, student gets 1x, normalized to token scale
        bool isTeacher = staking.isTeacherByStaking(voter);
        uint256 roleBonus = isTeacher
            ? TEACHER_BONUS * 100 * 10 ** 18
            : STUDENT_BONUS * 100 * 10 ** 18;

        // Apply weights
        uint256 weight = (tokenBal *
            wToken +
            stakedBal *
            wStake +
            nodeBal *
            wNode +
            roleBonus *
            wRole) / 10_000;

        return weight;
    }

    // ── View helpers ──────────────────────────────────────
    function getProposal(
        uint256 proposalId
    ) external view returns (Proposal memory) {
        return proposals[proposalId];
    }

    function getVoteRecord(
        uint256 proposalId,
        address voter
    ) external view returns (VoteRecord memory) {
        return voteRecords[proposalId][voter];
    }

    function getActiveProposals() external view returns (Proposal[] memory) {
        uint256 count = 0;
        for (uint256 i = 1; i <= proposalCount; i++) {
            if (proposals[i].status == ProposalStatus.ACTIVE) count++;
        }
        Proposal[] memory result = new Proposal[](count);
        uint256 j = 0;
        for (uint256 i = 1; i <= proposalCount; i++) {
            if (proposals[i].status == ProposalStatus.ACTIVE)
                result[j++] = proposals[i];
        }
        return result;
    }

    function getAllProposals() external view returns (Proposal[] memory) {
        Proposal[] memory result = new Proposal[](proposalCount);
        for (uint256 i = 1; i <= proposalCount; i++) {
            result[i - 1] = proposals[i];
        }
        return result;
    }

    // ── Admin ─────────────────────────────────────────────
    function setWeights(
        uint256 _wToken,
        uint256 _wStake,
        uint256 _wNode,
        uint256 _wRole
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(
            _wToken + _wStake + _wNode + _wRole == 10_000,
            "Voting: weights must sum to 10000"
        );
        wToken = _wToken;
        wStake = _wStake;
        wNode = _wNode;
        wRole = _wRole;
        emit WeightsUpdated(_wToken, _wStake, _wNode, _wRole);
    }

    function setQuorum(
        uint256 _quorumBps
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        quorumBps = _quorumBps;
    }

    function setVotingDuration(
        uint256 duration
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        votingDuration = duration;
    }

    function setMinProposerStake(
        uint256 amount
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        minProposerStake = amount;
    }
}
