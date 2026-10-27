"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  LayoutDashboard, Building2, Gem, Users, Target, Handshake, CalendarClock, IndianRupee, BarChart3, Settings, Bell, Search, Plus, PanelLeftClose, PanelLeft, LogOut, X, Loader2, ArrowRight, MapPin,
} from "lucide-react";
import { Logo, LogoMark } from "../public/logo";
import { Avatar, Kbd } from "../ui/misc";
import { cn } from "@/lib/cn";
import { logoutAction } from "@/app/admin/login/actions";

export interface NavItem { href: string; label: string; icon: keyof typeof ICONS; badge?: number }
const ICONS = { overview: LayoutDashboard, projects: Building2, inventory: Gem, buyers: Users, demand: Target, developers: Handshake, followups: CalendarClock, commissions: IndianRupee, reports: BarChart3, settings: Settings, locations: MapPin };

export function AdminShell({ nav, user, unread, quickAdd, children }: { nav: NavItem[]; user: { name: string; roleLabel: string }; unread: number; quickAdd: { href: string; label: string }[]; children: React.ReactNode }) {
  const path = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [palette, setPalette] = useState(false);
  useEffect(() => {
    try { setCollapsed(localStorage.getItem("ek-sidebar") === "1"); } catch {}
  }, []);
  useEffect(() => setMobile(false), [path]);
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette(true); }
      if (e.key === "/" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement)) { e.preventDefault(); setPalette(true); }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);
  const toggle = () => setCollapsed((c) => { try { localStorage.setItem("ek-sidebar", c ? "0" : "1"); } catch {} return !c; });
  const isActive = (href: string) => (href === "/admin" ? path === "/admin" : path.startsWith(href));

  const sidebar = (compact: boolean) => (
    <div className="flex h-full flex-col">
      <div className={cn("flex h-16 items-center", compact ? "justify-center" : "justify-between px-5")}>
        {compact ? <Link href="/admin" aria-label="Overview" className="text-ivory-50"><LogoMark /></Link> : <Logo light href="/admin" />}
      </div>
      <nav className="mt-2 flex-1 space-y-0.5 overflow-y-auto px-3 scrollbar-none" aria-label="Admin">
        {nav.map((n) => {
          const I = ICONS[n.icon];
          const active = isActive(n.href);
          return (
            <Link key={n.href} href={n.href} title={compact ? n.label : undefined} aria-current={active ? "page" : undefined} className={cn("group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-medium transition", active ? "bg-white/[0.08] text-ivory-50" : "text-ink-300 hover:bg-white/[0.04] hover:text-ivory-100", compact && "justify-center px-0")}>
              {active && <motion.span layoutId="nav-active" className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-gold-400" />}
              <I className={cn("size-[18px] shrink-0", active ? "text-gold-300" : "")} />
              {!compact && <span className="flex-1 truncate">{n.label}</span>}
              {!compact && n.badge ? <span className="num rounded-full bg-gold-400/20 px-1.5 py-0.5 text-[10.5px] font-semibold text-gold-200">{n.badge}</span> : null}
            </Link>
          );
        })}
      </nav>
      <div className={cn("border-t border-white/[0.06] p-3", compact && "flex flex-col items-center gap-2")}>
        <div className={cn("flex items-center gap-3 rounded-xl p-2", compact && "p-0")}>
          <Avatar name={user.name} className="bg-gold-300 text-ink-950" />
          {!compact && <div className="min-w-0 flex-1"><p className="truncate text-[13px] font-medium text-ivory-50">{user.name}</p><p className="truncate text-[11px] text-ink-400">{user.roleLabel}</p></div>}
          <form action={logoutAction}><button aria-label="Sign out" title="Sign out" className="grid size-8 place-items-center rounded-lg text-ink-300 hover:bg-white/5 hover:text-white"><LogOut className="size-4" /></button></form>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-svh bg-ivory-100">
      <aside className={cn("fixed inset-y-0 left-0 z-40 hidden bg-ink-950 transition-[width] duration-300 lg:block", collapsed ? "w-[76px]" : "w-[248px]")}>{sidebar(collapsed)}</aside>
      <AnimatePresence>
        {mobile && (
          <>
            <motion.div className="fixed inset-0 z-50 bg-ink-950/50 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMobile(false)} />
            <motion.aside className="fixed inset-y-0 left-0 z-50 w-[272px] bg-ink-950 lg:hidden" initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }} transition={{ type: "spring", bounce: 0, duration: 0.4 }}>{sidebar(false)}</motion.aside>
          </>
        )}
      </AnimatePresence>
      <div className={cn("transition-[padding] duration-300", collapsed ? "lg:pl-[76px]" : "lg:pl-[248px]")}>
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-ink-900/[0.06] bg-ivory-100/85 px-4 backdrop-blur-xl md:px-8">
          <button onClick={() => setMobile(true)} className="grid size-9 place-items-center rounded-lg text-ink-800 hover:bg-ink-900/5 lg:hidden" aria-label="Open navigation"><PanelLeft className="size-5" /></button>
          <button onClick={toggle} className="hidden size-9 place-items-center rounded-lg text-stone-500 hover:bg-ink-900/5 hover:text-ink-900 lg:grid" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>{collapsed ? <PanelLeft className="size-[18px]" /> : <PanelLeftClose className="size-[18px]" />}</button>
          <button onClick={() => setPalette(true)} className="flex h-10 max-w-md flex-1 items-center gap-2.5 rounded-full border border-ink-900/[0.08] bg-white px-4 text-left text-[13.5px] text-stone-400 shadow-soft transition hover:border-ink-900/20">
            <Search className="size-4" /> <span className="flex-1 truncate">Search buyers, projects, developers…</span> <span className="hidden sm:inline"><Kbd>⌘K</Kbd></span>
          </button>
          <div className="ml-auto flex items-center gap-2">
            <QuickAdd items={quickAdd} />
            <Link href="/admin/notifications" className="relative grid size-10 place-items-center rounded-full text-ink-800 hover:bg-ink-900/5" aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}>
              <Bell className="size-[18px]" />
              {unread > 0 && <span className="num absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-gold-500 px-1 text-[10px] font-bold text-ink-950">{unread > 9 ? "9+" : unread}</span>}
            </Link>
          </div>
        </header>
        <main className="px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
      <AnimatePresence>{palette && <CommandPalette onClose={() => setPalette(false)} />}</AnimatePresence>
    </div>
  );
}

function QuickAdd({ items }: { items: { href: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  if (!items.length) return null;
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex h-10 items-center gap-1.5 rounded-full bg-ink-900 px-4 text-[13.5px] font-medium text-white transition hover:bg-ink-800"><Plus className="size-4" /><span className="hidden sm:inline">Quick add</span></button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: 6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6 }} transition={{ duration: 0.15 }} className="absolute right-0 top-12 z-50 w-56 rounded-2xl border border-ink-900/5 bg-white p-1.5 shadow-lift">
            {items.map((i) => (
              <Link key={i.href} href={i.href} onClick={() => setOpen(false)} className="flex items-center justify-between rounded-xl px-3 py-2.5 text-[13.5px] text-ink-900 hover:bg-ivory-100">{i.label}<ArrowRight className="size-3.5 text-stone-400" /></Link>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

type Hit = { type: string; id: string; title: string; subtitle: string; href: string };

function CommandPalette({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const on = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [onClose]);
  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    const ctrl = new AbortController();
    setLoading(true);
    const t = setTimeout(() => {
      fetch(`/api/admin/search?q=${encodeURIComponent(q.trim())}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : { hits: [] }))
        .then((d: { hits: Hit[] }) => { setHits(d.hits); setIdx(0); })
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 180);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q]);
  const go = (h: Hit) => { onClose(); router.push(h.href); };
  return (
    <motion.div className="fixed inset-0 z-[80] flex items-start justify-center bg-ink-950/40 p-4 pt-[12vh] backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div role="dialog" aria-modal="true" aria-label="Search" initial={{ y: -12, scale: 0.98 }} animate={{ y: 0, scale: 1 }} exit={{ y: -12, opacity: 0 }} transition={{ duration: 0.2 }} className="w-full max-w-xl overflow-hidden rounded-3xl bg-white shadow-lift" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-ink-900/5 px-5">
          {loading ? <Loader2 className="size-5 animate-spin text-stone-400" /> : <Search className="size-5 text-stone-400" />}
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(hits.length - 1, i + 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
            if (e.key === "Enter" && hits[idx]) go(hits[idx]);
          }} placeholder="Name, phone, project, developer, unit…" className="h-14 flex-1 bg-transparent text-[15px] focus:outline-none" aria-label="Search everything" />
          <button onClick={onClose} aria-label="Close search"><X className="size-4 text-stone-400" /></button>
        </div>
        <ul className="max-h-[50vh] overflow-y-auto p-2" role="listbox">
          {q.trim().length < 2 ? (
            <li className="px-4 py-8 text-center text-sm text-stone-500">Type at least two characters. Tip: press <Kbd>/</Kbd> anywhere.</li>
          ) : !hits.length && !loading ? (
            <li className="px-4 py-8 text-center text-sm text-stone-500">No results for “{q}”.</li>
          ) : (
            hits.map((h, i) => (
              <li key={h.type + h.id} role="option" aria-selected={i === idx}>
                <button onMouseEnter={() => setIdx(i)} onClick={() => go(h)} className={cn("flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left", i === idx ? "bg-ivory-100" : "")}>
                  <span className="w-20 shrink-0 text-[10.5px] font-semibold uppercase tracking-wider text-gold-700">{h.type}</span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-ink-900">{h.title}</span><span className="block truncate text-[12px] text-stone-500">{h.subtitle}</span></span>
                  <ArrowRight className="size-3.5 text-stone-400" />
                </button>
              </li>
            ))
          )}
        </ul>
      </motion.div>
    </motion.div>
  );
}
