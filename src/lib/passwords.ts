import { randomInt } from "node:crypto";

// Friendly starting passwords for family logins: three short baseball
// words plus a number — easy to read over the phone or print on a slip,
// strong enough for a first login (families can change them later).
const WORDS = [
  "glove", "bunt", "steal", "dinger", "mound", "cleat", "dugout", "slide",
  "curve", "rally", "swing", "homer", "triple", "scoop", "hustle", "chalk",
  "seams", "windup", "cutoff", "bullpen",
];

export function generatePassword(): string {
  const pick = () => WORDS[randomInt(WORDS.length)];
  const num = randomInt(10, 100);
  return `${pick()}-${pick()}-${num}`;
}
