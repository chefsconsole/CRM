import { Link } from 'react-router-dom';
import { AVAILABILITY_LABEL, BOOKING_STATUS_LABEL } from '../../../../shared/domain';
import { Icon } from '../../components/icons';
import { ButtonLink, Pill } from '../../components/ui';

function HeroArt() {
  // An original line composition: a bridge of arcs resolving into a skyline of rooms.
  const arcs = [0, 1, 2, 3, 4, 5];
  return (
    <svg viewBox="0 0 400 400" fill="none" aria-hidden>
      <circle cx="200" cy="200" r="190" stroke="rgba(255,255,255,0.07)" />
      <circle cx="200" cy="200" r="140" stroke="rgba(255,255,255,0.05)" />
      {arcs.map((i) => <path key={i} d={`M${40 + i * 6} 270 C ${120 + i * 4} ${120 + i * 14}, ${280 - i * 4} ${120 + i * 14}, ${360 - i * 6} 270`} stroke={i === 0 ? '#C9AE7E' : `rgba(255,255,255,${0.32 - i * 0.045})`} strokeWidth={i === 0 ? 1.8 : 1} />)}
      <line x1="30" y1="270" x2="370" y2="270" stroke="rgba(255,255,255,0.35)" />
      {[80, 130, 200, 270, 320].map((x, i) => <line key={x} x1={x} y1="270" x2={x} y2={[226, 196, 182, 196, 226][i]} stroke="rgba(255,255,255,0.28)" />)}
      {[0, 1, 2, 3].map((r) => [0, 1, 2, 3, 4, 5, 6].map((c) => (
        <rect key={`${r}${c}`} x={108 + c * 27} y={292 + r * 18} width="14" height="9" rx="1.5" stroke="rgba(255,255,255,0.18)" fill={(r * 7 + c) % 9 === 0 ? 'rgba(201,174,126,0.55)' : 'none'} />
      )))}
    </svg>
  );
}

const COLLECTIONS = [
  ['City centre', 'Walkable, well-reviewed addresses where most leisure itineraries begin.'],
  ['Airport', 'Reliable rooms for early departures, late arrivals and crew or transit stays.'],
  ['Business', 'Quiet rooms, good Wi-Fi and meeting space near commercial districts.'],
  ['Premium leisure', 'Four- and five-star properties chosen for service, not only for stars.'],
  ['Group travel', 'Hotels that handle rooming lists, coach access and group breakfasts well.'],
  ['Value', 'Well-located three-star hotels where the price and the stay both make sense.'],
];

const STEPS = [
  ['Search', 'One destination, your dates, and every room configured individually — two adults here, a single there.'],
  ['Compare', 'A short, considered list. Total stay price, board, cancellation deadline and taxes on every option.'],
  ['Book or request', 'Book instantly where we hold availability; otherwise send a request the hotel confirms.'],
  ['Receive documents', 'Vouchers are issued only once a booking is confirmed — never before.'],
  ['Manage', 'Track status, request amendments or cancel within the terms you accepted at checkout.'],
];

export default function Home() {
  return (
    <>
      <section className="hero">
        <div className="site-wrap hero-inner">
          <div className="enter">
            <span className="eyebrow" style={{ color: 'var(--champagne-bright)' }}>B2B hotel distribution</span>
            <h1 style={{ marginTop: 'var(--s5)' }}>Fewer, better hotels.<br /><em>Booked with clarity.</em></h1>
            <p className="hero-lead">HotelBridge connects travel agents, tour operators and DMCs with a curated network of hotel partners — built on direct relationships, competitive trade terms and a booking flow that always tells you exactly where a reservation stands.</p>
            <div className="hero-actions">
              <ButtonLink to="/login" variant="light" size="lg">Agent sign in</ButtonLink>
              <ButtonLink to="/register" variant="outline-light" size="lg">Register your agency</ButtonLink>
            </div>
            <p className="hero-note">For verified travel businesses only. Hotels: <Link to="/partners/hotels" style={{ color: 'var(--champagne-bright)' }}>become a partner</Link>.</p>
          </div>
          <div className="hero-art"><HeroArt /></div>
        </div>
      </section>

      <section className="band" id="network">
        <div className="site-wrap">
          <div className="band-head">
            <span className="eyebrow">The curated network</span>
            <h2>Ten good answers beat a thousand search results.</h2>
            <p>Instead of listing every property every supplier can reach, we select a focused collection in each destination — each hotel included for a commercial and a guest-experience reason. Concentrated demand means better relationships with hotels, and better terms for the agents who book them.</p>
          </div>
          <div className="collections">
            {COLLECTIONS.map(([t, d], i) => (
              <div className="collection" key={t}><span className="idx">0{i + 1}</span><h3>{t}</h3><p>{d}</p></div>
            ))}
          </div>
        </div>
      </section>

      <section className="band dark" id="agents">
        <div className="site-wrap">
          <div className="band-head">
            <span className="eyebrow">The agent experience</span>
            <h2>Effortless to use. Honest about every condition.</h2>
            <p>Designed so a first-time agent can book without training — and so nothing important is ever hidden behind a click.</p>
          </div>
          <div className="steps">
            {STEPS.map(([t, d]) => <div className="step" key={t}><h3>{t}</h3><p>{d}</p></div>)}
          </div>
          <div className="status-legend" aria-label="Booking statuses you will see">
            <Pill tone="positive">{AVAILABILITY_LABEL.instant}</Pill>
            <Pill tone="pending">{AVAILABILITY_LABEL.revalidate}</Pill>
            <Pill tone="attention">{AVAILABILITY_LABEL.on_request}</Pill>
            <Pill tone="pending">{BOOKING_STATUS_LABEL.pending_confirmation}</Pill>
            <Pill tone="positive">{BOOKING_STATUS_LABEL.confirmed}</Pill>
          </div>
          <p className="muted small mt-4" style={{ maxWidth: 640 }}>Prices are re-checked with the hotel or supplier before every booking. If anything changes, you see the new price and decide — we never change it silently.</p>
        </div>
      </section>

      <section className="band" id="hotels">
        <div className="site-wrap split">
          <div className="band-head" style={{ marginBottom: 0 }}>
            <span className="eyebrow">For hotel partners</span>
            <h2>A focused channel to verified travel businesses.</h2>
            <p>HotelBridge works with a limited number of hotels per destination, so each partner is presented to agencies deliberately rather than lost in a list. We agree terms directly, and you can see what your partnership produces.</p>
            <div className="row gap-3 mt-8 wrap">
              <ButtonLink to="/partners/hotels">Apply as a hotel partner</ButtonLink>
              <ButtonLink to="/how-it-works" variant="secondary">How bookings work</ButtonLink>
            </div>
          </div>
          <ul className="point-list">
            {[
              ['Verified B2B agencies only', 'Every agency is reviewed before it can search or book.'],
              ['Potential incremental business', 'From agencies and markets you may not reach directly. We will not promise volumes we cannot substantiate.'],
              ['One commercial relationship', 'Contract terms, rates, releases and restrictions managed in one place, with a full change history.'],
              ['Structured group opportunities', 'Clear, complete group requests — dates, rooming, board and deadlines — instead of fragmented emails.'],
              ['Production visibility', 'Room nights and bookings for your property, reported from actual reservations.'],
            ].map(([t, d]) => <li key={t}><Icon name="check" /><div><strong>{t}</strong><span>{d}</span></div></li>)}
          </ul>
        </div>
      </section>

      <section className="band alt" id="groups">
        <div className="site-wrap split">
          <div className="band-head" style={{ marginBottom: 0 }}>
            <span className="eyebrow">Group Desk</span>
            <h2>Complex requirements, handled like a system.</h2>
            <p>Multi-city tours, corporate groups and series need negotiated rates. Submit the full requirement once; the Group Desk sources offers from suitable hotels and returns a structured proposal with every condition stated.</p>
            <div className="row gap-3 mt-8"><ButtonLink to="/login?next=/app/groups/new">Submit a group request</ButtonLink></div>
          </div>
          <ul className="point-list">
            {[
              ['Every room configuration', 'Singles, doubles, twins, triples and family rooms across multiple cities and dates.'],
              ['Practical requirements', 'Coach parking, breakfast, accessibility and anything else the group needs.'],
              ['Clear stages and deadlines', 'From review to hotel enquiries, offers and proposal — you always see where it stands.'],
              ['Proposals from real offers', 'Rates come from hotel responses, never placeholders. Validity dates are shown on every proposal.'],
            ].map(([t, d]) => <li key={t}><Icon name="groups" /><div><strong>{t}</strong><span>{d}</span></div></li>)}
          </ul>
        </div>
      </section>

      <section className="band">
        <div className="site-wrap">
          <div className="band-head"><span className="eyebrow">Join the network</span><h2>Three ways to work with HotelBridge.</h2></div>
          <div className="cta-grid">
            <Link to="/register" className="cta-card"><Icon name="user" size={22} /><h3>Travel agents &amp; DMCs</h3><p>Register your agency. Once verified, search the collection, book online and use the Group Desk.</p><span className="go">Register your agency <Icon name="arrow" size={16} /></span></Link>
            <Link to="/partners/hotels" className="cta-card"><Icon name="building" size={22} /><h3>Hotels</h3><p>Tell us about your property. We review each application against demand in the destination.</p><span className="go">Apply as a hotel <Icon name="arrow" size={16} /></span></Link>
            <Link to="/partners/distribution" className="cta-card"><Icon name="link" size={22} /><h3>Distribution partners</h3><p>Suppliers, channel managers and technology partners interested in working together.</p><span className="go">Start a conversation <Icon name="arrow" size={16} /></span></Link>
          </div>
        </div>
      </section>

      <section className="band alt">
        <div className="site-wrap split">
          <div className="band-head" style={{ marginBottom: 0 }}>
            <span className="eyebrow">Operational clarity</span>
            <h2>How it works, plainly.</h2>
            <p>The terms that matter are shown before you book and kept on every booking record.</p>
            <div className="mt-8"><ButtonLink to="/how-it-works" variant="secondary">Read the full detail</ButtonLink></div>
          </div>
          <div className="faq">
            <details open><summary>When is a booking confirmed?</summary><p>Only when the hotel or supplier has confirmed it. Bookings that need the hotel's approval are shown as pending until they respond, and no voucher is issued until then.</p></details>
            <details><summary>How do cancellations work?</summary><p>Each rate carries its own cancellation policy, shown in full at checkout with exact deadlines. Before you cancel, we show the exact charge and ask you to confirm it.</p></details>
            <details><summary>How are bookings paid?</summary><p>Refundable bookings are payable before their free-cancellation deadline. Non-refundable rates are submitted to the hotel once payment is received. Credit terms are available only after a separate approval. Online card payment is not yet enabled.</p></details>
            <details><summary>Which taxes are included?</summary><p>Prices show what is included. Local or city taxes collected by the hotel on arrival are listed separately and are not part of the price you pay us.</p></details>
            <details><summary>How do I get help?</summary><p>Open a support request from any booking in the portal, marked urgent where a guest is affected.</p></details>
          </div>
        </div>
      </section>
    </>
  );
}
