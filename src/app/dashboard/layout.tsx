import AppShell from "@/components/AppShell";

// Shared frame for the dashboard, project and billing pages.
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
