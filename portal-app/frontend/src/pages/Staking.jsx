import React, { useCallback, useEffect, useState } from "react";
import { Card, SectionTitle, Stat } from "../components/Card";
import { useWeb3 } from "../contexts/Web3Context";
import { Coins, Lock, Unlock, Gift, Layers3 } from "lucide-react";
import { apiPost } from "../lib/api";
import { TIERS } from "../contracts/config";
import { motion, AnimatePresence } from "framer-motion";

const NODE_STATUS = ["INACTIVE", "ACTIVE", "SLASHED"];

export default function StakingPage() {
    const {
        account,
        getContract,
        sendTx,
        ensureTokenApproval,
        isCorrectNetwork,
        formatUnits,
        parseUnits,
        tokenSymbol,
        tokenDecimals,
        ADDRESSES,
        tokenBalance,
    } = useWeb3();

    const [positions, setPositions] = useState([]);
    const [totalStaked, setTotalStaked] = useState("0");
    const [userStaked, setUserStaked] = useState("0");
    const [teacherByStaking, setTeacherByStaking] = useState(false);
    const [stakeAmt, setStakeAmt] = useState("");
    const [tier, setTier] = useState(0);
    const [busy, setBusy] = useState(false);

    const refresh = useCallback(async () => {
        if (!account || !isCorrectNetwork) return;
        try {
            const c = getContract("IIITPStaking");
            const [pos, tot, mine] = await Promise.all([
                c.getPositions(account).catch(() => []),
                c.totalStaked().catch(() => 0n),
                c.totalStakedByUser(account).catch(() => 0n),
            ]);
            // Compute pending reward per position
            const enriched = await Promise.all(
                pos.map(async (p, i) => {
                    let pending = 0n;
                    try {
                        pending = await c.pendingReward(account, i);
                    } catch (e) {
                        console.warn(`Staking: pendingReward(${i}) failed`, e?.message);
                    }
                    return {
                        index: i,
                        amount: p.amount,
                        stakedAt: Number(p.stakedAt),
                        unlockAt: Number(p.unlockAt),
                        tier: Number(p.tier),
                        active: !!p.active,
                        pending,
                    };
                })
            );
            setPositions(enriched);
            setTotalStaked(formatUnits(tot, tokenDecimals));
            setUserStaked(formatUnits(mine, tokenDecimals));
            setTeacherByStaking(Number(formatUnits(mine, tokenDecimals)) >= 1000);
        } catch (e) {
            console.warn("Staking: on-chain load failed", e?.message);
        }
    }, [account, getContract, formatUnits, isCorrectNetwork, tokenDecimals]);

    useEffect(() => {
        refresh();
        const i = setInterval(refresh, 12000);
        return () => clearInterval(i);
    }, [refresh]);

    const approveAndStake = async () => {
        if (!stakeAmt) return;
        setBusy(true);
        try {
            const amount = parseUnits(stakeAmt, tokenDecimals);
            const ok = await ensureTokenApproval(ADDRESSES.IIITPStaking, amount);
            if (!ok) {
                setBusy(false);
                return;
            }
            const r = await sendTx("Stake", "IIITPStaking", "stake", [amount, tier]);
            if (r) {
                apiPost("/tx", {
                    wallet: account,
                    tx_hash: r.tx.hash,
                    type: "stake",
                    summary: `Staked ${stakeAmt} ${tokenSymbol} · ${TIERS[tier].label}`,
                }).catch(() => { });
                setStakeAmt("");
                refresh();
            }
        } finally {
            setBusy(false);
        }
    };

    const unstake = async (positionId) => {
        const r = await sendTx("Unstake position", "IIITPStaking", "unstake", [positionId]);
        if (r) {
            apiPost("/tx", {
                wallet: account,
                tx_hash: r.tx.hash,
                type: "unstake",
                summary: `Unstaked position #${positionId}`,
            }).catch(() => { });
            refresh();
        }
    };

    const claim = async (positionId) => {
        const r = await sendTx("Claim reward", "IIITPStaking", "claimReward", [positionId]);
        if (r) {
            apiPost("/tx", {
                wallet: account,
                tx_hash: r.tx.hash,
                type: "claim",
                summary: `Claimed flexible reward · pos #${positionId}`,
            }).catch(() => { });
            refresh();
        }
    };

    const totalPending = positions
        .filter((p) => p.active)
        .reduce((acc, p) => acc + Number(formatUnits(p.pending || 0n, tokenDecimals)), 0);

    return (
        <div className="space-y-6" data-testid="staking-page">
            <SectionTitle kicker="// staking" title="Stake IITP. Earn yield. Unlock teacher status.">
                Pick a tier — Flexible (5% APY, no lock), Standard (12%, 30 days), or Long (25%, 90
                days). Stake ≥ teacher threshold and you're auto-promoted on-chain.
            </SectionTitle>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Card><Stat label="YOUR STAKED" value={Number(userStaked).toFixed(2)} suffix={tokenSymbol} /></Card>
                <Card><Stat label="PENDING REWARDS" value={totalPending.toFixed(4)} suffix={tokenSymbol} accent="pink" /></Card>
                <Card><Stat label="TOTAL STAKED" value={Number(totalStaked).toFixed(0)} suffix={tokenSymbol} /></Card>
                <Card><Stat label="TEACHER STATUS" value={teacherByStaking ? "ACTIVE" : "—"} accent={teacherByStaking ? "pink" : "cyan"} /></Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {TIERS.map((t) => (
                    <button
                        key={t.id}
                        onClick={() => setTier(t.id)}
                        data-testid={`tier-${t.key.toLowerCase()}`}
                        className={[
                            "text-left glass cyberpunk-clip p-5 transition-all",
                            tier === t.id
                                ? "border-cyan-400 glow-cyan bg-cyan-400/5"
                                : "border-white/10 hover:border-cyan-400/40",
                        ].join(" ")}
                    >
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <Layers3 className={`size-4 ${tier === t.id ? "text-cyan-300" : "text-slate-500"}`} />
                                <span className="font-display text-lg text-white">{t.label}</span>
                            </div>
                            <span className="font-mono text-pink-400 text-glow-pink text-2xl">{t.apy}</span>
                        </div>
                        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">
                            {t.lockLabel} {t.id === 0 ? "" : "· 10% early-exit penalty"}
                        </div>
                    </button>
                ))}
            </div>

            <Card hoverable={false}>
                <div className="flex items-center gap-2 mb-3">
                    <Lock className="size-4 text-cyan-300" />
                    <h3 className="font-display text-xl text-white">
                        Stake {tokenSymbol} · {TIERS[tier].label}
                    </h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                    <div className="md:col-span-2">
                        <Input
                            label={`Amount (balance: ${Number(tokenBalance).toFixed(2)})`}
                            value={stakeAmt}
                            onChange={setStakeAmt}
                            testId="stake-input"
                        />
                    </div>
                    <button
                        onClick={approveAndStake}
                        disabled={!account || busy || !stakeAmt}
                        className="btn-cyber w-full"
                        data-testid="stake-btn"
                    >
                        Approve & Stake
                    </button>
                </div>
            </Card>

            <div>
                <h3 className="font-display text-2xl text-white mb-3">Your positions</h3>
                {positions.filter((p) => p.active).length === 0 && (
                    <Card hoverable={false}>
                        <p className="font-mono text-xs text-slate-400">
                            No active positions. Open a stake above ↑
                        </p>
                    </Card>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <AnimatePresence>
                        {positions
                            .filter((p) => p.active)
                            .map((p) => {
                                const t = TIERS[p.tier];
                                const now = Math.floor(Date.now() / 1000);
                                const locked = p.unlockAt > now;
                                const eta = Math.max(0, p.unlockAt - now);
                                return (
                                    <motion.div
                                        key={p.index}
                                        initial={{ opacity: 0, y: 14 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0 }}
                                        className="glass cyberpunk-clip p-5"
                                        data-testid={`position-${p.index}`}
                                    >
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-cyan-300/80">
                                                Position #{p.index}
                                            </span>
                                            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-pink-400">
                                                {t.label} · {t.apy}
                                            </span>
                                        </div>
                                        <div className="font-mono text-2xl text-white">
                                            {Number(formatUnits(p.amount, tokenDecimals)).toFixed(2)}
                                            <span className="text-slate-500 text-sm ml-2">{tokenSymbol}</span>
                                        </div>
                                        <div className="mt-1 text-xs text-slate-400 font-mono">
                                            Pending:{" "}
                                            <span className="text-cyan-300">
                                                {Number(formatUnits(p.pending || 0n, tokenDecimals)).toFixed(4)}{" "}
                                                {tokenSymbol}
                                            </span>
                                        </div>
                                        <div className="mt-2 text-xs font-mono">
                                            {locked ? (
                                                <span className="text-pink-400">
                                                    Locked · unlocks in {formatEta(eta)}
                                                </span>
                                            ) : (
                                                <span className="text-cyber-green">Unlocked</span>
                                            )}
                                        </div>
                                        <div className="mt-4 grid grid-cols-2 gap-2">
                                            {p.tier === 0 && (
                                                <button
                                                    onClick={() => claim(p.index)}
                                                    className="btn-cyber col-span-2"
                                                    data-testid={`claim-${p.index}`}
                                                >
                                                    <Gift className="size-4" /> Claim Reward
                                                </button>
                                            )}
                                            <button
                                                onClick={() => unstake(p.index)}
                                                className="btn-cyber btn-cyber-pink col-span-2"
                                                data-testid={`unstake-${p.index}`}
                                            >
                                                <Unlock className="size-4" />{" "}
                                                {locked ? "Early Unstake (-10%)" : "Unstake"}
                                            </button>
                                        </div>
                                    </motion.div>
                                );
                            })}
                    </AnimatePresence>
                </div>
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

function Input({ label, value, onChange, testId }) {
    return (
        <label className="block">
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500 mb-1">
                {label}
            </div>
            <input
                type="number"
                inputMode="decimal"
                placeholder="0.0"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                data-testid={testId}
                className="w-full bg-black/60 border border-white/10 rounded-md px-3 py-2.5 font-mono text-white text-lg focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400 transition"
            />
        </label>
    );
}
