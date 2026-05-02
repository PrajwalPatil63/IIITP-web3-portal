import React from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowRight, ShieldCheck, Coins, Vote, Server, Image as ImageIcon, Layers, Droplets, Zap } from "lucide-react";
import { useWeb3 } from "../contexts/Web3Context";
import WalletButton from "../components/WalletButton";
import LiveStats from "../components/LiveStats";

const features = [
    { icon: Droplets, title: "Faucet", desc: "Claim test IIITP tokens with one click." },
    { icon: Coins, title: "Staking", desc: "Lock IIITP, earn yield, real on-chain APR." },
    { icon: Layers, title: "Liquidity", desc: "Provide ETH/IIITP, capture swap fees." },
    { icon: Zap, title: "Swap", desc: "AMM-style instant token swaps." },
    { icon: Vote, title: "Voting", desc: "Role-weighted governance for the campus." },
    { icon: Server, title: "Node Runner", desc: "Register your device, earn block rewards." },
    { icon: ImageIcon, title: "NFT Market", desc: "IIIT Pune branded collectibles." },
    { icon: ShieldCheck, title: "Admin Console", desc: "Operators manage faucet, pools, and treasury." },
];

export default function Landing() {
    const { account, isCorrectNetwork } = useWeb3();

    return (
        <div className="min-h-screen relative overflow-hidden">
            <div
                className="absolute inset-0 -z-10 opacity-40"
                style={{
                    backgroundImage:
                        "url(https://images.pexels.com/photos/30547584/pexels-photo-30547584.jpeg)",
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    filter: "saturate(1.2) contrast(1.1)",
                }}
            />
            <div className="absolute inset-0 -z-10 bg-gradient-to-b from-black/70 via-black/85 to-black" />

            {/* Header */}
            <header className="relative z-10 px-6 sm:px-10 h-20 flex items-center justify-between">
                <div className="flex items-center gap-3" data-testid="landing-logo">
                    <div className="size-9 rounded-sm bg-cyan-400/10 border border-cyan-400/60 flex items-center justify-center glow-cyan">
                        <span className="font-mono font-bold text-cyan-300">IP</span>
                    </div>
                    <div className="leading-tight">
                        <div className="font-display tracking-[0.2em] text-white uppercase text-sm">
                            IIIT Pune
                        </div>
                        <div className="font-mono text-[10px] text-cyan-300/70 tracking-wider">
                            // WEB3 PORTAL
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <WalletButton />
                </div>
            </header>

            {/* Hero */}
            <section className="relative z-10 px-6 sm:px-10 pt-12 pb-24">
                <div className="max-w-6xl mx-auto grid lg:grid-cols-12 gap-10 items-center">
                    <div className="lg:col-span-7">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5 }}
                            className="inline-flex items-center gap-2 px-3 py-1.5 glass-cyan cyberpunk-clip font-mono text-[10px] tracking-[0.3em] text-cyan-300 uppercase mb-6"
                        >
                            <span className="size-1.5 rounded-full bg-cyber-green blink" />
                            Live on Sepolia Testnet
                        </motion.div>
                        <motion.h1
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.6, delay: 0.05 }}
                            className="font-display text-5xl sm:text-6xl lg:text-7xl font-bold leading-[0.95] tracking-tight text-white"
                        >
                            The campus chain.
                            <br />
                            <span className="text-cyan-300 text-glow-cyan">Decentralized.</span>{" "}
                            <span className="text-pink-400 text-glow-pink">On-chain.</span>
                        </motion.h1>
                        <motion.p
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.6, delay: 0.15 }}
                            className="mt-6 text-slate-300 max-w-xl text-lg leading-relaxed"
                        >
                            A complete Web3 portal for IIIT Pune students and teachers — connect MetaMask
                            and stake, swap, govern, mint NFTs, and run network nodes from your own device.
                        </motion.p>

                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.6, delay: 0.25 }}
                            className="mt-8 flex flex-wrap items-center gap-4"
                        >
                            <Link
                                to={account && isCorrectNetwork ? "/app" : "#"}
                                onClick={(e) => {
                                    if (!account || !isCorrectNetwork) e.preventDefault();
                                }}
                                data-testid="enter-portal-btn"
                                className={[
                                    "btn-cyber",
                                    account && isCorrectNetwork ? "" : "opacity-50 cursor-not-allowed",
                                ].join(" ")}
                            >
                                Enter Portal <ArrowRight className="size-4" />
                            </Link>
                            <Link
                                to="/getting-started"
                                className="btn-cyber btn-cyber-pink"
                                data-testid="getting-started-link"
                            >
                                New here? Get Started
                            </Link>
                            <a
                                href="https://sepolia.etherscan.io/address/0x74c91A0c96aF5d53722a9Cacc030510354CAE6B7"
                                target="_blank"
                                rel="noreferrer"
                                className="font-mono text-xs text-cyan-300/80 hover:text-white tracking-[0.2em] uppercase border-b border-cyan-400/40 hover:border-white pb-0.5"
                                data-testid="view-token-link"
                            >
                                View IIITP Token →
                            </a>
                        </motion.div>

                        {/* Stats strip */}
                        <div className="mt-12 grid grid-cols-3 gap-4 max-w-lg">
                            {[
                                { k: "CHAIN", v: "SEPOLIA" },
                                { k: "CONTRACTS", v: "09" },
                                { k: "ROLES", v: "3" },
                            ].map((s, i) => (
                                <motion.div
                                    key={s.k}
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: 0.4 + i * 0.08 }}
                                    className="glass cyberpunk-clip p-3"
                                >
                                    <div className="font-mono text-[9px] text-slate-500 tracking-[0.3em]">
                                        {s.k}
                                    </div>
                                    <div className="font-mono text-cyan-300 text-glow-cyan text-lg">
                                        {s.v}
                                    </div>
                                </motion.div>
                            ))}
                        </div>

                        {/* Live chain telemetry */}
                        <div className="mt-8 max-w-2xl">
                            <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-pink-400 mb-2">
                                // live from sepolia
                            </div>
                            <LiveStats />
                        </div>
                    </div>

                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.7, delay: 0.2 }}
                        className="lg:col-span-5"
                    >
                        <div className="relative">
                            <div className="glass-cyan cyberpunk-clip p-8 pulse-border">
                                <div className="font-mono text-[10px] text-cyan-300/70 tracking-[0.3em] mb-2">
                                    // STEP_01
                                </div>
                                <h3 className="font-display text-2xl text-white mb-1">
                                    Connect your wallet
                                </h3>
                                <p className="text-slate-400 text-sm mb-6">
                                    The portal unlocks once your wallet is bridged to Sepolia.
                                </p>
                                <div className="space-y-3 font-mono text-xs">
                                    {[
                                        ["IIITPToken", "0x74c9…E6B7"],
                                        ["IIITPFaucet", "0xF1D6…1f3B"],
                                        ["IIITPStaking", "0x1339…99Ac"],
                                        ["LiquidityPool", "0xA649…4b7C"],
                                        ["NodeRegistry", "0xD1E7…CDaB"],
                                        ["Voting", "0x6EaB…156e3"],
                                    ].map(([k, v]) => (
                                        <div key={k} className="flex items-center justify-between border-b border-white/5 py-1.5">
                                            <span className="text-slate-400">{k}</span>
                                            <span className="text-cyan-300">{v}</span>
                                        </div>
                                    ))}
                                </div>
                                <div className="mt-6">
                                    <WalletButton />
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </div>
            </section>

            {/* Features */}
            <section className="relative z-10 px-6 sm:px-10 pb-24">
                <div className="max-w-6xl mx-auto">
                    <div className="font-mono text-xs uppercase tracking-[0.3em] text-pink-400 mb-2">
                        // CAPABILITIES
                    </div>
                    <h2 className="font-display text-3xl sm:text-4xl text-white mb-10">
                        Everything you need, on one chain.
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {features.map((f, i) => (
                            <motion.div
                                key={f.title}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.4, delay: i * 0.05 }}
                                className="glass cyberpunk-clip p-5 hover:border-cyan-400/40 transition"
                            >
                                <f.icon className="size-5 text-cyan-300 mb-3" />
                                <div className="font-display text-lg text-white">{f.title}</div>
                                <div className="text-sm text-slate-400 mt-1">{f.desc}</div>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            <footer className="relative z-10 border-t border-white/5 px-6 sm:px-10 py-6">
                <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-3 font-mono text-xs text-slate-500">
                    <div>// © IIIT Pune Web3 Portal — built for the campus, owned by users</div>
                    <div className="text-cyan-400/70">SEPOLIA · 11155111</div>
                </div>
            </footer>
        </div>
    );
}
