"use client";

import { createContext, startTransition, useActionState, useContext, useEffect, useRef } from "react";
import { Check, Loader2 } from "lucide-react";
import type { ActionState } from "@/lib/action";
import { buttonClass } from "../ui/button";
import { cn } from "@/lib/cn";

type Action = (prev: ActionState, form: FormData) => Promise<ActionState>;

const PendingContext = createContext(false);

/**
 * Submits through a server action WITHOUT React's automatic form reset, so entered data is
 * never lost when validation fails. Pass `resetOnSuccess` to clear the form after a success.
 */
export function ActionForm({ action, children, className, resetOnSuccess, onSuccess, id }: { action: Action; children: React.ReactNode; className?: string; resetOnSuccess?: boolean; onSuccess?: (s: ActionState) => void; id?: string }) {
  const [state, formAction, pending] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;
  useEffect(() => {
    if (state?.ok) {
      if (resetOnSuccess) ref.current?.reset();
      onSuccessRef.current?.(state);
    }
  }, [state, resetOnSuccess]);
  return (
    <form
      ref={ref}
      id={id}
      className={className}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
        startTransition(() => formAction(data));
      }}
    >
      <PendingContext.Provider value={pending}>
        {children}
        <StateMessage state={state} />
      </PendingContext.Provider>
    </form>
  );
}

export function StateMessage({ state }: { state: ActionState }) {
  if (!state) return null;
  if (state.error)
    return (
      <div role="alert" className="mt-4 rounded-xl bg-clay-50 px-3.5 py-2.5 text-[13px] text-clay-600">
        {state.error}
        {state.fieldErrors && <ul className="mt-1 list-disc pl-4">{Object.entries(state.fieldErrors).map(([k, v]) => <li key={k}>{v}</li>)}</ul>}
      </div>
    );
  if (state.ok && state.message)
    return (
      <p role="status" className="mt-4 flex items-center gap-2 rounded-xl bg-sage-50 px-3.5 py-2.5 text-[13px] text-sage-600">
        <Check className="size-4" /> {state.message}
      </p>
    );
  return null;
}

export function SubmitButton({ children, variant = "primary", size = "md", className, pendingLabel, name, value }: { children: React.ReactNode; variant?: Parameters<typeof buttonClass>[0]; size?: Parameters<typeof buttonClass>[1]; className?: string; pendingLabel?: string; name?: string; value?: string }) {
  const pending = useContext(PendingContext);
  return (
    <button type="submit" name={name} value={value} disabled={pending} className={buttonClass(variant, size, cn(className))}>
      {pending ? <><Loader2 className="size-4 animate-spin" />{pendingLabel ?? "Saving…"}</> : children}
    </button>
  );
}
