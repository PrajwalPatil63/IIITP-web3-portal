import React, { useEffect, useState } from "react";
import { Card, SectionTitle, Stat } from "../components/Card";
import { useWeb3 } from "../contexts/Web3Context";
import { User, Save } from "lucide-react";
import { apiGet, apiPost } from "../lib/api";
import { toast } from "sonner";

const ROLES = ["student", "teacher", "admin"];

export default function ProfilePage() {
    const { account, isAdmin, ethBalance, tokenBalance, tokenSymbol } = useWeb3();
    const [profile, setProfile] = useState(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!account) return;
        apiGet(`/profiles/${account}`)
            .then(setProfile)
            .catch(() => setProfile({ role: "student" }));
    }, [account]);

    if (!account) {
        return (
            <Card>
                <p className="text-slate-400 font-mono text-sm">
                    Connect your wallet to view and edit your on-chain identity.
                </p>
            </Card>
        );
    }

    const update = (k, v) => setProfile((p) => ({ ...p, [k]: v }));

    const save = async () => {
        setSaving(true);
        try {
            const r = await apiPost("/profiles", {
                wallet: account,
                role: profile.role,
                name: profile.name,
                department: profile.department,
                avatar_url: profile.avatar_url,
            });
            setProfile(r);
            toast.success("Profile saved");
        } catch (e) {
            toast.error("Save failed");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-6" data-testid="profile-page">
            <SectionTitle kicker="// identity" title="Your campus profile">
                Off-chain metadata that links your wallet to your campus identity. Role-weighted
                voting reads this when you cast votes.
            </SectionTitle>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Card><Stat label="ETH" value={Number(ethBalance).toFixed(4)} /></Card>
                <Card><Stat label={tokenSymbol} value={Number(tokenBalance).toFixed(2)} accent="pink" /></Card>
                <Card><Stat label="ROLE" value={(profile?.role || "student").toUpperCase()} /></Card>
                <Card><Stat label="ADMIN" value={isAdmin ? "YES" : "NO"} accent={isAdmin ? "pink" : "cyan"} /></Card>
            </div>

            {profile && (
                <Card hoverable={false}>
                    <div className="flex items-center gap-2 mb-4">
                        <User className="size-4 text-cyan-300" />
                        <h3 className="font-display text-xl text-white">Edit profile</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Field label="Display name" value={profile.name || ""} onChange={(v) => update("name", v)} testId="profile-name-input" />
                        <Field label="Department" value={profile.department || ""} onChange={(v) => update("department", v)} testId="profile-dept-input" />
                        <Field label="Avatar URL" value={profile.avatar_url || ""} onChange={(v) => update("avatar_url", v)} testId="profile-avatar-input" />
                        <div>
                            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500 mb-1">
                                Role
                            </div>
                            <div className="flex gap-2">
                                {ROLES.map((r) => (
                                    <button
                                        key={r}
                                        onClick={() => update("role", r)}
                                        data-testid={`role-${r}`}
                                        className={[
                                            "px-3 py-2 font-mono text-xs uppercase tracking-wider border cyberpunk-clip transition",
                                            profile.role === r
                                                ? "border-cyan-400 text-cyan-300 bg-cyan-400/10 glow-cyan"
                                                : "border-white/10 text-slate-400 hover:text-white",
                                        ].join(" ")}
                                    >
                                        {r}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={save}
                        disabled={saving}
                        className="btn-cyber mt-5"
                        data-testid="profile-save-btn"
                    >
                        <Save className="size-4" /> Save
                    </button>
                </Card>
            )}

            <Card hoverable={false}>
                <h3 className="font-display text-xl text-white mb-3">Wallet</h3>
                <div className="space-y-2 font-mono text-xs">
                    <Row label="Address" value={account} />
                    <Row label="Network" value="Sepolia · 11155111" />
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

function Row({ label, value }) {
    return (
        <div className="flex justify-between border-b border-white/5 py-1.5">
            <span className="text-slate-500">{label}</span>
            <span className="text-cyan-300">{value}</span>
        </div>
    );
}
