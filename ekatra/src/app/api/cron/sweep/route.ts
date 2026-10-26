import { runSweep } from "@/lib/services/sweep";

// Call from a scheduler (e.g. hourly): Authorization: Bearer $CRON_SECRET
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorised", { status: 401 });
  return Response.json(await runSweep(true));
}
