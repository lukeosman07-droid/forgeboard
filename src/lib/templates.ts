import type { ProjectPlan } from "@/app/dashboard/actions";

// Starter templates for new projects. Dates are offsets from the day the
// project is created (start_offset) plus a length in days (duration_days).

export type Template = { id: string; name: string; blurb: string; color: string; plan: ProjectPlan };

const t = (title: string, start_offset: number, duration_days: number, priority: "low" | "medium" | "high" | "urgent" = "medium") => ({
  title,
  start_offset,
  duration_days,
  priority,
});

export const TEMPLATES: Template[] = [
  {
    id: "engineering-design",
    name: "Engineering design project",
    blurb: "Concept to issued-for-construction drawings, with design reviews.",
    color: "blue",
    plan: {
      sections: [
        {
          name: "Concept",
          tasks: [t("Gather requirements and site data", 0, 5, "high"), t("Review existing drawings and as-builts", 2, 4), t("Develop concept alternatives", 6, 7), t("Concept review meeting", 13, 1, "high")],
        },
        {
          name: "30% design",
          tasks: [t("Preliminary calculations", 14, 7), t("Equipment selection", 16, 6, "high"), t("30% drawing set", 18, 10), t("30% design review", 28, 1, "high")],
        },
        {
          name: "Detailed design",
          tasks: [t("Final calculations and sizing", 30, 10), t("Specifications", 32, 12), t("90% drawing set", 34, 14, "high"), t("QA/QC check", 48, 3, "high")],
        },
        {
          name: "Issue",
          tasks: [t("Address review comments", 51, 5), t("Stamp and issue for construction", 56, 2, "urgent"), t("Cost estimate", 52, 4)],
        },
      ],
    },
  },
  {
    id: "product-launch",
    name: "Product launch",
    blurb: "Plan, build, and ship a launch across marketing, sales and support.",
    color: "purple",
    plan: {
      sections: [
        {
          name: "Strategy",
          tasks: [t("Define target audience and positioning", 0, 4, "high"), t("Set launch goals and success metrics", 2, 3), t("Pick the launch date", 4, 1, "high")],
        },
        {
          name: "Content",
          tasks: [t("Write launch announcement", 7, 5), t("Design launch graphics", 7, 7), t("Record demo video", 10, 5), t("Update website pages", 12, 6, "high")],
        },
        {
          name: "Enablement",
          tasks: [t("Sales one-pager", 10, 4), t("Support FAQ and help articles", 12, 5), t("Internal launch briefing", 18, 1)],
        },
        {
          name: "Launch",
          tasks: [t("Final go/no-go check", 20, 1, "urgent"), t("Publish and announce", 21, 1, "urgent"), t("Monitor feedback and metrics", 21, 7), t("Launch retrospective", 30, 1, "low")],
        },
      ],
    },
  },
  {
    id: "construction",
    name: "Construction project",
    blurb: "Pre-construction through closeout, with submittals and inspections.",
    color: "yellow",
    plan: {
      sections: [
        {
          name: "Pre-construction",
          tasks: [t("Kickoff meeting with contractor", 0, 1, "high"), t("Review construction schedule", 1, 3), t("Confirm permits", 1, 5, "urgent"), t("Site safety plan", 2, 4, "high")],
        },
        {
          name: "Submittals",
          tasks: [t("Log shop drawing submittals", 5, 10), t("Review equipment submittals", 8, 14, "high"), t("Approve materials", 15, 7)],
        },
        {
          name: "Construction",
          tasks: [t("Site work and excavation", 20, 14), t("Structural work", 34, 21), t("Mechanical and electrical install", 50, 21, "high"), t("Weekly progress meetings", 20, 60, "low")],
        },
        {
          name: "Closeout",
          tasks: [t("Testing and commissioning", 72, 7, "high"), t("Final inspection", 80, 2, "urgent"), t("Punch list", 82, 5), t("As-built drawings and O&M manuals", 84, 10)],
        },
      ],
    },
  },
  {
    id: "sprint",
    name: "Two-week sprint",
    blurb: "Backlog, in-flight work and review for a software team.",
    color: "teal",
    plan: {
      sections: [
        { name: "Backlog", tasks: [t("Groom and estimate backlog", 0, 1, "high"), t("Write acceptance criteria", 0, 2)] },
        { name: "Sprint", tasks: [t("Feature work", 1, 9, "high"), t("Bug fixes", 1, 9), t("Code review", 2, 9), t("Update documentation", 7, 3, "low")] },
        { name: "Review", tasks: [t("QA pass", 9, 2, "high"), t("Sprint demo", 12, 1), t("Retrospective", 13, 1)] },
      ],
    },
  },
];
