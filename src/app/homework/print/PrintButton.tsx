"use client";

export function PrintButton() {
  return (
    <button className="btn btn-primary print-hide" onClick={() => window.print()}>
      🖨 Print
    </button>
  );
}
