import { describe, expect, it } from "vitest";
import { initialsOf, relTime } from "./format";

describe("initialsOf", () => {
  it("takes first + last initials", () => {
    expect(initialsOf("Mike Christian")).toBe("MC");
    expect(initialsOf("Mike Bressan")).toBe("MB");
    expect(initialsOf("Adam Lovelady")).toBe("AL");
  });

  it("uses the final word of multi-part names", () => {
    expect(initialsOf("Owen Hayes-Brown")).toBe("OH");
    expect(initialsOf("Mary Jo Vance")).toBe("MV");
  });

  it("handles single names and stray spaces", () => {
    expect(initialsOf("Coach")).toBe("CO");
    expect(initialsOf("  Pat  Curran  ")).toBe("PC");
  });
});

describe("relTime", () => {
  it("rounds down honestly across the ranges", () => {
    expect(relTime(1000, 5_000)).toBe("just now");
    expect(relTime(0, 45_000)).toBe("45s ago");
    expect(relTime(0, 90_000)).toBe("1m ago");
    expect(relTime(0, 59 * 60_000)).toBe("59m ago");
    expect(relTime(0, 125 * 60_000)).toBe("2h 05m ago");
  });

  it("clamps clock skew to just now", () => {
    expect(relTime(10_000, 5_000)).toBe("just now");
  });
});
