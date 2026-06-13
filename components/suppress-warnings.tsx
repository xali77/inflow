"use client";

// Silences a short allowlist of benign, dev-only React warnings emitted by
// third-party libraries (not our code) — they render correctly and are stripped
// from production builds. Scoped to these exact messages so real warnings from
// our own components still surface.
//
//  - recharts spreads an `isActive` prop onto a DOM <div> (active dots/tooltip).
//  - @lifi/widget's TextFitter renders a valid SVG <text> React 19 over-flags.
if (typeof window !== "undefined") {
  const w = window as unknown as { __flowsWarnPatched?: boolean };
  if (!w.__flowsWarnPatched) {
    w.__flowsWarnPatched = true;
    const original = console.error;
    console.error = (...args: unknown[]) => {
      const head = typeof args[0] === "string" ? args[0] : "";
      const unknownTextTag =
        head.includes("is unrecognized in this browser") &&
        (head.includes("<text>") || args[1] === "text");
      const rechartsIsActive =
        head.includes("does not recognize the") &&
        args.some((a) => a === "isActive");
      if (unknownTextTag || rechartsIsActive) return;
      original(...(args as []));
    };
  }
}

export default function SuppressWarnings() {
  return null;
}
