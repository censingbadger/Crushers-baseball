import { describe, expect, it } from "vitest";
import { COALESCE_WINDOW_MS, shouldCoalesce } from "./gamelog";

const latest = { actor: "MC", coalesceKey: "pitches:p1:3", atMs: 1_000_000 };
const soon = latest.atMs + 5_000;

describe("shouldCoalesce", () => {
  it("folds a rapid same-coach burst of the same kind", () => {
    expect(
      shouldCoalesce(latest, { actor: "MC", coalesceKey: "pitches:p1:3" }, soon),
    ).toBe(true);
  });

  it("never folds across coaches — each screen's edits stay visible", () => {
    expect(
      shouldCoalesce(latest, { actor: "MB", coalesceKey: "pitches:p1:3" }, soon),
    ).toBe(false);
  });

  it("never folds different kinds of edits", () => {
    expect(shouldCoalesce(latest, { actor: "MC", coalesceKey: "order" }, soon)).toBe(
      false,
    );
    expect(shouldCoalesce(latest, { actor: "MC", coalesceKey: null }, soon)).toBe(false);
  });

  it("stops folding once the window passes", () => {
    expect(
      shouldCoalesce(
        latest,
        { actor: "MC", coalesceKey: "pitches:p1:3" },
        latest.atMs + COALESCE_WINDOW_MS + 1,
      ),
    ).toBe(false);
  });

  it("handles an empty trail", () => {
    expect(shouldCoalesce(null, { actor: "MC", coalesceKey: "order" }, soon)).toBe(false);
  });
});
