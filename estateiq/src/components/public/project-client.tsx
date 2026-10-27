"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft, ChevronRight, Expand, Sparkles, X } from "lucide-react";
import { InterestFlow, type InterestProject } from "./interest-flow";
import { PropertyImage } from "../ui/property-image";

const PropertyMap = dynamic(() => import("./property-map"), { ssr: false, loading: () => <div className="skeleton size-full rounded-none" /> });

export function InterestButton({ project, label = "Register my interest", className, sticky }: { project: InterestProject; label?: string; className?: string; sticky?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className={className ?? "flex h-14 w-full items-center justify-center gap-2 rounded-full bg-gradient-to-b from-gold-300 to-gold-500 text-[15px] font-semibold text-ink-950 shadow-glow transition hover:brightness-105"}>
        <Sparkles className="size-4" /> {label}
      </button>
      {sticky && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-900/5 bg-ivory-50/90 p-3 backdrop-blur-xl lg:hidden">
          <button onClick={() => setOpen(true)} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-ink-900 text-[15px] font-medium text-white"><Sparkles className="size-4 text-gold-300" /> {label}</button>
        </div>
      )}
      <InterestFlow project={project} open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function Gallery({ images, name, seed }: { images: { url: string; caption: string | null }[]; name: string; seed: string }) {
  const [idx, setIdx] = useState<number | null>(null);
  const shown = images.length ? images : [{ url: "", caption: null }];
  return (
    <>
      <div className="grid h-[52svh] min-h-[360px] grid-cols-4 grid-rows-2 gap-2 overflow-hidden rounded-[32px] md:h-[64svh]">
        {shown.slice(0, 3).map((im, i) => (
          <button key={i} onClick={() => images.length && setIdx(i)} className={`group relative overflow-hidden ${i === 0 ? "col-span-4 row-span-2 md:col-span-3" : "hidden md:block"}`} aria-label={`Open image ${i + 1}`}>
            <PropertyImage src={im.url || null} alt={im.caption ?? name} seed={`${seed}-${i}`} priority={i === 0} className="size-full transition duration-[1.2s] group-hover:scale-[1.03]" />
          </button>
        ))}
      </div>
      {images.length > 0 && (
        <p className="mt-2 flex items-center justify-between text-[11.5px] text-stone-500"><span>{images[0]?.caption ?? "Images are illustrative."}</span><button onClick={() => setIdx(0)} className="inline-flex items-center gap-1 font-medium text-ink-900"><Expand className="size-3.5" /> View {images.length} images</button></p>
      )}
      <AnimatePresence>
        {idx !== null && (
          <motion.div className="fixed inset-0 z-[95] flex items-center justify-center bg-ink-950/95 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="dialog" aria-modal="true" aria-label="Image gallery">
            <button onClick={() => setIdx(null)} aria-label="Close" className="absolute right-4 top-4 grid size-11 place-items-center rounded-full bg-white/10 text-white"><X className="size-5" /></button>
            <button onClick={() => setIdx((idx - 1 + images.length) % images.length)} aria-label="Previous" className="absolute left-4 grid size-11 place-items-center rounded-full bg-white/10 text-white"><ChevronLeft className="size-5" /></button>
            <motion.div key={idx} initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-5xl">
              <PropertyImage src={images[idx]!.url} alt={images[idx]!.caption ?? name} seed={`${seed}-${idx}`} className="aspect-[16/10] w-full rounded-2xl" />
              <p className="mt-3 text-center text-[13px] text-ink-300">{images[idx]!.caption} · {idx + 1} / {images.length}</p>
            </motion.div>
            <button onClick={() => setIdx((idx + 1) % images.length)} aria-label="Next" className="absolute right-4 grid size-11 place-items-center rounded-full bg-white/10 text-white"><ChevronRight className="size-5" /></button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export function MiniMap({ lat, lng, label, name }: { lat: number; lng: number; label: string; name: string }) {
  return <PropertyMap points={[{ id: "p", slug: "p", lat, lng, label, name }]} activeId="p" />;
}
