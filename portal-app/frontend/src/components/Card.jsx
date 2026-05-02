import React from "react";
import { motion } from "framer-motion";

export const Card = ({ className = "", children, hoverable = true, glow = false, ...props }) => (
    <motion.div
        whileHover={hoverable ? { y: -3 } : undefined}
        transition={{ duration: 0.25 }}
        className={[
            "relative overflow-hidden glass cyberpunk-clip p-6",
            hoverable
                ? "transition-all duration-300 hover:border-cyan-400/40 hover:shadow-[0_0_24px_rgba(0,229,255,0.15)]"
                : "",
            glow ? "glow-cyan" : "",
            className,
        ].join(" ")}
        {...props}
    >
        {children}
    </motion.div>
);

export const SectionTitle = ({ kicker, title, children, className = "" }) => (
    <div className={`mb-6 ${className}`}>
        {kicker && (
            <div className="font-mono text-xs uppercase tracking-[0.3em] text-cyan-400/80 mb-2">
                {kicker}
            </div>
        )}
        <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white">
            {title}
        </h1>
        {children && <p className="mt-2 text-slate-400 max-w-2xl">{children}</p>}
    </div>
);

export const Stat = ({ label, value, accent = "cyan", suffix }) => (
    <div className="space-y-1">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">{label}</div>
        <div
            className={[
                "font-mono text-2xl tracking-tight",
                accent === "pink" ? "text-pink-400 text-glow-pink" : "text-cyan-300 text-glow-cyan",
            ].join(" ")}
        >
            {value}
            {suffix && <span className="text-slate-500 text-base ml-1">{suffix}</span>}
        </div>
    </div>
);
