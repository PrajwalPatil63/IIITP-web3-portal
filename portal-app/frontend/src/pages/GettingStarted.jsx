import React, { useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Card, SectionTitle } from "../components/Card";
import { useWeb3 } from "../contexts/Web3Context";
import {
    Wallet, Coins, Droplets, ExternalLink, Check, Copy, ArrowRight, Network, ShieldCheck, Info,
} from "lucide-react";
import { toast } from "sonner";
import { ADDRESSES, CHAIN_ID_HEX, TARGET_IITP_PER_ETH } from "../contracts/config";

const SEPOLIA_FAUCETS = [
    {
        name: "Google Cloud Web3 Faucet",
        url: "https://cloud.google.com/application/web3/faucet/ethereum/sepolia",
        desc: "0.05 ETH every 24h · Google account required",
        highlight: true,
    },
    {
        name: "Alchemy Sepolia Faucet",
        url: "https://www.alchemy.com/faucets/ethereum-sepolia",
        desc: "0.5 ETH every 72h · Alchemy account required",
    },
    {
        name: "QuickNode Sepolia Faucet",
        url: "https://faucet.quicknode.com/ethereum/sepolia",
        desc: "0.05 ETH · tweet/social verification",
    },
    {
        name: "PoW Sepolia Faucet",
        url: "https://sepolia-faucet.pk910.de/",
        desc: "Mine in-browser · no signup",
    },
];

export default function GettingStartedPage({ publicMode = false }) {
    const { hasMetaMask, connect, account, switchNetwork, isCorrectNetwork, tokenSymbol } = useWeb3();
    const [copied, setCopied] = useState(false);

    const copyAddr = () => {
        navigator.clipboard.writeText(ADDRESSES.IIITPToken);
        setCopied(true);
        toast.success("IITP token address copied");
        setTimeout(() => setCopied(false), 2000);
    };

    const addSepoliaNetwork = async () => {
        if (!hasMetaMask) {
            toast.error("Install MetaMask first");
            return;
        }
        try {
            await window.ethereum.request({
                method: "wallet_addEthereumChain",
                params: [
                    {
                        chainId: CHAIN_ID_HEX,
                        chainName: "Sepolia Testnet",
                        nativeCurrency: { name: "Sepolia ETH", symbol: "ETH", decimals: 18 },
                        rpcUrls: ["https://rpc.sepolia.org", "https://ethereum-sepolia-rpc.publicnode.com"],
                        blockExplorerUrls: ["https://sepolia.etherscan.io"],
                    },
                ],
            });
            toast.success("Sepolia added to MetaMask");
        } catch (e) {
            toast.error(e?.message || "User rejected");
        }
    };

    const addTokenToMetaMask = async () => {
        if (!hasMetaMask) {
            toast.error("Install MetaMask first");
            return;
        }
        try {
            const added = await window.ethereum.request({
                method: "wallet_watchAsset",
                params: {
                    type: "ERC20",
                    options: {
                        address: ADDRESSES.IIITPToken,
                        symbol: "IITP",
                        decimals: 18,
                        image: "https://images.pexels.com/photos/14911398/pexels-photo-14911398.jpeg",
                    },
                },
            });
            if (added) toast.success("IITP token added to MetaMask");
        } catch (e) {
            toast.error(e?.message || "Failed to add token");
        }
    };

    const Wrapper = publicMode ? PublicWrapper : React.Fragment;
    const wrapperProps = publicMode ? {} : {};

    const content = (
        <div className="space-y-8" data-testid="getting-started-page">
            <SectionTitle kicker="// onboarding" title="Get started in 4 steps">
                New to Web3? Follow these steps to fund your wallet with Sepolia ETH, import the
                IITP token, and start using every module in the portal.
            </SectionTitle>

            {/* Price ticker */}
            <Card hoverable={false} className="bg-gradient-to-br from-cyan-500/5 to-pink-500/5">
                <div className="flex items-center gap-3 mb-2">
                    <Info className="size-4 text-cyan-300" />
                    <h3 className="font-display text-lg text-white">Target reference price</h3>
                </div>
                <div className="font-mono text-2xl md:text-3xl text-cyan-300 text-glow-cyan">
                    1,000 IITP = 0.01 Sepolia ETH
                </div>
                <div className="font-mono text-xs text-slate-400 mt-1">
                    1 ETH = {TARGET_IITP_PER_ETH.toLocaleString()} IITP · used by the liquidity pool
                    once seeded. Actual swap rate is always decided by on-chain reserves.
                </div>
            </Card>

            {/* Step 1 */}
            <Step n={1} title="Install MetaMask & connect" icon={Wallet}>
                <p className="text-slate-300">
                    MetaMask is the wallet that stores your Sepolia ETH and IITP tokens and signs
                    every transaction.
                </p>
                <div className="flex flex-wrap gap-3">
                    {!hasMetaMask && (
                        <a
                            href="https://metamask.io/download/"
                            target="_blank"
                            rel="noreferrer"
                            className="btn-cyber"
                            data-testid="install-metamask-link"
                        >
                            Install MetaMask <ExternalLink className="size-3.5" />
                        </a>
                    )}
                    {hasMetaMask && !account && (
                        <button onClick={connect} className="btn-cyber" data-testid="gs-connect-btn">
                            <Wallet className="size-4" /> Connect Wallet
                        </button>
                    )}
                    {account && (
                        <div className="font-mono text-xs text-cyber-green flex items-center gap-2">
                            <Check className="size-4" /> Connected as {account.slice(0, 6)}…{account.slice(-4)}
                        </div>
                    )}
                </div>
            </Step>

            {/* Step 2 */}
            <Step n={2} title="Switch to Sepolia testnet" icon={Network}>
                <p className="text-slate-300">
                    IIIT Pune Web3 Portal runs on <b>Sepolia</b>, Ethereum's test network. Your real
                    ETH is never touched.
                </p>
                <div className="flex flex-wrap gap-3">
                    <button
                        onClick={addSepoliaNetwork}
                        className="btn-cyber"
                        data-testid="add-sepolia-btn"
                    >
                        <Network className="size-4" /> Add Sepolia to MetaMask
                    </button>
                    {account && !isCorrectNetwork && (
                        <button
                            onClick={switchNetwork}
                            className="btn-cyber btn-cyber-pink"
                            data-testid="switch-to-sepolia-btn"
                        >
                            Switch now
                        </button>
                    )}
                    {account && isCorrectNetwork && (
                        <div className="font-mono text-xs text-cyber-green flex items-center gap-2">
                            <Check className="size-4" /> On Sepolia
                        </div>
                    )}
                </div>
            </Step>

            {/* Step 3 */}
            <Step n={3} title="Get free Sepolia ETH" icon={Droplets}>
                <p className="text-slate-300">
                    You'll need a small amount of Sepolia ETH to pay gas for your transactions.
                    Use any of these free faucets — <b>Google Cloud</b> is the easiest.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {SEPOLIA_FAUCETS.map((f) => (
                        <a
                            key={f.url}
                            href={f.url}
                            target="_blank"
                            rel="noreferrer"
                            data-testid={`faucet-link-${f.name.toLowerCase().split(" ")[0]}`}
                            className={[
                                "group cyberpunk-clip p-4 border transition-all flex items-start gap-3",
                                f.highlight
                                    ? "border-cyber-green/40 bg-cyber-green/5 hover:border-cyber-green hover:glow-cyan"
                                    : "border-white/10 hover:border-cyan-400/40",
                            ].join(" ")}
                        >
                            <Droplets
                                className={f.highlight ? "size-5 text-cyber-green" : "size-5 text-cyan-300"}
                            />
                            <div className="flex-1">
                                <div className="font-display text-white flex items-center gap-2">
                                    {f.name}
                                    {f.highlight && (
                                        <span className="font-mono text-[9px] text-cyber-green uppercase tracking-[0.2em] px-1.5 py-0.5 border border-cyber-green/40">
                                            RECOMMENDED
                                        </span>
                                    )}
                                </div>
                                <div className="font-mono text-[10px] text-slate-400 mt-0.5">
                                    {f.desc}
                                </div>
                            </div>
                            <ExternalLink className="size-4 text-slate-500 group-hover:text-white transition" />
                        </a>
                    ))}
                </div>
            </Step>

            {/* Step 4 */}
            <Step n={4} title="Import the IITP token" icon={Coins}>
                <p className="text-slate-300">
                    MetaMask shows only ETH by default. You need to import the IITP token contract
                    so its balance shows up in your wallet.
                </p>

                <div className="glass-cyan cyberpunk-clip p-4">
                    <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-cyan-300/80 mb-1">
                        IITP Token Address (Sepolia)
                    </div>
                    <div className="flex items-center gap-3">
                        <code className="flex-1 font-mono text-xs sm:text-sm text-white break-all">
                            {ADDRESSES.IIITPToken}
                        </code>
                        <button
                            onClick={copyAddr}
                            className="btn-cyber px-3 py-1.5"
                            data-testid="copy-token-address-btn"
                        >
                            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                            {copied ? "Copied" : "Copy"}
                        </button>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <button
                        onClick={addTokenToMetaMask}
                        className="btn-cyber"
                        data-testid="add-token-btn"
                    >
                        <Coins className="size-4" /> Add IITP to MetaMask (1-click)
                    </button>
                    <span className="font-mono text-[10px] text-slate-500">
                        or manually: MetaMask → Import tokens → paste address → Symbol: IITP · Decimals: 18
                    </span>
                </div>

                <details className="glass cyberpunk-clip p-4">
                    <summary className="cursor-pointer font-display text-sm text-white">
                        Show me the manual MetaMask steps
                    </summary>
                    <ol className="mt-3 space-y-2 font-mono text-xs text-slate-300 list-decimal list-inside">
                        <li>Open MetaMask and make sure you're on <b className="text-cyan-300">Sepolia</b> network (top dropdown).</li>
                        <li>Scroll to the bottom of "Tokens" → click <b>Import tokens</b>.</li>
                        <li>Paste the IITP token address above.</li>
                        <li>MetaMask will auto-detect <b>Symbol: IITP</b> and <b>Decimals: 18</b>.</li>
                        <li>Click <b>Next</b> → <b>Import</b>. You'll now see your IITP balance.</li>
                    </ol>
                </details>
            </Step>

            {/* Step 5: Claim */}
            <Step n={5} title="Claim your first IITP tokens" icon={ShieldCheck}>
                <p className="text-slate-300">
                    Use the faucet inside the portal to get your first {tokenSymbol} tokens —{" "}
                    students get 100, teachers get 500 per claim (every 24 hours).
                </p>
                <div className="flex flex-wrap gap-3">
                    <Link
                        to="/app/faucet"
                        className="btn-cyber"
                        data-testid="go-to-faucet-btn"
                    >
                        <Droplets className="size-4" /> Open Faucet <ArrowRight className="size-4" />
                    </Link>
                </div>
            </Step>

            {/* Now what */}
            <Card hoverable={false}>
                <h3 className="font-display text-xl text-white mb-3">Now what?</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    <NextLink to="/app" title="Dashboard" desc="See your balances and activity" />
                    <NextLink to="/app/staking" title="Stake" desc="Earn yield on your IITP" />
                    <NextLink to="/app/swap" title="Swap" desc="Trade ETH ↔ IITP" />
                    <NextLink to="/app/voting" title="Govern" desc="Vote on proposals" />
                    <NextLink to="/app/nodes" title="Run a node" desc="Validate the chain" />
                    <NextLink to="/app/nft" title="NFT market" desc="Mint and trade NFTs" />
                </div>
            </Card>
        </div>
    );

    return (
        <Wrapper {...wrapperProps}>
            {publicMode ? <div className="max-w-4xl mx-auto px-4 sm:px-8 py-10">{content}</div> : content}
        </Wrapper>
    );
}

function Step({ n, title, icon: Icon, children }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="glass cyberpunk-clip p-6"
        >
            <div className="flex items-center gap-3 mb-4">
                <div className="size-10 rounded-sm bg-cyan-400/10 border border-cyan-400/60 flex items-center justify-center font-mono text-cyan-300 glow-cyan">
                    {n}
                </div>
                <div className="flex items-center gap-2">
                    <Icon className="size-5 text-cyan-300" />
                    <h3 className="font-display text-2xl text-white">{title}</h3>
                </div>
            </div>
            <div className="space-y-4">{children}</div>
        </motion.div>
    );
}

function NextLink({ to, title, desc }) {
    return (
        <Link
            to={to}
            className="group glass cyberpunk-clip p-4 hover:border-cyan-400/40 transition-all hover:shadow-[0_0_18px_rgba(0,229,255,0.18)]"
        >
            <div className="flex items-center justify-between">
                <div>
                    <div className="font-display text-white">{title}</div>
                    <div className="text-xs text-slate-400">{desc}</div>
                </div>
                <ArrowRight className="size-4 text-slate-600 group-hover:text-cyan-300 transition" />
            </div>
        </Link>
    );
}

function PublicWrapper({ children }) {
    return (
        <div className="min-h-screen relative overflow-hidden">
            <div
                className="absolute inset-0 -z-10 opacity-30"
                style={{
                    backgroundImage:
                        "url(https://images.pexels.com/photos/30547584/pexels-photo-30547584.jpeg)",
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                }}
            />
            <div className="absolute inset-0 -z-10 bg-gradient-to-b from-black/80 via-black/90 to-black" />
            <header className="relative z-10 px-6 sm:px-10 h-20 flex items-center justify-between">
                <Link to="/" className="flex items-center gap-3" data-testid="gs-logo-home">
                    <div className="size-9 rounded-sm bg-cyan-400/10 border border-cyan-400/60 flex items-center justify-center glow-cyan">
                        <span className="font-mono font-bold text-cyan-300">IP</span>
                    </div>
                    <div className="leading-tight">
                        <div className="font-display tracking-[0.2em] text-white uppercase text-sm">
                            IIIT Pune
                        </div>
                        <div className="font-mono text-[10px] text-cyan-300/70 tracking-wider">
                            // WEB3 PORTAL · GETTING STARTED
                        </div>
                    </div>
                </Link>
                <Link to="/" className="font-mono text-xs text-cyan-300/80 hover:text-white uppercase tracking-[0.2em]">
                    ← Back to home
                </Link>
            </header>
            {children}
        </div>
    );
}
