"use client";

import { useActionState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { loginAction } from "@/app/admin/login/actions";
import { Field, Input } from "../ui/field";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(loginAction, null);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next ?? ""} />
      <Field label="Work email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="username" required placeholder="you@company.com" defaultValue={process.env.NODE_ENV !== "production" ? "admin@estateiq.demo" : undefined} />
      </Field>
      <Field label="Password" htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required placeholder="••••••••" />
      </Field>
      {state?.error && <p role="alert" className="rounded-xl bg-clay-50 px-3.5 py-2.5 text-[13px] text-clay-600">{state.error}</p>}
      <button type="submit" disabled={pending} className="mt-2 flex h-12 items-center justify-center gap-2 rounded-full bg-ink-900 text-[15px] font-medium text-white transition hover:bg-ink-800 disabled:opacity-60">
        {pending ? <Loader2 className="size-4 animate-spin" /> : <>Sign in <ArrowRight className="size-4" /></>}
      </button>
    </form>
  );
}
