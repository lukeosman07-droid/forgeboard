import type { ProjectPlan } from "@/server/schemas";
import { SAMPLE_NOTES } from "./sample-notes";

// The sample project a new workspace can open during onboarding: a small
// pump station retrofit with a schedule, decisions, risks and the meeting
// notes they came from, so every view has something to show.

const t = (
  title: string,
  start_offset: number,
  duration_days: number,
  assignee: string | null = null,
  priority: "low" | "medium" | "high" | "urgent" = "medium",
) => ({ title, start_offset, duration_days, assignee, priority });

export const SAMPLE_PROJECT = {
  name: "Sample: Pump Station Retrofit",
  description: "Replace two 40 HP pumps with VFD-driven units and add SCADA monitoring while the station stays in service. A sample to explore; delete it any time.",
  color: "teal" as const,
  plan: {
    sections: [
      {
        name: "Investigation",
        tasks: [
          t("Site visit and condition assessment", 0, 2, "Priya", "high"),
          t("Collect pump curves and run-time data", 1, 4, "Sam"),
          t("Confirm electrical service capacity", 3, 3, "Dev", "high"),
        ],
      },
      {
        name: "Design",
        tasks: [
          t("Pump and VFD selection", 6, 5, "Sam", "high"),
          t("SCADA integration plan", 8, 6, "Dev"),
          t("60% drawings", 10, 10, "Priya"),
          t("Bypass pumping plan for cutover", 12, 4, "Sam", "urgent"),
        ],
      },
      {
        name: "Construction support",
        tasks: [
          t("Bid set and specifications", 22, 6, "Priya"),
          t("Submittal reviews", 30, 10, "Sam"),
          t("Startup and commissioning", 45, 3, "Dev", "high"),
        ],
      },
    ],
  } satisfies ProjectPlan,
  log: [
    { type: "decision", title: "Use VFDs on both new pumps", details: "Agreed at the kickoff: saves energy at low flow and avoids water hammer on startup." },
    { type: "decision", title: "Keep the station running during cutover", details: "Temporary bypass pumping is in the budget; no planned outage." },
    { type: "risk", title: "Existing switchgear may be undersized", details: "If the service can't carry both VFDs, a new MCC adds 6 to 8 weeks.", priority: "high" },
    { type: "risk", title: "Long lead time on VFD panels", details: "Supplier quotes 14 weeks; order before 90% design." },
    { type: "question", title: "Does the owner want remote alarm callouts in SCADA?", details: null },
  ] as const,
  notes: SAMPLE_NOTES,
  notesSummary: "Kickoff: VFDs approved, cutover without an outage, electrical capacity to be confirmed.",
};
