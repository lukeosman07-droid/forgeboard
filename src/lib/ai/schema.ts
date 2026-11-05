import { z } from "zod";

// The exact shape the AI must return. Used for Anthropic structured outputs
// (so the response is guaranteed to parse) and shared with the review screen.

const Level = z.enum(["high", "medium", "low"]);

export const ExtractionSchema = z.object({
  summary: z.string().describe("2-3 sentence summary of the notes."),
  action_items: z.array(
    z.object({
      title: z.string().describe("Short imperative task, e.g. 'Send pump curves to Sam'."),
      assignee: z
        .string()
        .describe("The person's name exactly as written in the notes, or 'Unassigned'. Never guess."),
      due_date: z
        .string()
        .nullable()
        .describe("YYYY-MM-DD only if a date is stated or clearly implied; otherwise null."),
      priority: Level,
      source_quote: z.string().describe("The line from the notes this came from, copied word for word."),
    }),
  ),
  decisions: z.array(
    z.object({
      title: z.string(),
      details: z.string(),
      source_quote: z.string(),
    }),
  ),
  risks: z.array(
    z.object({
      title: z.string(),
      details: z.string(),
      severity: Level,
    }),
  ),
  questions: z.array(
    z.object({
      question: z.string().describe("An open question that nobody answered in the notes."),
    }),
  ),
});

export type Extraction = z.infer<typeof ExtractionSchema>;
