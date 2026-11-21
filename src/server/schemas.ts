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

export const SaveExtractionSchema = z.object({
  projectId: z.uuid(),
  rawText: z.string().trim().min(1).max(MAX_NOTES_CHARS),
  summary: z.string().trim().max(2000).nullable(),
  items: z.array(ItemInputSchema).min(1, "Select at least one item to save.").max(300),
});

export type SaveExtractionInput = z.input<typeof SaveExtractionSchema>;

export const WorkspaceName = z.string().trim().min(1, "Give the workspace a name.").max(120, "That name is too long.");
export const InviteRole = z.enum(["admin", "member", "guest"]);
/** The secret in an invite link: 32 random bytes, base64url. */
export const InviteToken = z.string().regex(/^[A-Za-z0-9_-]{20,100}$/);
export const Email = z.email("That email address doesn't look right.").max(320);

export function firstIssue(error: z.ZodError) {
  return error.issues[0]?.message ?? "Please check the form.";
}
