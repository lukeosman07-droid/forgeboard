// Site-wide fallback while a page streams in.
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 animate-pulse space-y-4 px-4 py-24" aria-label="Loading">
      <div className="h-8 w-1/2 rounded bg-white/5" />
      <div className="h-4 w-3/4 rounded bg-white/5" />
      <div className="h-48 rounded-2xl bg-white/5" />
    </div>
  );
}
