import Link from "next/link";
import { cn } from "@/lib/cn";

type Variant = "primary" | "gold" | "outline" | "ghost" | "light" | "danger" | "subtle";
type Size = "sm" | "md" | "lg" | "xl" | "icon";

const variants: Record<Variant, string> = {
  primary: "bg-ink-900 text-ivory-50 hover:bg-ink-800 shadow-[inset_0_1px_0_rgb(255_255_255/0.08)]",
  gold: "bg-gradient-to-b from-gold-300 to-gold-500 text-ink-950 hover:from-gold-200 hover:to-gold-400 shadow-[inset_0_1px_0_rgb(255_255_255/0.5),0_8px_24px_-10px_rgb(184_151_92/0.8)]",
  outline: "border border-ink-900/15 bg-white/60 text-ink-900 hover:border-ink-900/35 hover:bg-white",
  ghost: "text-ink-800 hover:bg-ink-900/5",
  light: "bg-white text-ink-900 hover:bg-ivory-100 shadow-soft",
  danger: "bg-clay-600 text-white hover:bg-clay-600/90",
  subtle: "bg-ivory-200/70 text-ink-900 hover:bg-ivory-300/70",
};
const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-6 text-[15px] gap-2",
  xl: "h-14 px-8 text-base gap-2.5",
  icon: "size-10 justify-center",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", className?: string) {
  return cn(
    "inline-flex select-none items-center justify-center whitespace-nowrap rounded-full font-medium transition-all duration-300 ease-[var(--ease-lux)] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
    variants[variant],
    sizes[size],
    className,
  );
}

export function Button({
  variant,
  size,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink({
  variant,
  size,
  className,
  href,
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; variant?: Variant; size?: Size }) {
  return <Link href={href} className={buttonClass(variant, size, className)} {...props} />;
}
