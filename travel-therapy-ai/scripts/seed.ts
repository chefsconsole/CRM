import { connectDb, disconnectDb } from "../src/db/connect.js";
import { SupplierModel, ActivityModel } from "../src/db/models/index.js";
import { createLogger } from "../src/utils/logger.js";

const log = createLogger("seed");

const suppliers = [
  { name: "The Ubud Sanctuary", type: "hotel", destination: "Bali", country: "Indonesia", rating: 5, preferred: true, contact: { email: "res@ubudsanctuary.example", whatsapp: "+62-000-000" } },
  { name: "Seminyak Shores Resort", type: "hotel", destination: "Bali", country: "Indonesia", rating: 4.5, preferred: true },
  { name: "Bali Bliss DMC", type: "dmc", destination: "Bali", country: "Indonesia", rating: 4.7, preferred: true, contact: { email: "ops@balibliss.example" } },
  { name: "Kyoto Machiya Ryokan", type: "hotel", destination: "Japan", country: "Japan", rating: 5, preferred: true },
  { name: "Tokyo Skyline Hotel", type: "hotel", destination: "Japan", country: "Japan", rating: 4.6 },
  { name: "Nippon Journeys DMC", type: "dmc", destination: "Japan", country: "Japan", rating: 4.8, preferred: true, contact: { email: "hello@nipponjourneys.example" } },
] as const;

const activities = [
  { name: "Private Ubud Rice Terrace Trek", destination: "Bali", category: "adventure", durationHours: 4, priceFrom: 6000, description: "Guided sunrise walk through the Tegallalang terraces." },
  { name: "Uluwatu Cliffside Dinner", destination: "Bali", category: "dining", durationHours: 3, priceFrom: 9000, description: "Sunset Kecak dance then private seafood dinner." },
  { name: "Nusa Penida Island Day Cruise", destination: "Bali", category: "adventure", durationHours: 8, priceFrom: 12000, description: "Speedboat to hidden beaches and snorkelling." },
  { name: "Balinese Couples Spa Ritual", destination: "Bali", category: "wellness", durationHours: 2, priceFrom: 7000, description: "Flower-bath and 90-min massage for two." },
  { name: "Kyoto Geisha District Evening Walk", destination: "Japan", category: "cultural", durationHours: 3, priceFrom: 8000, description: "Guided stroll through Gion at dusk." },
  { name: "Mt. Fuji & Hakone Private Day Tour", destination: "Japan", category: "sightseeing", durationHours: 10, priceFrom: 22000, description: "Lake Ashi cruise, ropeway, and Fuji viewpoints." },
  { name: "Tsukiji Outer Market Food Crawl", destination: "Japan", category: "dining", durationHours: 3, priceFrom: 7000, description: "Tastings with a local guide." },
  { name: "Arashiyama Bamboo Grove & Monkey Park", destination: "Japan", category: "sightseeing", durationHours: 5, priceFrom: 6000, description: "Bamboo forest, riverside, and hilltop macaques." },
] as const;

async function main() {
  await connectDb();
  await SupplierModel.deleteMany({});
  await ActivityModel.deleteMany({});
  await SupplierModel.insertMany(suppliers);
  await ActivityModel.insertMany(activities);
  log.info("seeded", { suppliers: suppliers.length, activities: activities.length });
  await disconnectDb();
}

main().catch((err) => {
  log.error("fatal", { error: String(err) });
  process.exit(1);
});
