import Link from "next/link";
import { LogoMark } from "@/components/public/logo";

export default function NotFound() {
  return (
    <div className="grid min-h-svh place-items-center bg-ivory-50 px-6 text-center">
      <div>
        <LogoMark className="mx-auto size-12 text-ink-900" />
        <p className="eyebrow mt-8 text-gold-600">404</p>
        <h1 className="display mt-3 text-6xl text-ink-900">This page isn&apos;t here.</h1>
        <p className="mt-4 text-stone-500">It may have moved, or the project may not be public yet.</p>
        <div className="mt-8 flex justify-center gap-3"><Link href="/" className="rounded-full bg-ink-900 px-6 py-3 text-sm font-medium text-white">Home</Link><Link href="/properties" className="rounded-full border border-ink-900/15 px-6 py-3 text-sm font-medium">Explore properties</Link></div>
      </div>
    </div>
  );
}
