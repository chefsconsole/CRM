import type { Queryable } from '../../db/pool.js';

export interface HotelRow {
  id: string; slug: string; name: string; city: string; country_code: string; address: string | null;
  latitude: number | null; longitude: number | null; star_rating: number | null; star_rating_verified: boolean;
  collections: string[]; summary: string | null; description: string | null; facilities: string[];
  content_verified: boolean; transport_notes: string | null; check_in_time: string | null; check_out_time: string | null;
  inclusion_rationale: string | null; status: string; is_sample: boolean; partner_contact_email: string | null;
  images?: { url: string; caption: string | null; credit: string; license: string }[];
}

export async function loadHotelCards(q: Queryable, f: { id?: string; city?: string; minStars?: number; collection?: string; slug?: string; liveOnly?: boolean }) {
  const where: string[] = [];
  const params: unknown[] = [];
  const p = (v: unknown) => { params.push(v); return `$${params.length}`; };
  if (f.liveOnly) where.push(`h.status = 'live'`);
  if (f.city) where.push(`lower(h.city) = lower(${p(f.city.trim())})`);
  if (f.minStars) where.push(`h.star_rating >= ${p(f.minStars)}`);
  if (f.collection) where.push(`${p(f.collection)} = ANY(h.collections)`);
  if (f.slug) where.push(`h.slug = ${p(f.slug)}`);
  if (f.id) where.push(`h.id = ${p(f.id)}`);
  const rows = await q.query<HotelRow>(
    `SELECT h.*, COALESCE((SELECT json_agg(json_build_object('url',i.url,'caption',i.caption,'credit',i.credit,'license',i.license) ORDER BY i.sort_order)
              FROM hotel_images i WHERE i.hotel_id = h.id), '[]') AS images
       FROM hotels h ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY h.name`, params);
  return rows;
}

/** Fields an agent may see. Star ratings are shown only when verified. */
export function hotelCardView(h: HotelRow) {
  return {
    id: h.id, slug: h.slug, name: h.name, city: h.city, countryCode: h.country_code, address: h.address,
    starRating: h.star_rating_verified ? h.star_rating : null,
    collections: h.collections, summary: h.summary, facilities: h.facilities.slice(0, 6),
    contentVerified: h.content_verified, isSample: h.is_sample, images: h.images ?? [],
  };
}

export async function hotelDetailView(q: Queryable, h: HotelRow) {
  const rooms = await q.query(
    `SELECT id, name, description, max_adults, max_children, max_occupancy, bed_configuration, size_sqm
       FROM room_types WHERE hotel_id = $1 AND status = 'active' ORDER BY max_occupancy, name`, [h.id]);
  return {
    ...hotelCardView(h),
    description: h.description, facilities: h.facilities, transportNotes: h.transport_notes,
    checkInTime: h.check_in_time, checkOutTime: h.check_out_time,
    location: h.latitude !== null && h.longitude !== null ? { lat: h.latitude, lng: h.longitude } : null,
    roomTypes: rooms.map((r: any) => ({
      id: r.id, name: r.name, description: r.description, maxAdults: r.max_adults, maxChildren: r.max_children,
      maxOccupancy: r.max_occupancy, bedConfiguration: r.bed_configuration, sizeSqm: r.size_sqm,
    })),
  };
}
