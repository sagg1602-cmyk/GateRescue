/** Shown beside the synthetic-data label while GET /api/state is the dashboard source. */
export function LiveDataBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-ready-soft px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-ready ring-1 ring-inset ring-ready/30">
      <span className="h-1.5 w-1.5 rounded-full bg-ready" aria-hidden />
      Live data
    </span>
  );
}
