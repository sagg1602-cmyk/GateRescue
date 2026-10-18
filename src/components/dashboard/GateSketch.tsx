/**
 * Original line drawing: two stacked containers beside a terminal gate with a
 * boom barrier, an "A" sign and a clipboard on a post. Thin navy strokes with
 * light hatching. Decorative only (aria-hidden). When `open` is true the boom
 * lifts 40 degrees (CSS transform in globals.css, 600ms ease, reduced-motion safe).
 */
export function GateSketch({ open, className = "" }: { open: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 50 520 235"
      className={`h-auto w-full ${className}`}
      aria-hidden
      focusable="false"
      fill="none"
      stroke="#0f1d33"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <defs>
        <pattern id="gr-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="#0f1d33" strokeWidth="0.7" opacity="0.35" />
        </pattern>
        <pattern id="gr-hatch-light" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
          <line x1="0" y1="0" x2="0" y2="8" stroke="#0f1d33" strokeWidth="0.6" opacity="0.22" />
        </pattern>
      </defs>

      {/* ground line, slightly uneven like a quick pen stroke */}
      <path d="M8 262 C 120 260, 240 264, 512 261" />
      <path d="M40 272 L 92 272 M 300 270 L 360 270 M 420 273 L 470 273" opacity="0.5" />

      {/* lower container, in slight perspective */}
      <g>
        <path d="M30 170 L 230 170 L 230 258 L 30 258 Z" />
        <path d="M230 170 L 262 152 L 262 240 L 230 258" />
        <path d="M30 170 L 62 152 L 262 152" />
        <rect x="236" y="162" width="20" height="78" fill="url(#gr-hatch)" stroke="none" transform="skewY(-29.3)" opacity="0.9" />
        {/* corrugation */}
        {Array.from({ length: 13 }, (_, i) => 44 + i * 14).map((x) => (
          <path key={x} d={`M${x} 178 L ${x} 250`} opacity="0.55" />
        ))}
        {/* door seam and bars */}
        <path d="M30 170 L 30 258 M 38 180 L 38 250 M 54 180 L 54 250" />
        <rect x="30" y="236" width="200" height="22" fill="url(#gr-hatch-light)" stroke="none" />
        {/* id plate */}
        <rect x="168" y="178" width="52" height="16" />
        <path d="M174 186 L 214 186" strokeWidth="1" opacity="0.6" />
        {/* corner castings */}
        <rect x="30" y="170" width="8" height="8" fill="#0f1d33" stroke="none" />
        <rect x="222" y="170" width="8" height="8" fill="#0f1d33" stroke="none" />
        <rect x="30" y="250" width="8" height="8" fill="#0f1d33" stroke="none" />
        <rect x="222" y="250" width="8" height="8" fill="#0f1d33" stroke="none" />
      </g>

      {/* upper container, offset a little so the stack reads as stacked */}
      <g>
        <path d="M36 82 L 236 82 L 236 170 L 36 170" />
        <path d="M236 82 L 268 64 L 268 152 L 236 170" />
        <path d="M36 82 L 68 64 L 268 64" />
        <path d="M68 64 L 68 152" opacity="0.4" />
        <rect x="242" y="74" width="20" height="78" fill="url(#gr-hatch)" stroke="none" transform="skewY(-29.3)" opacity="0.9" />
        {Array.from({ length: 13 }, (_, i) => 50 + i * 14).map((x) => (
          <path key={x} d={`M${x} 90 L ${x} 162`} opacity="0.55" />
        ))}
        <rect x="36" y="82" width="200" height="14" fill="url(#gr-hatch-light)" stroke="none" />
        <path d="M44 150 L 100 150 M 44 156 L 84 156" strokeWidth="1" opacity="0.6" />
        <rect x="36" y="82" width="8" height="8" fill="#0f1d33" stroke="none" />
        <rect x="228" y="82" width="8" height="8" fill="#0f1d33" stroke="none" />
        <rect x="36" y="162" width="8" height="8" fill="#0f1d33" stroke="none" />
        <rect x="228" y="162" width="8" height="8" fill="#0f1d33" stroke="none" />
      </g>

      {/* gate house */}
      <g>
        <path d="M318 262 L 318 176 L 392 176 L 392 262" />
        <path d="M312 176 L 398 176 L 398 168 L 312 168 Z" />
        <path d="M392 176 L 412 164 L 412 254 L 392 262" />
        <path d="M398 168 L 418 156 L 412 164" />
        <rect x="392" y="178" width="20" height="78" fill="url(#gr-hatch)" stroke="none" transform="skewY(-31)" opacity="0.8" />
        {/* window with a lamp glow kept as hatching, not colour */}
        <rect x="334" y="192" width="40" height="28" />
        <path d="M354 192 L 354 220 M 334 206 L 374 206" strokeWidth="1" opacity="0.7" />
        {/* door */}
        <path d="M344 262 L 344 232 L 366 232 L 366 262" />
        <circle cx="361" cy="248" r="1.2" fill="#0f1d33" stroke="none" />
        {/* "A" sign on a short post above the roof */}
        <path d="M355 168 L 355 148" />
        <rect x="341" y="124" width="28" height="24" />
        <path d="M349 144 L 355 130 L 361 144 M 351.5 139 L 358.5 139" strokeWidth="1.6" />
      </g>

      {/* barrier post and boom arm. The arm pivots about (438, 214). */}
      <g>
        <rect x="430" y="214" width="16" height="48" />
        <rect x="430" y="214" width="16" height="48" fill="url(#gr-hatch-light)" stroke="none" />
        <path d="M424 262 L 452 262" />
        <circle cx="438" cy="214" r="4" />
        <g className={`gate-boom ${open ? "gate-boom-open" : ""}`}>
          {/* arm, drawn to the right of the pivot; counterweight to the left */}
          <path d="M442 211 L 512 211 L 512 217 L 442 217 Z" />
          <path d="M434 211 L 426 211 L 426 217 L 434 217 Z" fill="#0f1d33" stroke="none" />
          {/* stripes */}
          {[454, 470, 486, 502].map((x) => (
            <path key={x} d={`M${x} 211 L ${x + 6} 217`} strokeWidth="1.2" />
          ))}
          <path d="M506 217 L 506 236" opacity="0.5" />
        </g>
      </g>

      {/* clipboard on a post, left of the barrier */}
      <g>
        <path d="M296 262 L 296 206" />
        <path d="M290 262 L 302 262" />
        <rect x="282" y="178" width="28" height="34" rx="1.5" />
        <rect x="291" y="174" width="10" height="7" rx="1" />
        <path d="M288 190 L 304 190 M 288 196 L 304 196 M 288 202 L 299 202" strokeWidth="1" opacity="0.7" />
      </g>

      {/* a few stray pen ticks for the hand-drawn feel */}
      <path d="M20 250 L 24 246 M 490 250 L 494 254 M 286 128 L 294 124" opacity="0.5" />
    </svg>
  );
}
