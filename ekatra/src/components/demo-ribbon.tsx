export function isDemoMode() {
  const v = process.env.NEXT_PUBLIC_DEMO_MODE;
  if (v === "true") return true;
  if (v === "false") return false;
  return process.env.NODE_ENV !== "production";
}

export function DemoRibbon() {
  if (!isDemoMode()) return null;
  return (
    <div
      role="note"
      className="pointer-events-none fixed bottom-[76px] right-3 z-[60] lg:bottom-3 flex items-center gap-2 rounded-full border border-gold-400/40 bg-ink-900/90 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-gold-300 shadow-lift backdrop-blur"
    >
      <span className="size-1.5 animate-pulse rounded-full bg-gold-400" />
      Demo data · fictional projects &amp; prices
    </div>
  );
}
