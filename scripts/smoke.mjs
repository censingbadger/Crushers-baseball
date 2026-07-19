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
import { mkdirSync, writeFileSync } from "node:fs";
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

// Availability grids render, with the weekend planner rollup.
await page.goto(BASE + "/availability");
const availText = await page.textContent("main");
if (!availText?.includes("Tournament weekends")) fail("availability page incomplete");
if (!availText?.includes("Best tournament weekends")) fail("weekend rollup missing");
if (!availText?.includes("can play")) fail("weekend rollup missing viability chip");
await page.screenshot({ path: `${SHOTS}/04-availability.png`, fullPage: true });

// Coach adds a candidate day, then removes it.
await page.fill("#day", "2026-09-12");
await page.click("button:has-text('Add day')");
await page.locator("th", { hasText: "9/12" }).waitFor({ timeout: 15000 });
await page.locator("th:has-text('9/12') button[title*='Remove']").click();
await page.waitForTimeout(1000);
const afterRemove = await page.textContent("main");
if (afterRemove?.includes("9/12")) fail("candidate day removal did not stick");

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

// Dugout dashboard: create a game (auto-seeded lineup), run game actions.
await page.goto(BASE + "/games");
await page.fill("#label", "Smoke Game");
await page.click("button:has-text('Create game')");
await page.waitForURL("**/game/**");
const fieldText = await page.textContent("main");
if (!fieldText?.includes("Batting order")) fail("dashboard missing batting order");
// All nine positions filled by the solver seed (no dashed empty slots).
const emptySlots = await page.locator("button:has-text('—')").count();
if (emptySlots > 0) fail(`dashboard left ${emptySlots} field slots empty`);
// Start the game, add pitches for the pitcher, score a run, take an out.
await page.click("button:has-text('Start game')");
await page.locator("button:has-text('Final')").waitFor({ timeout: 15000 });
await page.click("button:has-text('+5')");
await page.waitForTimeout(600);
await page.click("button:has-text('+1 Crushers')");
await page.waitForTimeout(600);
const liveText = await page.textContent("main");
if (!liveText?.includes("5 pitches")) fail("pitch count did not update");
if (!liveText?.includes("1–0") && !liveText?.includes("1–0".normalize())) {
  const score = await page.textContent("main");
  if (!score?.match(/1\s*–\s*0/)) fail("score did not update");
}
// Move the pitcher to the bench (tap pitcher, tap bench button).
const pitcherBtn = page.locator("button:has(span:text-is('P'))").first();
await pitcherBtn.click();
await page.click("button:has-text('send')");
await page.waitForTimeout(800);
const afterMove = await page.textContent("main");
if (!afterMove?.includes("P is empty")) fail("bench move did not vacate P");
// Cascade suggestion: fill P from the suggested bench candidates.
await page.locator("p:has-text('P is empty') button").first().click();
await page.waitForTimeout(800);
const refilled = await page.textContent("main");
if (refilled?.includes("P is empty")) fail("cascade suggestion did not fill P");
await page.screenshot({ path: `${SHOTS}/10-dugout.png`, fullPage: true });

// Stats: create a manual box score, enter a line, verify derived rates.
await page.goto(BASE + "/stats");
await page.fill("#label", "Smoke Scrimmage");
await page.fill("#gameDate", "2026-07-18");
await page.click("button:has-text('Create & enter stats')");
await page.waitForURL("**/stats/game/**");
const statRow = page.locator("tr", { hasText: "Milo Vance" }).first();
const statPid = await page.locator("input[name='playerId']").first().inputValue();
await page.fill(`input[name='ab_${statPid}']`, "3");
await page.fill(`input[name='h_${statPid}']`, "2");
await page.fill(`input[name='hr_${statPid}']`, "1");
await page.fill(`input[name='ip_${statPid}']`, "2.1");
await page.fill(`input[name='er_${statPid}']`, "1");
await page.fill(`input[name='pk_${statPid}']`, "4");
await page.locator("button:has-text('Save all')").first().click();
await page.waitForURL("**saved=1**");
await page.goto(BASE + "/stats");
const statsText = await page.textContent("main");
if (!statsText?.includes(".667")) fail("batting AVG not derived (expected .667)");
if (!statsText?.includes("2.1")) fail("pitching IP missing");
if (!statsText?.includes("2.57")) fail(`ERA not derived (expected 2.57)`);
await page.screenshot({ path: `${SHOTS}/12-stats.png`, fullPage: true });
void statRow;

// Coach progress view shows the trend.
await page.goto(BASE + "/progress");
const coachProgress = await page.textContent("main");
if (!coachProgress?.includes("Hitting")) fail("progress missing rated dimension");
if (!coachProgress?.includes("4 · 5")) fail("progress missing rating trend points");
await page.screenshot({ path: `${SHOTS}/09-progress.png`, fullPage: true });

// Monthly reports: draft for Milo (template fallback), review, publish.
await page.goto(BASE + "/reports");
const reportsText = await page.textContent("main");
if (!reportsText?.includes("Monthly parent reports")) fail("reports page incomplete");
await page
  .locator("section div", { hasText: "Milo Vance" })
  .locator("button:has-text('Generate draft')")
  .first()
  .click();
await page.waitForURL("**/reports/**");
const draftText = await page.inputValue("textarea[name='finalText']");
if (!draftText.includes("Dear Milo's family,")) fail("report draft missing greeting");
if (!draftText.includes("Major areas that we intend to focus on")) {
  fail("report draft missing letter structure");
}
if (!draftText.includes("Quick glove to the dirt")) {
  fail("report draft missing shared cue");
}
if (draftText.includes("Secret cue text")) fail("report draft leaked a coach-only note");
// Edit before publishing: coach's voice wins.
await page.fill(
  "textarea[name='finalText']",
  draftText.replace("Dear Milo's family,", "Dear Milo's family, (reviewed)"),
);
await page.click("button:has-text('Approve & publish')");
await page.waitForURL("**published=1**");
await page.screenshot({ path: `${SHOTS}/13-report.png`, fullPage: true });

// Drill library: coach loads the starter set (feeds guided workouts).
await page.goto(BASE + "/drills");
await page.click("button:has-text('Load starter drills')");
await page.locator("text=Long toss").first().waitFor({ timeout: 15000 });

// Family logins: generate for the seeded pending guardian, capture the
// one-time credentials for a real login later in the run.
await page.goto(BASE + "/families");
const famText = await page.textContent("main");
if (!famText?.includes("Dana Ramos")) fail("families page missing pending guardian");
await page.click("button:has-text('Generate 1 family login')");
await page.locator("[data-testid=cred-password]").first().waitFor({ timeout: 15000 });
const newFamilyEmail = (
  await page.locator("[data-testid=cred-email]").first().textContent()
)?.trim();
const newFamilyPassword = (
  await page.locator("[data-testid=cred-password]").first().textContent()
)?.trim();
if (!newFamilyEmail || !newFamilyPassword) fail("family credentials not shown");

// Admin: add a family member by hand, then revoke their access.
await page.fill("#fam-first", "Kim");
await page.fill("#fam-last", "Delgado");
await page.fill("#fam-email", "kim@demo.crushersblue.example");
await page.selectOption("#fam-player", { index: 1 });
await page.click("button:has-text('Add family member')");
await page.locator("[data-testid=new-member-password]").waitFor({ timeout: 15000 });
const kimPassword = (
  await page.locator("[data-testid=new-member-password]").textContent()
)?.trim();
await page
  .locator("tr", { hasText: "Kim Delgado" })
  .locator("button:has-text('revoke access')")
  .click();
await page
  .locator("tr", { hasText: "Kim Delgado" })
  .locator("text=revoked")
  .waitFor({ timeout: 15000 });

// Roles: promote Dana to coach, then demote back to parent.
await page
  .locator("tr", { hasText: "Dana Ramos" })
  .locator("button:has-text('make coach')")
  .click();
await page
  .locator("li", { hasText: "Dana Ramos" })
  .waitFor({ timeout: 15000 });
await page
  .locator("li", { hasText: "Dana Ramos" })
  .locator("button:has-text('make parent')")
  .click();
await page.waitForTimeout(1000);
const rolesAfter = await page.textContent("main");
if (rolesAfter?.match(/Coaches[\s\S]*Dana Ramos[\s\S]*Add a coach/)) {
  fail("demotion back to parent did not stick");
}
await page.screenshot({ path: `${SHOTS}/15-families.png`, fullPage: true });

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
if (!parentProgress?.includes("Monthly reports from the coaching staff")) {
  fail("parent progress missing published report section");
}
if (!parentProgress?.includes("Dear Milo's family, (reviewed)")) {
  fail("parent progress missing the published (edited) report text");
}

// Player pages: the parent can open exactly one page — Milo's.
await page.goto(BASE + "/players");
const openable = await page.locator("a[href^='/players/']").count();
if (openable !== 1) fail(`parent should open exactly 1 player page (got ${openable})`);
await page.click("a[href^='/players/']");
await page.waitForURL("**/players/**");
const heroName = await page.textContent("h1");
if (!heroName?.includes("Milo")) fail("parent player page is not Milo's");

// Guided workout: start 10 minutes, skip through, verify it logs.
await page.click("button:has-text('10 min')");
await page.locator("[data-testid=workout-timer]").waitFor({ timeout: 10000 });
for (let i = 0; i < 8; i++) {
  if ((await page.locator("button:has-text('Done early')").count()) === 0) break;
  await page.click("button:has-text('Done early')");
  await page.waitForTimeout(350);
}
await page.locator("text=Great work").waitFor({ timeout: 15000 });
await page.locator("text=Logged").waitFor({ timeout: 15000 });
const playerPageText = await page.textContent("main");
if (playerPageText?.includes("Secret cue text")) {
  fail("player page leaked a coach-only note");
}
if (!playerPageText?.includes("Quick glove to the dirt")) {
  fail("player page missing shared focus cue");
}
if (!playerPageText?.includes("My teammates")) fail("player page missing teammates");

// Customize: pick a look, attach a photo (browser-resized), save, verify
// the visible confirmation and the applied border.
await page.click("summary:has-text('Make it yours')");
await page.click("button[aria-label='Bubblegum']");
await page.click("button[aria-label='Green monster']");
const photoPath = `${SHOTS}/fixture-photo.png`;
writeFileSync(
  photoPath,
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  ),
);
await page.setInputFiles("#photo", photoPath);
await page.locator("text=Photo ready").waitFor({ timeout: 10000 });
await page.click("button:has-text('Save my page')");
await page.locator("[data-testid=save-status]").waitFor({ timeout: 15000 });
const saveStatus = await page.textContent("[data-testid=save-status]");
if (!saveStatus?.includes("Saved")) fail(`player page save failed: ${saveStatus}`);
await page.waitForTimeout(800);
const heroStyle = await page.locator("section").first().getAttribute("style");
if (!heroStyle?.includes("29, 122, 70")) {
  fail(`customized border not applied (got ${heroStyle})`);
}
await page.screenshot({ path: `${SHOTS}/14-playerpage.png`, fullPage: true });

// Parent taps Milo's first tournament-day cell; it cycles and persists.
await page.goto(BASE + "/availability");
const cell = page.locator("table").first().locator("button[data-cell]").first();
const cellId = await cell.getAttribute("data-cell");
const beforeTap = (await cell.textContent())?.trim();
await cell.click();
await page.waitForTimeout(1000);
const afterTap = (
  await page.locator(`button[data-cell='${cellId}']`).textContent()
)?.trim();
const CYCLE = { "·": "Y", Y: "?", "?": "N", N: "Y" };
if (afterTap !== CYCLE[beforeTap ?? "·"]) {
  fail(`availability tap did not cycle (${beforeTap} -> ${afterTap})`);
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

// The freshly generated family login works and is scoped to its own player.
await page.click("header form button");
await page.waitForURL("**/login");
await page.fill("#email", newFamilyEmail);
await page.fill("#password", newFamilyPassword);
await page.click("button[type=submit]");
await page.waitForURL(BASE + "/");
await page.goto(BASE + "/progress");
const danaProgress = await page.textContent("main");
if (!danaProgress?.includes("Theo Ramos")) {
  fail("generated family login does not see its own player");
}
if (danaProgress?.includes("Milo Vance")) {
  fail("generated family login sees another family's player");
}

// A revoked login must not work.
await page.click("header form button");
await page.waitForURL("**/login");
await page.fill("#email", "kim@demo.crushersblue.example");
await page.fill("#password", kimPassword ?? "");
await page.click("button[type=submit]");
await page.waitForURL("**error=invalid**");

// Self-service settings: Perry changes his password and Milo's details.
await page.fill("#email", "parent@demo.crushersblue.example");
await page.fill("#password", "family-demo");
await page.click("button[type=submit]");
await page.waitForURL(BASE + "/");
await page.goto(BASE + "/account");
await page.fill("#current", "family-demo");
await page.fill("#next", "family-demo-2");
await page.fill("#confirm", "family-demo-2");
await page.click("button:has-text('Update password')");
await page.waitForURL("**saved=password**");
await page.locator("input[name='school']").first().fill("Demo Elementary");
await page.locator('button:has-text("Save Milo")').click();
await page.waitForURL("**saved=player**");
// The new password signs in.
await page.click("header form button");
await page.waitForURL("**/login");
await page.fill("#email", "parent@demo.crushersblue.example");
await page.fill("#password", "family-demo-2");
await page.click("button[type=submit]");
await page.waitForURL(BASE + "/");

console.log("SMOKE OK");
await browser.close();
process.exit(0);
