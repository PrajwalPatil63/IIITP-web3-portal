import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Coins, ArrowRight, Vote, Server, Image as ImageIcon, Droplets, Layers, ArrowLeftRight } from "lucide-react";
import { Card, SectionTitle, Stat } from "../components/Card";
import { useWeb3 } from "../contexts/Web3Context";
import { apiGet } from "../lib/api";
import { useChainStats } from "../hooks/useChainStats";
import LiveStats from "../components/LiveStats";

export default function Dashboard() {
    const { account, ethBalance, tokenBalance, tokenSymbol, isCorrectNetwork, EXPLORER_URL } = useWeb3();
    const [tx, setTx] = useState([]);
    const chain = useChainStats(25000);

    useEffect(() => {
        if (!account) return;
        apiGet(`/tx/${account}`).then(setTx).catch(() => {});
    }, [account]);

    if (!account) {
        return (
            <Card>
                <div className="font-mono text-xs uppercase tracking-[0.2em] text-cyan-300/80 mb-2">
                    // wallet required
                </div>
                <h2 className="font-display text-3xl text-white">Connect your wallet to begin</h2>
                <p className="mt-2 text-slate-400">Use the connect button in the top-right.</p>
            </Card>
        );
    }

    return (
        <div className="space-y-8" data-testid="dashboard-page">
            <SectionTitle kicker="// dashboard" title="Welcome back, operator">
                Your portfolio, on-chain activity, and shortcuts to every protocol module.
            </SectionTitle>

            {!isCorrectNetwork && (
                <div className="glass cyberpunk-clip p-4 border-pink-500/40 text-pink-300 font-mono text-xs">
                    Network mismatch. Switch to Sepolia from the top-right to load on-chain data.
                </div>
            )}

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Card glow data-testid="stat-eth">
                    <Stat label="ETH BALANCE" value={Number(ethBalance).toFixed(4)} suffix="ETH" />
                </Card>
                <Card data-testid="stat-token">
                    <Stat
                        label={`${tokenSymbol} BALANCE`}
                        value={Number(tokenBalance).toFixed(2)}
                        suffix={tokenSymbol}
                        accent="pink"
                    />
                </Card>
                <Card>
                    <Stat label="WALLET" value={`${account.slice(0, 6)}…${account.slice(-4)}`} />
                </Card>
                <Card>
                    <Stat label="NETWORK" value={isCorrectNetwork ? "SEPOLIA" : "WRONG"} />
                </Card>
            </div>

            {/* Live on-chain telemetry across all 9 contracts */}
            <div>
                <div className="flex items-center gap-2 mb-3">
                    <span className="size-2 rounded-full bg-cyber-green blink shadow-[0_0_8px_#39FF14]" />
                    <div className="font-mono text-xs uppercase tracking-[0.3em] text-cyan-300/80">
                        // live from chain
                    </div>
                    <span className="font-mono text-[10px] text-slate-500">
                        block {chain.block ? "#" + chain.block.toLocaleString() : "…"}
                    </span>
                </div>
                <LiveStats />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <ShortcutCard to="/app/faucet" icon={Droplets} title="Claim Tokens" desc="Top up testnet IIITP" />
                <ShortcutCard to="/app/staking" icon={Coins} title="Stake & Earn" desc="Lock IIITP for yield" />
                <ShortcutCard to="/app/swap" icon={ArrowLeftRight} title="Swap" desc="ETH ↔ IIITP instantly" />
                <ShortcutCard to="/app/liquidity" icon={Layers} title="Liquidity" desc="Provide and earn fees" />
                <ShortcutCard to="/app/voting" icon={Vote} title="Governance" desc="Vote on proposals" />
                <ShortcutCard to="/app/nodes" icon={Server} title="Run a Node" desc="Register your device" />
                <ShortcutCard to="/app/nft" icon={ImageIcon} title="NFT Market" desc="IIIT Pune collectibles" />
            </div>

            <Card hoverable={false}>
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <div className="font-mono text-xs uppercase tracking-[0.2em] text-cyan-300/80">
                            // recent activity
                        </div>
                        <h3 className="font-display text-2xl text-white">Your transactions</h3>
                    </div>
                </div>
                {tx.length === 0 ? (
                    <div className="font-mono text-xs text-slate-500 py-8 text-center">
                        No tracked transactions yet. Stake, swap, or vote to see them here.
                    </div>
                ) : (
                    <div className="divide-y divide-white/5">
                        {tx.slice(0, 8).map((t) => (
                            <div key={t.id} className="flex items-center justify-between py-3 font-mono text-xs">
                                <div>
                                    <div className="text-white uppercase tracking-wider">{t.type}</div>
                                    <div className="text-slate-500">{t.summary}</div>
                                </div>
                                <a
                                    href={`${EXPLORER_URL}/tx/${t.tx_hash}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-cyan-300 hover:text-white"
                                >
                                    {t.tx_hash.slice(0, 10)}…
                                </a>
                            </div>
                        ))}
                    </div>
                )}
            </Card>
        </div>
    );
}

function ShortcutCard({ to, icon: Icon, title, desc }) {
    return (
        <Link to={to} data-testid={`shortcut-${title.toLowerCase().replace(/\s+/g, "-")}`}>
            <motion.div
                whileHover={{ y: -3 }}
                className="glass cyberpunk-clip p-5 group transition-all hover:border-cyan-400/40 hover:shadow-[0_0_20px_rgba(0,229,255,0.18)]"
            >
                <div className="flex items-center justify-between">
                    <Icon className="size-5 text-cyan-300" />
                    <ArrowRight className="size-4 text-slate-600 group-hover:text-cyan-300 transition" />
                </div>
                <div className="mt-4 font-display text-lg text-white">{title}</div>
                <div className="text-sm text-slate-400">{desc}</div>
            </motion.div>
        </Link>
    );
}
