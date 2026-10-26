"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1800);
        } catch {}
      }}
      className="inline-flex h-9 items-center gap-1.5 rounded-full border border-ink-900/10 bg-white px-3.5 text-[13px] font-medium text-ink-900 hover:border-ink-900/30"
    >
      {done ? <Check className="size-4 text-sage-600" /> : <Copy className="size-4" />} {done ? "Copied" : label}
    </button>
  );
}
