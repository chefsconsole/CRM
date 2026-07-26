import type { Agent } from "./agent.js";
import { leadManager } from "./agents/leadManager.js";
import { itineraryGenerator } from "./agents/itineraryGenerator.js";
import { quotationAgent } from "./agents/quotationAgent.js";
import { instagramAgent } from "./agents/instagramAgent.js";
import { travelConsultant } from "./agents/travelConsultant.js";
import { socialMediaManager } from "./agents/socialMediaManager.js";
import { customerSuccessAgent } from "./agents/customerSuccessAgent.js";

/**
 * The roster of AI employees, keyed by stable name. Factories are called lazily
 * (per invocation) so each run gets a fresh agent instance. Add new employees
 * here — the API `/api/agents/:name/run` route picks them up automatically.
 */
export const agentFactories = {
  "lead-manager": leadManager,
  "travel-consultant": travelConsultant,
  "itinerary-generator": itineraryGenerator,
  "quotation-agent": quotationAgent,
  "instagram-agent": instagramAgent,
  "social-media-manager": socialMediaManager,
  "customer-success-agent": customerSuccessAgent,
} as const;

export type AgentName = keyof typeof agentFactories;

export function isAgentName(name: string): name is AgentName {
  return name in agentFactories;
}

export function getAgent(name: AgentName): Agent {
  return agentFactories[name]();
}

export function listAgents(): Array<{ name: AgentName; role: string }> {
  return (Object.keys(agentFactories) as AgentName[]).map((name) => ({
    name,
    role: agentFactories[name]().role,
  }));
}
