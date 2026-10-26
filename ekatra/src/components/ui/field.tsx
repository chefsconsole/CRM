import { cn } from "@/lib/cn";

export const inputClass =
  "w-full rounded-xl border border-ink-900/12 bg-white px-3.5 py-2.5 text-[14px] text-ink-900 placeholder:text-stone-400 transition focus:border-gold-500 focus:outline-none focus:ring-4 focus:ring-gold-300/30 disabled:bg-ivory-100 aria-[invalid=true]:border-clay-600 aria-[invalid=true]:ring-clay-600/10";

export function Field({
  label,
  hint,
  error,
  children,
  className,
  htmlFor,
  required,
}: {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: string | null;
  children: React.ReactNode;
  className?: string;
  htmlFor?: string;
  required?: boolean;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && (
        <label htmlFor={htmlFor} className="text-[12.5px] font-medium text-stone-700">
          {label}
          {required && <span className="text-gold-600"> *</span>}
        </label>
      )}
      {children}
      {error ? (
        <p role="alert" className="text-[12px] text-clay-600">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[12px] text-stone-500">{hint}</p>
      ) : null}
    </div>
  );
}

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(inputClass, className)} {...props} />;
}
export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(inputClass, "min-h-24 resize-y", className)} {...props} />;
}
export function Select({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        inputClass,
        "appearance-none bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='none' stroke='%237b766d' stroke-width='1.5'%3E%3Cpath d='M3 4.5l3 3 3-3'/%3E%3C/svg%3E\")] bg-[right_0.9rem_center] bg-no-repeat pr-9",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}
export function Checkbox({ label, className, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: React.ReactNode }) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-3 text-[13px] leading-relaxed text-stone-600", className)}>
      <input type="checkbox" className="mt-0.5 size-4 shrink-0 cursor-pointer rounded accent-ink-900" {...props} />
      <span>{label}</span>
    </label>
  );
}
