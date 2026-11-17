import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";

// The one place that talks to the Anthropic API. Every AI feature goes through
// runStructured(), so model choice, error handling and logging live here.

/** Model IDs in one place. Change a model here and every feature follows. */
export const AI_MODELS = {
  /** Extraction, planning and reports. */
  standard: "claude-sonnet-5-5",
} as const;

export type AiResult<T> = { ok: true; data: T } | { ok: false; error: string; status: number };

/** What the user sees for each kind of failure. Callers can reword any of them. */
export type AiMessages = {
  auth: string;
  busy: string;
  badRequest: string;
  connection: string;
  refusal: string;
  incomplete: string;
  other: string;
};

const DEFAULT_MESSAGES: AiMessages = {
  auth: "The AI service rejected our API key.",
  busy: "The AI service is busy right now. Please try again in a minute.",
  badRequest: "The AI service couldn't process this request. Try shortening or simplifying it.",
  connection: "Couldn't reach the AI service. Please try again.",
  refusal: "The AI declined this request. Try rewording it.",
  incomplete: "The AI's answer was incomplete. Please try again.",
  other: "The AI service had a problem. Please try again.",
};

export async function runStructured<T>(options: {
  /** Short name for logs, e.g. "extract". */
  feature: string;
  schema: z.ZodType<T>;
  system: string;
  content: string;
  maxTokens: number;
  effort?: "low" | "medium" | "high";
  model?: string;
  messages?: Partial<AiMessages>;
}): Promise<AiResult<T>> {
  const messages = { ...DEFAULT_MESSAGES, ...options.messages };
  const model = options.model ?? AI_MODELS.standard;
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY from the server environment
  const started = Date.now();

  let response;
  try {
    response = await client.beta.messages.parse({
      model,
      max_tokens: options.maxTokens,
      output_config: { effort: options.effort ?? "low", format: betaZodOutputFormat(options.schema) },
      // If a safety classifier declines, retry on Anthropic's recommended fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: options.system,
      messages: [{ role: "user", content: options.content }],
    });
  } catch (error) {
    console.error(`AI ${options.feature} failed:`, error);
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
      return { ok: false, status: 500, error: messages.auth };
    }
    if (error instanceof Anthropic.RateLimitError) return { ok: false, status: 503, error: messages.busy };
    if (error instanceof Anthropic.BadRequestError) return { ok: false, status: 502, error: messages.badRequest };
    if (error instanceof Anthropic.APIConnectionError) return { ok: false, status: 503, error: messages.connection };
    return { ok: false, status: 502, error: messages.other };
  }

  // Token and latency log. Phase 2 of docs/SPEC.md stores this in the ai_usage table.
  console.log(
    `AI ${options.feature}: model=${response.model} in=${response.usage.input_tokens} out=${response.usage.output_tokens} ms=${Date.now() - started}`,
  );

  if (response.stop_reason === "refusal") return { ok: false, status: 422, error: messages.refusal };
  if (response.stop_reason === "max_tokens" || !response.parsed_output) {
    return { ok: false, status: 502, error: messages.incomplete };
  }
  return { ok: true, data: response.parsed_output as T };
}
