import React, { useEffect, useState } from "react";
import { Card, SectionTitle, Stat } from "../components/Card";
import { useWeb3 } from "../contexts/Web3Context";
import { Shield, Settings2, ImagePlus, ListChecks, GraduationCap, Gauge, Server, Layers3, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPost } from "../lib/api";
import { TIERS } from "../contracts/config";

export default function AdminPage() {
    const { isAdmin, sendTx, account, parseUnits, tokenDecimals, tokenSymbol } = useWeb3();
    const [studentDrip, setStudentDrip] = useState("");
    const [teacherDrip, setTeacherDrip] = useState("");
    const [cooldown, setCooldown] = useState("");
    const [teacherAddr, setTeacherAddr] = useState("");
    const [teacherStatus, setTeacherStatus] = useState(true);
    const [stakeReq, setStakeReq] = useState("");
    const [reward, setReward] = useState("");
    const [maxNodes, setMaxNodes] = useState("");
    const [epoch, setEpoch] = useState("");
    const [slashId, setSlashId] = useState("");
    const [tierIdx, setTierIdx] = useState(1);
    const [tierApy, setTierApy] = useState("");
    const [tx, setTx] = useState([]);
    const [nftForm, setNftForm] = useState({
        token_id: "",
        title: "",
        description: "",
        image_url: "",
        price_eth: "",
    });

    useEffect(() => {
        apiGet("/tx")
            .then((data) => {
                if (Array.isArray(data)) setTx(data);
                else setTx([]);
            })
            .catch(() => setTx([]));
    }, []);

    if (!account) {
        return (
            <Card>
                <p className="text-slate-400 font-mono text-sm">Connect your wallet first.</p>
            </Card>
        );
    }
    if (!isAdmin) {
        return (
            <Card>
                <div className="flex items-center gap-3 mb-2">
                    <Shield className="size-5 text-pink-400" />
                    <h2 className="font-display text-2xl text-white">Admin only</h2>
                </div>
                <p className="text-slate-400 font-mono text-sm">
                    This wallet is not in the ADMIN_WALLETS list. Add your deployer wallet to{" "}
                    <span className="text-cyan-300">/app/frontend/src/contracts/config.js</span>{" "}
                    to grant admin UI access. (On-chain operations also require the wallet to hold
                    the corresponding role on the contract — DEFAULT_ADMIN_ROLE / OPERATOR_ROLE /
                    Owner.)
                </p>
            </Card>
        );
    }

    // ─── Faucet ───
    const setDrip = async () => {
        if (!studentDrip || !teacherDrip) return;
        const sd = parseUnits(studentDrip, 18);
        const td = parseUnits(teacherDrip, 18);
        await sendTx("Set drip amounts", "IIITPFaucet", "setDrip", [sd, td]);
    };
    const setCooldownVal = async () => {
        if (!cooldown) return;
        await sendTx("Set faucet cooldown", "IIITPFaucet", "setCooldown", [BigInt(cooldown)]);
    };
    const setTeacher = async () => {
        if (!teacherAddr) return;
        await sendTx(
            `Set teacher (${teacherStatus ? "ON" : "OFF"})`,
            "IIITPFaucet",
            "setTeacher",
            [teacherAddr, teacherStatus]
        );
    };

    // ─── NodeRegistry ───
    const saveStakeReq = async () => {
        if (!stakeReq) return;
        await sendTx("Set node stake", "NodeRegistry", "setNodeStakeRequired", [
            parseUnits(stakeReq, 18),
        ]);
    };
    const saveReward = async () => {
        if (!reward) return;
        await sendTx("Set node reward", "NodeRegistry", "setNodeRewardPerEpoch", [
            parseUnits(reward, 18),
        ]);
    };
    const saveMaxN = async () => {
        if (!maxNodes) return;
        await sendTx("Set max nodes", "NodeRegistry", "setMaxNodes", [BigInt(maxNodes)]);
    };
    const distribute = async () => {
        if (!epoch) return;
        await sendTx("Distribute epoch rewards", "NodeRegistry", "distributeEpochRewards", [
            BigInt(epoch),
        ]);
    };
    const slash = async () => {
        if (!slashId) return;
        await sendTx("Slash node", "NodeRegistry", "slashNode", [BigInt(slashId)]);
    };

    // ─── Staking ───
    const saveApy = async () => {
        if (!tierApy) return;
        await sendTx(
            `Set ${TIERS[tierIdx].label} APY`,
            "IIITPStaking",
            "setTierAPY",
            [tierIdx, BigInt(Math.floor(parseFloat(tierApy) * 100))]
        );
    };

    // ─── NFT marketplace ───
    const addNft = async () => {
        if (!nftForm.title || !nftForm.image_url) {
            toast.error("Title and image are required");
            return;
        }
        try {
            await apiPost("/nfts", {
                token_id: parseInt(nftForm.token_id || Math.floor(Math.random() * 99999)),
                title: nftForm.title,
                description: nftForm.description,
                image_url: nftForm.image_url,
                price_eth: nftForm.price_eth || "0.01",
                seller_wallet: account,
            });
            toast.success("NFT added to marketplace");
            setNftForm({ token_id: "", title: "", description: "", image_url: "", price_eth: "" });
        } catch (e) {
            toast.error("Failed to add NFT");
        }
    };

    return (
        <div className="space-y-6" data-testid="admin-page">
            <SectionTitle kicker="// admin console" title="Operator controls">
                Deploy parameters, distribute epoch rewards, manage faucet & teacher whitelist, slash
                misbehaving nodes, and curate the NFT marketplace — all from one cyberpunk console.
            </SectionTitle>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Card><Stat label="STATUS" value="OPERATOR" accent="pink" /></Card>
                <Card><Stat label="WALLET" value={`${account.slice(0, 6)}…${account.slice(-4)}`} /></Card>
                <Card><Stat label="TX LOGGED" value={tx.length} /></Card>
                <Card><Stat label="MODE" value="LIVE" /></Card>
            </div>

            {/* Faucet controls */}
            <Card>
                <div className="flex items-center gap-2 mb-3">
                    <Settings2 className="size-4 text-cyan-300" />
                    <h3 className="font-display text-xl text-white">Faucet</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Field
                        label={`Student drip (${tokenSymbol})`}
                        value={studentDrip}
                        onChange={setStudentDrip}
                        testId="admin-student-drip"
                    />
                    <Field
                        label={`Teacher drip (${tokenSymbol})`}
                        value={teacherDrip}
                        onChange={setTeacherDrip}
                        testId="admin-teacher-drip"
                    />
                    <button
                        onClick={setDrip}
                        className="btn-cyber self-end"
                        data-testid="admin-set-drip-btn"
                    >
                        Set drip
                    </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                    <Field
                        label="Cooldown (seconds)"
                        value={cooldown}
                        onChange={setCooldown}
                        testId="admin-cooldown-input"
                    />
                    <button
                        onClick={setCooldownVal}
                        className="btn-cyber md:col-start-3 self-end"
                        data-testid="admin-set-cooldown-btn"
                    >
                        Set cooldown
                    </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-3 items-end">
                    <Field
                        label="Teacher address"
                        value={teacherAddr}
                        onChange={setTeacherAddr}
                        testId="admin-teacher-address"
                    />
                    <div>
                        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500 mb-1">
                            Status
                        </div>
                        <div className="flex gap-2">
                            {[true, false].map((v) => (
                                <button
                                    key={String(v)}
                                    onClick={() => setTeacherStatus(v)}
                                    data-testid={`admin-teacher-status-${v ? "on" : "off"}`}
                                    className={[
                                        "px-3 py-2 font-mono text-xs uppercase border cyberpunk-clip transition",
                                        teacherStatus === v
                                            ? "border-cyan-400 bg-cyan-400/10 text-cyan-300"
                                            : "border-white/10 text-slate-400",
                                    ].join(" ")}
                                >
                                    {v ? "Grant" : "Revoke"}
                                </button>
                            ))}
                        </div>
                    </div>
                    <button
                        onClick={setTeacher}
                        className="btn-cyber md:col-span-2"
                        data-testid="admin-set-teacher-btn"
                    >
                        <GraduationCap className="size-4" /> {teacherStatus ? "Grant" : "Revoke"} teacher
                    </button>
                </div>
            </Card>

            {/* Node registry */}
            <Card>
                <div className="flex items-center gap-2 mb-3">
                    <Server className="size-4 text-pink-400" />
                    <h3 className="font-display text-xl text-white">Node registry</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <Field label={`Stake required (${tokenSymbol})`} value={stakeReq} onChange={setStakeReq} testId="admin-node-stake" />
                    <Field label={`Reward / epoch (${tokenSymbol})`} value={reward} onChange={setReward} testId="admin-node-reward" />
                    <Field label="Max nodes" value={maxNodes} onChange={setMaxNodes} testId="admin-node-max" />
                    <div className="flex items-end gap-2">
                        <button onClick={saveStakeReq} className="btn-cyber flex-1" data-testid="admin-set-stake-btn">Save stake</button>
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-3">
                    <button onClick={saveReward} className="btn-cyber" data-testid="admin-set-reward-btn">Save reward</button>
                    <button onClick={saveMaxN} className="btn-cyber" data-testid="admin-set-max-btn">Save max</button>
                    <Field label="Epoch number" value={epoch} onChange={setEpoch} testId="admin-epoch-input" />
                    <button
                        onClick={distribute}
                        className="btn-cyber"
                        data-testid="admin-distribute-btn"
                    >
                        <Gauge className="size-4" /> Distribute rewards
                    </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-3 items-end">
                    <Field label="Node ID to slash" value={slashId} onChange={setSlashId} testId="admin-slash-input" />
                    <button onClick={slash} className="btn-cyber btn-cyber-pink" data-testid="admin-slash-btn">
                        <ShieldAlert className="size-4" /> Slash node
                    </button>
                </div>
            </Card>

            {/* Staking */}
            <Card>
                <div className="flex items-center gap-2 mb-3">
                    <Layers3 className="size-4 text-cyan-300" />
                    <h3 className="font-display text-xl text-white">Staking · tier APY</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                    <div>
                        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500 mb-1">Tier</div>
                        <div className="flex gap-2">
                            {TIERS.map((t) => (
                                <button
                                    key={t.id}
                                    onClick={() => setTierIdx(t.id)}
                                    data-testid={`admin-tier-${t.key.toLowerCase()}`}
                                    className={[
                                        "px-3 py-2 font-mono text-xs uppercase border cyberpunk-clip transition",
                                        tierIdx === t.id
                                            ? "border-cyan-400 bg-cyan-400/10 text-cyan-300"
                                            : "border-white/10 text-slate-400",
                                    ].join(" ")}
                                >
                                    {t.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <Field label="APY (%)" value={tierApy} onChange={setTierApy} testId="admin-tier-apy" />
                    <button onClick={saveApy} className="btn-cyber md:col-span-2" data-testid="admin-set-apy-btn">
                        Save APY
                    </button>
                </div>
            </Card>

            {/* NFT */}
            <Card>
                <div className="flex items-center gap-2 mb-3">
                    <ImagePlus className="size-4 text-pink-400" />
                    <h3 className="font-display text-xl text-white">NFT marketplace</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Field label="Token ID" value={nftForm.token_id} onChange={(v) => setNftForm({ ...nftForm, token_id: v })} testId="admin-nft-id" />
                    <Field label="Price ETH" value={nftForm.price_eth} onChange={(v) => setNftForm({ ...nftForm, price_eth: v })} testId="admin-nft-price" />
                    <Field label="Title" value={nftForm.title} onChange={(v) => setNftForm({ ...nftForm, title: v })} testId="admin-nft-title" />
                    <Field label="Image URL" value={nftForm.image_url} onChange={(v) => setNftForm({ ...nftForm, image_url: v })} testId="admin-nft-image" />
                    <div className="md:col-span-2">
                        <Field label="Description" value={nftForm.description} onChange={(v) => setNftForm({ ...nftForm, description: v })} testId="admin-nft-desc" />
                    </div>
                </div>
                <button onClick={addNft} className="btn-cyber btn-cyber-pink mt-4" data-testid="admin-add-nft-btn">
                    Publish listing
                </button>
            </Card>

            {/* Tx monitor */}
            <Card hoverable={false}>
                <div className="flex items-center gap-2 mb-3">
                    <ListChecks className="size-4 text-cyan-300" />
                    <h3 className="font-display text-xl text-white">Transaction monitor</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left font-mono text-xs">
                        <thead>
                            <tr className="text-slate-500 uppercase tracking-[0.2em] border-b border-white/10">
                                <th className="py-2 pr-3">Time</th>
                                <th className="py-2 pr-3">Wallet</th>
                                <th className="py-2 pr-3">Type</th>
                                <th className="py-2 pr-3">Summary</th>
                                <th className="py-2 pr-3">Hash</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {tx.slice(0, 30).map((t) => (
                                <tr key={t.id}>
                                    <td className="py-2 pr-3 text-slate-500">{new Date(t.timestamp).toLocaleTimeString()}</td>
                                    <td className="py-2 pr-3 text-cyan-300">{t.wallet.slice(0, 8)}…{t.wallet.slice(-4)}</td>
                                    <td className="py-2 pr-3 uppercase text-pink-400">{t.type}</td>
                                    <td className="py-2 pr-3 text-slate-300">{t.summary}</td>
                                    <td className="py-2 pr-3 text-slate-500">{t.tx_hash.slice(0, 10)}…</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>
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
                value={value}
                onChange={(e) => onChange(e.target.value)}
                data-testid={testId}
                className="w-full bg-black/60 border border-white/10 rounded-md px-3 py-2.5 font-mono text-white text-base focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400 transition"
            />
        </label>
    );
}
