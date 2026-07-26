import type Anthropic from "@anthropic-ai/sdk";

/**
 * A Tool couples the JSON-schema definition Claude sees with the async handler
 * that runs when Claude calls it. Handlers receive the parsed input and a
 * per-run context object, and return any JSON-serialisable value.
 */
export interface Tool<Ctx = AgentContext> {
  definition: Anthropic.Tool;
  handler: (input: Record<string, unknown>, ctx: Ctx) => Promise<unknown>;
}

/** Context threaded through a single agent run and into every tool call. */
export interface AgentContext {
  /** Identifier of the customer/lead the run concerns, when known. */
  customerId?: string;
  leadId?: string;
  /** Free-form scratch space agents/tools can read and write during a run. */
  scratch: Record<string, unknown>;
}

export interface AgentResult {
  /** Final assistant text after all tool calls resolved. */
  text: string;
  /** Number of tool calls executed during the run. */
  toolCalls: number;
  /** Token usage summed across the run. */
  usage: { input: number; output: number };
  /** The tools that were called, with their inputs — useful for auditing. */
  trace: Array<{ tool: string; input: Record<string, unknown> }>;
}

export function newContext(partial: Partial<AgentContext> = {}): AgentContext {
  return { scratch: {}, ...partial };
}
