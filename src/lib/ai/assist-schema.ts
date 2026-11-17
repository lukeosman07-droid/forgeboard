import { z } from "zod";

// Output shapes for the project planner and the status report.
// No server imports, so client components and tests can use the types.

const Priority = z.enum(["urgent", "high", "medium", "low"]);

export const PlanOutputSchema = z.object({
  sections: z.array(
    z.object({
      name: z.string().describe("Short phase or workstream name, e.g. 'Design' or 'Procurement'."),
      tasks: z.array(
        z.object({
          title: z.string().describe("Short imperative task."),
          details: z.string().describe("One sentence on what done looks like."),
          priority: Priority,
          start_offset: z.number().int().describe("Days from today the task should start (0 = today)."),
          duration_days: z.number().int().describe("Working length of the task in calendar days (at least 1)."),
        }),
      ),
    }),
  ),
});

export type PlanOutput = z.infer<typeof PlanOutputSchema>;

export const StatusReportSchema = z.object({
  health: z.enum(["on_track", "at_risk", "off_track"]),
  headline: z.string().describe("One sentence: where the project stands."),
  highlights: z.array(z.string()).describe("2-4 bullets: what got done or moved forward."),
  concerns: z.array(z.string()).describe("0-4 bullets: overdue, stuck, or risky work, naming the task."),
  next_steps: z.array(z.string()).describe("2-4 bullets: the most important next actions, with owners when known."),
});

export type StatusReport = z.infer<typeof StatusReportSchema>;
