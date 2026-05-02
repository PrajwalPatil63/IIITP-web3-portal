import React, { useCallback, useEffect, useState } from "react";
import { Card, SectionTitle, Stat } from "../components/Card";
import { useWeb3 } from "../contexts/Web3Context";
import { Droplets, ExternalLink, Clock } from "lucide-react";
import { apiPost } from "../lib/api";

export default function FaucetPage() {
    const {
        account,
        getContract,
        sendTx,
        isCorrectNetwork,
        formatUnits,
        tokenSymbol,
        ADDRESSES,
    } = useWeb3();

    const [studentDrip, setStudentDrip] = useState("?");
    const [teacherDrip, setTeacherDrip] = useState("?");
    const [cooldown, setCooldown] = useState("?");
    const [isTeacher, setIsTeacher] = useState(false);
    const [canClaimNow, setCanClaimNow] = useState(false);
    const [eta, setEta] = useState(0);
    const [loading, setLoading] = useState(false);

    const refresh = useCallback(async () => {
        if (!account || !isCorrectNetwork) return;
        try {
            const c = getContract("IIITPFaucet");
            const [sd, td, cd, t, can, until] = await Promise.all([
                c.studentDrip().catch(() => null),
                c.teacherDrip().catch(() => null),
                c.cooldown().catch(() => null),
                c.isTeacher(account).catch(() => false),
                c.canClaim(account).catch(() => false),
                c.timeUntilNextClaim(account).catch(() => 0n),
            ]);
            if (sd) setStudentDrip(formatUnits(sd, 18));
            if (td) setTeacherDrip(formatUnits(td, 18));
            if (cd) setCooldown(Number(cd));
            setIsTeacher(!!t);
            setCanClaimNow(!!can);
            setEta(Number(until));
        } catch (e) {
            console.warn("Faucet: on-chain load failed", e?.message);
        }
    }, [account, getContract, formatUnits, isCorrectNetwork]);

    useEffect(() => {
        refresh();
        const i = setInterval(refresh, 8000);
        return () => clearInterval(i);
    }, [refresh]);

    const claim = async () => {
        setLoading(true);
        const r = await sendTx("Faucet claim", "IIITPFaucet", "claim", []);
        if (r) {
            apiPost("/tx", {
                wallet: account,
                tx_hash: r.tx.hash,
                type: "faucet",
                summary: `Claimed ${isTeacher ? teacherDrip : studentDrip} ${tokenSymbol}`,
            }).catch(() => {});
            refresh();
        }
        setLoading(false);
    };

    const dripAmount = isTeacher ? teacherDrip : studentDrip;
    const role = isTeacher ? "TEACHER" : "STUDENT";

    const fmt = (v, dec = 0) => {
        const n = Number(v);
        return Number.isFinite(n) ? n.toFixed(dec) : "—";
    };

    return (
        <div className="space-y-6" data-testid="faucet-page">
            <SectionTitle kicker="// faucet" title="Sepolia testnet drip">
                Free testnet IITP tokens for builders, students and teachers. Use them across staking,
                voting and liquidity.
            </SectionTitle>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                <Card><Stat label="YOUR ROLE" value={account ? role : "—"} accent={isTeacher ? "pink" : "cyan"} /></Card>
                <Card><Stat label="DRIP / CLAIM" value={fmt(dripAmount)} suffix={tokenSymbol} /></Card>
                <Card><Stat label="COOLDOWN" value={cooldown === "?" ? "—" : formatDuration(cooldown)} /></Card>
                <Card>
                    <Stat
                        label="NEXT CLAIM"
                        value={!account ? "—" : canClaimNow ? "READY" : formatDuration(eta)}
                        accent={canClaimNow ? "cyan" : "pink"}
                    />
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <Card hoverable={false} className="lg:col-span-2">
                    <div className="flex items-center gap-3 mb-3">
                        <Droplets className="size-5 text-cyan-300" />
                        <h3 className="font-display text-2xl text-white">
                            Claim {fmt(dripAmount)} {tokenSymbol}
                        </h3>
                    </div>
                    <p className="text-slate-400 text-sm mb-6 max-w-xl">
                        Calls <span className="font-mono text-cyan-300">claim()</span> on the deployed
                        Faucet contract. Make sure your wallet has a small amount of Sepolia ETH for gas
                        — get some at{" "}
                        <a
                            href="https://www.alchemy.com/faucets/ethereum-sepolia"
                            target="_blank"
                            rel="noreferrer"
                            className="text-cyan-300 underline"
                        >
                            Alchemy Sepolia faucet
                        </a>
                        .
                    </p>
                    <div className="flex flex-wrap items-center gap-3">
                        <button
                            onClick={claim}
                            disabled={!account || !isCorrectNetwork || loading || !canClaimNow}
                            className="btn-cyber"
                            data-testid="faucet-claim-btn"
                        >
                            <Droplets className="size-4" />
                            {loading ? "Claiming…" : canClaimNow ? "Claim Tokens" : "Cooling down"}
                        </button>
                        <a
                            href={`https://sepolia.etherscan.io/address/${ADDRESSES.IIITPFaucet}`}
                            target="_blank"
                            rel="noreferrer"
                            className="font-mono text-xs text-cyan-300 hover:text-white inline-flex items-center gap-1"
                            data-testid="faucet-explorer-link"
                        >
                            View on Etherscan <ExternalLink className="size-3" />
                        </a>
                    </div>
                </Card>

                <Card hoverable={false}>
                    <div className="flex items-center gap-2 mb-2">
                        <Clock className="size-4 text-pink-400" />
                        <h3 className="font-display text-xl text-white">Drip schedule</h3>
                    </div>
                    <div className="space-y-2 font-mono text-xs">
                        <Row label="Student" value={`${fmt(studentDrip)} ${tokenSymbol}`} />
                        <Row label="Teacher" value={`${fmt(teacherDrip)} ${tokenSymbol}`} />
                        <Row label="Cooldown" value={cooldown === "?" ? "—" : formatDuration(cooldown)} />
                    </div>
                    {!isTeacher && (
                        <p className="text-[11px] text-slate-500 font-mono mt-3">
                            // Teacher status is granted by the admin via setTeacher(addr,true) or
                            automatically by staking ≥ teacher threshold.
                        </p>
                    )}
                </Card>
            </div>
        </div>
    );
}

function Row({ label, value }) {
    return (
        <div className="flex justify-between border-b border-white/5 py-1.5">
            <span className="text-slate-500">{label}</span>
            <span className="text-cyan-300">{value}</span>
        </div>
    );
}

function formatDuration(secs) {
    if (!secs || secs <= 0) return "0s";
    const d = Math.floor(secs / 86400);
    const h = Math.floor((secs % 86400) / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}
