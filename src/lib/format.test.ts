import { describe, expect, it } from "vitest";
import { initialsOf } from "./format";

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
