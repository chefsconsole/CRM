import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropic } from "./client.js";
import { env } from "../config/env.js";
import { createLogger } from "../utils/logger.js";
import { newContext, type AgentContext, type AgentResult, type Tool } from "./types.js";

const log = createLogger("agent");

export interface AgentConfig {
  /** Stable identifier, e.g. "itinerary-generator". */
  name: string;
  /** Human-facing role, e.g. "Itinerary Generator". */
  role: string;
  /** System prompt defining the employee's behaviour. */
  system: string;
  /** Tools this employee may call. */
  tools?: Tool[];
  /** Override the default model (e.g. use the cheaper content model). */
  model?: string;
  /** Max tokens per turn. Defaults to 8000. */
  maxTokens?: number;
  /** Safety cap on tool-use loop iterations. Defaults to 12. */
  maxIterations?: number;
}

/**
 * Base class for every AI employee. Runs the standard Claude tool-use loop:
 * call the model, execute any tools it requests, feed the results back, and
 * repeat until it stops calling tools (or the iteration cap is hit).
 *
 * The full `response.content` (including thinking blocks) is appended back on
 * every turn, which is the correct pattern for models with thinking on.
 */
export class Agent {
  readonly name: string;
  readonly role: string;
  private readonly system: string;
  private readonly tools: Tool[];
  private readonly toolsByName: Map<string, Tool>;
  private readonly model: string;
  private readonly maxTokens: number;
  private readonly maxIterations: number;

  constructor(config: AgentConfig) {
    this.name = config.name;
    this.role = config.role;
    this.system = config.system;
    this.tools = config.tools ?? [];
    this.toolsByName = new Map(this.tools.map((t) => [t.definition.name, t]));
    this.model = config.model ?? env.aiModel;
    this.maxTokens = config.maxTokens ?? 8000;
    this.maxIterations = config.maxIterations ?? 12;
  }

  /**
   * Run the agent against a single instruction. `messages` may be seeded with
   * prior conversation for multi-turn agents (e.g. the Travel Consultant chat).
   */
  async run(
    instruction: string | Anthropic.MessageParam[],
    ctx: AgentContext = newContext()
  ): Promise<AgentResult> {
    const anthropic = getAnthropic();
    const messages: Anthropic.MessageParam[] =
      typeof instruction === "string"
        ? [{ role: "user", content: instruction }]
        : [...instruction];

    const toolDefs = this.tools.map((t) => t.definition);
    const trace: AgentResult["trace"] = [];
    let toolCalls = 0;
    const usage = { input: 0, output: 0 };
    let finalText = "";

    for (let iteration = 0; iteration < this.maxIterations; iteration++) {
      const response = await anthropic.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        thinking: { type: "adaptive" },
        system: this.system,
        messages,
        ...(toolDefs.length > 0 ? { tools: toolDefs } : {}),
      });

      usage.input += response.usage.input_tokens;
      usage.output += response.usage.output_tokens;

      // Collect the text from this turn (there may be multiple text blocks).
      finalText = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();

      if (response.stop_reason !== "tool_use") {
        // end_turn / max_tokens / refusal — we're done.
        if (response.stop_reason === "refusal") {
          log.warn("refusal", { agent: this.name });
        }
        break;
      }

      // Append the full assistant content (preserves thinking + tool_use blocks).
      messages.push({ role: "assistant", content: response.content });

      const toolUses = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
      );

      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const use of toolUses) {
        toolCalls++;
        const input = (use.input ?? {}) as Record<string, unknown>;
        trace.push({ tool: use.name, input });
        const tool = this.toolsByName.get(use.name);
        if (!tool) {
          results.push({
            type: "tool_result",
            tool_use_id: use.id,
            content: `Unknown tool: ${use.name}`,
            is_error: true,
          });
          continue;
        }
        try {
          const output = await tool.handler(input, ctx);
          results.push({
            type: "tool_result",
            tool_use_id: use.id,
            content: JSON.stringify(output ?? null),
          });
        } catch (err) {
          log.error("tool_error", { agent: this.name, tool: use.name, error: String(err) });
          results.push({
            type: "tool_result",
            tool_use_id: use.id,
            content: `Error: ${err instanceof Error ? err.message : String(err)}`,
            is_error: true,
          });
        }
      }

      messages.push({ role: "user", content: results });
    }

    log.info("run_complete", { agent: this.name, toolCalls, usage });
    return { text: finalText, toolCalls, usage, trace };
  }
}
