import { z } from "zod";

// Output shapes for the register AI helpers (Phase 5). No server imports, so
// client components and tests can use the types.

export const RfiDraftSchema = z.object({
  subject: z.string().describe("Short RFI subject, under 100 characters, e.g. 'Beam B-12 bearing elevation at grid C'."),
  question: z
    .string()
    .describe("The question to the design team, in plain professional language: what is unclear, where (sheet, detail, spec section if mentioned), and what answer is needed."),
  suggested_answer: z.string().describe("A proposed solution if the text suggests one, otherwise an empty string."),
  references: z.array(z.string()).describe("Drawing sheets, details or spec sections named in the text. Empty if none."),
});
export type RfiDraft = z.infer<typeof RfiDraftSchema>;

export const SubmittalReviewSchema = z.object({
  summary: z.string().describe("Two or three sentences: what was submitted (product, manufacturer, model) and how it compares to the spec overall."),
  deviations: z.array(
    z.object({
      item: z.string().describe("What is being compared, e.g. 'Motor efficiency' or 'Finish'."),
      required: z.string().describe("What the spec section requires, quoted or closely paraphrased."),
      submitted: z.string().describe("What the submittal shows, or 'Not shown' if the submittal doesn't say."),
      severity: z.enum(["major", "minor", "unclear"]).describe("major: doesn't meet the spec; minor: small or likely acceptable difference; unclear: the submittal doesn't show enough to tell."),
      page: z.number().int().nullable().describe("Submittal page where it appears, if known."),
    }),
  ),
  missing: z.array(z.string()).describe("Things the spec asks the submittal to include (data, certificates, samples) that aren't in it."),
});
export type SubmittalReview = z.infer<typeof SubmittalReviewSchema>;
