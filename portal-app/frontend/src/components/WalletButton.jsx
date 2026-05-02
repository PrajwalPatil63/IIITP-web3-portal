import React from "react";
import { motion } from "framer-motion";
import { Wallet, Power, AlertTriangle } from "lucide-react";
import { useWeb3 } from "../contexts/Web3Context";

const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");

export default function WalletButton() {
    const { account, connect, connecting, isCorrectNetwork, switchNetwork, disconnect, ethBalance } =
        useWeb3();

    if (!account) {
        return (
            <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={connect}
                disabled={connecting}
                data-testid="connect-wallet-btn"
                className="btn-cyber"
            >
                <Wallet className="size-4" />
                {connecting ? "Connecting…" : "Connect Wallet"}
            </motion.button>
        );
    }

    if (!isCorrectNetwork) {
        return (
            <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={switchNetwork}
                data-testid="switch-network-btn"
                className="btn-cyber btn-cyber-pink"
            >
                <AlertTriangle className="size-4" /> Switch to Sepolia
            </motion.button>
        );
    }

    return (
        <div className="flex items-center gap-2">
            <div
                className="hidden sm:flex items-center gap-2 px-3 py-2 glass-cyan cyberpunk-clip font-mono text-xs"
                data-testid="wallet-balance"
            >
                <span className="text-cyan-300/80">ETH</span>
                <span className="text-white">{Number(ethBalance).toFixed(4)}</span>
            </div>
            <div
                className="flex items-center gap-2 px-3 py-2 glass cyberpunk-clip"
                data-testid="wallet-address-display"
            >
                <span className="size-2 rounded-full bg-cyber-green blink shadow-[0_0_8px_#39FF14]" />
                <span className="font-mono text-xs text-white">{short(account)}</span>
                <button
                    onClick={disconnect}
                    title="Disconnect (locally)"
                    className="ml-1 text-slate-500 hover:text-pink-400 transition"
                    data-testid="disconnect-wallet-btn"
                >
                    <Power className="size-3.5" />
                </button>
            </div>
        </div>
    );
}
