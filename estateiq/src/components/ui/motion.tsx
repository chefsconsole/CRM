"use client";

import { animate, motion, MotionConfig, useInView, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useEffect, useRef } from "react";

// Reduced-motion is honoured globally via <MotionConfig reducedMotion="user"> (no SSR/client branching here).
export function Reveal({ children, delay = 0, className, y = 18 }: { children: React.ReactNode; delay?: number; className?: string; y?: number }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.1 }}
      transition={{ duration: 0.9, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

/** Counts up to a value once it scrolls into view. */
export function CountUp({ value, format = "number", className }: { value: number; format?: "number" | "crore"; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduce = useReducedMotion();
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) =>
    format === "crore" ? `₹${(v / 1e7).toFixed(v >= 1e9 ? 0 : 1)} Cr` : Math.round(v).toLocaleString("en-IN"),
  );
  useEffect(() => {
    if (!inView) return;
    if (reduce) {
      mv.set(value);
      return;
    }
    const c = animate(mv, value, { duration: 1.6, ease: [0.22, 1, 0.36, 1] });
    return () => c.stop();
  }, [inView, value, mv, reduce]);
  return (
    <motion.span ref={ref} className={className}>
      {text}
    </motion.span>
  );
}

export function ProgressBar({ value, className, tone = "gold" }: { value: number; className?: string; tone?: "gold" | "ink" | "light" }) {
  const fill = tone === "gold" ? "bg-gradient-to-r from-gold-500 to-gold-300" : tone === "ink" ? "bg-ink-900" : "bg-ivory-50";
  return (
    <div className={`h-1.5 w-full overflow-hidden rounded-full ${tone === "light" ? "bg-white/15" : "bg-ink-900/[0.07]"} ${className ?? ""}`} role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
      <motion.div
        className={`h-full rounded-full ${fill}`}
        initial={{ width: 0 }}
        whileInView={{ width: `${Math.max(2, Math.min(100, value * 100))}%` }}
        viewport={{ once: true }}
        transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  );
}

export function ProgressRing({ value, size = 72, stroke = 5, label, light }: { value: number; size?: number; stroke?: number; label?: React.ReactNode; light?: boolean }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={light ? "rgb(255 255 255 / 0.12)" : "rgb(10 19 34 / 0.08)"} strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="url(#ek-gold)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          whileInView={{ strokeDashoffset: c * (1 - Math.min(1, value)) }}
          viewport={{ once: true }}
          transition={{ duration: 1.6, ease: [0.22, 1, 0.36, 1] }}
        />
        <defs>
          <linearGradient id="ek-gold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#e2cc9c" />
            <stop offset="1" stopColor="#997a42" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{label ?? <span className="num text-sm font-semibold">{Math.round(value * 100)}%</span>}</div>
    </div>
  );
}

export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
