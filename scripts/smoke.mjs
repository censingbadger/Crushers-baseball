/*
 * Browser smoke test: drives login, roster/availability views, role
 * restrictions, and a live RSVP update against a running dev server with
 * the demo seed loaded.
 *
 *   npm run seed && npm run dev &
 *   node scripts/smoke.mjs
 *
 * Env: BASE_URL (default http://localhost:3000), CHROMIUM_PATH,
 * SHOTS_DIR (default .data/screenshots).
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SHOTS = process.env.SHOTS_DIR ?? ".data/screenshots";
mkdirSync(SHOTS, { recursive: true });
const fail = (msg) => {
  console.error("FAIL:", msg);
  process.exit(1);
};

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
});
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });

// Unauthenticated hit redirects to login.
await page.goto(BASE + "/");
await page.waitForURL("**/login");
await page.screenshot({ path: `${SHOTS}/01-login.png` });

// Coach login.
await page.fill("#email", "coach@demo.crushersblue.example");
await page.fill("#password", "dugout-demo");
await page.click("button[type=submit]");
await page.waitForURL(BASE + "/");
const heading = await page.textContent("h1");
if (!heading?.includes("Crushers Blue")) fail(`unexpected dashboard heading: ${heading}`);
await page.screenshot({ path: `${SHOTS}/02-dashboard.png`, fullPage: true });

// Roster shows coach-only guardian contact info.
await page.goto(BASE + "/roster");
const rosterText = await page.textContent("main");
if (!rosterText?.includes("Perry Vance")) fail("coach roster missing guardian contact");
await page.screenshot({ path: `${SHOTS}/03-roster.png`, fullPage: true });

// Availability grids render.
await page.goto(BASE + "/availability");
const availText = await page.textContent("main");
if (!availText?.includes("Tournament weekends")) fail("availability page incomplete");
await page.screenshot({ path: `${SHOTS}/04-availability.png`, fullPage: true });

// Import page reachable for coach.
await page.goto(BASE + "/import");
const importText = await page.textContent("main");
if (!importText?.includes("Roster tab")) fail("import page incomplete");

// Position matrix: blended view renders, per-coach tab is editable.
await page.goto(BASE + "/matrix");
const matrixText = await page.textContent("main");
if (!matrixText?.includes("Blended")) fail("matrix page incomplete");
if (!matrixText?.includes("Coach AB")) fail("matrix missing seeded coach tab");
await page.screenshot({ path: `${SHOTS}/06-matrix.png`, fullPage: true });
await page.goto(BASE + "/matrix?rater=AB");
const firstInput = page.locator("input[name='pos_P']").first();
await firstInput.fill("9");
await page.locator("table form button", { hasText: "Save" }).first().click();
await page.waitForTimeout(800);
await page.goto(BASE + "/matrix?rater=AB");
const savedVal = await page.locator("input[name='pos_P']").first().inputValue();
if (savedVal !== "9") fail(`matrix rating did not save (got "${savedVal}")`);

// Lineup lab: solver renders a full field from the seeded matrix.
await page.goto(BASE + "/lineup");
const lineupText = await page.textContent("main");
if (!lineupText?.includes("Strongest lineup")) fail("lineup page did not solve");
if (lineupText?.includes("unfilled")) fail("lineup left positions unfilled with a full pool");
await page.screenshot({ path: `${SHOTS}/07-lineup.png`, fullPage: true });

// Weekend planner: start a plan for the seeded tournament, save a line,
// verify the balance panel tracks it.
await page.goto(BASE + "/weekend");
// Index 0 is the "— choose —" placeholder; the seeded tournament is next.
await page.selectOption("#eventId", { index: 1 });
await page.click("form button[type=submit]:has-text('Start plan')");
await page.waitForURL("**/weekend?event=**");
const firstRow = page.locator("tbody tr").first();
const firstPlayerId = await firstRow.locator("input[name='playerId']").inputValue();
await page.selectOption(`select[name='posA_${firstPlayerId}']`, "C");
await page.fill(`input[name='inningsA_${firstPlayerId}']`, "20");
await page.fill(`input[name='pitch_${firstPlayerId}']`, "4");
await page.click("button:has-text('Save all')");
// The URL already matches before the POST resolves, so wait for the balance
// panel to reflect the saved line instead of waiting on navigation.
await page.locator("text=20/24").first().waitFor({ timeout: 15000 });
const weekendText = await page.textContent("main");
if (!weekendText?.includes("Position coverage")) fail("weekend balance panel missing");
await page.screenshot({ path: `${SHOTS}/08-weekend.png`, fullPage: true });

// Player edit page loads for the coach.
await page.goto(BASE + "/roster");
await page.click("tbody a[href^='/roster/']");
await page.waitForURL("**/roster/**");
const editText = await page.textContent("main");
if (!editText?.includes("Careful zone")) fail("player edit page incomplete");

// Rate Milo twice to build a trend (second save bumps hitting 4 -> 5).
await page.goto(BASE + "/rate");
await page.click("a:has-text('Milo Vance')");
await page.waitForURL("**/rate/**");
await page.click("label:has(input[name='dim_hitting'][value='4'])");
await page.click("label:has(input[name='dim_dugout'][value='5'])");
await page.click("button:has-text('Save ratings')");
await page.waitForURL("**/rate?done=**");
await page.click("a:has-text('Milo Vance')");
await page.waitForURL("**/rate/**");
await page.click("label:has(input[name='dim_hitting'][value='5'])");
await page.click("button:has-text('Save ratings')");
await page.waitForURL("**/rate?done=**");

// Aspirations and development notes on Milo's player page.
await page.goto(BASE + "/roster");
await page.click("a:has-text('Milo Vance')");
await page.waitForURL("**/roster/**");
await page.fill("#desiredPositions", "SS, P");
await page.fill("#seasonGoals", "Make the summer all-star team");
await page.click("button:has-text('Save goals')");
await page.waitForTimeout(700);
await page.fill("input[name='tendency']", "Drops glove on backhand");
await page.fill("input[name='cue']", "Quick glove to the dirt");
await page.check("input[name='shared']");
await page.click("button:has-text('Add note')");
await page.locator("text=Quick glove to the dirt").first().waitFor({ timeout: 15000 });
await page.fill("input[name='tendency']", "Coach-only observation");
await page.fill("input[name='cue']", "Secret cue text");
await page.click("button:has-text('Add note')");
await page.locator("text=Secret cue text").first().waitFor({ timeout: 15000 });

// Coach progress view shows the trend.
await page.goto(BASE + "/progress");
const coachProgress = await page.textContent("main");
if (!coachProgress?.includes("Hitting")) fail("progress missing rated dimension");
if (!coachProgress?.includes("4 · 5")) fail("progress missing rating trend points");
await page.screenshot({ path: `${SHOTS}/09-progress.png`, fullPage: true });

// Log out, log in as parent, RSVP for own player on the next practice.
await page.click("header form button");
await page.waitForURL("**/login");
await page.fill("#email", "parent@demo.crushersblue.example");
await page.fill("#password", "family-demo");
await page.click("button[type=submit]");
await page.waitForURL(BASE + "/");

// Parent must NOT see the Import nav or coach columns.
const nav = await page.textContent("header");
if (nav?.includes("Import")) fail("parent sees coach-only nav");
await page.goto(BASE + "/roster");
const parentRoster = await page.textContent("main");
if (parentRoster?.includes("Perry Vance")) fail("parent sees guardian contact info");

// Parent progress: own player only, shared content only.
await page.goto(BASE + "/progress");
const parentProgress = await page.textContent("main");
if (!parentProgress?.includes("Milo Vance")) fail("parent progress missing own player");
if (parentProgress?.includes("Eli Brooks")) fail("parent progress shows other players");
if (!parentProgress?.includes("Make the summer all-star team")) {
  fail("parent progress missing shared season goals");
}
if (!parentProgress?.includes("Quick glove to the dirt")) {
  fail("parent progress missing shared cue");
}
if (parentProgress?.includes("Secret cue text")) {
  fail("parent progress leaked a coach-only note");
}

// Open the first upcoming event and flip Milo to Maybe.
await page.goto(BASE + "/schedule");
await page.click("section a[href^='/schedule/']");
await page.waitForURL("**/schedule/**");
const row = page.locator("tr", { hasText: "Milo Vance" });
await row.locator("form button", { hasText: "Maybe" }).click();
await page.waitForTimeout(800);
const rowText = await row.textContent();
if (!rowText?.includes("Maybe")) fail("RSVP update did not stick");
await page.screenshot({ path: `${SHOTS}/05-event-parent.png`, fullPage: true });

console.log("SMOKE OK");
await browser.close();
process.exit(0);
