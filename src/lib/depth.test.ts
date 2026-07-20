import { describe, expect, it } from "vitest";
import {
  ASPIRING_BONUS_DEVELOP,
  nextRole,
  roleWeighted,
  roleWeights,
  solverWeights,
} from "@/lib/depth";

describe("roleWeighted", () => {
  it("orders roles primary > secondary > blank > develop > emergency > never in compete", () => {
    const at = (role?: "primary" | "secondary" | "develop" | "emergency" | "never") =>
      roleWeighted(8, role, "compete");
    expect(at("primary")).toBeGreaterThan(at("secondary"));
    expect(at("secondary")).toBeGreaterThan(at(undefined));
    expect(at(undefined)).toBeGreaterThan(at("develop"));
    expect(at("develop")).toBeGreaterThan(at("emergency"));
    expect(at("emergency")).toBeGreaterThan(at("never"));
    expect(at("never")).toBe(0);
  });

  it("puts develop ahead of primary in develop mode and unlocks emergency", () => {
    expect(roleWeighted(6, "develop", "develop")).toBeGreaterThan(
      roleWeighted(6, "primary", "develop"),
    );
    expect(roleWeighted(6, "emergency", "develop")).toBeGreaterThan(
      roleWeighted(6, "emergency", "compete"),
    );
    // Never stays blocked no matter the mode.
    expect(roleWeighted(10, "never", "develop")).toBe(0);
  });

  it("adds the aspiration bonus only in develop mode", () => {
    const base = roleWeighted(5, undefined, "develop");
    expect(roleWeighted(5, undefined, "develop", true)).toBeCloseTo(
      base + ASPIRING_BONUS_DEVELOP,
    );
    expect(roleWeighted(5, undefined, "compete", true)).toBeCloseTo(
      roleWeighted(5, undefined, "compete"),
    );
  });
});

describe("roleWeights", () => {
  it("is dense over all nine positions with the ability floor of 1", () => {
    const w = roleWeights(["a"], { a: { SS: 7 } }, {}, "compete");
    expect(Object.keys(w.a)).toHaveLength(9);
    expect(w.a.LF).toBeCloseTo(1); // unrated → floor
  });

  it("is the identity when no roles are set — blank matrix = today's engine", () => {
    const w = roleWeights(
      ["a", "b"],
      { a: { SS: 9 }, b: { SS: 4 } },
      {},
      "compete",
    );
    expect(w.a.SS).toBe(9);
    expect(w.b.SS).toBe(4);
  });
});

describe("solverWeights", () => {
  it("values the same rating more at high-leverage spots in compete", () => {
    const w = solverWeights(["a"], { a: { SS: 8, LF: 8 } }, {}, "compete");
    expect(w.a.SS).toBeGreaterThan(w.a.LF);
  });

  it("flattens leverage in develop mode", () => {
    const compete = solverWeights(["a"], { a: { SS: 8, LF: 8 } }, {}, "compete");
    const develop = solverWeights(["a"], { a: { SS: 8, LF: 8 } }, {}, "develop");
    expect(develop.a.SS / develop.a.LF).toBeLessThan(compete.a.SS / compete.a.LF);
  });
});

describe("nextRole", () => {
  it("cycles blank → primary → secondary → develop → emergency → never → blank", () => {
    expect(nextRole(null)).toBe("primary");
    expect(nextRole("primary")).toBe("secondary");
    expect(nextRole("secondary")).toBe("develop");
    expect(nextRole("develop")).toBe("emergency");
    expect(nextRole("emergency")).toBe("never");
    expect(nextRole("never")).toBeNull();
  });
});
