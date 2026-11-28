// Shared site settings. Change values here and they update everywhere.
export const site = {
  name: "Forgeboard",
  title: "Forgeboard – Project control for engineering and construction teams",
  description:
    "Forgeboard runs the paperwork of engineering projects in one system: tasks and schedules with dependencies, RFI and submittal logs, design reviews, decisions, files and team workload.",
  builder: "Luke Osman",
  year: 2026,
};

// Contact addresses come from environment variables (see .env.example), so no
// placeholder address ever ships. Each is null until it's set.
export const contact = {
  sales: process.env.NEXT_PUBLIC_SALES_EMAIL || null,
  support: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || null,
  security: process.env.NEXT_PUBLIC_SECURITY_EMAIL || null,
};

export const navLinks = [
  { label: "Product", href: "/#workflows" },
  { label: "Collaboration", href: "/#team" },
  { label: "Security", href: "/#security" },
  { label: "Pricing", href: "/#pricing" },
];
