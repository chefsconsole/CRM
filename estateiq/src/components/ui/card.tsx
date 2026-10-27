import { cn } from "@/lib/cn";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-3xl border border-ink-900/[0.07] bg-white shadow-soft", className)} {...props} />;
}

export function CardHeader({ title, subtitle, action, className }: { title: React.ReactNode; subtitle?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start justify-between gap-4 px-6 pt-5", className)}>
      <div className="min-w-0">
        <h3 className="text-[15px] font-semibold tracking-tight text-ink-900">{title}</h3>
        {subtitle && <p className="mt-0.5 text-[13px] text-stone-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function SectionTitle({ eyebrow, title, subtitle, action, light, className }: { eyebrow?: string; title: React.ReactNode; subtitle?: React.ReactNode; action?: React.ReactNode; light?: boolean; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-6 md:flex-row md:items-end md:justify-between", className)}>
      <div className="max-w-2xl">
        {eyebrow && <p className={cn("eyebrow mb-4", light ? "text-gold-300" : "text-gold-600")}>{eyebrow}</p>}
        <h2 className={cn("display text-4xl md:text-[56px]", light ? "text-ivory-50" : "text-ink-900")}>{title}</h2>
        {subtitle && <p className={cn("mt-5 max-w-xl text-[15px] leading-relaxed", light ? "text-ink-300" : "text-stone-500")}>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
