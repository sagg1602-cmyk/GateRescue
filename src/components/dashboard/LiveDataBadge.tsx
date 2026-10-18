/** Shown beside the synthetic-data label while GET /api/state is the dashboard source. */
export function LiveDataBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-teal-50 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-teal-800 ring-1 ring-inset ring-teal-200">
      <span className="h-1.5 w-1.5 rounded-full bg-teal-500" aria-hidden />
      Live data
    </span>
  );
}
