import { Router } from "express";
import { asyncHandler } from "../middleware/error.js";
import {
  CustomerModel,
  LeadModel,
  ItineraryModel,
  QuoteModel,
  TripModel,
  PaymentModel,
  CampaignModel,
  ContentAssetModel,
  SupplierModel,
} from "../../db/models/index.js";

/** Read-only CRM endpoints for inspecting what the agents produced. */
export const crmRouter = Router();

crmRouter.get(
  "/customers",
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit ?? 25), 100);
    const customers = await CustomerModel.find().sort({ createdAt: -1 }).limit(limit).lean();
    res.json({ customers });
  })
);

crmRouter.get(
  "/leads",
  asyncHandler(async (req, res) => {
    const filter: Record<string, unknown> = {};
    if (req.query.status) filter.status = req.query.status;
    const limit = Math.min(Number(req.query.limit ?? 25), 100);
    const leads = await LeadModel.find(filter)
      .populate("customer", "name email handles")
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    res.json({ leads });
  })
);

crmRouter.get(
  "/leads/:id",
  asyncHandler(async (req, res) => {
    const lead = await LeadModel.findById(req.params.id).populate("customer").lean();
    if (!lead) {
      res.status(404).json({ error: "Lead not found" });
      return;
    }
    const [itineraries, quotes] = await Promise.all([
      ItineraryModel.find({ lead: lead._id }).lean(),
      QuoteModel.find({ lead: lead._id }).lean(),
    ]);
    res.json({ lead, itineraries, quotes });
  })
);

crmRouter.get(
  "/itineraries/:id",
  asyncHandler(async (req, res) => {
    const itinerary = await ItineraryModel.findById(req.params.id).lean();
    if (!itinerary) {
      res.status(404).json({ error: "Itinerary not found" });
      return;
    }
    res.json({ itinerary });
  })
);

crmRouter.get(
  "/quotes/:id",
  asyncHandler(async (req, res) => {
    const quote = await QuoteModel.findById(req.params.id)
      .populate("itinerary")
      .populate("customer", "name email")
      .lean();
    if (!quote) {
      res.status(404).json({ error: "Quote not found" });
      return;
    }
    res.json({ quote });
  })
);

crmRouter.get(
  "/trips",
  asyncHandler(async (req, res) => {
    const filter: Record<string, unknown> = {};
    if (req.query.status) filter.status = req.query.status;
    const trips = await TripModel.find(filter)
      .populate("customer", "name email")
      .sort({ createdAt: -1 })
      .limit(Math.min(Number(req.query.limit ?? 25), 100))
      .lean();
    res.json({ trips });
  })
);

crmRouter.get(
  "/payments",
  asyncHandler(async (req, res) => {
    const filter: Record<string, unknown> = {};
    if (req.query.status) filter.status = req.query.status;
    const payments = await PaymentModel.find(filter)
      .populate("customer", "name email")
      .sort({ createdAt: -1 })
      .limit(Math.min(Number(req.query.limit ?? 25), 100))
      .lean();
    res.json({ payments });
  })
);

crmRouter.get(
  "/suppliers",
  asyncHandler(async (req, res) => {
    const filter: Record<string, unknown> = {};
    if (req.query.destination) filter.destination = req.query.destination;
    if (req.query.type) filter.type = req.query.type;
    const suppliers = await SupplierModel.find(filter)
      .sort({ preferred: -1, rating: -1 })
      .limit(Math.min(Number(req.query.limit ?? 50), 100))
      .lean();
    res.json({ suppliers });
  })
);

crmRouter.get(
  "/campaigns",
  asyncHandler(async (req, res) => {
    const campaigns = await CampaignModel.find()
      .sort({ scheduledFor: 1, createdAt: -1 })
      .limit(Math.min(Number(req.query.limit ?? 50), 100))
      .lean();
    res.json({ campaigns });
  })
);

crmRouter.get(
  "/content",
  asyncHandler(async (req, res) => {
    const filter: Record<string, unknown> = {};
    if (req.query.kind) filter.kind = req.query.kind;
    if (req.query.status) filter.status = req.query.status;
    const content = await ContentAssetModel.find(filter)
      .sort({ createdAt: -1 })
      .limit(Math.min(Number(req.query.limit ?? 50), 100))
      .lean();
    res.json({ content });
  })
);
