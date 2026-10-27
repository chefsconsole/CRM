import Link from "next/link";
import { cn } from "@/lib/cn";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-7", className)} aria-hidden>
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#efe2c4" />
          <stop offset="1" stopColor="#997a42" />
        </linearGradient>
      </defs>
      <rect x="3" y="11" width="7" height="18" rx="1" fill="url(#lg)" />
      <rect x="12.5" y="3" width="7" height="26" rx="1" fill="currentColor" />
      <rect x="22" y="15" width="7" height="14" rx="1" fill="url(#lg)" />
    </svg>
  );
}

export function Logo({ light, className, href = "/" }: { light?: boolean; className?: string; href?: string }) {
  return (
    <Link href={href} className={cn("group flex items-center gap-2.5", light ? "text-ivory-50" : "text-ink-900", className)} aria-label="EstateIQ home">
      <LogoMark className="transition-transform duration-500 group-hover:-translate-y-0.5" />
      <span className="font-serif text-[26px] leading-none tracking-tight">Estate<span className="gold-text font-sans text-[19px] font-semibold tracking-normal">IQ</span></span>
    </Link>
  );
}
