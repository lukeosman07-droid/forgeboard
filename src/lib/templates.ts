import type { ProjectPlan } from "@/server/schemas";

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
  {
    id: "mep-design",
    name: "MEP design",
    blurb: "Mechanical, electrical and plumbing design from loads to coordinated CDs.",
    color: "orange",
    plan: {
      sections: [
        {
          name: "Schematic design",
          tasks: [t("Collect architectural backgrounds", 0, 3, "high"), t("Heating and cooling load calculations", 2, 6, "high"), t("Electrical load estimate", 3, 5), t("Plumbing fixture count and sizing", 3, 4), t("Systems narrative", 8, 4), t("SD review", 13, 1, "high")],
        },
        {
          name: "Design development",
          tasks: [t("Equipment selection and schedules", 14, 7, "high"), t("Duct and pipe layouts", 16, 10), t("Single-line diagram and panel schedules", 16, 8), t("Fire protection coordination", 20, 5), t("Energy code compliance check", 24, 4, "high"), t("DD review", 28, 1, "high")],
        },
        {
          name: "Construction documents",
          tasks: [t("Clash detection with structure", 30, 6, "high"), t("Final MEP drawings", 30, 14, "high"), t("Specifications (Div 21-28)", 32, 12), t("QA/QC check", 45, 3, "high"), t("Issue for permit", 49, 1, "urgent")],
        },
        {
          name: "Construction support",
          tasks: [t("Review equipment submittals", 52, 15, "high"), t("Answer RFIs", 52, 40), t("Site observation visits", 60, 30, "low"), t("Commissioning support", 88, 7)],
        },
      ],
    },
  },
  {
    id: "structural-design",
    name: "Structural design",
    blurb: "Loads, analysis, member design and stamped drawings, with peer review.",
    color: "blue",
    plan: {
      sections: [
        {
          name: "Criteria",
          tasks: [t("Review geotechnical report", 0, 3, "high"), t("Set design criteria and load cases", 1, 4, "high"), t("Wind and seismic parameters", 3, 3), t("Framing concept options", 5, 5)],
        },
        {
          name: "Analysis",
          tasks: [t("Build analysis model", 10, 7, "high"), t("Gravity system design", 14, 8), t("Lateral system design", 16, 10, "high"), t("Foundation design", 20, 8, "high"), t("Connection design", 26, 7)],
        },
        {
          name: "Documents",
          tasks: [t("General notes and typical details", 26, 5), t("Framing plans and sections", 28, 12, "high"), t("Calculation package", 34, 6, "high"), t("Peer review", 40, 5, "high"), t("Stamp and issue", 46, 1, "urgent")],
        },
        {
          name: "Construction",
          tasks: [t("Review steel shop drawings", 48, 14, "high"), t("Rebar submittal review", 48, 10), t("Answer RFIs", 48, 45), t("Special inspection reports", 60, 30, "low")],
        },
      ],
    },
  },
  {
    id: "site-civil",
    name: "Site and civil",
    blurb: "Survey, grading, utilities and stormwater through permits and construction.",
    color: "green",
    plan: {
      sections: [
        {
          name: "Due diligence",
          tasks: [t("Topographic and boundary survey", 0, 10, "high"), t("Utility research and locates", 2, 7), t("Zoning and setback review", 2, 4), t("Pre-application meeting", 8, 1, "high")],
        },
        {
          name: "Design",
          tasks: [t("Site layout and grading plan", 12, 10, "high"), t("Stormwater management design", 14, 12, "high"), t("Water and sewer design", 16, 10), t("Erosion and sediment control plan", 22, 5), t("Paving and striping plan", 24, 5, "low")],
        },
        {
          name: "Permitting",
          tasks: [t("Submit site plan application", 30, 1, "urgent"), t("Stormwater permit", 30, 20, "high"), t("Address agency comments", 45, 10, "high"), t("Utility connection approvals", 40, 15)],
        },
        {
          name: "Construction",
          tasks: [t("Pre-construction meeting", 60, 1, "high"), t("Review pipe and structure submittals", 60, 10), t("Inspections and testing", 65, 40), t("Record drawings", 105, 10)],
        },
      ],
    },
  },
  {
    id: "npi",
    name: "Product development (NPI)",
    blurb: "New product introduction through concept, design gates, validation and launch.",
    color: "purple",
    plan: {
      sections: [
        {
          name: "Concept",
          tasks: [t("Market and customer requirements", 0, 7, "high"), t("Product requirements document", 5, 7, "high"), t("Concept sketches and trade study", 8, 10), t("Gate 1: concept review", 18, 1, "urgent")],
        },
        {
          name: "Design",
          tasks: [t("Industrial design", 19, 14), t("Mechanical CAD", 21, 21, "high"), t("Electronics schematic and layout", 21, 21, "high"), t("DFMEA", 30, 7, "high"), t("Bill of materials and cost roll-up", 35, 7), t("Gate 2: design review", 43, 1, "urgent")],
        },
        {
          name: "Validation",
          tasks: [t("Prototype build (EVT)", 44, 14, "high"), t("Design verification testing", 58, 14, "high"), t("Regulatory and safety testing", 60, 20, "high"), t("Pilot build (DVT/PVT)", 75, 14), t("Gate 3: production readiness", 90, 1, "urgent")],
        },
        {
          name: "Launch",
          tasks: [t("Supplier PPAP and first articles", 80, 14), t("Production line setup", 85, 10), t("Launch and ramp", 95, 14, "high"), t("Post-launch review", 115, 1, "low")],
        },
      ],
    },
  },
];
