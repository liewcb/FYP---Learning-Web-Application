import { OwlMark } from "@/views/shared/owl-mark.view";

interface BrandLogoProps {
  /** "auto" follows the theme; "ivory"/"navy" force a colour. */
  readonly tone?: "ivory" | "navy" | "auto";
  readonly className?: string;
}

export function BrandLogo({ tone = "auto", className }: BrandLogoProps) {
  return (
    <span className={`brand brand-${tone}${className ? ` ${className}` : ""}`}>
      <OwlMark tone={tone} className="brand-owl" />
      <span className="brand-name">Athenix</span>
    </span>
  );
}
