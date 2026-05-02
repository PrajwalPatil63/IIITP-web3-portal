import React, { useCallback, useEffect, useState } from "react";
import { Card, SectionTitle, Stat } from "../components/Card";
import { useWeb3 } from "../contexts/Web3Context";
import { Vote, Plus, CheckCircle2, XCircle, MinusCircle, Gavel, Sparkles, Zap } from "lucide-react";
import { apiPost } from "../lib/api";
import { PROPOSAL_CATEGORIES, PROPOSAL_STATUS, VOTE_CHOICE, VOTE_CHOICE_LABELS } from "../contracts/config";
import { motion, AnimatePresence } from "framer-motion";

const CATEGORY_COLORS = {
    governance: "border-cyan-400/40 text-cyan-300",
    treasury: "border-cyber-yellow/40 text-cyber-yellow",
    technical: "border-pink-400/40 text-pink-400",
    academic: "border-emerald-400/40 text-emerald-300",
};

const STATUS_COLORS = {
    PENDING: "text-slate-400",
    ACTIVE: "text-cyber-green",
    PASSED: "text-cyan-300",
    REJECTED: "text-pink-400",
    EXECUTED: "text-cyber-yellow",
};

export default function VotingPage() {
    const { account, getContract, sendTx, isCorrectNetwork, formatUnits, parseUnits, tokenSymbol, tokenDecimals } = useWeb3();

    const [proposals, setProposals] = useState([]);
    const [minStake, setMinStake] = useState("100");
    const [quorumBps, setQuorumBps] = useState(500);
    const [weights, setWeights] = useState({ token: 40, stake: 30, node: 20, role: 10 });
    const [myWeight, setMyWeight] = useState("0");
    const [isNode, setIsNode] = useState(false);
    const [myStake, setMyStake] = useState("0");

    const [showCreate, setShowCreate] = useState(false);
    const [title, setTitle] = useState("");
    const [desc, setDesc] = useState("");
    const [category, setCategory] = useState("governance");
    const [busy, setBusy] = useState(false);

    const loadAll = useCallback(async () => {
        if (!isCorrectNetwork || !account) return;
        try {
            const v = getContract("Voting");
            const [all, ms, qb, wT, wS, wN, wR] = await Promise.all([
                v.getAllProposals().catch(() => []),
                v.minProposerStake().catch(() => 0n),
                v.quorumBps().catch(() => 500n),
                v.wToken().catch(() => 4000n),
                v.wStake().catch(() => 3000n),
                v.wNode().catch(() => 2000n),
                v.wRole().catch(() => 1000n),
            ]);
            setMinStake(formatUnits(ms, tokenDecimals));
            setQuorumBps(Number(qb));
            setWeights({
                token: Number(wT) / 100,
                stake: Number(wS) / 100,
                node: Number(wN) / 100,
                role: Number(wR) / 100,
            });

            // Enrich each proposal with user's vote record
            const enriched = await Promise.all(
                all.map(async (p) => {
                    const rec = await v.getVoteRecord(p.id, account).catch(() => ({
                        hasVoted: false,
                        choice: 0,
                        weight: 0n,
                    }));
                    let weight = 0n;
                    try {
                        weight = await v.calculateVotingWeight(account, p.snapshotId);
                    } catch (e) {
                        console.warn("Voting: weight calc failed", e?.message);
                    }
                    return {
                        id: Number(p.id),
                        proposer: p.proposer,
                        title: p.title,
                        description: p.description,
                        category: p.category,
                        snapshotId: p.snapshotId,
                        startTime: Number(p.startTime),
                        endTime: Number(p.endTime),
                        forVotes: formatUnits(p.forVotes, tokenDecimals),
                        againstVotes: formatUnits(p.againstVotes, tokenDecimals),
                        abstainVotes: formatUnits(p.abstainVotes, tokenDecimals),
                        totalVoters: Number(p.totalVoters),
                        status: PROPOSAL_STATUS[Number(p.status)] || "PENDING",
                        hasVoted: rec.hasVoted,
                        myChoice: Number(rec.choice ?? 0),
                        myWeightAtProposal: formatUnits(weight, tokenDecimals),
                    };
                })
            );
            setProposals(enriched.reverse());
        } catch (e) {
            console.warn("Voting: on-chain load failed", e?.message);
        }

        try {
            const s = getContract("IIITPStaking");
            const nr = getContract("NodeRegistry");
            const staked = await s.totalStakedByUser(account).catch(() => 0n);
            setMyStake(formatUnits(staked, tokenDecimals));
            setIsNode(false);
        } catch (e) {
            console.warn("Voting: stake/node check failed", e?.message);
        }
    }, [account, getContract, formatUnits, isCorrectNetwork, tokenDecimals]);

    // Estimate voter's current weight (for display before creating a proposal)
    useEffect(() => {
        const est = async () => {
            if (!account || !isCorrectNetwork) return;
            try {
                const v = getContract("Voting");
                const t = getContract("IIITPToken");
                const bal = await t.balanceOf(account).catch(() => 0n);
                // Rough estimate using current state (snapshot-less): w = (T*wT + S*wS + N*wN + R*wR)/10000
                const s = getContract("IIITPStaking");
                const nr = getContract("NodeRegistry");
                const stk = await s.totalStakedByUser(account).catch(() => 0n);
                const isT = Number(formatUnits(stk, tokenDecimals)) >= 1000;
                const actNode = false;
                const BONUS = 1000n * 10n ** 18n;
                const nodeBal = actNode ? BONUS : 0n;
                const roleBonus = (isT ? 2n : 1n) * 100n * 10n ** 18n;
                const wTk = BigInt(Math.round(weights.token * 100));
                const wSt = BigInt(Math.round(weights.stake * 100));
                const wNd = BigInt(Math.round(weights.node * 100));
                const wRl = BigInt(Math.round(weights.role * 100));
                const w = (bal * wTk + stk * wSt + nodeBal * wNd + roleBonus * wRl) / 10_000n;
                setMyWeight(formatUnits(w, tokenDecimals));
                // eslint-disable-next-line no-unused-vars
                const _unused = v;
            } catch (e) {
                console.warn("Voting: weight estimate failed", e?.message);
            }
        };
        est();
    }, [account, isCorrectNetwork, getContract, formatUnits, weights, tokenDecimals]);

    useEffect(() => {
        loadAll();
        const i = setInterval(loadAll, 20000);
        return () => clearInterval(i);
    }, [loadAll]);

    const canPropose = Number(myStake) >= Number(minStake);

    const createProposal = async () => {
        if (!title || !desc) return;
        setBusy(true);
        const r = await sendTx("Create proposal", "Voting", "createProposal", [title, desc, category]);
        if (r) {
            apiPost("/tx", {
                wallet: account,
                tx_hash: r.tx.hash,
                type: "proposal",
                summary: `"${title}" · ${category}`,
            }).catch(() => { });
            setTitle("");
            setDesc("");
            setShowCreate(false);
            setTimeout(loadAll, 3000);
        }
        setBusy(false);
    };

    const vote = async (id, choice) => {
        const label = VOTE_CHOICE_LABELS[choice];
        const r = await sendTx(`Vote ${label}`, "Voting", "castVote", [id, choice]);
        if (r) {
            apiPost("/tx", {
                wallet: account,
                tx_hash: r.tx.hash,
                type: "vote",
                summary: `${label} on proposal #${id}`,
            }).catch(() => { });
            loadAll();
        }
    };

    const finalize = async (id) => {
        const r = await sendTx("Finalize proposal", "Voting", "finalizeProposal", [id]);
        if (r) loadAll();
    };

    return (
        <div className="space-y-6" data-testid="voting-page">
            <SectionTitle kicker="// governance" title="On-chain governance">
                Custom weighted voting. Anyone with ≥ {minStake} {tokenSymbol} staked can propose.
                Voting power = token × {weights.token}% + stake × {weights.stake}% + node bonus × {weights.node}% + role × {weights.role}%.
            </SectionTitle>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Card><Stat label="YOUR VOTING POWER" value={Number(myWeight).toFixed(2)} suffix={tokenSymbol} /></Card>
                <Card><Stat label="YOUR STAKE" value={Number(myStake).toFixed(2)} suffix={tokenSymbol} /></Card>
                <Card>
                    <Stat
                        label="NODE BONUS"
                        value={isNode ? "+1000" : "—"}
                        suffix={isNode ? tokenSymbol : ""}
                        accent={isNode ? "cyan" : "pink"}
                    />
                </Card>
                <Card><Stat label="QUORUM" value={`${quorumBps / 100}%`} /></Card>
            </div>

            {/* Weight formula visualizer */}
            <Card hoverable={false}>
                <div className="flex items-center gap-2 mb-3">
                    <Zap className="size-4 text-cyber-yellow" />
                    <h3 className="font-display text-lg text-white">The formula</h3>
                </div>
                <div className="font-mono text-xs md:text-sm text-cyan-300 bg-black/60 border border-cyan-400/20 rounded-md p-3 overflow-x-auto">
                    W = (T × {weights.token}%) + (S × {weights.stake}%) + (N × {weights.node}%) + (R × {weights.role}%)
                </div>
                <div className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-3 font-mono text-xs">
                    <BoostRow label="Token balance" pct={weights.token} active />
                    <BoostRow label="Staked amount" pct={weights.stake} active={Number(myStake) > 0} />
                    <BoostRow label="Node bonus" pct={weights.node} active={isNode} />
                    <BoostRow label="Role bonus" pct={weights.role} active />
                </div>
                {!isNode && (
                    <div className="mt-3 font-mono text-[11px] text-pink-400/80">
                        Run a node to unlock an additional +1000 {tokenSymbol} voting power boost →{" "}
                        <a href="/app/nodes" className="underline hover:text-pink-300">
                            go to Node Runner
                        </a>
                    </div>
                )}
            </Card>

            <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="font-display text-2xl text-white">
                    Proposals
                    <span className="ml-2 font-mono text-xs text-slate-500">({proposals.length})</span>
                </div>
                <div className="flex items-center gap-3">
                    {!canPropose && (
                        <span className="font-mono text-[10px] text-slate-500">
                            Stake ≥ {minStake} {tokenSymbol} to propose
                        </span>
                    )}
                    <button
                        onClick={() => setShowCreate((s) => !s)}
                        disabled={!canPropose}
                        className="btn-cyber"
                        data-testid="toggle-create-proposal-btn"
                    >
                        <Plus className="size-4" /> {showCreate ? "Close" : "New proposal"}
                    </button>
                </div>
            </div>

            {showCreate && (
                <Card hoverable={false}>
                    <h3 className="font-display text-xl text-white mb-3">Create proposal</h3>
                    <input
                        placeholder="Title"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        data-testid="proposal-title-input"
                        className="w-full bg-black/60 border border-white/10 rounded-md px-3 py-2.5 font-display text-white mb-3 focus:border-cyan-400 focus:outline-none"
                    />
                    <textarea
                        rows={5}
                        placeholder="Full description — what's being proposed and why?"
                        value={desc}
                        onChange={(e) => setDesc(e.target.value)}
                        data-testid="proposal-desc-input"
                        className="w-full bg-black/60 border border-white/10 rounded-md px-3 py-2.5 font-display text-white mb-3 focus:border-cyan-400 focus:outline-none"
                    />
                    <div className="flex flex-wrap gap-2 mb-4">
                        {PROPOSAL_CATEGORIES.map((c) => (
                            <button
                                key={c}
                                onClick={() => setCategory(c)}
                                data-testid={`category-${c}`}
                                className={[
                                    "px-3 py-1.5 font-mono text-xs uppercase tracking-wider border cyberpunk-clip transition",
                                    category === c
                                        ? `${CATEGORY_COLORS[c]} bg-white/5 glow-cyan`
                                        : "border-white/10 text-slate-400 hover:text-white",
                                ].join(" ")}
                            >
                                {c}
                            </button>
                        ))}
                    </div>
                    <button
                        onClick={createProposal}
                        disabled={busy || !title || !desc}
                        className="btn-cyber"
                        data-testid="submit-proposal-btn"
                    >
                        <Sparkles className="size-4" /> Submit on-chain
                    </button>
                </Card>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {proposals.length === 0 && (
                    <Card hoverable={false}>
                        <p className="text-slate-400 font-mono text-sm">
                            No on-chain proposals yet. Create the first one ↑
                        </p>
                    </Card>
                )}
                <AnimatePresence>
                    {proposals.map((p) => (
                        <motion.div
                            key={p.id}
                            initial={{ opacity: 0, y: 14 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            className="glass cyberpunk-clip p-5 hover:border-cyan-400/30 transition"
                            data-testid={`proposal-card-${p.id}`}
                        >
                            <ProposalCard
                                p={p}
                                tokenSymbol={tokenSymbol}
                                onVote={vote}
                                onFinalize={finalize}
                                account={account}
                            />
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>
        </div>
    );
}

function BoostRow({ label, pct, active }) {
    return (
        <div
            className={[
                "cyberpunk-clip p-2 border",
                active ? "border-cyan-400/40 bg-cyan-400/5" : "border-white/10 bg-black/40",
            ].join(" ")}
        >
            <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{label}</div>
            <div className={active ? "text-cyan-300 text-glow-cyan" : "text-slate-500"}>
                {pct}% weight
            </div>
        </div>
    );
}

function ProposalCard({ p, tokenSymbol, onVote, onFinalize, account }) {
    const total = Number(p.forVotes) + Number(p.againstVotes) + Number(p.abstainVotes);
    const forPct = total > 0 ? (Number(p.forVotes) / total) * 100 : 0;
    const againstPct = total > 0 ? (Number(p.againstVotes) / total) * 100 : 0;
    const abstainPct = total > 0 ? (Number(p.abstainVotes) / total) * 100 : 0;
    const now = Math.floor(Date.now() / 1000);
    const ended = p.endTime < now;
    const eta = Math.max(0, p.endTime - now);
    const canVote = p.status === "ACTIVE" && !p.hasVoted && !ended;
    const canFinalize = p.status === "ACTIVE" && ended;

    return (
        <>
            <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-cyan-300/80">
                        #{p.id}
                    </span>
                    <span
                        className={[
                            "px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.2em] border cyberpunk-clip",
                            CATEGORY_COLORS[p.category] || "border-white/20 text-slate-300",
                        ].join(" ")}
                    >
                        {p.category}
                    </span>
                </div>
                <span className={`font-mono text-[10px] uppercase tracking-[0.2em] ${STATUS_COLORS[p.status]}`}>
                    {p.status}
                </span>
            </div>
            <h3 className="font-display text-xl text-white mb-1">{p.title}</h3>
            <p className="text-slate-400 text-sm mb-2 line-clamp-3">{p.description}</p>
            <div className="font-mono text-[10px] text-slate-500 mb-4">
                By {p.proposer.slice(0, 8)}…{p.proposer.slice(-4)} ·{" "}
                {p.status === "ACTIVE" && !ended
                    ? `${formatEta(eta)} left`
                    : ended
                        ? "voting ended"
                        : "pending"}
                {p.hasVoted && (
                    <span className="ml-2 text-cyan-300">
                        · you voted {VOTE_CHOICE_LABELS[p.myChoice]}
                    </span>
                )}
            </div>

            <div className="space-y-2 mb-4 font-mono text-xs">
                <VoteBar label="FOR" pct={forPct} value={p.forVotes} color="bg-cyber-green" />
                <VoteBar label="AGAINST" pct={againstPct} value={p.againstVotes} color="bg-pink-500" />
                <VoteBar label="ABSTAIN" pct={abstainPct} value={p.abstainVotes} color="bg-slate-400" />
                <div className="flex justify-between text-slate-500 pt-1">
                    <span>{p.totalVoters} voters</span>
                    <span>your weight: {Number(p.myWeightAtProposal).toFixed(2)} {tokenSymbol}</span>
                </div>
            </div>

            {canVote && (
                <div className="grid grid-cols-3 gap-2">
                    <button
                        onClick={() => onVote(p.id, VOTE_CHOICE.FOR)}
                        className="btn-cyber"
                        data-testid={`vote-for-${p.id}`}
                    >
                        <CheckCircle2 className="size-4" /> For
                    </button>
                    <button
                        onClick={() => onVote(p.id, VOTE_CHOICE.AGAINST)}
                        className="btn-cyber btn-cyber-pink"
                        data-testid={`vote-against-${p.id}`}
                    >
                        <XCircle className="size-4" /> Against
                    </button>
                    <button
                        onClick={() => onVote(p.id, VOTE_CHOICE.ABSTAIN)}
                        className="btn-cyber opacity-70"
                        data-testid={`vote-abstain-${p.id}`}
                    >
                        <MinusCircle className="size-4" /> Abstain
                    </button>
                </div>
            )}
            {canFinalize && (
                <button
                    onClick={() => onFinalize(p.id)}
                    className="btn-cyber w-full"
                    data-testid={`finalize-${p.id}`}
                >
                    <Gavel className="size-4" /> Finalize result
                </button>
            )}
            {p.hasVoted && p.status === "ACTIVE" && !ended && (
                <div className="mt-2 font-mono text-[10px] text-cyan-300/70">
                    // your vote is locked in — waiting for voting period to end
                </div>
            )}
        </>
    );
}

function VoteBar({ label, pct, value, color }) {
    return (
        <div>
            <div className="flex justify-between mb-1">
                <span className="text-slate-400">{label}</span>
                <span className="text-white">
                    {Number(value).toFixed(2)} ({pct.toFixed(0)}%)
                </span>
            </div>
            <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div className={`h-full ${color} transition-all`} style={{ width: `${pct}%` }} />
            </div>
        </div>
    );
}

function formatEta(secs) {
    if (secs <= 0) return "0s";
    const d = Math.floor(secs / 86400);
    const h = Math.floor((secs % 86400) / 3600);
    const m = Math.floor((secs % 3600) / 60);
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
}
