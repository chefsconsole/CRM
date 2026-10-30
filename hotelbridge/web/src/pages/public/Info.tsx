import { useAuth } from '../../lib/auth';

export function HowItWorks() {
  return (
    <div className="band-tight"><div className="site-wrap prose enter">
      <span className="eyebrow">Operational clarity</span>
      <h1 style={{ fontSize: 'var(--fs-3xl)', marginTop: 'var(--s3)' }}>Bookings, payments and support</h1>
      <h2>Availability types</h2>
      <ul>
        <li><strong>Available to book now</strong> — HotelBridge holds availability under a direct contract; the booking confirms immediately.</li>
        <li><strong>Price confirmed at checkout</strong> — offered by a connected supplier; we re-check price and availability before booking.</li>
        <li><strong>On request</strong> — the hotel must confirm. The booking shows <em>Pending hotel confirmation</em> until it does, and no voucher is issued until then.</li>
      </ul>
      <h2>Price changes</h2>
      <p>Every booking is revalidated immediately before it is placed. If the price or conditions have changed, we show you the new offer and you choose whether to proceed. Prices are never changed silently.</p>
      <h2>Payment</h2>
      <p>Refundable bookings are confirmed straight away and are payable before the free-cancellation deadline shown on the booking. Non-refundable rates are held until payment is received, then submitted to the hotel — the rate is re-checked at that point. Credit terms are available only to agencies approved for credit. Online card payment is not yet enabled; HotelBridge finance provides bank transfer details on each invoice.</p>
      <h2>Cancellation</h2>
      <p>Each rate's policy is shown at checkout with exact dates. The deadlines you see are set a day ahead of the hotel's own, so cancellations can always be processed in time. Before cancelling, the portal shows the exact charge and asks you to confirm it.</p>
      <h2>Taxes and local charges</h2>
      <p>Where a price includes taxes we say so. Local or city taxes collected by the hotel on arrival are listed separately, are approximate, and are not included in the amount you pay HotelBridge.</p>
      <h2>Support</h2>
      <p>Open a support request from the portal — mark it urgent if a guest is affected. Group requests are acknowledged automatically with a target response time.</p>
    </div></div>
  );
}

export function Legal({ kind }: { kind: 'privacy' | 'terms' }) {
  const { config } = useAuth();
  return (
    <div className="band-tight"><div className="site-wrap prose enter">
      <span className="eyebrow">Legal</span>
      <h1 style={{ fontSize: 'var(--fs-3xl)', marginTop: 'var(--s3)' }}>{kind === 'privacy' ? 'Privacy notice' : 'Terms of business'}</h1>
      <div className="notice warn mt-6"><div><strong>Draft.</strong> This page summarises how the platform is designed to operate. The binding {kind === 'privacy' ? 'privacy notice' : 'terms of business'} will be published here after review by qualified counsel for each market we operate in.</div></div>
      {kind === 'privacy' ? (
        <>
          <h2>What we collect</h2><p>Agency and user details needed to verify and operate your account; guest names needed by hotels to honour reservations; and booking, payment and support records. We do not store payment card numbers.</p>
          <h2>How it is used</h2><p>To provide reservations, invoicing, support and fraud prevention, and to meet legal obligations. Guest details are shared only with the hotel or supplier fulfilling that booking.</p>
          <h2>Retention</h2><p>Booking and financial records are kept for the periods required by accounting and tax law; other data only as long as needed. Contact us to exercise your data rights.</p>
        </>
      ) : (
        <>
          <h2>Who may use HotelBridge</h2><p>Verified travel businesses booking on behalf of their clients. Accounts may be suspended where verification fails or terms are breached.</p>
          <h2>Rates and conditions</h2><p>The price, inclusions, cancellation and payment terms shown at checkout form part of each booking. Availability and prices are subject to confirmation by the hotel or supplier.</p>
          <h2>Payment and credit</h2><p>Payment is due as stated on the booking and invoice. Credit is offered only by separate written approval.</p>
        </>
      )}
      {config?.contactEmail && <p className="mt-6">Questions: <a href={`mailto:${config.contactEmail}`}>{config.contactEmail}</a></p>}
    </div></div>
  );
}
