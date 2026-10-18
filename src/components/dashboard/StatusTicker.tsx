/**
 * Thin horizontally scrolling mono strip of terminal and job statuses from
 * existing data. Pauses on hover; static (single copy, no scroll) under
 * prefers-reduced-motion via globals.css. Display only.
 */
export function StatusTicker({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  const line = items.map((t) => t.toUpperCase());
  return (
    <div
      className="ticker group relative overflow-hidden border-x border-b border-line bg-white"
      role="marquee"
      aria-label="Terminal and job status"
    >
      <div className="ticker-track flex w-max whitespace-nowrap font-mono text-[11px] uppercase tracking-[0.14em] text-navy">
        <TickerCopy items={line} />
        <TickerCopy items={line} ariaHidden />
      </div>
    </div>
  );
}

function TickerCopy({ items, ariaHidden = false }: { items: string[]; ariaHidden?: boolean }) {
  return (
    <ul className={`flex ${ariaHidden ? "ticker-dup" : ""}`} aria-hidden={ariaHidden || undefined}>
      {items.map((text, i) => (
        <li key={`${text}-${i}`} className="flex items-center gap-4 py-2 pr-4">
          <span className="h-1.5 w-1.5 rounded-full bg-rust" aria-hidden />
          {text}
        </li>
      ))}
    </ul>
  );
}
