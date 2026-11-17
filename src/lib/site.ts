// Shared site settings. Change values here and they update everywhere.
export const site = {
  name: "Forgeboard",
  title: "Forgeboard – The organized workspace for engineering teams",
  description:
    "Forgeboard is work management for engineering teams: table, board, calendar and timeline views, with AI that plans projects, turns meeting notes into tasks, and writes status reports.",
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
  { label: "Features", href: "/#features" },
  { label: "How It Works", href: "/#how-it-works" },
  { label: "Pricing", href: "/#pricing" },
];

export const legalLinks = [
  { label: "Terms", href: "/terms" },
  { label: "Privacy", href: "/privacy" },
  { label: "Security", href: "/security" },
  { label: "Contact", href: "/contact" },
];
