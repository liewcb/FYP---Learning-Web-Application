import { OwlMark } from "@/views/shared/owl-mark.view";

interface BrandLogoProps {
  /** "ivory" for dark backgrounds, "navy" for light ones. */
  readonly tone?: "ivory" | "navy";
  readonly className?: string;
}

export function BrandLogo({ tone = "navy", className }: BrandLogoProps) {
  return (
    <span className={`brand brand-${tone}${className ? ` ${className}` : ""}`}>
      <OwlMark tone={tone} className="brand-owl" />
      <span className="brand-name">Athenix</span>
    </span>
  );
}
