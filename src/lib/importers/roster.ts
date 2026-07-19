import Papa from "papaparse";
import { parseSheetDate, toIsoDate } from "./dates";

// Parses the Roster tab of the organizing Google Sheet, exported as CSV.
// Expected columns (header whitespace/newlines vary in real exports):
//   Player Number, First Name, Last Name, Birthday, School,
//   Parent/Guardian 1, Parent/Guardian 1 E-Mail, Parent/Guardian 1 Phone,
//   Parent/Guardian 2, Parent/Guardian 2 E-Mail, Parent/Guardian 2 Phone

export interface ImportedGuardian {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
}

export interface ImportedRosterRow {
  jerseyNumber: number | null;
  firstName: string;
  lastName: string;
  birthdate: string | null; // ISO date
  school: string | null;
  guardians: ImportedGuardian[];
}

export interface RosterImportResult {
  rows: ImportedRosterRow[];
  warnings: string[];
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeHeader(h: string): string {
  return h.replace(/\s+/g, " ").trim().toLowerCase();
}

function splitName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts[parts.length - 1],
  };
}

function looksLikePhone(v: string): boolean {
  const digits = v.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}

export function parseRosterCsv(csv: string, defaultYear: number): RosterImportResult {
  const warnings: string[] = [];
  const parsed = Papa.parse<string[]>(csv.trim(), { skipEmptyLines: true });
  if (parsed.errors.length > 0) {
    for (const e of parsed.errors.slice(0, 3)) {
      warnings.push(`CSV parse warning: ${e.message} (row ${e.row})`);
    }
  }
  const grid = parsed.data;
  if (grid.length === 0) return { rows: [], warnings: ["Empty file."] };

  // Find the header row: the first row containing "first name".
  const headerIdx = grid.findIndex((row) =>
    row.some((cell) => normalizeHeader(cell) === "first name"),
  );
  if (headerIdx === -1) {
    return {
      rows: [],
      warnings: ["Could not find a header row containing 'First Name'."],
    };
  }
  const header = grid[headerIdx].map(normalizeHeader);
  const col = (name: string) => header.indexOf(name);
  const idx = {
    number: col("player number"),
    first: col("first name"),
    last: col("last name"),
    birthday: col("birthday"),
    school: col("school"),
    g1: col("parent/guardian 1"),
    g1Email: col("parent/guardian 1 e-mail"),
    g1Phone: col("parent/guardian 1 phone"),
    g2: col("parent/guardian 2"),
    g2Email: col("parent/guardian 2 e-mail"),
    g2Phone: col("parent/guardian 2 phone"),
  };

  const rows: ImportedRosterRow[] = [];
  for (const raw of grid.slice(headerIdx + 1)) {
    const cell = (i: number) => (i >= 0 && raw[i] ? raw[i].trim() : "");
    const first = cell(idx.first);
    const last = cell(idx.last);
    if (!first && !last) continue;
    if (!first || !last) {
      warnings.push(
        `Skipped row with incomplete player name: "${raw.filter(Boolean).join(", ")}"`,
      );
      continue;
    }

    const numberRaw = cell(idx.number);
    const jerseyNumber =
      numberRaw && /^\d+$/.test(numberRaw) ? Number(numberRaw) : null;
    if (numberRaw && jerseyNumber === null) {
      warnings.push(`${first} ${last}: ignored jersey number "${numberRaw}".`);
    }

    let birthdate: string | null = null;
    const birthdayRaw = cell(idx.birthday);
    if (birthdayRaw) {
      const d = parseSheetDate(birthdayRaw, defaultYear);
      if (d) birthdate = toIsoDate(d);
      else warnings.push(`${first} ${last}: could not parse birthday "${birthdayRaw}".`);
    }

    const guardians: ImportedGuardian[] = [];
    for (const g of [
      { name: cell(idx.g1), email: cell(idx.g1Email), phone: cell(idx.g1Phone) },
      { name: cell(idx.g2), email: cell(idx.g2Email), phone: cell(idx.g2Phone) },
    ]) {
      if (!g.name && !g.email && !g.phone) continue;
      const email = g.email && EMAIL_RE.test(g.email) ? g.email.toLowerCase() : null;
      if (g.email && !email) {
        warnings.push(`${first} ${last}: ignored invalid email "${g.email}".`);
      }
      const phone = g.phone && looksLikePhone(g.phone) ? g.phone : null;
      if (g.phone && !phone) {
        warnings.push(`${first} ${last}: ignored invalid phone "${g.phone}".`);
      }
      if (!g.name) {
        if (email) {
          // Real sheets sometimes carry an email with no name; derive one.
          const local = email.split("@")[0];
          guardians.push({ firstName: local, lastName: "", email, phone });
          warnings.push(
            `${first} ${last}: guardian email "${email}" had no name; imported with a placeholder name.`,
          );
        }
        continue;
      }
      const { firstName, lastName } = splitName(g.name);
      guardians.push({ firstName, lastName, email, phone });
    }

    rows.push({
      jerseyNumber,
      firstName: first,
      lastName: last,
      birthdate,
      school: cell(idx.school) || null,
      guardians,
    });
  }

  return { rows, warnings };
}
