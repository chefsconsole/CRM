import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTeamUser } from "@/lib/auth";
import { Logo } from "@/components/public/logo";
import { LoginForm } from "@/components/admin/login-form";
import { PropertyImage } from "@/components/ui/property-image";
import { isDemoMode } from "@/components/demo-ribbon";

export const metadata: Metadata = { title: "Team sign-in", robots: { index: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getTeamUser()) redirect("/admin");
  const { next } = await searchParams;
  return (
    <div className="grid min-h-svh lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden overflow-hidden bg-ink-950 lg:block">
        <PropertyImage src="https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1800&q=80" alt="" seed="login" className="absolute inset-0 size-full opacity-70" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/40 to-ink-950/20" />
        <div className="absolute inset-x-0 bottom-0 p-14">
          <p className="eyebrow text-gold-300">EstateIQ Command Centre</p>
          <p className="display mt-5 max-w-lg text-5xl text-ivory-50">See where demand is. <span className="italic text-gold-300">Act on it first.</span></p>
        </div>
      </div>
      <div className="flex flex-col justify-center px-6 py-16 sm:px-16">
        <div className="mx-auto w-full max-w-sm">
          <Logo href="/" />
          <h1 className="mt-12 font-serif text-4xl text-ink-900">Welcome back</h1>
          <p className="mt-2 text-sm text-stone-500">Sign in to manage buyers, projects and negotiations.</p>
          <div className="mt-10"><LoginForm next={next} /></div>
          {isDemoMode() && (
            <div className="mt-8 rounded-2xl border border-gold-400/30 bg-gold-200/30 p-4 text-[12.5px] leading-relaxed text-stone-600">
              <p className="font-semibold text-gold-700">Demo accounts</p>
              admin@ · ops@ · riya@ · arjun@ · analyst@ <span className="text-stone-400">(estateiq.demo)</span><br />Password: <code className="font-mono">EstateIQ@2026</code> unless SEED_TEAM_PASSWORD was set.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
