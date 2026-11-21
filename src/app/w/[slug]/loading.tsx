// In-app fallback: matches the header + content layout most dashboard pages use.
export default function DashboardLoading() {
  return (
    <div className="animate-pulse space-y-6" aria-label="Loading">
      <div className="h-8 w-64 rounded bg-white/5" />
      <div className="h-5 w-96 max-w-full rounded bg-white/5" />
      <div className="h-72 rounded-2xl bg-white/5" />
    </div>
  );
}
