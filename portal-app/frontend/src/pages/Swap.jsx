import React, { useCallback, useEffect, useState } from "react";
import { Card, SectionTitle, Stat } from "../components/Card";
import { useWeb3 } from "../contexts/Web3Context";
import { ArrowDownUp, Info } from "lucide-react";
import { apiPost } from "../lib/api";
import { TARGET_IITP_PER_ETH } from "../contracts/config";

export default function SwapPage() {
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
        ethBalance,
        tokenBalance,
    } = useWeb3();

    // direction: "eth-token" or "token-eth"
    const [direction, setDirection] = useState("eth-token");
    const [amountIn, setAmountIn] = useState("");
    const [amountOut, setAmountOut] = useState("0");
    const [reserves, setReserves] = useState({ token: "0", eth: "0" });
    const [busy, setBusy] = useState(false);

    const refresh = useCallback(async () => {
        if (!isCorrectNetwork || !account) return;
        try {
            const lp = getContract("LiquidityPool");
            // Contract returns (reserveToken, reserveETH)
            const [rt, re] = await lp.getReserves();
            setReserves({
                token: formatUnits(rt, tokenDecimals),
                eth: formatUnits(re, 18),
            });
        } catch (e) {
            console.warn("Swap: getReserves failed", e?.message);
        }
    }, [getContract, formatUnits, tokenDecimals, isCorrectNetwork, account]);

    useEffect(() => {
        refresh();
        const i = setInterval(refresh, 15000);
        return () => clearInterval(i);
    }, [refresh]);

    // Estimate output via on-chain helper or local x*y=k with 0.3% fee
    useEffect(() => {
        const estimate = async () => {
            const amt = Number(amountIn);
            if (!amt || !isCorrectNetwork) {
                setAmountOut("0");
                return;
            }
            try {
                const lp = getContract("LiquidityPool");
                if (direction === "eth-token") {
                    const v = parseUnits(amountIn, 18);
                    const out = await lp.getAmountOutETHForToken(v);
                    setAmountOut(formatUnits(out, tokenDecimals));
                } else {
                    const v = parseUnits(amountIn, tokenDecimals);
                    const out = await lp.getAmountOutTokenForETH(v);
                    setAmountOut(formatUnits(out, 18));
                }
            } catch (e) {
                console.warn("Swap: on-chain quote failed, using local estimate", e?.message);
                // fallback local
                const reserveIn =
                    direction === "eth-token" ? Number(reserves.eth) : Number(reserves.token);
                const reserveOut =
                    direction === "eth-token" ? Number(reserves.token) : Number(reserves.eth);
                if (reserveIn <= 0 || reserveOut <= 0) {
                    setAmountOut("0");
                    return;
                }
                const inAfterFee = amt * 0.997;
                const out = (inAfterFee * reserveOut) / (reserveIn + inAfterFee);
                setAmountOut(out.toFixed(6));
            }
        };
        estimate();
    }, [amountIn, direction, reserves, getContract, parseUnits, formatUnits, tokenDecimals, isCorrectNetwork]);

    const flip = () => setDirection((d) => (d === "eth-token" ? "token-eth" : "eth-token"));

    const swap = async () => {
        if (!amountIn) return;
        setBusy(true);
        try {
            if (direction === "eth-token") {
                const value = parseUnits(amountIn, 18);
                const minOut = parseUnits(((Number(amountOut) * 0.98) || 0).toFixed(6), tokenDecimals);
                const r = await sendTx("Swap ETH→IITP", "LiquidityPool", "swapETHForToken", [minOut], {
                    value,
                });
                if (r) {
                    apiPost("/tx", {
                        wallet: account,
                        tx_hash: r.tx.hash,
                        type: "swap",
                        summary: `${amountIn} ETH → ~${Number(amountOut).toFixed(4)} ${tokenSymbol}`,
                    }).catch(() => {});
                    setAmountIn("");
                    refresh();
                }
            } else {
                const amt = parseUnits(amountIn, tokenDecimals);
                const minEth = parseUnits(((Number(amountOut) * 0.98) || 0).toFixed(6), 18);
                const ok = await ensureTokenApproval(ADDRESSES.LiquidityPool, amt);
                if (!ok) {
                    setBusy(false);
                    return;
                }
                const r = await sendTx("Swap IITP→ETH", "LiquidityPool", "swapTokenForETH", [
                    amt,
                    minEth,
                ]);
                if (r) {
                    apiPost("/tx", {
                        wallet: account,
                        tx_hash: r.tx.hash,
                        type: "swap",
                        summary: `${amountIn} ${tokenSymbol} → ~${Number(amountOut).toFixed(6)} ETH`,
                    }).catch(() => {});
                    setAmountIn("");
                    refresh();
                }
            }
        } finally {
            setBusy(false);
        }
    };

    const fromLabel = direction === "eth-token" ? "ETH" : tokenSymbol;
    const toLabel = direction === "eth-token" ? tokenSymbol : "ETH";
    const fromBalance = direction === "eth-token" ? ethBalance : tokenBalance;

    const midPrice =
        Number(reserves.token) > 0 && Number(reserves.eth) > 0
            ? Number(reserves.token) / Number(reserves.eth)
            : 0;

    return (
        <div className="space-y-6" data-testid="swap-page">
            <SectionTitle kicker="// swap" title="AMM token swap">
                Trade ETH ↔ {tokenSymbol} on-chain. 0.30% pool fee (0.05% to treasury, 0.25% to LPs).
            </SectionTitle>

            <div className="glass-cyan cyberpunk-clip p-3 flex items-center gap-3 font-mono text-xs">
                <Info className="size-4 text-cyan-300 shrink-0" />
                <span className="text-slate-300">
                    <span className="text-cyan-300 font-bold">Target price:</span> 1,000 IITP = 0.01 Sepolia ETH
                    <span className="text-slate-500"> (1 ETH = {TARGET_IITP_PER_ETH.toLocaleString()} IITP)</span>. Actual rate is decided by pool reserves.
                </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <Card><Stat label="POOL ETH" value={Number(reserves.eth).toFixed(4)} /></Card>
                <Card><Stat label={`POOL ${tokenSymbol}`} value={Number(reserves.token).toFixed(2)} accent="pink" /></Card>
                <Card><Stat label="MID PRICE" value={midPrice ? midPrice.toFixed(2) : "?"} suffix={`${tokenSymbol}/ETH`} /></Card>
            </div>

            <div className="max-w-lg mx-auto">
                <Card hoverable={false} className="p-6">
                    <SwapField
                        label={`From · ${fromLabel}`}
                        value={amountIn}
                        onChange={setAmountIn}
                        balance={Number(fromBalance).toFixed(4)}
                        testId="swap-from-input"
                    />

                    <div className="flex justify-center my-2">
                        <button
                            onClick={flip}
                            data-testid="swap-flip-btn"
                            className="size-10 rounded-full glass-cyan border border-cyan-400/40 flex items-center justify-center hover:rotate-180 transition-all duration-300 hover:shadow-[0_0_20px_rgba(0,229,255,0.5)]"
                        >
                            <ArrowDownUp className="size-4 text-cyan-300" />
                        </button>
                    </div>

                    <SwapField
                        label={`To · ${toLabel} (est.)`}
                        value={amountOut === "0" ? "" : Number(amountOut).toFixed(direction === "eth-token" ? 4 : 6)}
                        onChange={() => {}}
                        readOnly
                        testId="swap-to-input"
                    />

                    <div className="mt-4 p-3 glass cyberpunk-clip font-mono text-xs text-slate-400 space-y-1">
                        <div className="flex justify-between">
                            <span>Slippage tolerance</span>
                            <span className="text-cyan-300">2.0%</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Pool fee</span>
                            <span className="text-cyan-300">0.30%</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Min received</span>
                            <span className="text-cyan-300">
                                {(Number(amountOut) * 0.98 || 0).toFixed(direction === "eth-token" ? 4 : 6)}{" "}
                                {toLabel}
                            </span>
                        </div>
                    </div>

                    <button
                        onClick={swap}
                        disabled={!account || busy || !amountIn || Number(amountOut) === 0}
                        className="btn-cyber w-full mt-5"
                        data-testid="swap-btn"
                    >
                        {busy ? "Swapping…" : "Swap"}
                    </button>
                </Card>
            </div>
        </div>
    );
}

function SwapField({ label, value, onChange, readOnly, balance, testId }) {
    return (
        <div className="bg-black/60 border border-white/10 rounded-md p-4 focus-within:border-cyan-400 transition">
            <div className="flex justify-between items-center mb-1">
                <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">
                    {label}
                </div>
                {balance && (
                    <div className="font-mono text-[10px] text-slate-500">Bal: {balance}</div>
                )}
            </div>
            <input
                type="number"
                inputMode="decimal"
                placeholder="0.0"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                readOnly={readOnly}
                data-testid={testId}
                className="w-full bg-transparent font-mono text-3xl text-white outline-none"
            />
        </div>
    );
}
