import { z } from "zod";
import { MAX_NOTES_CHARS } from "@/lib/plans";

// Input shapes for the server actions in this folder. Kept out of the
// "use server" files, which may only export async functions.

export type ActionResult = { error?: string; ok?: boolean };

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date.");
const optionalDate = isoDate.nullable().optional().or(z.literal("").transform(() => null));
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)
    .nullable()
    .optional();

export const Status = z.enum(["open", "in_progress", "stuck", "done"]);
const PriorityEnum = z.enum(["low", "medium", "high", "urgent"]);
const Color = z.enum(["orange", "blue", "green", "purple", "pink", "teal", "yellow", "red"]);
export const Id = z.uuid();
export const Slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(60);

export const ItemInputSchema = z.object({
  type: z.enum(["action_item", "decision", "risk", "question"]),
  title: z.string().trim().min(1, "Give it a title.").max(500, "Title is too long (500 characters max)."),
  details: optionalText(5000),
  assignee: optionalText(200),
  due_date: optionalDate,
  priority: PriorityEnum.nullable().optional().or(z.literal("").transform(() => null)),
  /** Where an AI-captured item came from: the words, and the page for PDFs. */
  source_quote: optionalText(2000),
  source_page: z.number().int().min(1).max(100000).nullable().optional(),
});

export type ItemInput = z.input<typeof ItemInputSchema>;

export const PlanSchema = z.object({
  sections: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        tasks: z
          .array(
            z.object({
              title: z.string().trim().min(1).max(500),
              details: optionalText(5000),
              assignee: optionalText(200),
              priority: PriorityEnum.nullable().optional(),
              start_offset: z.number().int().min(0).max(730).nullable().optional(),
              duration_days: z.number().int().min(1).max(365).nullable().optional(),
            }),
          )
          .max(40),
      }),
    )
    .max(12),
});

export type ProjectPlan = z.input<typeof PlanSchema>;

export const NewProjectSchema = z.object({
  name: z.string().trim().min(1, "Give your project a name.").max(200, "Name is too long."),
  description: optionalText(2000),
  color: Color.default("orange"),
  plan: PlanSchema.nullable().optional(),
  // The browser's local date, so planned dates start "today" for the user.
  today: isoDate.optional(),
});

export type NewProjectInput = z.input<typeof NewProjectSchema>;

export const ProjectPatchSchema = z.object({
  name: z.string().trim().min(1, "Give your project a name.").max(200).optional(),
  description: optionalText(2000),
  color: Color.optional(),
});

export type ProjectPatch = z.input<typeof ProjectPatchSchema>;

export const SectionName = z.string().trim().min(1, "Name the section.").max(120);

export const TaskPatchSchema = z.object({
  title: z.string().trim().min(1, "Give it a title.").max(500).optional(),
  details: optionalText(5000),
  /** A free-text owner, for someone who isn't a workspace member. */
  assignee: optionalText(200),
  /** A workspace member as the owner. When set, the name is filled in from their profile. */
  assignee_id: Id.nullable().optional(),
  status: Status.optional(),
  priority: PriorityEnum.nullable().optional(),
  start_date: optionalDate,
  due_date: optionalDate,
  section_id: Id.nullable().optional(),
  position: z.number().finite().optional(),
});

export type TaskPatch = z.input<typeof TaskPatchSchema>;

export const SaveExtractionSchema = z
  .object({
    projectId: z.uuid(),
    /** Pasted notes, saved as a new document. */
    rawText: z.string().trim().min(1).max(MAX_NOTES_CHARS).optional(),
    /** Or the document (a file or email) the items were read from. */
    documentId: z.uuid().optional(),
    summary: z.string().trim().max(2000).nullable(),
    items: z.array(ItemInputSchema).min(1, "Select at least one item to save.").max(300),
  })
  .refine((v) => !!v.rawText !== !!v.documentId, "Nothing to save the items from.");

export type SaveExtractionInput = z.input<typeof SaveExtractionSchema>;

export const WorkspaceName = z.string().trim().min(1, "Give the workspace a name.").max(120, "That name is too long.");
export const InviteRole = z.enum(["admin", "member", "guest"]);
/** The secret in an invite link: 32 random bytes, base64url. */
export const InviteToken = z.string().regex(/^[A-Za-z0-9_-]{20,100}$/);
export const Email = z.email("That email address doesn't look right.").max(320);

export function firstIssue(error: z.ZodError) {
  return error.issues[0]?.message ?? "Please check the form.";
}

// ---------------------------------------------------------------------------
// Phase 5: registers, reviews, dependencies, saved views, templates
// ---------------------------------------------------------------------------

export const RfiStatus = z.enum(["draft", "open", "answered", "closed"]);

export const RfiInputSchema = z.object({
  subject: z.string().trim().min(1, "Give the RFI a subject.").max(300, "Subject is too long (300 characters max)."),
  question: z.string().trim().max(10000, "The question is too long.").optional(),
  response: optionalText(10000),
  status: RfiStatus.optional(),
  /** A member who has to answer, or a plain name (an outside party). */
  ball_in_court_id: Id.nullable().optional(),
  ball_in_court: optionalText(200),
  asked_by_id: Id.nullable().optional(),
  date_required: optionalDate,
});
export type RfiInput = z.input<typeof RfiInputSchema>;
export const RfiPatchSchema = RfiInputSchema.partial();
export type RfiPatch = z.input<typeof RfiPatchSchema>;

export const SubmittalAction = z.enum(["pending", "approved", "approved_as_noted", "revise_resubmit", "rejected"]);

export const SubmittalInputSchema = z.object({
  title: z.string().trim().min(1, "Give the submittal a title.").max(300),
  spec_section: optionalText(60),
  description: optionalText(10000),
  submitted_by: optionalText(200),
  reviewer_id: Id.nullable().optional(),
  reviewer: optionalText(200),
  received_on: optionalDate,
  due_on: optionalDate,
  action: SubmittalAction.optional(),
  review_notes: optionalText(10000),
});
export type SubmittalInput = z.input<typeof SubmittalInputSchema>;
export const SubmittalPatchSchema = SubmittalInputSchema.partial();
export type SubmittalPatch = z.input<typeof SubmittalPatchSchema>;

export const MilestoneInputSchema = z.object({
  name: z.string().trim().min(1, "Name the milestone.").max(120),
  due_on: isoDate,
});
export const MilestonePatchSchema = MilestoneInputSchema.partial().extend({ done: z.boolean().optional() });
export type MilestonePatch = z.input<typeof MilestonePatchSchema>;

export const ReviewInputSchema = z.object({
  name: z.string().trim().min(1, "Name the review.").max(200),
  milestone_id: Id.nullable().optional(),
  due_on: optionalDate,
});
export const ReviewPatchSchema = ReviewInputSchema.partial().extend({ status: z.enum(["open", "closed"]).optional() });
export type ReviewPatch = z.input<typeof ReviewPatchSchema>;

export const Disposition = z.enum(["pending", "incorporate", "no_change", "rejected", "deferred"]);

export const ViewQuery = z.string().max(2000);
export const SavedViewInputSchema = z.object({
  name: z.string().trim().min(1, "Name the view.").max(80),
  view: z.enum(["table", "board", "calendar", "timeline"]),
  query: ViewQuery,
  shared: z.boolean().default(true),
});
export type SavedViewInput = z.input<typeof SavedViewInputSchema>;

export const TemplateInputSchema = z.object({
  name: z.string().trim().min(1, "Name the template.").max(120),
  description: optionalText(500),
});
