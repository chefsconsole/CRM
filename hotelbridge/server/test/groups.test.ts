import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, DEMO_USERS, futureDate, login, startTestApp, type TestEnv } from './helpers.js';

let env: TestEnv;
let agent: Client, other: Client, ops: Client;
const enquiry = () => ({
  title: 'Spring architecture tour', groupType: 'leisure',
  legs: [{ city: 'Amsterdam', checkIn: futureDate(60), checkOut: futureDate(63) }, { city: 'Barcelona', checkIn: futureDate(63), checkOut: futureDate(66) }],
  totalPassengers: 32, rooming: { single: 2, double: 10, twin: 5, triple: 0, family: 0 },
  hotelCategory: '4', mealPlan: 'BB', coachParking: true, quoteNeededBy: futureDate(14), specialRequests: 'Ground-floor rooms for two guests',
});

beforeAll(async () => {
  env = await startTestApp();
  [agent, other, ops] = await Promise.all([login(env, DEMO_USERS.agent), login(env, DEMO_USERS.creditAgent), login(env, DEMO_USERS.ops)]);
});
afterAll(async () => { await env.close(); });

describe('group desk', () => {
  it('validates the rooming list against passengers', async () => {
    const bad = await agent.post('/api/agent/groups', { ...enquiry(), totalPassengers: 60 });
    expect(bad.status).toBe(400);
    expect(bad.body.error.message).toMatch(/sleeps 32/);
  });

  it('runs the full workflow from enquiry to accepted proposal', async () => {
    const created = await agent.post('/api/agent/groups', enquiry());
    expect(created.status).toBe(201);
    const id = created.body.id;
    const view = await agent.get(`/api/agent/groups/${id}`);
    expect(view.body.status).toBe('new');
    expect(view.body.messages[0].body).toMatch(/Automatic acknowledgement/);

    // Other agencies cannot see it.
    expect((await other.get(`/api/agent/groups/${id}`)).status).toBe(404);

    const hotel = await env.db.one<{ id: string }>(`SELECT id FROM hotels WHERE slug = 'kade-house-amsterdam'`);
    const drafted = await ops.post(`/api/admin/groups/${id}/hotel-requests`, { legIndex: 0, hotels: [{ hotelId: hotel!.id }, { hotelName: 'Independent Canal Hotel', contactEmail: 'groups@example.com' }], respondBy: futureDate(7) });
    expect(drafted.status).toBe(201);
    expect(drafted.body.emailIntegration).toBe(false);
    let admin = await ops.get(`/api/admin/groups/${id}`);
    expect(admin.body.hotelRequests.every((r: any) => r.status === 'drafted' && r.sent_at === null)).toBe(true); // generated ≠ sent
    expect(admin.body.hotelRequests[0].body).not.toContain('Sample Travel Co'); // agency identity not disclosed to hotels
    await ops.post(`/api/admin/hotel-requests/${admin.body.hotelRequests[0].id}/sent`);
    expect((await ops.post(`/api/admin/hotel-requests/${admin.body.hotelRequests[0].id}/sent`)).status).toBe(409);

    const offer = await ops.post(`/api/admin/groups/${id}/offers`, {
      hotelRequestId: admin.body.hotelRequests[0].id, hotelName: 'Kade House', city: 'Amsterdam', checkIn: futureDate(60), checkOut: futureDate(63), currency: 'EUR',
      lines: [{ roomType: 'Single', rooms: 2, nightlyNetMinor: 12000 }, { roomType: 'Double/Twin', rooms: 15, nightlyNetMinor: 14000 }],
      mealPlan: 'BB', taxesMinor: 33600, cancellationTerms: 'Free release of 10% until 30 days prior', paymentTerms: '30% deposit on signature', validUntil: futureDate(20),
    });
    expect(offer.status).toBe(201);
    expect(offer.body.netTotalMinor).toBe((2 * 12000 + 15 * 14000) * 3 + 33600);

    const tooLong = await ops.post(`/api/admin/groups/${id}/proposals`, { offerIds: [offer.body.id], markupBps: 800, validUntil: futureDate(30) });
    expect(tooLong.status).toBe(400); // cannot promise beyond hotel validity
    const proposal = await ops.post(`/api/admin/groups/${id}/proposals`, { offerIds: [offer.body.id], markupBps: 800, validUntil: futureDate(10), exclusions: 'City tax, coach transfers' });
    expect(proposal.status).toBe(201);
    expect(proposal.body.totalSellMinor).toBeGreaterThan(proposal.body.totalNetMinor);

    // Drafts are invisible to the agent until sent.
    expect((await agent.get(`/api/agent/groups/${id}`)).body.proposals).toHaveLength(0);
    await ops.post(`/api/admin/proposals/${proposal.body.id}/send`);
    const agentView = await agent.get(`/api/agent/groups/${id}`);
    expect(agentView.body.status).toBe('sent_to_agent');
    expect(agentView.body.proposals).toHaveLength(1);
    expect(JSON.stringify(agentView.body)).not.toContain('netTotalMinor');
    expect(JSON.stringify(agentView.body)).not.toContain('internal');
    const opt = agentView.body.proposals[0].options[0];
    expect(opt.lines.reduce((a: number, l: any) => a + l.lineSellMinor, 0) + opt.taxesMinor).toBe(opt.sellTotalMinor);

    expect((await other.post(`/api/agent/groups/proposals/${proposal.body.id}/respond`, { accept: true })).status).toBe(404);
    const acc = await agent.post(`/api/agent/groups/proposals/${proposal.body.id}/respond`, { accept: true });
    expect(acc.status).toBe(200);
    admin = await ops.get(`/api/admin/groups/${id}`);
    expect(admin.body.status).toBe('won');

    const doc = await ops.get(`/api/admin/proposals/${proposal.body.id}/document`);
    expect(String(doc.body)).toContain('Kade House');
    expect(String(doc.body)).toContain('City tax, coach transfers');
  });

  it('flags missed response targets in operations', async () => {
    const created = await agent.post('/api/agent/groups', enquiry());
    await env.db.query(`UPDATE group_enquiries SET target_response_at = now() - interval '1 hour' WHERE id = $1`, [created.body.id]);
    const admin = await login(env, DEMO_USERS.admin);
    const r = await admin.get('/api/admin/overview');
    expect(r.body.issues.some((i: any) => i.kind === 'group_sla' && i.entityId === created.body.id)).toBe(true);
  });

  it('scenario API validates and labels results as scenarios', async () => {
    const admin = await login(env, DEMO_USERS.admin);
    const r = await admin.post('/api/admin/scenarios', {
      currency: 'EUR', activeAgencies: 1000, bookingsPerAgencyPerMonth: 3,
      segments: [{ name: 'All', shareBps: 10000, averageBookingValueMinor: 55000, takeRateBps: 900 }],
      cancellationRateBps: 1200, paymentCostBps: 150, supportCostPerBookingMinor: 400, agenciesPerAccountManager: 80, accountManagerMonthlyCostMinor: 450000, fixedMonthlyCostsMinor: 5000000,
    });
    expect(r.status).toBe(200);
    expect(r.body.disclaimer).toMatch(/Scenario only/);
    expect((await agent.post('/api/admin/scenarios', {})).status).toBe(403);
  });
});
