import type { Metadata } from "next";
import { Compass, ScrollText, Users, Handshake, ShieldCheck } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Reveal } from "@/components/ui/motion";

export const metadata: Metadata = { title: "How collective buying works" };

const STEPS = [
  { icon: Compass, t: "Discover a project", d: "Browse upcoming, new-launch and under-construction projects by location, budget, configuration and possession timeline. Every fact carries its verification status." },
  { icon: ScrollText, t: "Register your interest", d: "Tell us your configuration, budget range, how soon you could commit and how long you can wait for possession. It takes two minutes and commits you to nothing." },
  { icon: Users, t: "Build collective demand", d: "Compatible buyers form a group. We verify requirements so the group is credible: expressions of interest, verified leads, qualified buyers and committed purchasers are always counted separately." },
  { icon: Handshake, t: "Explore negotiated benefits", d: "We present anonymised, consolidated demand to the developer and negotiate. A benefit is shown only after the developer confirms it in writing — with its conditions and validity." },
];

export default function HowItWorks() {
  return (
    <div className="pb-24 pt-32">
      <div className="mx-auto max-w-4xl px-5 text-center md:px-10">
        <p className="eyebrow text-gold-600">How it works</p>
        <h1 className="display mt-4 text-5xl text-ink-900 md:text-7xl">Aggregate demand first. <span className="italic text-gold-600">Negotiate second.</span> Facilitate third.</h1>
      </div>
      <div className="mx-auto mt-16 max-w-5xl space-y-4 px-5 md:px-10">
        {STEPS.map((s, i) => (
          <Reveal key={s.t}>
            <div className="grid gap-6 rounded-[32px] border border-ink-900/[0.07] bg-white p-8 shadow-soft md:grid-cols-[120px_1fr] md:p-10">
              <span className="font-serif text-7xl leading-none text-gold-500">0{i + 1}</span>
              <div><h2 className="flex items-center gap-3 font-serif text-3xl text-ink-900"><s.icon className="size-6 text-gold-600" />{s.t}</h2><p className="mt-3 text-[15.5px] leading-relaxed text-stone-600">{s.d}</p></div>
            </div>
          </Reveal>
        ))}
        <Reveal>
          <div className="rounded-[32px] bg-ink-900 p-8 text-ivory-100 md:p-10">
            <h2 className="flex items-center gap-3 font-serif text-3xl text-ivory-50"><ShieldCheck className="size-6 text-gold-300" /> What we promise — and what we don&apos;t</h2>
            <ul className="mt-5 grid gap-3 text-[14.5px] text-ink-300 md:grid-cols-2">
              <li>✓ Your contact details and budget are never shown publicly.</li>
              <li>✓ Prices are labelled indicative unless verified.</li>
              <li>✓ Benefits appear only when confirmed by the developer.</li>
              <li>✓ You can update or delete your information any time.</li>
              <li>✗ A larger group does not guarantee a discount.</li>
              <li>✗ We don&apos;t promise allocations, savings, appreciation or returns.</li>
            </ul>
            <p className="mt-5 text-[12.5px] text-ink-400">EstateIQ earns a commission from developers under agreed commercial terms, which we disclose on request. Have MahaRERA details verified independently before any transaction.</p>
          </div>
        </Reveal>
        <div className="flex flex-wrap justify-center gap-3 pt-6"><ButtonLink href="/match" variant="gold" size="xl">Find my match</ButtonLink><ButtonLink href="/groups" variant="outline" size="xl">See buying groups</ButtonLink></div>
      </div>
    </div>
  );
}
