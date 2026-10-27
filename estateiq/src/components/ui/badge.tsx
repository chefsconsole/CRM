import { cn } from "@/lib/cn";
import type { Tone } from "@/lib/labels";

const tones: Record<Tone, string> = {
  neutral: "bg-ivory-200 text-stone-700 ring-ink-900/5",
  gold: "bg-gold-200/70 text-gold-700 ring-gold-500/20",
  ink: "bg-ink-900 text-ivory-100 ring-ink-900",
  positive: "bg-sage-50 text-sage-600 ring-sage-600/15",
  warning: "bg-amber-50 text-amber-600 ring-amber-600/15",
  danger: "bg-clay-50 text-clay-600 ring-clay-600/15",
  info: "bg-sky-50 text-sky-600 ring-sky-600/15",
  muted: "bg-stone-300/30 text-stone-500 ring-ink-900/5",
};

export function Badge({
  tone = "neutral",
  children,
  className,
  dot,
  title,
}: {
  tone?: Tone;
  children: React.ReactNode;
  className?: string;
  dot?: boolean;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 font-sans tracking-normal text-[11.5px] font-medium ring-1 ring-inset", tones[tone], className)}
    >
      {dot && <span className="size-1.5 rounded-full bg-current opacity-80" />}
      {children}
    </span>
  );
}

export function LabelBadge<T extends string>({ map, value, className }: { map: Record<T, { label: string; tone: Tone; hint?: string }>; value: T; className?: string }) {
  const m = map[value];
  return (
    <Badge tone={m.tone} title={m.hint} className={className} dot>
      {m.label}
    </Badge>
  );
}
