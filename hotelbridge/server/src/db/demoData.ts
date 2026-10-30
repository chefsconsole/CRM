import type { Db, Queryable } from './pool.js';
import { hashPassword } from '../modules/auth/passwords.js';
import { addDays, today } from '../lib/dates.js';

/**
 * DEMO DATA — fictional sample hotels, agencies and rates for development and demonstration.
 * None of these properties are real HotelBridge partners and none of the rates are real offers.
 * Every hotel is flagged is_sample, and the UI labels sample content and non-production environments.
 */
export const DEMO_PASSWORD = 'Demo-Passw0rd-2026';

export const DEMO_USERS = {
  admin: 'admin@hotelbridge.test',
  ops: 'ops@hotelbridge.test',
  finance: 'finance@hotelbridge.test',
  agent: 'agent@sample-agency.test',
  creditAgent: 'agent@sample-dmc.test',
  pendingAgent: 'owner@pending-agency.test',
  partner: 'reservations@kade-house.test',
} as const;

interface HotelSeed {
  slug: string; name: string; city: string; country: string; address: string; stars: number; collections: string[];
  summary: string; description: string; facilities: string[]; transport: string; lat: number; lng: number;
  rationale: string;
  contract: {
    reference: string; rateModel: 'net' | 'commissionable'; commissionBps?: number; bookingMode: 'instant' | 'request';
    releaseDays: number; localTaxMinor?: number; refundable: boolean; freeDays: number; allocation?: number;
    base: { SGL: number; DBL1: number; DBL2: number; FAM: number }; // EUR minor per night, BB
  };
  sandbox?: boolean;
}

const HOTELS: HotelSeed[] = [
  {
    slug: 'kade-house-amsterdam', name: 'Kade House', city: 'Amsterdam', country: 'NL', address: 'Sample Canal Street 1',
    stars: 4, collections: ['city_centre', 'premium_leisure'], lat: 52.3731, lng: 4.8922,
    summary: 'A calm canal-side base within walking distance of the old centre.',
    description: 'Sample property for demonstration. A four-star canal-side hotel concept with quiet rooms, a generous breakfast and easy tram access.',
    facilities: ['Breakfast room', '24-hour reception', 'Lift', 'Wi-Fi', 'Luggage storage', 'Bar'],
    transport: 'Sample: ~15 minutes by tram from Amsterdam Centraal.',
    rationale: 'Demo: premium city-centre option with direct allocation.',
    contract: { reference: 'DEMO-AMS-KADE-2026', rateModel: 'net', bookingMode: 'instant', releaseDays: 7, localTaxMinor: 350, refundable: true, freeDays: 7, allocation: 6,
      base: { SGL: 15500, DBL1: 16500, DBL2: 18500, FAM: 26500 } },
  },
  {
    slug: 'station-loft-amsterdam', name: 'Station Loft', city: 'Amsterdam', country: 'NL', address: 'Sample Station Square 8',
    stars: 3, collections: ['station', 'value', 'groups'], lat: 52.3791, lng: 4.9003,
    summary: 'Straightforward, well-run rooms steps from the central station.',
    description: 'Sample property for demonstration. A three-star value hotel concept suited to rail arrivals and groups.',
    facilities: ['Breakfast buffet', 'Lift', 'Wi-Fi', 'Coach drop-off', 'Group check-in desk'],
    transport: 'Sample: 3-minute walk from the central station.',
    rationale: 'Demo: value option near the station; request-to-book only.',
    contract: { reference: 'DEMO-AMS-LOFT-2026', rateModel: 'net', bookingMode: 'request', releaseDays: 0, localTaxMinor: 350, refundable: true, freeDays: 3,
      base: { SGL: 9800, DBL1: 10500, DBL2: 11900, FAM: 17500 } },
    sandbox: true,
  },
  {
    slug: 'runway-hotel-schiphol', name: 'Runway Hotel', city: 'Amsterdam', country: 'NL', address: 'Sample Airport Boulevard 20',
    stars: 4, collections: ['airport', 'business'], lat: 52.3105, lng: 4.7683,
    summary: 'Soundproofed rooms for early departures and late arrivals.',
    description: 'Sample property for demonstration. A four-star airport hotel concept with a 24-hour shuttle.',
    facilities: ['Airport shuttle', 'Fitness room', 'Meeting rooms', 'Restaurant', 'Wi-Fi'],
    transport: 'Sample: 5 minutes by shuttle from the terminal.',
    rationale: 'Demo: airport option for transit and crew business.',
    contract: { reference: 'DEMO-AMS-RUNWAY-2026', rateModel: 'commissionable', commissionBps: 1500, bookingMode: 'instant', releaseDays: 2, refundable: false, freeDays: 0, allocation: 4,
      base: { SGL: 14000, DBL1: 14000, DBL2: 15500, FAM: 21000 } },
  },
  {
    slug: 'casa-patio-barcelona', name: 'Casa Patio', city: 'Barcelona', country: 'ES', address: 'Sample Carrer 12',
    stars: 4, collections: ['city_centre', 'premium_leisure'], lat: 41.3917, lng: 2.1649,
    summary: 'A quiet courtyard hotel close to the main boulevards.',
    description: 'Sample property for demonstration. A four-star courtyard hotel concept in the Eixample grid.',
    facilities: ['Courtyard', 'Breakfast', 'Rooftop terrace', 'Wi-Fi', 'Lift'],
    transport: 'Sample: 8 minutes on foot to the nearest metro.',
    rationale: 'Demo: premium leisure in the centre.',
    contract: { reference: 'DEMO-BCN-PATIO-2026', rateModel: 'net', bookingMode: 'instant', releaseDays: 5, localTaxMinor: 400, refundable: true, freeDays: 5, allocation: 5,
      base: { SGL: 13500, DBL1: 14500, DBL2: 16000, FAM: 23000 } },
  },
  {
    slug: 'sants-central-barcelona', name: 'Sants Central', city: 'Barcelona', country: 'ES', address: 'Sample Plaça 3',
    stars: 3, collections: ['station', 'value', 'groups'], lat: 41.3792, lng: 2.1403,
    summary: 'Practical rooms beside the high-speed rail terminal.',
    description: 'Sample property for demonstration. A three-star station hotel concept with coach access.',
    facilities: ['Breakfast', 'Coach parking', '24-hour reception', 'Wi-Fi'],
    transport: 'Sample: adjacent to the main rail station.',
    rationale: 'Demo: groups and value near rail.',
    contract: { reference: 'DEMO-BCN-SANTS-2026', rateModel: 'net', bookingMode: 'instant', releaseDays: 3, localTaxMinor: 275, refundable: true, freeDays: 2, allocation: 8,
      base: { SGL: 8900, DBL1: 9500, DBL2: 10900, FAM: 15900 } },
  },
];

async function insertUser(q: Queryable, u: { email: string; name: string; role: string; agencyId?: string; hotelId?: string }, hash: string) {
  const r = await q.one<{ id: string }>('INSERT INTO users (agency_id, hotel_id, email, name, password_hash, role) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
    [u.agencyId ?? null, u.hotelId ?? null, u.email, u.name, hash, u.role]);
  return r!.id;
}

export async function seedDemo(db: Db, now = new Date()): Promise<{ seeded: boolean }> {
  const exists = await db.one('SELECT 1 FROM users WHERE lower(email) = $1', [DEMO_USERS.admin]);
  if (exists) return { seeded: false };
  const hash = await hashPassword(DEMO_PASSWORD);
  const t = today(now);
  await db.tx(async (q) => {
    const adminId = await insertUser(q, { email: DEMO_USERS.admin, name: 'Demo Administrator', role: 'hb_admin' }, hash);
    await insertUser(q, { email: DEMO_USERS.ops, name: 'Demo Operations', role: 'hb_ops' }, hash);
    await insertUser(q, { email: DEMO_USERS.finance, name: 'Demo Finance', role: 'hb_finance' }, hash);

    const ag1 = await q.one<{ id: string }>(`INSERT INTO agencies (name, legal_name, country_code, city, phone, status, verified_at, verified_by, selling_currency, notes)
      VALUES ('Sample Travel Co.', 'Sample Travel Co. (demo)', 'IN', 'Mumbai', '+91 00000 00000', 'active', now(), $1, 'EUR', 'Demo agency — prepay') RETURNING id`, [adminId]);
    const ag2 = await q.one<{ id: string }>(`INSERT INTO agencies (name, legal_name, country_code, city, phone, status, verified_at, verified_by, selling_currency,
        credit_enabled, credit_limit_minor, credit_approved_by, credit_approved_at, payment_terms, notes)
      VALUES ('Sample DMC Partners', 'Sample DMC Partners (demo)', 'AE', 'Dubai', '+971 0 000 0000', 'active', now(), $1, 'USD', true, 1500000, $1, now(), 'credit', 'Demo agency — approved credit, sells in USD') RETURNING id`, [adminId]);
    const ag3 = await q.one<{ id: string }>(`INSERT INTO agencies (name, country_code, city, phone, status, selling_currency) VALUES ('Pending Journeys (demo)', 'GB', 'London', '+44 0000 000000', 'pending', 'GBP') RETURNING id`);
    await insertUser(q, { email: DEMO_USERS.agent, name: 'Asha Mehta (demo)', role: 'agency_admin', agencyId: ag1!.id }, hash);
    await insertUser(q, { email: DEMO_USERS.creditAgent, name: 'Omar Haddad (demo)', role: 'agency_admin', agencyId: ag2!.id }, hash);
    await insertUser(q, { email: DEMO_USERS.pendingAgent, name: 'Grace Lee (demo)', role: 'agency_admin', agencyId: ag3!.id }, hash);

    // Network default: 10% markup on net cost, sell price rounded up to the next whole unit.
    await q.query(`INSERT INTO pricing_rules (markup_type, value, rounding, created_by) VALUES ('percent', 1000, 'up_to_unit', $1)`, [adminId]);
    await q.query(`INSERT INTO fx_rates (base, quote, rate_scaled, source, as_of, recorded_by) VALUES ('EUR','USD', 108000000, 'DEMO sample rate — not a market quote', now(), $1)`, [adminId]);

    for (const h of HOTELS) {
      const hotel = await q.one<{ id: string }>(`INSERT INTO hotels (slug, name, city, country_code, address, latitude, longitude, star_rating, star_rating_verified, collections, summary,
          description, facilities, content_verified, transport_notes, check_in_time, check_out_time, inclusion_rationale, status, is_sample, partner_contact_email)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,$9,$10,$11,$12,false,$13,'15:00','11:00',$14,'live',true,$15) RETURNING id`,
        [h.slug, h.name, h.city, h.country, h.address, h.lat, h.lng, h.stars, h.collections, h.summary, h.description, h.facilities, h.transport, h.rationale,
          h.slug === 'kade-house-amsterdam' ? DEMO_USERS.partner : null]);
      const room = async (code: string, name: string, a: number, c: number, occ: number, bed: string, sqm: number) =>
        (await q.one<{ id: string }>(`INSERT INTO room_types (hotel_id, code, name, max_adults, max_children, max_occupancy, bed_configuration, size_sqm) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
          [hotel!.id, code, name, a, c, occ, bed, sqm]))!.id;
      const sgl = await room('SGL', 'Single Room', 1, 0, 1, '1 single bed', 14);
      const dbl = await room('DBL', 'Double Room', 2, 1, 3, '1 double bed', 20);
      const fam = await room('FAM', 'Family Room', 2, 2, 4, '1 double + 2 single beds', 30);

      const c = h.contract;
      const policy = c.refundable
        ? { refundable: true, tiers: [{ daysBefore: c.freeDays, penaltyBps: 0 }, { daysBefore: 1, penaltyBps: 5000 }] }
        : { refundable: false, tiers: [] };
      const contract = await q.one<{ id: string }>(`INSERT INTO contracts (hotel_id, reference, rate_model, commission_bps, currency, valid_from, valid_to, booking_mode, release_days,
          tax_policy, cancellation_policy, payment_terms, distribution, status, internal_notes, created_by, approved_by, approved_at)
        VALUES ($1,$2,$3,$4,'EUR',$5,$6,$7,$8,$9,$10,$11,$12,'active','DEMO contract — not a real agreement.',$13,$13,now()) RETURNING id`,
        [hotel!.id, c.reference, c.rateModel, c.commissionBps ?? 0, addDays(t, -30), addDays(t, 365), c.bookingMode, c.releaseDays,
          JSON.stringify({ includedInRate: true, ...(c.localTaxMinor ? { localTaxPerPersonNightMinor: c.localTaxMinor, localTaxLabel: 'City tax (sample), payable at the hotel' } : {}) }),
          JSON.stringify(policy), 'Sample terms: agency payment due before the free-cancellation deadline.',
          JSON.stringify({ b2bAgencies: true, markets: [], notes: 'Demo' }), adminId]);
      // Two seasons: standard, then a higher-demand period.
      const seasons = [{ from: addDays(t, -30), to: addDays(t, 120), f: 1 }, { from: addDays(t, 121), to: addDays(t, 365), f: 1.15 }];
      for (const s of seasons) {
        const ins = async (rt: string, adults: number, amount: number, child = 0) => {
          for (const [meal, adj] of [['BB', 1], ['RO', 0.88]] as const) {
            await q.query(`INSERT INTO rates (contract_id, room_type_id, meal_plan, adults, date_from, date_to, amount_minor, child_amount_minor, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
              [contract!.id, rt, meal, adults, s.from, s.to, Math.round((amount * s.f * adj) / 100) * 100, child, adminId]);
          }
        };
        await ins(sgl, 1, c.base.SGL);
        await ins(dbl, 1, c.base.DBL1, 2500);
        await ins(dbl, 2, c.base.DBL2, 2500);
        await ins(fam, 2, c.base.FAM, 1500);
      }
      if (c.allocation) {
        for (const rt of [sgl, dbl, fam]) {
          await q.query(`INSERT INTO allocations (contract_id, room_type_id, stay_date, allotted)
                         SELECT $1, $2, d::date, $3 FROM generate_series($4::date, $5::date, interval '1 day') d`, [contract!.id, rt, c.allocation, t, addDays(t, 180)]);
        }
      }
      await q.query('INSERT INTO contract_versions (contract_id, version, snapshot, change_note, changed_by) VALUES ($1,1,$2,$3,$4)',
        [contract!.id, JSON.stringify({ seeded: true }), 'Demo contract seeded', adminId]);
      if (h.sandbox) await q.query(`INSERT INTO source_mappings (hotel_id, source, external_id) VALUES ($1,'sandbox',$2)`, [hotel!.id, `SBX-${h.slug}`]);
      if (h.slug === 'kade-house-amsterdam') await insertUser(q, { email: DEMO_USERS.partner, name: 'Kade House Reservations (demo)', role: 'hotel_partner', hotelId: hotel!.id }, hash);
    }
  });
  return { seeded: true };
}
