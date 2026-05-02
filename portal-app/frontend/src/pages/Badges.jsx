import React, { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Card, SectionTitle, Stat } from "../components/Card";
import { useWeb3 } from "../contexts/Web3Context";
import { Award, CheckCircle2, Lock } from "lucide-react";
import { apiPost } from "../lib/api";
import { toast } from "sonner";
import { BADGE_TIERS, BADGE_TIER_COLORS } from "../contracts/config";

export default function BadgesPage() {
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

    const [types, setTypes] = useState([]);
    const [mintedMap, setMintedMap] = useState({});
    const [myBadges, setMyBadges] = useState([]);
    const [totalMinted, setTotalMinted] = useState(0);
    const [busy, setBusy] = useState(false);

    const refresh = useCallback(async () => {
        if (!isCorrectNetwork || !account) return;
        try {
            const b = getContract("IIITPBadge");
            const [all, total] = await Promise.all([
                b.getAllBadgeTypes().catch(() => []),
                b.totalMinted().catch(() => 0n),
            ]);
            setTotalMinted(Number(total));
            const rows = all.map((t, i) => ({
                id: i,
                name: t.name,
                category: t.category,
                tier: BADGE_TIERS[Number(t.tier)] || "COMMON",
                tierIdx: Number(t.tier),
                mintPrice: formatUnits(t.mintPrice, tokenDecimals),
                maxSupply: Number(t.maxSupply),
                minted: Number(t.minted),
                active: !!t.active,
            }));
            setTypes(rows);
            const mintedEntries = await Promise.all(
                rows.map(async (r) => [r.id, await b.hasMinted(account, r.id).catch(() => false)])
            );
            setMintedMap(Object.fromEntries(mintedEntries));

            const owned = await b.getOwnedTokens(account).catch(() => []);
            const ownedNums = owned.map((x) => Number(x));

            // construct owned badge cards using badgeMeta for accurate type lookup
            const mine = await Promise.all(
                ownedNums.map(async (tid) => {
                    const meta = await b.badgeMeta(tid).catch(() => null);
                    const typeId = meta ? Number(meta.badgeTypeId) : 0;
                    const type = rows.find((r) => r.id === typeId) || rows[0];
                    return {
                        tokenId: tid,
                        typeId,
                        name: type?.name || `Badge #${tid}`,
                        tier: type?.tier || "COMMON",
                        category: type?.category || "",
                        mintedAt: meta ? Number(meta.mintedAt) : Date.now() / 1000,
                    };
                })
            );
            setMyBadges(mine);
             
        } catch (e) {
            console.warn("Badges: load failed", e?.message);
        }
    }, [account, getContract, formatUnits, isCorrectNetwork, tokenDecimals]);

    useEffect(() => {
        refresh();
        const i = setInterval(refresh, 15000);
        return () => clearInterval(i);
    }, [refresh]);

    const mintBadge = async (type) => {
        setBusy(true);
        try {
            if (Number(type.mintPrice) > 0) {
                const amount = parseUnits(type.mintPrice, tokenDecimals);
                const ok = await ensureTokenApproval(ADDRESSES.IIITPBadge, amount);
                if (!ok) {
                    setBusy(false);
                    return;
                }
            }
            const uri = `ipfs://iiitp-badge/${type.id}`;
            const r = await sendTx(`Mint ${type.name}`, "IIITPBadge", "mint", [type.id, uri]);
            if (r) {
                apiPost("/tx", {
                    wallet: account,
                    tx_hash: r.tx.hash,
                    type: "mint-badge",
                    summary: `Minted ${type.name} (${type.tier})`,
                }).catch(() => {});
                toast.success(`Badge "${type.name}" minted!`);
                refresh();
            }
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-6" data-testid="badges-page">
            <SectionTitle kicker="// campus badges" title="Collect achievement NFTs">
                Limited-supply badges for campus milestones, achievements, and certificates. Each
                wallet can mint one of each type. Pay in {tokenSymbol}, own forever.
            </SectionTitle>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Card><Stat label="BADGE TYPES" value={types.length} /></Card>
                <Card><Stat label="TOTAL MINTED" value={totalMinted} accent="pink" /></Card>
                <Card><Stat label="YOUR BADGES" value={myBadges.length} /></Card>
                <Card>
                    <Stat
                        label="LEGENDARY HELD"
                        value={myBadges.filter((b) => b.tier === "LEGENDARY").length}
                        accent="pink"
                    />
                </Card>
            </div>

            {myBadges.length > 0 && (
                <Card hoverable={false}>
                    <h3 className="font-display text-xl text-white mb-3">Your badges</h3>
                    <div className="flex flex-wrap gap-2">
                        {myBadges.map((b) => (
                            <span
                                key={b.tokenId}
                                className={[
                                    "px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] border cyberpunk-clip",
                                    BADGE_TIER_COLORS[b.tier] || "",
                                ].join(" ")}
                                data-testid={`owned-badge-${b.tokenId}`}
                            >
                                #{b.tokenId} · {b.name}
                            </span>
                        ))}
                    </div>
                </Card>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {types.map((t, i) => {
                    const alreadyMinted = mintedMap[t.id];
                    const soldOut = t.maxSupply > 0 && t.minted >= t.maxSupply;
                    const disabled = !t.active || alreadyMinted || soldOut;
                    return (
                        <motion.div
                            key={t.id}
                            initial={{ opacity: 0, y: 16 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.04 }}
                            whileHover={!disabled ? { y: -3 } : undefined}
                            className={[
                                "cyberpunk-clip p-5 border-2 bg-black/60 transition-all overflow-hidden",
                                BADGE_TIER_COLORS[t.tier] || "border-white/10",
                            ].join(" ")}
                            data-testid={`badge-type-${t.id}`}
                        >
                            <div className="flex items-center justify-between mb-3">
                                <Award className={`size-5 ${BADGE_TIER_COLORS[t.tier]?.split(" ")[0] || ""}`} />
                                <span className={`font-mono text-[10px] uppercase tracking-[0.2em] ${BADGE_TIER_COLORS[t.tier]?.split(" ")[0] || ""}`}>
                                    {t.tier}
                                </span>
                            </div>
                            <div className="font-display text-xl text-white">{t.name}</div>
                            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500 mt-0.5">
                                {t.category}
                            </div>

                            <div className="mt-4 grid grid-cols-2 gap-3 font-mono text-xs">
                                <div>
                                    <div className="text-[9px] text-slate-500 uppercase tracking-[0.2em]">Price</div>
                                    <div className="text-cyan-300">
                                        {Number(t.mintPrice).toFixed(0)} {tokenSymbol}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-[9px] text-slate-500 uppercase tracking-[0.2em]">Supply</div>
                                    <div className="text-white">
                                        {t.minted}/{t.maxSupply === 0 ? "∞" : t.maxSupply}
                                    </div>
                                </div>
                            </div>

                            <button
                                onClick={() => mintBadge(t)}
                                disabled={busy || disabled}
                                className="btn-cyber w-full mt-5"
                                data-testid={`mint-badge-${t.id}`}
                            >
                                {alreadyMinted ? (
                                    <>
                                        <CheckCircle2 className="size-4" /> Already owned
                                    </>
                                ) : soldOut ? (
                                    <>
                                        <Lock className="size-4" /> Sold out
                                    </>
                                ) : !t.active ? (
                                    <>
                                        <Lock className="size-4" /> Inactive
                                    </>
                                ) : (
                                    <>
                                        <Award className="size-4" /> Mint
                                    </>
                                )}
                            </button>
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );
}
