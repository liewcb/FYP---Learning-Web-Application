interface OwlMarkProps {
  /**
   * "ivory" for dark backgrounds, "navy" for light ones, or "auto" to use
   * the surrounding text colour so it follows the light/dark theme.
   */
  readonly tone?: "ivory" | "navy" | "auto";
  /** Adds the gold perch line under the owl, as in the large brand mark. */
  readonly withPerch?: boolean;
  readonly className?: string;
}

const strokeColours = { ivory: "#EDE6D6", navy: "#1F2A44" } as const;
const gold = "#F2B544";

/**
 * The Athenix owl, drawn from public/logo/svg/athenix-mark-*.svg so it stays
 * sharp at any size. Decorative: the brand name is always shown next to it
 * or given as a label by the parent.
 */
export function OwlMark({ tone = "auto", withPerch = false, className }: OwlMarkProps) {
  const stroke = tone === "auto" ? "currentColor" : strokeColours[tone];
  const maskId = `athenix-moon-${tone}`;

  return (
    <svg
      className={className}
      viewBox={withPerch ? "16 6 100 112" : "22 6 94 106"}
      aria-hidden="true"
      focusable="false"
    >
      <mask id={maskId}>
        <rect width="120" height="120" fill="#fff" />
        <circle cx="103.5" cy="18" r="9" fill="#000" />
      </mask>
      <circle cx="98" cy="22" r="11" fill={gold} mask={`url(#${maskId})`} />
      <path
        d="M32 40 L45 49 Q60 44 75 49 L88 40 L86 68 Q84 100 60 108 Q36 100 34 68 Z"
        fill="none"
        stroke={stroke}
        strokeWidth="5"
        strokeLinejoin="round"
      />
      <circle cx="48.5" cy="68" r="10" fill="none" stroke={stroke} strokeWidth="5" />
      <circle cx="71.5" cy="68" r="10" fill="none" stroke={stroke} strokeWidth="5" />
      <circle cx="48.5" cy="68" r="4" fill={gold} />
      <circle cx="71.5" cy="68" r="4" fill={gold} />
      <path d="M56.5 81 L63.5 81 L60 87 Z" fill={stroke} />
      {withPerch ? (
        <path d="M22 113 L98 113" stroke={gold} strokeWidth="4.5" strokeLinecap="round" />
      ) : null}
    </svg>
  );
}
