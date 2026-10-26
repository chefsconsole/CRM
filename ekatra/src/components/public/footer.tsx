import Link from "next/link";
import { Logo } from "./logo";
import { getBusiness } from "@/lib/settings";

export async function SiteFooter() {
  const b = await getBusiness();
  const cols = [
    { title: "Discover", links: [["Homes for sale", "/properties?mode=homes"], ["Commercial", "/properties?mode=commercial"], ["Pre-leased", "/properties?mode=pre-leased"], ["Rentals", "/properties?mode=rent-homes"], ["Map view", "/properties?view=map"]] },
    { title: "Collective buying", links: [["Active buying groups", "/groups"], ["How it works", "/how-it-works"], ["Find my match", "/match"], ["Developers", "/developers"], ["Locations", "/locations"]] },
    { title: "Company", links: [["My account", "/account"], ["Privacy notice", "/legal/privacy"], ["Terms of use", "/legal/terms"], ["Disclosures", "/legal/disclosures"], ["Team sign-in", "/admin/login"]] },
  ];
  return (
    <footer className="grain relative overflow-hidden bg-ink-950 text-ink-300">
      <div className="pointer-events-none absolute -top-40 right-0 size-[600px] rounded-full bg-gold-500/10 blur-3xl" />
      <div className="relative mx-auto max-w-[1400px] px-5 pt-20 pb-10 md:px-10">
        <div className="grid gap-12 lg:grid-cols-[1.4fr_2fr]">
          <div>
            <Logo light />
            <p className="mt-6 max-w-sm font-serif text-3xl leading-tight text-ivory-50">Better homes. Better terms. <span className="italic text-gold-300">Together.</span></p>
            <div className="mt-8 space-y-1.5 text-sm">
              <p>{b.address}</p>
              {b.phone && <p>{b.phone}</p>}
              <a href={`mailto:${b.email}`} className="text-gold-300 hover:text-gold-200">{b.email}</a>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-10 sm:grid-cols-3">
            {cols.map((c) => (
              <div key={c.title}>
                <p className="eyebrow text-ivory-100/50">{c.title}</p>
                <ul className="mt-5 space-y-3 text-sm">
                  {c.links.map(([label, href]) => (
                    <li key={href}>
                      <Link href={href!} className="transition hover:text-ivory-50">{label}</Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-16 space-y-3 border-t border-white/10 pt-8 text-[11.5px] leading-relaxed text-ink-400">
          <p>
            <strong className="text-ink-300">Important:</strong> Prices shown are indicative and are not offers. Starting prices exclude stamp duty, registration, GST and other charges. Buyer counts
            reflect registered interest, not commitments. Reaching a group target does not guarantee a discount, allocation or transaction. Benefits are shown only when confirmed by the developer, with their
            conditions. Gross rental yields are estimates, not guaranteed returns. Please verify all information, including MahaRERA registration, before making any decision.
          </p>
          <p>
            {b.agentReraNumber ? `MahaRERA agent registration: ${b.agentReraNumber}.` : "MahaRERA agent registration: to be added by the business before public promotion."} Images are illustrative.
          </p>
          <p>© {new Date().getFullYear()} {b.companyName}. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
