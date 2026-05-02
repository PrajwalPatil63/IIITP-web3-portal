import React, { useCallback, useEffect, useRef, useState } from "react";
import { Card, SectionTitle, Stat } from "../components/Card";
import { useWeb3 } from "../contexts/Web3Context";
import { Server, Power, Cpu, Activity } from "lucide-react";
import { apiPost } from "../lib/api";
import { NODE_STATUS } from "../contracts/config";

const NODE_TYPES = [
    { id: "validator", label: "Validator", desc: "Produces blocks. High uptime." },
    { id: "rpc", label: "RPC", desc: "Serves API queries." },
    { id: "archive", label: "Archive", desc: "Stores full history." },
];

export default function NodesPage() {
    const {
        account,
        getContract,
        sendTx,
        isCorrectNetwork,
        formatUnits,
        tokenSymbol,
        tokenDecimals,
        provider,
        ADDRESSES,
    } = useWeb3();

    const [activeNodes, setActiveNodes] = useState([]);
    const [myNode, setMyNode] = useState(null);
    const [stakeRequired, setStakeRequired] = useState("?");
    const [rewardPerEpoch, setRewardPerEpoch] = useState("?");
    const [maxNodes, setMaxNodes] = useState("?");
    const [activeCount, setActiveCount] = useState(0);
    const [name, setName] = useState("");
    const [nodeType, setNodeType] = useState("validator");
    const [logs, setLogs] = useState([]);
    const [busy, setBusy] = useState(false);
    const logsRef = useRef(null);

    const refresh = useCallback(async () => {
        if (!account || !isCorrectNetwork) return;
        try {
            const c = getContract("NodeRegistry");
            const [stake, reward, max, count, all] = await Promise.all([
                c.nodeStakeRequired().catch(() => 0n),
                c.nodeRewardPerEpoch().catch(() => 0n),
                c.maxNodes().catch(() => 0n),
                c.activeNodeCount().catch(() => 0n),
                c.getActiveNodes().catch(() => []),
            ]);
            setStakeRequired(formatUnits(stake, 18));
            setRewardPerEpoch(formatUnits(reward, 18));
            setMaxNodes(Number(max));
            setActiveCount(Number(count));
            setActiveNodes(
                all.map((n) => ({
                    nodeId: Number(n.nodeId),
                    owner: n.owner,
                    name: n.name,
                    nodeType: n.nodeType,
                    registeredAt: Number(n.registeredAt),
                    lastRewardAt: Number(n.lastRewardAt),
                    totalRewards: formatUnits(n.totalRewards, 18),
                    stake: formatUnits(n.stake, 18),
                    status: NODE_STATUS[Number(n.status)] || "INACTIVE",
                }))
            );
            try {
                const n = await c.getMyNode().catch(() => null);
                if (n && Number(n.nodeId) !== 0) {
                    setMyNode({
                        nodeId: Number(n.nodeId),
                        name: n.name,
                        nodeType: n.nodeType,
                        registeredAt: Number(n.registeredAt),
                        lastRewardAt: Number(n.lastRewardAt),
                        totalRewards: formatUnits(n.totalRewards, 18),
                        stake: formatUnits(n.stake, 18),
                        status: NODE_STATUS[Number(n.status)] || "INACTIVE",
                    });
                } else {
                    setMyNode(null);
                }
            } catch {
                setMyNode(null);
            }
        } catch (e) {
            console.warn("Nodes: on-chain load failed", e?.message);
        }
    }, [account, getContract, formatUnits, isCorrectNetwork]);

    useEffect(() => {
        refresh();
        const i = setInterval(refresh, 12000);
        return () => clearInterval(i);
    }, [refresh]);

    // Real chain telemetry — live events from all deployed contracts
    const logIdRef = useRef(0);
    useEffect(() => {
        if (!provider || !isCorrectNetwork) return;

        const addLog = (msg) =>
            setLogs((prev) => {
                logIdRef.current += 1;
                return [...prev, { id: logIdRef.current, ts: new Date().toLocaleTimeString(), msg }].slice(-50);
            });

        const unsubs = [];
        const fmt = (wei) => Number(formatUnits(wei, tokenDecimals)).toFixed(0);
        const addr = (a) => `${a.slice(0, 6)}…`;

        // Safe attach helper
        const listen = (contract, event, handler) => {
            try {
                contract.on(event, handler);
                unsubs.push(() => { try { contract.off(event, handler); } catch {} });
            } catch {}
        };

        // Block heartbeat (~12s on Sepolia)
        provider.getBlockNumber().then((n) => addLog(`[chain] connected · latest block #${n}`)).catch(() => {});
        const onBlock = (n) => addLog(`[chain] block #${n} produced`);
        provider.on("block", onBlock);
        unsubs.push(() => provider.off("block", onBlock));

        // ── NodeRegistry ──────────────────────────────────
        const reg = getContract("NodeRegistry");
        listen(reg, "NodeRegistered",   (id, owner, name) => addLog(`[node] new operator: "${name}" #${Number(id)} by ${addr(owner)}`));
        listen(reg, "NodeDeregistered", (id)               => addLog(`[node] operator left · node #${Number(id)}`));
        listen(reg, "EpochRewardsDistributed",(epochId, total)   => addLog(`[reward] epoch #${Number(epochId)} · ${fmt(total)} ${tokenSymbol} paid out`));
        listen(reg, "NodeSlashed",      (id, owner, amt)   => addLog(`[node] slash #${Number(id)} · ${fmt(amt)} ${tokenSymbol} burned`));

        // ── Staking ───────────────────────────────────────
        const staking = getContract("IIITPStaking");
        listen(staking, "Staked",       (user, _, amt)      => addLog(`[staking] ${addr(user)} staked ${fmt(amt)} ${tokenSymbol}`));
        listen(staking, "Unstaked",     (user, _, amt)      => addLog(`[staking] ${addr(user)} unstaked ${fmt(amt)} ${tokenSymbol}`));
        listen(staking, "RewardClaimed",(user, _, reward)   => addLog(`[staking] ${addr(user)} claimed ${fmt(reward)} ${tokenSymbol}`));

        // ── Voting ────────────────────────────────────────
        const voting = getContract("Voting");
        listen(voting, "ProposalCreated", (id, proposer, title) => addLog(`[gov] proposal #${Number(id)}: "${title}"`) );
        listen(voting, "VoteCast",        (id, voter, choice)   => addLog(`[gov] ${addr(voter)} voted ${Number(choice) === 1 ? "FOR" : "AGAINST"} #${Number(id)}`));
        listen(voting, "ProposalFinalized",(id, passed)         => addLog(`[gov] proposal #${Number(id)} ${passed ? "PASSED ✓" : "REJECTED ✗"}`));

        // ── Dice ──────────────────────────────────────────
        const dice = getContract("IIITPDice");
        listen(dice, "Rolled", (player, roll, won, payout) =>
            addLog(`[game] ${addr(player)} rolled ${roll} · ${won ? `WON ${fmt(payout)} ${tokenSymbol}` : "lost"}`));

        // ── Market ────────────────────────────────────────
        const market = getContract("IIITPMarket");
        listen(market, "Minted",  (id, creator, _, name) => addLog(`[market] NFT #${Number(id)} minted: "${name}" by ${addr(creator)}`));
        listen(market, "Listed",  (id, seller, price)   => addLog(`[market] NFT #${Number(id)} listed · ${fmt(price)} ${tokenSymbol}`));
        listen(market, "Sold",    (id, buyer, _, price)  => addLog(`[market] NFT #${Number(id)} sold · ${fmt(price)} ${tokenSymbol} to ${addr(buyer)}`));
        listen(market, "Delisted",(id)                  => addLog(`[market] NFT #${Number(id)} delisted`));

        // ── Badge ─────────────────────────────────────────
        const badge = getContract("IIITPBadge");
        listen(badge, "BadgeMinted", (tokenId, typeId, recipient) =>
            addLog(`[badge] type #${Number(typeId)} minted to ${addr(recipient)}`));

        // ── Liquidity Pool ────────────────────────────────
        const lp = getContract("LiquidityPool");
        listen(lp, "SwapETHForToken", (user, ethIn, tokenOut) =>
            addLog(`[lp] ${addr(user)} swapped ${(Number(ethIn) / 1e18).toFixed(4)} ETH → ${fmt(tokenOut)} ${tokenSymbol}`));
        listen(lp, "SwapTokenForETH", (user, tokenIn, ethOut) =>
            addLog(`[lp] ${addr(user)} swapped ${fmt(tokenIn)} ${tokenSymbol} → ${(Number(ethOut) / 1e18).toFixed(4)} ETH`));
        listen(lp, "LiquidityAdded",  (lpp, ethAmt)           => addLog(`[lp] ${addr(lpp)} added liquidity · ${(Number(ethAmt) / 1e18).toFixed(4)} ETH`));
        listen(lp, "LiquidityRemoved",(lpp, ethAmt)           => addLog(`[lp] ${addr(lpp)} removed liquidity`));

        // ── Faucet ────────────────────────────────────────
        const faucet = getContract("IIITPFaucet");
        listen(faucet, "Claimed", (user, amount) =>
            addLog(`[faucet] ${addr(user)} claimed ${fmt(amount)} ${tokenSymbol}`));

        return () => unsubs.forEach((fn) => fn());
    }, [provider, isCorrectNetwork, getContract, formatUnits, tokenSymbol, tokenDecimals]);

    useEffect(() => {
        if (logsRef.current) logsRef.current.scrollTop = logsRef.current.scrollHeight;
    }, [logs]);

    const register = async () => {
        if (!name) return;
        setBusy(true);
        try {
            // 1) approve stake
            const stakeAmount = BigInt(Math.floor(parseFloat(stakeRequired) * 1e18));
            const ok = await sendTx("Approve stake", "IIITPToken", "approve", [
                ADDRESSES.NodeRegistry,
                stakeAmount,
            ]);
            if (!ok) {
                setBusy(false);
                return;
            }
            // 2) register
            const r = await sendTx("Register node", "NodeRegistry", "registerNode", [
                name,
                nodeType,
            ]);
            if (r) {
                apiPost("/nodes", {
                    wallet: account,
                    node_alias: name,
                    region: nodeType, // re-use field
                }).catch(() => {});
                apiPost("/tx", {
                    wallet: account,
                    tx_hash: r.tx.hash,
                    type: "node-register",
                    summary: `Registered ${nodeType} node "${name}"`,
                }).catch(() => {});
                setName("");
                refresh();
            }
        } finally {
            setBusy(false);
        }
    };

    const deregister = async () => {
        setBusy(true);
        const r = await sendTx("Deregister node", "NodeRegistry", "deregisterNode", []);
        if (r) {
            apiPost("/tx", {
                wallet: account,
                tx_hash: r.tx.hash,
                type: "node-deregister",
                summary: `Deregistered node`,
            }).catch(() => {});
            refresh();
        }
        setBusy(false);
    };

    return (
        <div className="space-y-6" data-testid="nodes-page">
            <SectionTitle kicker="// node runner" title="Run your device as a chain node">
                Stake {stakeRequired === "?" ? "—" : Number(stakeRequired).toFixed(0)} {tokenSymbol}{" "}
                to register your device. Active nodes earn{" "}
                {rewardPerEpoch === "?" ? "—" : Number(rewardPerEpoch).toFixed(0)} {tokenSymbol} every
                epoch when the operator distributes rewards.
            </SectionTitle>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Card><Stat label="ACTIVE NODES" value={`${activeCount}/${maxNodes}`} /></Card>
                <Card><Stat label="STAKE REQUIRED" value={Number(stakeRequired).toFixed(0)} suffix={tokenSymbol} /></Card>
                <Card><Stat label="REWARD/EPOCH" value={Number(rewardPerEpoch).toFixed(0)} suffix={tokenSymbol} accent="pink" /></Card>
                <Card>
                    <Stat
                        label="YOUR STATUS"
                        value={myNode ? myNode.status : "OFFLINE"}
                        accent={myNode?.status === "ACTIVE" ? "cyan" : "pink"}
                    />
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card>
                    <div className="flex items-center gap-2 mb-3">
                        <Server className="size-4 text-cyan-300" />
                        <h3 className="font-display text-xl text-white">Node controls</h3>
                    </div>
                    {myNode && myNode.status === "ACTIVE" ? (
                        <div className="space-y-3">
                            <Row label="Node ID" value={`#${myNode.nodeId}`} mono />
                            <Row label="Name" value={myNode.name} />
                            <Row label="Type" value={myNode.nodeType} />
                            <Row label="Stake" value={`${Number(myNode.stake).toFixed(0)} ${tokenSymbol}`} />
                            <Row
                                label="Total rewards"
                                value={`${Number(myNode.totalRewards).toFixed(2)} ${tokenSymbol}`}
                            />
                            <Row
                                label="Registered"
                                value={new Date(myNode.registeredAt * 1000).toLocaleString()}
                            />
                            <button
                                onClick={deregister}
                                disabled={busy}
                                className="btn-cyber btn-cyber-pink w-full mt-2"
                                data-testid="node-deregister-btn"
                            >
                                <Power className="size-4" /> Deregister & Reclaim Stake
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <Field
                                label="Node name"
                                placeholder="e.g. Prajwal's Laptop"
                                value={name}
                                onChange={setName}
                                testId="node-name-input"
                            />
                            <div>
                                <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500 mb-1">
                                    Node type
                                </div>
                                <div className="grid grid-cols-3 gap-2">
                                    {NODE_TYPES.map((t) => (
                                        <button
                                            key={t.id}
                                            onClick={() => setNodeType(t.id)}
                                            data-testid={`node-type-${t.id}`}
                                            className={[
                                                "p-3 cyberpunk-clip border transition text-left",
                                                nodeType === t.id
                                                    ? "border-cyan-400 bg-cyan-400/10 glow-cyan"
                                                    : "border-white/10 hover:border-cyan-400/40",
                                            ].join(" ")}
                                        >
                                            <Cpu
                                                className={`size-4 mb-1 ${
                                                    nodeType === t.id ? "text-cyan-300" : "text-slate-500"
                                                }`}
                                            />
                                            <div className="font-display text-sm text-white">
                                                {t.label}
                                            </div>
                                            <div className="text-[10px] text-slate-500 mt-0.5">
                                                {t.desc}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <button
                                onClick={register}
                                disabled={busy || !name}
                                className="btn-cyber w-full"
                                data-testid="node-register-btn"
                            >
                                <Server className="size-4" /> Approve {Number(stakeRequired).toFixed(0)}{" "}
                                {tokenSymbol} & Register
                            </button>
                        </div>
                    )}
                </Card>

                <Card hoverable={false}>
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="font-display text-xl text-white">// chain telemetry</h3>
                        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-cyber-green">
                            <span className="size-2 rounded-full bg-cyber-green blink" />
                            LIVE
                        </div>
                    </div>
                    <div
                        ref={logsRef}
                        className="bg-black border border-cyber-green/20 rounded-md font-mono text-xs text-cyber-green p-3 h-72 overflow-y-auto"
                        data-testid="node-terminal"
                    >
                        {logs.length === 0 && (
                            <div className="opacity-60">{">"} waiting for on-chain events…</div>
                        )}
                        {logs.map((l, i) => (
                            <div key={i}>
                                <span className="text-cyber-green/50">[{l.ts}]</span> {l.msg}
                            </div>
                        ))}
                        <span className="blink">_</span>
                    </div>
                </Card>
            </div>

            <Card hoverable={false}>
                <div className="flex items-center gap-2 mb-3">
                    <Activity className="size-4 text-cyan-300" />
                    <h3 className="font-display text-xl text-white">
                        Active operators on the network
                    </h3>
                </div>
                {activeNodes.length === 0 ? (
                    <p className="font-mono text-xs text-slate-400">
                        No active nodes yet — be the first to register ↑.
                    </p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left font-mono text-xs">
                            <thead>
                                <tr className="text-slate-500 uppercase tracking-[0.2em] border-b border-white/10">
                                    <th className="py-2 pr-3">ID</th>
                                    <th className="py-2 pr-3">Name</th>
                                    <th className="py-2 pr-3">Type</th>
                                    <th className="py-2 pr-3">Owner</th>
                                    <th className="py-2 pr-3">Stake</th>
                                    <th className="py-2 pr-3">Rewards</th>
                                    <th className="py-2 pr-3">Since</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {activeNodes.map((n) => (
                                    <tr key={n.nodeId} data-testid={`node-row-${n.nodeId}`}>
                                        <td className="py-2 pr-3 text-cyan-300">#{n.nodeId}</td>
                                        <td className="py-2 pr-3 text-white">{n.name}</td>
                                        <td className="py-2 pr-3 text-pink-400 uppercase">{n.nodeType}</td>
                                        <td className="py-2 pr-3 text-slate-300">
                                            {n.owner.slice(0, 8)}…{n.owner.slice(-4)}
                                        </td>
                                        <td className="py-2 pr-3 text-white">
                                            {Number(n.stake).toFixed(0)} {tokenSymbol}
                                        </td>
                                        <td className="py-2 pr-3 text-cyan-300">
                                            {Number(n.totalRewards).toFixed(2)}
                                        </td>
                                        <td className="py-2 pr-3 text-slate-500">
                                            {n.registeredAt
                                                ? new Date(n.registeredAt * 1000).toLocaleDateString()
                                                : "—"}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>
        </div>
    );
}

function Field({ label, value, onChange, placeholder, testId }) {
    return (
        <label className="block">
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500 mb-1">
                {label}
            </div>
            <input
                placeholder={placeholder}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                data-testid={testId}
                className="w-full bg-black/60 border border-white/10 rounded-md px-3 py-2.5 font-mono text-white text-base focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400 transition"
            />
        </label>
    );
}

function Row({ label, value, mono }) {
    return (
        <div className="flex justify-between font-mono text-xs border-b border-white/5 py-1.5">
            <span className="text-slate-500">{label}</span>
            <span className={mono ? "text-cyan-300" : "text-white"}>{value}</span>
        </div>
    );
}
