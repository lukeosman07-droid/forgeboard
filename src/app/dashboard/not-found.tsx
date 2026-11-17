import NotFoundScreen from "@/components/NotFoundScreen";

// Shown inside the app frame, e.g. for a project that was deleted.
export default function DashboardNotFound() {
  return (
    <NotFoundScreen
      text="This project or page doesn't exist, or you don't have access to it."
      href="/dashboard"
      label="Back to dashboard"
    />
  );
}
