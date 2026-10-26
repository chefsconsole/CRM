"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Menu, X, Sparkles, UserRound } from "lucide-react";
import { Logo } from "./logo";
import { buttonClass } from "../ui/button";
import { cn } from "@/lib/cn";

const NAV = [
  { href: "/properties?mode=homes", label: "Buy" },
  { href: "/properties?mode=commercial", label: "Commercial" },
  { href: "/properties?mode=rent-homes", label: "Rent" },
  { href: "/groups", label: "Buying groups" },
  { href: "/locations", label: "Locations" },
  { href: "/how-it-works", label: "How it works" },
];

export function SiteHeader() {
  const path = usePathname();
  const overHero = path === "/";
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 40);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  useEffect(() => setOpen(false), [path]);
  const light = overHero && !scrolled && !open;

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-all duration-500",
        light ? "bg-transparent" : "border-b border-ink-900/[0.06] bg-ivory-50/80 backdrop-blur-xl",
      )}
    >
      <div className="mx-auto flex h-[72px] max-w-[1400px] items-center justify-between gap-6 px-5 md:px-10">
        <Logo light={light} />
        <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={cn(
                "rounded-full px-3.5 py-2 text-[13.5px] font-medium transition",
                light ? "text-ivory-100/85 hover:bg-white/10 hover:text-white" : "text-stone-600 hover:bg-ink-900/5 hover:text-ink-900",
              )}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/account" aria-label="My account" className={cn("hidden size-10 place-items-center rounded-full transition sm:grid", light ? "text-ivory-100 hover:bg-white/10" : "text-ink-800 hover:bg-ink-900/5")}>
            <UserRound className="size-[18px]" />
          </Link>
          <Link href="/match" className={buttonClass("gold", "md", "hidden sm:inline-flex")}>
            <Sparkles className="size-4" /> Find my match
          </Link>
          <button onClick={() => setOpen((o) => !o)} aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} className={cn("grid size-10 place-items-center rounded-full lg:hidden", light ? "text-white" : "text-ink-900")}>
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>
      <AnimatePresence>
        {open && (
          <motion.nav
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden border-t border-ink-900/5 bg-ivory-50 lg:hidden"
            aria-label="Mobile"
          >
            <div className="flex flex-col px-5 py-4">
              {NAV.map((n, i) => (
                <motion.div key={n.href} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.04 * i }}>
                  <Link href={n.href} className="block border-b border-ink-900/5 py-3.5 font-serif text-2xl text-ink-900">
                    {n.label}
                  </Link>
                </motion.div>
              ))}
              <div className="mt-5 grid grid-cols-2 gap-3">
                <Link href="/account" className={buttonClass("outline", "lg")}>My account</Link>
                <Link href="/match" className={buttonClass("gold", "lg")}>Find my match</Link>
              </div>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
