"use client";

import { useActionState, useState, startTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Mail, Heart } from "lucide-react";
import { requestCodeAction, verifyCodeAction } from "@/app/(site)/account/actions";
import { fieldClass } from "./steps";
import { cn } from "@/lib/cn";

export function SignIn() {
  const router = useRouter();
  const [sent, sendAction, sending] = useActionState(requestCodeAction, null);
  const [verified, verifyAction, verifying] = useActionState(async (p: Awaited<ReturnType<typeof verifyCodeAction>>, f: FormData) => {
    const r = await verifyCodeAction(p, f);
    if (r?.ok) router.refresh();
    return r;
  }, null);
  const data = sent?.data as { email: string; devHint?: string } | undefined;
  if (!sent?.ok)
    return (
      <form action={(f) => startTransition(() => sendAction(f))} className="space-y-4">
        <label className="block text-[13px] font-medium text-stone-700">Email address<input name="email" type="email" required autoComplete="email" className={cn(fieldClass, "mt-1.5")} placeholder="you@example.com" /></label>
        {sent?.error && <p role="alert" className="text-[13px] text-clay-600">{sent.error}</p>}
        <button type="submit" disabled={sending} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-ink-900 text-[15px] font-medium text-white disabled:opacity-60">{sending ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />} Email me a sign-in code</button>
        <p className="text-center text-[12px] text-stone-500">No password needed.</p>
      </form>
    );
  return (
    <form action={(f) => startTransition(() => verifyAction(f))} className="space-y-4">
      <input type="hidden" name="email" value={data?.email ?? ""} />
      <p className="text-[14px] text-stone-600">{sent.message} <span className="font-medium text-ink-900">{data?.email}</span></p>
      {data?.devHint && <p className="rounded-xl bg-gold-200/40 px-3 py-2 text-[12.5px] text-gold-700">Development mode (no email provider): your code is <strong className="font-mono">{data.devHint}</strong></p>}
      <label className="block text-[13px] font-medium text-stone-700">6-digit code<input name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required className={cn(fieldClass, "mt-1.5 text-center font-mono text-2xl tracking-[0.5em]")} /></label>
      {verified?.error && <p role="alert" className="text-[13px] text-clay-600">{verified.error}</p>}
      <button type="submit" disabled={verifying} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-ink-900 text-[15px] font-medium text-white disabled:opacity-60">{verifying && <Loader2 className="size-4 animate-spin" />} Sign in</button>
    </form>
  );
}

export function SaveButton({ projectId, initial, signedIn }: { projectId: string; initial: boolean; signedIn: boolean }) {
  const [saved, setSaved] = useState(initial);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        if (!signedIn) return router.push(`/account?next=${encodeURIComponent(location.pathname)}`);
        setBusy(true);
        const r = await fetch("/api/account/saved", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId }) });
        if (r.ok) setSaved(((await r.json()) as { saved: boolean }).saved);
        setBusy(false);
      }}
      disabled={busy}
      aria-pressed={saved}
      className="flex h-12 w-full items-center justify-center gap-2 rounded-full border border-ink-900/12 bg-white text-[14px] font-medium text-ink-900 transition hover:border-ink-900/30"
    >
      <Heart className={cn("size-4", saved && "fill-clay-600 text-clay-600")} /> {saved ? "Saved to your account" : "Save project"}
    </button>
  );
}
