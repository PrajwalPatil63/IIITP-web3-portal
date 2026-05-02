import React, { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, SectionTitle, Stat } from "../components/Card";
import { useWeb3 } from "../contexts/Web3Context";
import { Dice1, Dice2, Dice3, Dice4, Dice5, Dice6, TrendingUp, TrendingDown, Target } from "lucide-react";
import { apiPost } from "../lib/api";
import { toast } from "sonner";
import { DICE_BET, DICE_BET_LABELS } from "../contracts/config";

const DICE_ICONS = [Dice1, Dice2, Dice3, Dice4, Dice5, Dice6];

export default function GamesPage() {
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

    const [wager, setWager] = useState("1");
    const [betType, setBetType] = useState(0); // OVER
    const [target, setTarget] = useState(3);
    const [minBet, setMinBet] = useState("1");
    const [maxBet, setMaxBet] = useState("0");
    const [house, setHouse] = useState("0");
    const [history, setHistory] = useState([]);
    const [stats, setStats] = useState({ rolls: 0, wagered: "0", paidOut: "0" });
    const [busy, setBusy] = useState(false);
    const [lastRoll, setLastRoll] = useState(null);

    const refresh = useCallback(async () => {
        if (!isCorrectNetwork || !account) return;
        try {
            const d = getContract("IIITPDice");
            const [mb, max, hb, st, hist] = await Promise.all([
                d.minBet().catch(() => 0n),
                d.maxBetAmount().catch(() => 0n),
                d.houseBalance().catch(() => 0n),
                d.getStats().catch(() => [0n, 0n, 0n, 0n]),
                d.getHistory(account).catch(() => []),
            ]);
            setMinBet(formatUnits(mb, tokenDecimals));
            setMaxBet(formatUnits(max, tokenDecimals));
            setHouse(formatUnits(hb, tokenDecimals));
            setStats({
                rolls: Number(st[0]),
                wagered: formatUnits(st[1], tokenDecimals),
                paidOut: formatUnits(st[2], tokenDecimals),
            });
            const rows = hist
                .map((h, i) => ({
                    id: i,
                    roll: Number(h.roll),
                    wager: formatUnits(h.wager, tokenDecimals),
                    payout: formatUnits(h.payout, tokenDecimals),
                    betType: Number(h.betType),
                    target: Number(h.target),
                    won: !!h.won,
                    timestamp: Number(h.timestamp),
                }))
                .reverse()
                .slice(0, 20);
            setHistory(rows);
        } catch (e) {
            console.warn("Dice: load failed", e?.message);
        }
    }, [account, getContract, formatUnits, isCorrectNetwork, tokenDecimals]);

    useEffect(() => {
        refresh();
        const i = setInterval(refresh, 12000);
        return () => clearInterval(i);
    }, [refresh]);

    // Valid target ranges per bet type
    useEffect(() => {
        if (betType === DICE_BET.OVER && (target < 1 || target > 5)) setTarget(3);
        if (betType === DICE_BET.UNDER && (target < 2 || target > 6)) setTarget(4);
        if (betType === DICE_BET.EXACT && (target < 1 || target > 6)) setTarget(6);
    }, [betType, target]);

    const rollDice = async () => {
        if (!wager || Number(wager) < Number(minBet)) {
            toast.error(`Minimum bet is ${minBet} ${tokenSymbol}`);
            return;
        }
        if (Number(wager) > Number(maxBet)) {
            toast.error(`Max bet is ${Number(maxBet).toFixed(2)} ${tokenSymbol}`);
            return;
        }
        // Validate target BEFORE spending gas on approval
        if (Number(betType) === 0 && (Number(target) < 1 || Number(target) > 5)) {
            toast.error("OVER target must be 1-5");
            return;
        }
        if (Number(betType) === 1 && (Number(target) < 2 || Number(target) > 6)) {
            toast.error("UNDER target must be 2-6");
            return;
        }
        if (Number(betType) === 2 && (Number(target) < 1 || Number(target) > 6)) {
            toast.error("EXACT target must be 1-6");
            return;
        }
        setBusy(true);
        setLastRoll(null);
        try {
            const w = parseUnits(wager, tokenDecimals);
            const ok = await ensureTokenApproval(ADDRESSES.IIITPDice, w);
            if (!ok) return;
            const r = await sendTx("Roll dice", "IIITPDice", "roll", [w, Number(betType), Number(target)]);
            if (r) {
                apiPost("/tx", {
                    wallet: account,
                    tx_hash: r.tx.hash,
                    type: "dice-roll",
                    summary: `${DICE_BET_LABELS[betType]} ${target} · ${wager} ${tokenSymbol}`,
                }).catch(() => { });
                // Parse Rolled event to get result
                try {
                    const d = getContract("IIITPDice");
                    const logs = r.receipt.logs
                        .map((l) => {
                            try {
                                return d.interface.parseLog(l);
                            } catch {
                                return null;
                            }
                        })
                        .filter((e) => e && e.name === "Rolled");
                    if (logs[0]) {
                        const ev = logs[0].args;
                        setLastRoll({
                            roll: Number(ev.roll),
                            won: ev.won,
                            payout: formatUnits(ev.payout, tokenDecimals),
                            wager,
                        });
                        if (ev.won) {
                            toast.success(`Rolled ${Number(ev.roll)}! Won ${formatUnits(ev.payout, tokenDecimals)} ${tokenSymbol}`);
                        } else {
                            toast.error(`Rolled ${Number(ev.roll)}. Better luck next time.`);
                        }
                    }
                } catch (e) {
                    console.warn("Dice: event parse failed", e?.message);
                }
                setTimeout(refresh, 2000);
            }
        } finally {
            setBusy(false);
        }
    };

    const targetRange =
        betType === DICE_BET.OVER
            ? [1, 2, 3, 4, 5]
            : betType === DICE_BET.UNDER
                ? [2, 3, 4, 5, 6]
                : [1, 2, 3, 4, 5, 6];

    const winChance =
        betType === DICE_BET.OVER
            ? ((6 - target) / 6) * 100
            : betType === DICE_BET.UNDER
                ? ((target - 1) / 6) * 100
                : (1 / 6) * 100;

    const multiplier =
        betType === DICE_BET.EXACT
            ? 5
            : betType === DICE_BET.OVER
                ? (6 / (6 - target)) * 0.95
                : (6 / (target - 1)) * 0.95;

    return (
        <div className="space-y-6" data-testid="games-page">
            <SectionTitle kicker="// on-chain dice" title="Roll the dice. Earn IITP.">
                Real on-chain pseudo-random dice with 3 modes: bet OVER, UNDER, or on an EXACT roll.
                5x payout on exact hits. 5% house edge. All settled on-chain instantly.
            </SectionTitle>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Card><Stat label="MIN BET" value={Number(minBet).toFixed(0)} suffix={tokenSymbol} /></Card>
                <Card><Stat label="MAX BET" value={Number(maxBet).toFixed(0)} suffix={tokenSymbol} /></Card>
                <Card><Stat label="HOUSE BALANCE" value={Number(house).toFixed(0)} suffix={tokenSymbol} accent="pink" /></Card>
                <Card><Stat label="TOTAL ROLLS" value={stats.rolls} /></Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Bet panel */}
                <div className="lg:col-span-2 space-y-4">
                    <Card hoverable={false}>
                        <h3 className="font-display text-xl text-white mb-4">Place your bet</h3>

                        {/* Bet type */}
                        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500 mb-2">
                            Bet type
                        </div>
                        <div className="grid grid-cols-3 gap-2 mb-5">
                            {[
                                { id: 0, label: "OVER", icon: TrendingUp, desc: "Roll > target" },
                                { id: 1, label: "UNDER", icon: TrendingDown, desc: "Roll < target" },
                                { id: 2, label: "EXACT", icon: Target, desc: "Exact · 5x" },
                            ].map((b) => {
                                const Icon = b.icon;
                                return (
                                    <button
                                        key={b.id}
                                        onClick={() => setBetType(b.id)}
                                        data-testid={`bet-${b.label.toLowerCase()}`}
                                        className={[
                                            "p-3 cyberpunk-clip border transition text-left",
                                            betType === b.id
                                                ? "border-cyan-400 bg-cyan-400/10 glow-cyan"
                                                : "border-white/10 hover:border-cyan-400/40",
                                        ].join(" ")}
                                    >
                                        <Icon className={`size-4 mb-1 ${betType === b.id ? "text-cyan-300" : "text-slate-500"}`} />
                                        <div className="font-display text-sm text-white">{b.label}</div>
                                        <div className="text-[9px] text-slate-500 mt-0.5">{b.desc}</div>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Target picker */}
                        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500 mb-2">
                            Target
                        </div>
                        <div className="flex gap-2 mb-5 flex-wrap">
                            {targetRange.map((n) => {
                                const Icon = DICE_ICONS[n - 1];
                                return (
                                    <button
                                        key={n}
                                        onClick={() => setTarget(n)}
                                        data-testid={`target-${n}`}
                                        className={[
                                            "size-14 cyberpunk-clip border flex items-center justify-center transition",
                                            target === n
                                                ? "border-pink-400 bg-pink-400/10 glow-pink text-pink-300"
                                                : "border-white/10 text-slate-500 hover:text-white hover:border-cyan-400/40",
                                        ].join(" ")}
                                    >
                                        <Icon className="size-6" />
                                    </button>
                                );
                            })}
                        </div>

                        {/* Wager */}
                        <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
                            <label className="block">
                                <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500 mb-1">
                                    Wager · balance {Number(tokenBalance).toFixed(2)}
                                </div>
                                <input
                                    type="number"
                                    inputMode="decimal"
                                    value={wager}
                                    onChange={(e) => setWager(e.target.value)}
                                    data-testid="wager-input"
                                    className="w-full bg-black/60 border border-white/10 rounded-md px-3 py-2.5 font-mono text-white text-lg focus:border-cyan-400 focus:outline-none"
                                />
                            </label>
                            <button
                                onClick={rollDice}
                                disabled={busy || !wager}
                                className="btn-cyber btn-cyber-pink h-[42px] px-8"
                                data-testid="roll-btn"
                            >
                                {busy ? "Rolling…" : "Roll"}
                            </button>
                        </div>

                        {/* Odds summary */}
                        <div className="mt-4 p-3 glass cyberpunk-clip grid grid-cols-3 gap-3 font-mono text-xs">
                            <div>
                                <div className="text-[9px] text-slate-500 uppercase tracking-[0.2em]">Win chance</div>
                                <div className="text-cyber-green">{winChance.toFixed(1)}%</div>
                            </div>
                            <div>
                                <div className="text-[9px] text-slate-500 uppercase tracking-[0.2em]">Multiplier</div>
                                <div className="text-cyan-300">{multiplier.toFixed(2)}x</div>
                            </div>
                            <div>
                                <div className="text-[9px] text-slate-500 uppercase tracking-[0.2em]">To win</div>
                                <div className="text-pink-400">
                                    {(Number(wager) * multiplier).toFixed(2)} {tokenSymbol}
                                </div>
                            </div>
                        </div>
                    </Card>

                    {/* Big roll result */}
                    <AnimatePresence>
                        {lastRoll && (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0 }}
                                className={[
                                    "cyberpunk-clip p-6 border-2 flex items-center gap-6",
                                    lastRoll.won ? "border-cyber-green glow-cyan" : "border-pink-500 glow-pink",
                                ].join(" ")}
                                data-testid="roll-result"
                            >
                                {(() => {
                                    const Icon = DICE_ICONS[lastRoll.roll - 1];
                                    return <Icon className="size-20 text-white" />;
                                })()}
                                <div>
                                    <div className={`font-display text-4xl ${lastRoll.won ? "text-cyber-green" : "text-pink-400"}`}>
                                        {lastRoll.won ? "YOU WON" : "HOUSE WINS"}
                                    </div>
                                    <div className="font-mono text-sm text-slate-300 mt-1">
                                        Rolled <span className="text-white text-lg">{lastRoll.roll}</span> ·{" "}
                                        {lastRoll.won
                                            ? `+${Number(lastRoll.payout).toFixed(2)} ${tokenSymbol}`
                                            : `−${lastRoll.wager} ${tokenSymbol}`}
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* History */}
                <Card hoverable={false}>
                    <h3 className="font-display text-lg text-white mb-3">Your rolls</h3>
                    {history.length === 0 ? (
                        <p className="font-mono text-xs text-slate-500">
                            No rolls yet. Place your first bet →
                        </p>
                    ) : (
                        <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                            {history.map((h) => {
                                const Icon = DICE_ICONS[h.roll - 1];
                                return (
                                    <div
                                        key={h.timestamp + "_" + h.id}
                                        className={[
                                            "flex items-center gap-3 p-2 cyberpunk-clip border font-mono text-xs",
                                            h.won ? "border-cyber-green/30 bg-cyber-green/5" : "border-pink-500/20 bg-pink-500/5",
                                        ].join(" ")}
                                    >
                                        <Icon className={`size-6 ${h.won ? "text-cyber-green" : "text-pink-400"}`} />
                                        <div className="flex-1">
                                            <div className="text-white">
                                                {DICE_BET_LABELS[h.betType]} {h.target}
                                            </div>
                                            <div className="text-[10px] text-slate-500">
                                                Wager {Number(h.wager).toFixed(2)}
                                            </div>
                                        </div>
                                        <div className={h.won ? "text-cyber-green" : "text-slate-400"}>
                                            {h.won ? `+${Number(h.payout).toFixed(2)}` : "Lost"}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </Card>
            </div>
        </div>
    );
}
