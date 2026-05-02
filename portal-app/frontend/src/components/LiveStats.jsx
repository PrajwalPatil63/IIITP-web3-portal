import React from "react";
import { motion } from "framer-motion";
import { useChainStats } from "../hooks/useChainStats";

const fmtNum = (n, d = 0) => {
    if (!Number.isFinite(n) || n === 0) return "0";
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
    if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
    return n.toFixed(d);
};

/**
 * Live stats strip — reads all 9 deployed contracts via public Sepolia RPC.
 * Works without a wallet. Safe for public / landing pages.
 */
export default function LiveStats({ variant = "default", className = "" }) {
    const s = useChainStats(30000);

    const cards = [
        { k: "BLOCK",       v: s.block ? "#" + s.block.toLocaleString() : "—", accent: "cyan" },
        { k: "IITP SUPPLY", v: fmtNum(s.tokenSupply),                           accent: "cyan" },
        { k: "TVL (POOL)",  v: s.pool.tvlEth ? `${s.pool.tvlEth.toFixed(3)} ETH` : "—", accent: "pink" },
        { k: "TOTAL STAKED",v: fmtNum(s.totalStaked) + " IITP",                 accent: "cyan" },
        { k: "ACTIVE NODES",v: String(s.activeNodes),                           accent: "pink" },
        { k: "PROPOSALS",   v: `${s.activeProposals} / ${s.proposalCount}`,     accent: "cyan" },
        { k: "NFTs MINTED", v: String(s.nftsMinted),                            accent: "pink" },
        { k: "DICE ROLLS",  v: String(s.diceRolls),                             accent: "cyan" },
    ];

    if (variant === "compact") {
        return (
            <div className={`grid grid-cols-2 md:grid-cols-4 gap-3 ${className}`} data-testid="live-stats">
                {cards.slice(0, 4).map((c, i) => (
                    <LiveCard key={c.k} c={c} i={i} small />
                ))}
            </div>
        );
    }

    return (
        <div className={`grid grid-cols-2 md:grid-cols-4 gap-3 ${className}`} data-testid="live-stats">
            {cards.map((c, i) => (
                <LiveCard key={c.k} c={c} i={i} />
            ))}
        </div>
    );
}

function LiveCard({ c, i, small }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            className={`glass cyberpunk-clip ${small ? "p-2.5" : "p-3"}`}
        >
            <div className="flex items-center gap-1.5 mb-0.5">
                <span className="size-1.5 rounded-full bg-cyber-green blink shadow-[0_0_8px_#39FF14]" />
                <span className="font-mono text-[9px] text-slate-500 tracking-[0.3em] uppercase">
                    {c.k}
                </span>
            </div>
            <div
                className={[
                    "font-mono tracking-tight",
                    small ? "text-base" : "text-lg",
                    c.accent === "pink"
                        ? "text-pink-400 text-glow-pink"
                        : "text-cyan-300 text-glow-cyan",
                ].join(" ")}
            >
                {c.v}
            </div>
        </motion.div>
    );
}
