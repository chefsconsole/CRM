import { Router } from "express";
import { asyncHandler } from "../middleware/error.js";
import { getAgent, isAgentName, listAgents } from "../../ai/registry.js";
import { newContext } from "../../ai/types.js";

export const agentsRouter = Router();

// List the roster of AI employees.
agentsRouter.get("/", (_req, res) => {
  res.json({ agents: listAgents() });
});

/**
 * Run any agent by name.
 * POST /api/agents/:name/run
 * body: { input: string | messages[], context?: { customerId?, leadId? } }
 */
agentsRouter.post(
  "/:name/run",
  asyncHandler(async (req, res) => {
    const { name } = req.params;
    if (!isAgentName(name)) {
      res.status(404).json({ error: `Unknown agent: ${name}` });
      return;
    }
    const { input, context } = req.body ?? {};
    if (!input) {
      res.status(400).json({ error: "Body must include `input` (string or messages array)." });
      return;
    }
    const agent = getAgent(name);
    const ctx = newContext(context ?? {});
    ctx.scratch.agentName = name;
    const result = await agent.run(input, ctx);
    res.json({ agent: name, ...result, context: { customerId: ctx.customerId, leadId: ctx.leadId } });
  })
);
