"use client";

export default function Error({ reset, error }: { reset: () => void; error: Error & { digest?: string } }) {
  return (
    <div className="grid min-h-[70svh] place-items-center px-6 text-center">
      <div>
        <p className="eyebrow text-gold-600">Something went wrong</p>
        <h1 className="display mt-3 text-5xl text-ink-900">We couldn&apos;t load this.</h1>
        <p className="mt-3 text-stone-500">Please try again. If it keeps happening, contact us{error.digest ? ` with reference ${error.digest}` : ""}.</p>
        <button onClick={reset} className="mt-8 rounded-full bg-ink-900 px-6 py-3 text-sm font-medium text-white">Try again</button>
      </div>
    </div>
  );
}
