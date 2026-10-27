"use client";

import { useState } from "react";
import { ArchitecturalPlate } from "./plate";
import { cn } from "@/lib/cn";

const MODE = process.env.NEXT_PUBLIC_IMAGE_MODE ?? "remote";

/** Photograph with a graceful generative fallback; never shows a broken image. */
export function PropertyImage({ src, alt, seed, className, priority }: { src?: string | null; alt: string; seed: string; className?: string; priority?: boolean }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const usePhoto = src && !failed && MODE !== "plates";
  return (
    <div className={cn(/\babsolute\b/.test(className ?? "") ? "" : "relative", "overflow-hidden bg-ivory-200", className)}>
      <ArchitecturalPlate seed={seed} label={alt} className={cn("absolute inset-0 size-full transition-opacity duration-700", usePhoto && loaded ? "opacity-0" : "opacity-100")} />
      {usePhoto && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          referrerPolicy="no-referrer"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={cn("absolute inset-0 size-full object-cover transition-[opacity,transform] duration-[1.2s] ease-[var(--ease-lux)]", loaded ? "opacity-100" : "opacity-0")}
        />
      )}
    </div>
  );
}
