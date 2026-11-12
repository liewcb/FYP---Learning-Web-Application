"use client";

export function PrintReportButton() {
  return (
    <button className="button button-outline" type="button" onClick={() => window.print()}>
      Print / save as PDF
    </button>
  );
}
