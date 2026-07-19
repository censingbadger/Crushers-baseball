import { describe, expect, it } from "vitest";
import { parseRosterCsv } from "./roster";

// Synthetic fixture mirroring the organizing Sheet's Roster tab shape.
// All names fictional.
const CSV = [
  ",,,,,,,,,,",
  "Player Number,First Name,Last Name,Birthday,School,Parent/Guardian 1,Parent/Guardian  1 E-Mail,Parent/Guardian  1 Phone,Parent/Guardian 2,Parent/Guardian 2 E-Mail,Parent/Guardian  2 Phone",
  "2,Milo,Vance,03/31/2015,Hillside Elementary,Perry Vance,perry.vance@example.com,555-010-0100,Quinn Vance,quinn.vance@example.com,555-010-0101",
  "5,Theo,Ramos,2/7/15,North Elementary,Ana Ramos,ana.ramos@example.com,555-010-0200,,,",
  ",Jax,Turner,,,,jturner@example.com,,,,",
  "x,Sam,Whitfield,13/99/2015,,Pat Whitfield,not-an-email,12,,,",
].join("\n");

describe("parseRosterCsv", () => {
  const result = parseRosterCsv(CSV, 2026);

  it("finds all player rows below the header", () => {
    expect(result.rows.map((r) => r.firstName)).toEqual([
      "Milo",
      "Theo",
      "Jax",
      "Sam",
    ]);
  });

  it("parses jerseys, birthdays, school", () => {
    const milo = result.rows[0];
    expect(milo.jerseyNumber).toBe(2);
    expect(milo.birthdate).toBe("2015-03-31");
    expect(milo.school).toBe("Hillside Elementary");
    expect(milo.guardians).toHaveLength(2);
    expect(milo.guardians[0]).toEqual({
      firstName: "Perry",
      lastName: "Vance",
      email: "perry.vance@example.com",
      phone: "555-010-0100",
    });
  });

  it("expands two-digit birth years", () => {
    expect(result.rows[1].birthdate).toBe("2015-02-07");
  });

  it("keeps an email-only guardian with a placeholder name and warns", () => {
    const jax = result.rows[2];
    expect(jax.guardians).toHaveLength(1);
    expect(jax.guardians[0].email).toBe("jturner@example.com");
    expect(result.warnings.some((w) => w.includes("placeholder name"))).toBe(true);
  });

  it("warns on bad jersey, birthday, email, and phone instead of failing", () => {
    const sam = result.rows[3];
    expect(sam.jerseyNumber).toBeNull();
    expect(sam.birthdate).toBeNull();
    expect(sam.guardians[0].email).toBeNull();
    expect(sam.guardians[0].phone).toBeNull();
    expect(result.warnings.length).toBeGreaterThanOrEqual(4);
  });
});
