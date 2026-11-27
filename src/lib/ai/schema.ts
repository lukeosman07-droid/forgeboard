import { z } from "zod";

// The exact shape the AI must return. Used for Anthropic structured outputs
// (so the response is guaranteed to parse) and shared with the review screen.
// Every item carries the words it came from and, for paged documents, the page.

const Level = z.enum(["high", "medium", "low"]);

const quote = z.string().describe("The sentence from the document this came from, copied word for word.");
const page = z
  .number()
  .int()
  .nullable()
  .describe("The page number from the nearest [Page N] marker above the quote, or null if the text has no page markers.");

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
      source_quote: quote,
      source_page: page,
    }),
  ),
  decisions: z.array(
    z.object({
      title: z.string(),
      details: z.string(),
      source_quote: quote,
      source_page: page,
    }),
  ),
  risks: z.array(
    z.object({
      title: z.string(),
      details: z.string(),
      severity: Level,
      source_quote: quote,
      source_page: page,
    }),
  ),
  questions: z.array(
    z.object({
      question: z.string().describe("An open question that nobody answered in the notes."),
      source_quote: quote,
      source_page: page,
    }),
  ),
});

export type Extraction = z.infer<typeof ExtractionSchema>;
