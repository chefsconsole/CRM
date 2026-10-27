"use client";

import { useState, useTransition } from "react";
import type { DeveloperStage } from "@prisma/client";
import { DEVELOPER_STAGE, DEVELOPER_STAGES } from "@/lib/labels";
import { setDeveloperStageAction } from "@/app/admin/(app)/developers/actions";

export function DevStageSelect({ id, stage, disabled }: { id: string; stage: DeveloperStage; disabled?: boolean }) {
  const [v, setV] = useState(stage);
  const [pending, start] = useTransition();
  return (
    <select
      value={v}
      disabled={disabled || pending}
      onChange={(e) => {
        const s = e.target.value as DeveloperStage;
        setV(s);
        start(async () => {
          const r = await setDeveloperStageAction(id, s);
          if (r?.error) setV(stage);
        });
      }}
      className="w-full rounded-lg border border-ink-900/10 bg-ivory-50 px-2 py-1 text-[11.5px] text-stone-600"
      aria-label="Relationship stage"
    >
      {DEVELOPER_STAGES.map((s) => <option key={s} value={s}>{DEVELOPER_STAGE[s].label}</option>)}
    </select>
  );
}
