import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../../context.js';
import { h, parse, user } from '../../lib/http.js';
import { forbidden, notFound } from '../../lib/errors.js';
import { requireRole } from '../auth/middleware.js';
import { resolvePendingConfirmation } from '../bookings/service.js';

/**
 * Hotel partner workspace (minimum viable). A partner sees only bookings at their own hotel and
 * only the net amount owed to them. Agency identities, sell prices and HotelBridge margins are
 * never exposed; HotelBridge is the booker of record.
 */
export function partnerRoutes(ctx: AppContext) {
  const r = Router();
  r.use(requireRole('hotel_partner'));
  const hotelOf = (req: any) => { const id = user(req).hotelId; if (!id) throw forbidden(); return id; };

  r.get('/overview', h(async (req, res) => {
    const hotelId = hotelOf(req);
    const [hotel, bookings, contracts, production] = await Promise.all([
      ctx.db.one('SELECT id, name, city, country_code, status FROM hotels WHERE id = $1', [hotelId]),
      ctx.db.query(`SELECT b.id, b.reference, b.status, b.check_in, b.check_out, b.nights, b.lead_guest_name, b.special_requests, b.hotel_confirmation_number,
                           b.supplier_currency, b.supplier_cost_minor AS net_payable_minor, b.created_at,
                           (SELECT json_agg(json_build_object('roomName', r.room_name, 'mealPlan', r.meal_plan, 'adults', r.adults, 'childrenAges', r.children_ages) ORDER BY r.room_index)
                              FROM booking_rooms r WHERE r.booking_id = b.id) AS rooms
                      FROM bookings b WHERE b.hotel_id = $1 AND b.source = 'direct_contract'
                       AND b.status IN ('pending_confirmation','confirmed','amendment_requested','cancellation_requested','cancelled')
                     ORDER BY (b.status = 'pending_confirmation') DESC, b.check_in LIMIT 200`, [hotelId]),
      ctx.db.query(`SELECT reference, status, rate_model, currency, valid_from, valid_to, booking_mode, release_days FROM contracts WHERE hotel_id = $1 AND status IN ('active','pending_approval') ORDER BY valid_from`, [hotelId]),
      ctx.db.query(`SELECT to_char(date_trunc('month', check_in::timestamp), 'YYYY-MM') AS month, supplier_currency AS currency, count(*)::int AS bookings,
                           SUM(nights * (SELECT count(*) FROM booking_rooms r WHERE r.booking_id = b.id))::int AS room_nights, SUM(supplier_cost_minor)::bigint AS net_minor
                      FROM bookings b WHERE hotel_id = $1 AND status IN ('confirmed','amendment_requested') GROUP BY 1, 2 ORDER BY 1`, [hotelId]),
    ]);
    // Guest names are shared only for bookings that are pending or confirmed (needed for arrival).
    res.json({ hotel, bookings: bookings.map((b: any) => (b.status === 'cancelled' ? { ...b, lead_guest_name: null } : b)), contracts, production });
  }));

  const own = async (req: any) => {
    const b = await ctx.db.one('SELECT id FROM bookings WHERE id = $1 AND hotel_id = $2', [req.params.id, hotelOf(req)]);
    if (!b) throw notFound('Booking');
  };
  r.post('/bookings/:id/confirm', h(async (req, res) => {
    await own(req);
    const { hotelConfirmationNumber } = parse(z.object({ hotelConfirmationNumber: z.string().trim().min(2).max(80) }), req.body);
    await resolvePendingConfirmation(ctx, req.params.id, user(req).id, { confirm: true, hotelConfirmationNumber });
    res.json({ ok: true });
  }));
  r.post('/bookings/:id/decline', h(async (req, res) => {
    await own(req);
    const { reason } = parse(z.object({ reason: z.string().trim().min(3).max(300) }), req.body);
    await resolvePendingConfirmation(ctx, req.params.id, user(req).id, { confirm: false, reason });
    res.json({ ok: true });
  }));
  return r;
}
