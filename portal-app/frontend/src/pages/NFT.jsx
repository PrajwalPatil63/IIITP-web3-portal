import React, { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, SectionTitle, Stat } from "../components/Card";
import { useWeb3 } from "../contexts/Web3Context";
import { Image as ImageIcon, Upload, Tag, ShoppingCart, X, Plus, Sparkles } from "lucide-react";
import { apiPost } from "../lib/api";
import { toast } from "sonner";

const TABS = [
    { id: "market", label: "Marketplace" },
    { id: "mine", label: "My NFTs" },
    { id: "mint", label: "Create / Mint" },
];

export default function NFTPage() {
    const {
        account,
        getContract,
        sendTx,
        ensureTokenApproval,
        signer,
        isCorrectNetwork,
        formatUnits,
        parseUnits,
        tokenSymbol,
        tokenDecimals,
        ADDRESSES,
    } = useWeb3();

    const [tab, setTab] = useState("market");
    const [listings, setListings] = useState([]);
    const [myNfts, setMyNfts] = useState([]);
    const [mintFee, setMintFee] = useState("0");
    const [isTeacherOnChain, setIsTeacherOnChain] = useState(false);
    const [totalMinted, setTotalMinted] = useState(0);
    const [busy, setBusy] = useState(false);

    // Mint form
    const [mintUri, setMintUri] = useState("");
    const [mintName, setMintName] = useState("");

    // List form (per tokenId)
    const [listPrices, setListPrices] = useState({});

    const refresh = useCallback(async () => {
        if (!isCorrectNetwork || !account) return;
        try {
            const m = getContract("IIITPMarket");
            const [fee, tchr, total, all] = await Promise.all([
                m.mintFee().catch(() => 0n),
                m.isTeacher(account).catch(() => false),
                m.totalMinted().catch(() => 0n),
                m.getAllListings().catch(() => [[], [], [], [], []]),
            ]);
            setMintFee(formatUnits(fee, tokenDecimals));
            setIsTeacherOnChain(!!tchr);
            setTotalMinted(Number(total));

            // all = [tokenIds[], sellers[], prices[], imageURIs[], names[]]
            const tokenIds = all[0] || [];
            const sellers = all[1] || [];
            const prices = all[2] || [];
            const imageURIs = all[3] || [];
            const names = all[4] || [];
            const rows = tokenIds.map((id, i) => ({
                tokenId: Number(id),
                seller: sellers[i],
                price: formatUnits(prices[i] || 0n, tokenDecimals),
                imageURI: imageURIs[i] || "",
                name: names[i] || `#${id}`,
            }));
            setListings(rows);

            // My NFTs — load real nftInfo for each token
            const owned = await m.getOwnedTokens(account).catch(() => []);
            const listedIds = tokenIds.map((x) => Number(x));

            const mine = await Promise.all(
                owned.map(async (tid) => {
                    const idNum = Number(tid);
                    const listedIndex = listedIds.indexOf(idNum);
                    // Fetch real on-chain metadata
                    const info = await m.nftInfo(idNum).catch(() => null);
                    return {
                        tokenId: idNum,
                        creator: info?.creator || account,
                        imageURI: info?.imageURI || "",
                        name: info?.name || `NFT #${idNum}`,
                        mintedAt: info?.mintedAt ? Number(info.mintedAt) : Date.now() / 1000,
                        listed: listedIndex !== -1,
                        listingPrice:
                            listedIndex !== -1
                                ? formatUnits(prices[listedIndex] || 0n, tokenDecimals)
                                : "0",
                    };
                })
            );
            setMyNfts(mine);
        } catch (e) {
            console.warn("Market: load failed", e?.message);
        }
    }, [account, getContract, formatUnits, isCorrectNetwork, tokenDecimals]);

    useEffect(() => {
        refresh();
        const i = setInterval(refresh, 15000);
        return () => clearInterval(i);
    }, [refresh]);

    const mint = async () => {
        if (!mintUri || !mintName) {
            toast.error("Image URL and name required");
            return;
        }
        setBusy(true);
        try {
            // Students pay mintFee — approve first (infinite, one-time)
            if (!isTeacherOnChain && Number(mintFee) > 0) {
                const amount = parseUnits(mintFee, tokenDecimals);

                const token = getContract("IIITPToken", true);
                const current = await token.allowance(account, ADDRESSES.IIITPMarket).catch(() => 0n);

                if (current < amount) {
                    const txa = await token.approve(ADDRESSES.IIITPMarket, 2n ** 256n - 1n);
                    await txa.wait();
                }
            }
            const r = await sendTx("Mint NFT", "IIITPMarket", "mint", [mintUri, mintName]);
            if (r) {
                apiPost("/tx", {
                    wallet: account,
                    tx_hash: r.tx.hash,
                    type: "mint-nft",
                    summary: `Minted "${mintName}"`,
                }).catch(() => { });
                setMintUri("");
                setMintName("");
                setTab("mine");
                setTimeout(refresh, 3000);
            }
        } finally {
            setBusy(false);
        }
    };

    const list = async (tokenId) => {
        const price = listPrices[tokenId];
        if (!price || Number(price) <= 0) {
            toast.error("Enter a valid price");
            return;
        }
        setBusy(true);
        try {
            // Approve marketplace as operator
            const m = getContract("IIITPMarket", true);
            const approved = await m.getApproved(tokenId).catch(() => "");
            const approvedAll = await m.isApprovedForAll(account, ADDRESSES.IIITPMarket).catch(() => false);

            if (approved.toLowerCase?.() !== ADDRESSES.IIITPMarket.toLowerCase() && !approvedAll) {
                const tx = await m.approve(ADDRESSES.IIITPMarket, tokenId);
                await tx.wait();
            }
            const priceWei = parseUnits(price, tokenDecimals);
            const r = await sendTx("List NFT", "IIITPMarket", "list", [tokenId, priceWei]);
            if (r) {
                apiPost("/tx", {
                    wallet: account,
                    tx_hash: r.tx.hash,
                    type: "list-nft",
                    summary: `Listed #${tokenId} @ ${price} ${tokenSymbol}`,
                }).catch(() => { });
                refresh();
            }
        } finally {
            setBusy(false);
        }
    };

    const delist = async (tokenId) => {
        const r = await sendTx("Delist NFT", "IIITPMarket", "delist", [tokenId]);
        if (r) refresh();
    };

    const buy = async (item) => {
        setBusy(true);
        try {
            const price = parseUnits(item.price, tokenDecimals);
            const ok = await ensureTokenApproval(ADDRESSES.IIITPMarket, price);
            if (!ok) {
                setBusy(false);
                return;
            }
            const r = await sendTx("Buy NFT", "IIITPMarket", "buy", [item.tokenId]);
            if (r) {
                apiPost("/tx", {
                    wallet: account,
                    tx_hash: r.tx.hash,
                    type: "buy-nft",
                    summary: `Bought "${item.name}" for ${item.price} ${tokenSymbol}`,
                }).catch(() => { });
                refresh();
            }
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-6" data-testid="nft-page">
            {/* Hero */}
            <div
                className="relative overflow-hidden cyberpunk-clip border border-pink-500/30 p-8"
                style={{
                    backgroundImage:
                        "linear-gradient(rgba(0,0,0,0.7), rgba(0,0,0,0.85)), url(https://images.pexels.com/photos/9967912/pexels-photo-9967912.jpeg)",
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                }}
            >
                <div className="font-mono text-xs uppercase tracking-[0.3em] text-pink-400 mb-2">
                    // IIIT Pune · open marketplace
                </div>
                <h1 className="font-display text-4xl sm:text-5xl text-white">
                    Mint. List. Sell. All on-chain.
                </h1>
                <p className="text-slate-300 mt-3 max-w-2xl">
                    Anyone can mint a campus NFT by pasting an image URL (IPFS or http).
                    Teachers mint <span className="text-cyan-300 font-mono">free</span>;
                    students pay <span className="text-cyan-300 font-mono">{Number(mintFee).toFixed(0)} {tokenSymbol}</span>.
                    Sales settle in {tokenSymbol}.
                </p>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Card><Stat label="TOTAL MINTED" value={totalMinted} /></Card>
                <Card><Stat label="ACTIVE LISTINGS" value={listings.length} accent="pink" /></Card>
                <Card>
                    <Stat
                        label="YOU ARE"
                        value={isTeacherOnChain ? "TEACHER" : account ? "STUDENT" : "—"}
                        accent={isTeacherOnChain ? "pink" : "cyan"}
                    />
                </Card>
                <Card><Stat label="YOUR NFTs" value={myNfts.length} /></Card>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 border-b border-white/10 overflow-x-auto">
                {TABS.map((t) => (
                    <button
                        key={t.id}
                        onClick={() => setTab(t.id)}
                        data-testid={`nft-tab-${t.id}`}
                        className={[
                            "px-4 py-2 font-mono text-xs uppercase tracking-[0.2em] border-b-2 -mb-px transition",
                            tab === t.id
                                ? "border-cyan-400 text-cyan-300 text-glow-cyan"
                                : "border-transparent text-slate-500 hover:text-white",
                        ].join(" ")}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {tab === "market" && (
                <MarketplaceGrid listings={listings} onBuy={buy} busy={busy} account={account} tokenSymbol={tokenSymbol} />
            )}

            {tab === "mine" && (
                <MyCollection
                    items={myNfts}
                    onList={list}
                    onDelist={delist}
                    listPrices={listPrices}
                    setListPrices={setListPrices}
                    busy={busy}
                    tokenSymbol={tokenSymbol}
                />
            )}

            {tab === "mint" && (
                <MintForm
                    uri={mintUri}
                    setUri={setMintUri}
                    name={mintName}
                    setName={setMintName}
                    onMint={mint}
                    busy={busy}
                    isTeacher={isTeacherOnChain}
                    mintFee={mintFee}
                    tokenSymbol={tokenSymbol}
                />
            )}
        </div>
    );
}

// ─── Marketplace ────────────────────────────────────────────
function MarketplaceGrid({ listings, onBuy, busy, account, tokenSymbol }) {
    if (listings.length === 0) {
        return (
            <Card hoverable={false}>
                <p className="font-mono text-xs text-slate-400">
                    No NFTs for sale yet. Be the first to mint one in the Create tab.
                </p>
            </Card>
        );
    }
    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            <AnimatePresence>
                {listings.map((n, i) => (
                    <motion.div
                        key={n.tokenId}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ delay: i * 0.05 }}
                        whileHover={{ y: -4 }}
                        className="group cyberpunk-clip border border-pink-500/30 hover:border-pink-400 hover:shadow-[0_0_24px_rgba(255,0,60,0.35)] transition-all overflow-hidden bg-black/60"
                        data-testid={`nft-card-${n.tokenId}`}
                    >
                        <NFTImage uri={n.imageURI} />
                        <div className="p-4 glass">
                            <div className="flex items-center justify-between mb-1">
                                <div className="font-display text-lg text-white truncate">{n.name}</div>
                                <div className="font-mono text-[10px] text-pink-400">#{n.tokenId}</div>
                            </div>
                            <div className="font-mono text-[10px] text-slate-500 mb-3">
                                Seller {n.seller.slice(0, 6)}…{n.seller.slice(-4)}
                            </div>
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="font-mono text-[10px] text-slate-500">PRICE</div>
                                    <div className="font-mono text-cyan-300 text-glow-cyan text-xl">
                                        {Number(n.price).toFixed(2)} {tokenSymbol}
                                    </div>
                                </div>
                                <button
                                    onClick={() => onBuy(n)}
                                    disabled={busy || !account || n.seller.toLowerCase() === account?.toLowerCase()}
                                    className="btn-cyber btn-cyber-pink"
                                    data-testid={`nft-buy-${n.tokenId}`}
                                >
                                    <ShoppingCart className="size-4" /> Buy
                                </button>
                            </div>
                        </div>
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );
}

// ─── My collection ──────────────────────────────────────────
function MyCollection({ items, onList, onDelist, listPrices, setListPrices, busy, tokenSymbol }) {
    if (items.length === 0) {
        return (
            <Card hoverable={false}>
                <p className="font-mono text-xs text-slate-400">
                    You don't own any NFTs yet. Head to the Create tab to mint your first one.
                </p>
            </Card>
        );
    }
    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {items.map((n) => (
                <div
                    key={n.tokenId}
                    className="cyberpunk-clip border border-cyan-400/30 overflow-hidden bg-black/60"
                    data-testid={`my-nft-${n.tokenId}`}
                >
                    <NFTImage uri={n.imageURI} />
                    <div className="p-4 glass">
                        <div className="flex items-center justify-between mb-1">
                            <div className="font-display text-lg text-white truncate">{n.name}</div>
                            <div className="font-mono text-[10px] text-cyan-300">#{n.tokenId}</div>
                        </div>
                        <div className="font-mono text-[10px] text-slate-500 mb-3">
                            Minted {n.mintedAt ? new Date(n.mintedAt * 1000).toLocaleDateString() : "—"}
                        </div>
                        {n.listed ? (
                            <div className="space-y-2">
                                <div className="font-mono text-xs text-pink-400">
                                    Listed @ {Number(n.listingPrice).toFixed(2)} {tokenSymbol}
                                </div>
                                <button
                                    onClick={() => onDelist(n.tokenId)}
                                    disabled={busy}
                                    className="btn-cyber btn-cyber-pink w-full"
                                    data-testid={`delist-${n.tokenId}`}
                                >
                                    <X className="size-4" /> Delist
                                </button>
                            </div>
                        ) : (
                            <div className="flex gap-2">
                                <input
                                    type="number"
                                    inputMode="decimal"
                                    placeholder={`Price in ${tokenSymbol}`}
                                    value={listPrices[n.tokenId] || ""}
                                    onChange={(e) => setListPrices({ ...listPrices, [n.tokenId]: e.target.value })}
                                    data-testid={`list-price-${n.tokenId}`}
                                    className="flex-1 bg-black/60 border border-white/10 rounded-md px-3 py-2 font-mono text-white text-sm focus:border-cyan-400 focus:outline-none"
                                />
                                <button
                                    onClick={() => onList(n.tokenId)}
                                    disabled={busy}
                                    className="btn-cyber"
                                    data-testid={`list-${n.tokenId}`}
                                >
                                    <Tag className="size-4" /> List
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
}

// ─── Mint form ──────────────────────────────────────────────
function MintForm({ uri, setUri, name, setName, onMint, busy, isTeacher, mintFee, tokenSymbol }) {
    const valid = uri && name;
    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card hoverable={false}>
                <div className="flex items-center gap-2 mb-3">
                    <Upload className="size-4 text-cyan-300" />
                    <h3 className="font-display text-xl text-white">Upload a new NFT</h3>
                </div>
                <div className="space-y-3">
                    <label className="block">
                        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500 mb-1">
                            Image URL
                        </div>
                        <input
                            placeholder="ipfs://Qm… or https://…"
                            value={uri}
                            onChange={(e) => setUri(e.target.value)}
                            data-testid="mint-uri-input"
                            className="w-full bg-black/60 border border-white/10 rounded-md px-3 py-2.5 font-mono text-white text-sm focus:border-cyan-400 focus:outline-none"
                        />
                        <div className="mt-1 text-[10px] text-slate-500 font-mono">
                            Host your image on IPFS (web3.storage, Pinata) or any public URL.
                        </div>
                    </label>
                    <label className="block">
                        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500 mb-1">
                            NFT name
                        </div>
                        <input
                            placeholder='e.g. "IIIT Pune Convocation 2026"'
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            data-testid="mint-name-input"
                            className="w-full bg-black/60 border border-white/10 rounded-md px-3 py-2.5 font-display text-white text-base focus:border-cyan-400 focus:outline-none"
                        />
                    </label>
                    <div className="font-mono text-xs text-slate-400 p-3 glass-cyan cyberpunk-clip">
                        {isTeacher
                            ? `You're a teacher — minting is FREE.`
                            : `Cost: ${Number(mintFee).toFixed(0)} ${tokenSymbol}. Approval will be requested.`}
                    </div>
                    <button
                        onClick={onMint}
                        disabled={busy || !valid}
                        className="btn-cyber w-full"
                        data-testid="mint-btn"
                    >
                        <Sparkles className="size-4" /> Mint NFT
                    </button>
                </div>
            </Card>

            <Card hoverable={false}>
                <h3 className="font-display text-xl text-white mb-3">Preview</h3>
                {uri ? (
                    <div className="cyberpunk-clip border border-cyan-400/30 overflow-hidden">
                        <NFTImage uri={uri} />
                        <div className="p-3 glass">
                            <div className="font-display text-lg text-white truncate">
                                {name || "Untitled"}
                            </div>
                            <div className="font-mono text-[10px] text-slate-500">Preview · unminted</div>
                        </div>
                    </div>
                ) : (
                    <div className="aspect-square border border-dashed border-white/10 rounded-md flex items-center justify-center text-slate-600 font-mono text-xs">
                        Paste an image URL →
                    </div>
                )}
            </Card>
        </div>
    );
}

// ─── Shared ─────────────────────────────────────────────────
function NFTImage({ uri }) {
    const [errored, setErrored] = React.useState(false);
    const [loaded,  setLoaded]  = React.useState(false);

    // Reset when the URI changes (e.g. user types a new URL in the preview)
    React.useEffect(() => {
        setErrored(false);
        setLoaded(false);
    }, [uri]);

    // Convert ipfs:// → public gateway, keep http/https as-is
    const src = uri?.startsWith("ipfs://")
        ? `https://ipfs.io/ipfs/${uri.replace("ipfs://", "")}`
        : uri;

    return (
        <div className="aspect-square bg-black/60 relative flex items-center justify-center overflow-hidden">
            {/* Loaded image */}
            {src && !errored && (
                <img
                    key={src}
                    src={src}
                    alt=""
                    className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
                    onLoad={() => setLoaded(true)}
                    onError={() => setErrored(true)}
                />
            )}

            {/* Shimmer while loading */}
            {src && !errored && !loaded && (
                <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-slate-800 via-slate-700 to-slate-800" />
            )}

            {/* Fallback: no URI or load error */}
            {(!src || errored) && (
                <div className="flex flex-col items-center justify-center gap-2 p-3">
                    <ImageIcon className="size-10 text-slate-600" />
                    {errored && (
                        <span className="font-mono text-[9px] text-red-400/70 text-center leading-tight">
                            Could not load image
                        </span>
                    )}
                    {!src && (
                        <span className="font-mono text-[9px] text-slate-600 text-center leading-tight">
                            Paste an image URL above
                        </span>
                    )}
                </div>
            )}

            {/* Bottom gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent pointer-events-none" />
        </div>
    );
}

