import { describe, expect, it } from "vitest";
import { generatePassword } from "./passwords";

describe("generatePassword", () => {
  it("produces word-word-number slips", () => {
    for (let i = 0; i < 50; i++) {
      expect(generatePassword()).toMatch(/^[a-z]+-[a-z]+-\d{2}$/);
    }
  });

  it("is long enough and varies", () => {
    const seen = new Set(Array.from({ length: 50 }, generatePassword));
    expect([...seen].every((p) => p.length >= 11)).toBe(true);
    expect(seen.size).toBeGreaterThan(10);
  });
});
