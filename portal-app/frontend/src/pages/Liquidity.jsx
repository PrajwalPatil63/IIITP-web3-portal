import React, { useCallback, useEffect, useState } from "react";
import { Card, SectionTitle, Stat } from "../components/Card";
import { useWeb3 } from "../contexts/Web3Context";
import { Layers, Plus, Minus } from "lucide-react";
import { apiPost } from "../lib/api";

export default function LiquidityPage() {
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
    } = useWeb3();

    const [reserves, setReserves] = useState({ token: "0", eth: "0" });
    const [lpBal, setLpBal] = useState("0");
    const [lpTotal, setLpTotal] = useState("0");
    const [ethIn, setEthIn] = useState("");
    const [tokIn, setTokIn] = useState("");
    const [lpRemove, setLpRemove] = useState("");
    const [busy, setBusy] = useState(false);

    const refresh = useCallback(async () => {
        if (!isCorrectNetwork || !account) return;
        try {
            const lp = getContract("LiquidityPool");
            const [rt, re] = await lp.getReserves();
            const [b, t] = await Promise.all([
                lp.balanceOf(account).catch(() => 0n),
                lp.totalSupply().catch(() => 0n),
            ]);
            setReserves({ token: formatUnits(rt, tokenDecimals), eth: formatUnits(re, 18) });
            setLpBal(formatUnits(b, 18));
            setLpTotal(formatUnits(t, 18));
        } catch (e) {
            console.warn("Liquidity: on-chain load failed", e?.message);
        }
    }, [getContract, formatUnits, tokenDecimals, isCorrectNetwork, account]);

    useEffect(() => {
        refresh();
        const i = setInterval(refresh, 15000);
        return () => clearInterval(i);
    }, [refresh]);

    // Auto-balance the other side once one side is filled (maintain ratio)
    useEffect(() => {
        if (Number(lpTotal) === 0) return; // first liquidity, free pricing
        const ratio = Number(reserves.token) / Math.max(Number(reserves.eth), 1e-18);
        if (document.activeElement?.dataset?.testid === "add-eth-input" && ethIn) {
            setTokIn((Number(ethIn) * ratio).toFixed(2));
        } else if (document.activeElement?.dataset?.testid === "add-token-input" && tokIn) {
            setEthIn((Number(tokIn) / Math.max(ratio, 1e-18)).toFixed(6));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ethIn, tokIn]);

    const addLiq = async () => {
        if (!ethIn || !tokIn) return;
        setBusy(true);
        try {
            const tokAmt = parseUnits(tokIn, tokenDecimals);
            const ethAmt = parseUnits(ethIn, 18);
            const ok = await ensureTokenApproval(ADDRESSES.LiquidityPool, tokAmt);
            if (!ok) {
                setBusy(false);
                return;
            }
            const r = await sendTx("Add liquidity", "LiquidityPool", "addLiquidity", [tokAmt], {
                value: ethAmt,
            });
            if (r) {
                apiPost("/tx", {
                    wallet: account,
                    tx_hash: r.tx.hash,
                    type: "addLiquidity",
                    summary: `+${ethIn} ETH +${tokIn} ${tokenSymbol}`,
                }).catch(() => {});
                setEthIn("");
                setTokIn("");
                refresh();
            }
        } finally {
            setBusy(false);
        }
    };

    const removeLiq = async () => {
        if (!lpRemove) return;
        setBusy(true);
        const amt = parseUnits(lpRemove, 18);
        const r = await sendTx("Remove liquidity", "LiquidityPool", "removeLiquidity", [amt]);
        if (r) {
            apiPost("/tx", {
                wallet: account,
                tx_hash: r.tx.hash,
                type: "removeLiquidity",
                summary: `Burned ${lpRemove} LP`,
            }).catch(() => {});
            setLpRemove("");
            refresh();
        }
        setBusy(false);
    };

    const sharePct =
        Number(lpTotal) > 0 ? ((Number(lpBal) / Number(lpTotal)) * 100).toFixed(2) : "0";

    return (
        <div className="space-y-6" data-testid="liquidity-page">
            <SectionTitle kicker="// liquidity" title="Provide ETH/IITP, earn 0.25% LP fees">
                Mint LP tokens by depositing ETH + IITP at the pool ratio. Burn anytime to withdraw
                your share + accumulated fees.
            </SectionTitle>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Card><Stat label="POOL ETH" value={Number(reserves.eth).toFixed(4)} /></Card>
                <Card><Stat label={`POOL ${tokenSymbol}`} value={Number(reserves.token).toFixed(2)} accent="pink" /></Card>
                <Card><Stat label="YOUR LP" value={Number(lpBal).toFixed(4)} /></Card>
                <Card><Stat label="POOL SHARE" value={`${sharePct}%`} accent="pink" /></Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card>
                    <div className="flex items-center gap-2 mb-3">
                        <Plus className="size-4 text-cyan-300" />
                        <h3 className="font-display text-xl text-white">Add Liquidity</h3>
                    </div>
                    <Field label="ETH amount" value={ethIn} onChange={setEthIn} testId="add-eth-input" />
                    <div className="h-3" />
                    <Field
                        label={`${tokenSymbol} amount`}
                        value={tokIn}
                        onChange={setTokIn}
                        testId="add-token-input"
                    />
                    <button
                        onClick={addLiq}
                        disabled={!account || busy || !ethIn || !tokIn}
                        className="btn-cyber w-full mt-4"
                        data-testid="add-liquidity-btn"
                    >
                        <Layers className="size-4" /> Approve & Add
                    </button>
                </Card>

                <Card>
                    <div className="flex items-center gap-2 mb-3">
                        <Minus className="size-4 text-pink-400" />
                        <h3 className="font-display text-xl text-white">Remove Liquidity</h3>
                    </div>
                    <Field
                        label={`LP to burn (max ${Number(lpBal).toFixed(4)})`}
                        value={lpRemove}
                        onChange={setLpRemove}
                        testId="remove-lp-input"
                    />
                    <button
                        onClick={removeLiq}
                        disabled={!account || busy || !lpRemove}
                        className="btn-cyber btn-cyber-pink w-full mt-4"
                        data-testid="remove-liquidity-btn"
                    >
                        Remove
                    </button>
                </Card>
            </div>
        </div>
    );
}

function Field({ label, value, onChange, testId }) {
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
