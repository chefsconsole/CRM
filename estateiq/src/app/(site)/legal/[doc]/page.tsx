import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getBusiness } from "@/lib/settings";
import { CONSENT_POLICY_VERSION } from "@/lib/validation";

const DOCS = {
  privacy: {
    title: "Privacy notice",
    body: (c: string, email: string) => [
      ["Who we are", `${c} operates this platform to help homebuyers discover projects and form collective buying groups.`],
      ["What we collect", "Only what you choose to give us: your name, mobile number, optional email, the projects and locations you are interested in, budget range, configuration, timelines and any notes. We also keep a record of the permissions (consents) you give, with the wording you saw and the time."],
      ["Why we use it", "To contact you about your inquiry, understand your requirement, organise site visits, and — only if you agree — share your configuration and budget range with a developer when presenting group demand. Your name and contact details are shared with a developer only after you separately agree."],
      ["What we never do", "We never show your personal details, budget or financial information to other buyers or on the public website. Public buying-group figures are counts only, and can be approximate or hidden. We do not sell your data."],
      ["Messages", "We email you confirmed updates only if you opted in. We do not send automated WhatsApp messages without your consent."],
      ["Your choices", `You can view and update your preferences, withdraw consent, or ask us to delete your personal data from your account page or by writing to ${email}. We keep records linked to completed transactions for as long as the law requires.`],
      ["Security", "Access to buyer data is restricted by role, logged, and protected in transit. Our team signs in with individual accounts."],
      ["Version", `Consent policy version ${CONSENT_POLICY_VERSION}. We will update this page if anything material changes.`],
    ],
  },
  terms: {
    title: "Terms of use",
    body: (c: string) => [
      ["Information only", `Project information on ${c} is for orientation. Prices are indicative and are not offers. Verify all details, including MahaRERA registration, with the developer and official sources before deciding.`],
      ["No commitment", "Registering interest or joining a buying group does not commit you to buy and does not create any obligation for the developer."],
      ["No guarantees", "We do not guarantee discounts, benefits, allotments, availability, savings, appreciation or returns. Benefits apply only as and when confirmed by the developer, on its conditions."],
      ["Our role and fees", "We facilitate introductions and coordination and may receive a commission from the developer under a separate agreement."],
      ["Acceptable use", "Do not submit false information or information about other people without their permission. We may remove abusive or automated submissions."],
    ],
  },
  disclosures: {
    title: "Disclosures",
    body: (c: string) => [
      ["Indicative pricing", "Starting prices exclude stamp duty, registration, GST, parking, floor-rise, maintenance deposits and other charges unless stated. Price per sq ft is computed on carpet area where shown."],
      ["Carpet area", "Areas are carpet areas as defined under RERA unless otherwise labelled; they are not built-up or saleable areas."],
      ["Buyer counts", "Group figures reflect registered interest and are not purchase commitments. They may be shown exactly, approximately or not at all."],
      ["Yields", "Gross rental yield = annual rent ÷ purchase price × 100. Yields are estimates, not guaranteed returns."],
      ["Images", "Images are illustrative unless captioned as actual site photographs."],
      ["Regulatory", `${c} has not represented that any project or activity is exempt from registration. The legal requirements for aggregating demand and facilitating transactions in Maharashtra should be reviewed by a qualified professional.`],
    ],
  },
} as const;

export async function generateMetadata({ params }: { params: Promise<{ doc: string }> }): Promise<Metadata> {
  const d = DOCS[(await params).doc as keyof typeof DOCS];
  return { title: d?.title ?? "Legal" };
}

export default async function LegalPage({ params }: { params: Promise<{ doc: string }> }) {
  const d = DOCS[(await params).doc as keyof typeof DOCS];
  if (!d) notFound();
  const b = await getBusiness();
  return (
    <div className="mx-auto max-w-3xl px-5 pb-24 pt-32 md:px-10">
      <p className="eyebrow text-gold-600">Legal</p>
      <h1 className="display mt-3 text-5xl text-ink-900 md:text-6xl">{d.title}</h1>
      <p className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-[13px] text-amber-600">Template text for this platform — have it reviewed by a qualified professional before launch.</p>
      <div className="mt-10 space-y-8">{d.body(b.companyName, b.email).map(([h, t]) => <section key={h}><h2 className="font-serif text-2xl text-ink-900">{h}</h2><p className="mt-2 text-[15px] leading-relaxed text-stone-600">{t}</p></section>)}</div>
    </div>
  );
}
