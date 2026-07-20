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

// The slim coach menu: Game day, Roster, Performance — planning and admin
// live in Future preview now.
const headerText = await page.textContent("header");
if (headerText?.includes("Planning")) fail("coach nav still shows Planning group");
if (headerText?.includes("Admin")) fail("coach nav still shows Admin group");
if (!headerText?.includes("Performance")) fail("coach nav missing Performance group");

// Coach home is the four-needs launcher — no schedule hero, no parked links.
const homeText = await page.textContent("main");
for (const need of ["Game day", "Position matrix", "Roster", "Stats"]) {
  if (!homeText?.includes(need)) fail(`coach home missing "${need}" card`);
}
if (!homeText?.includes("Quick entry")) fail("coach home missing quick-entry shortcut");
if (homeText?.includes("Next up") || homeText?.includes("Full schedule")) {
  fail("coach home still shows the parked schedule hero");
}
await page.screenshot({ path: `${SHOTS}/02-dashboard.png`, fullPage: true });

// Roster: expandable card per player. The "everything" panel opens on
// tap and carries the coach-only guardian contacts + an edit affordance.
await page.goto(BASE + "/roster");
const rosterText = await page.textContent("main");
if (!rosterText?.includes("Perry Vance")) fail("coach roster missing guardian contact");
if ((await page.locator("main a:has-text('Edit')").count()) === 0)
  fail("roster cards missing the Edit link");
await page.locator("[data-testid=expand-everything]").first().click();
await page.waitForTimeout(300);
if (!(await page.locator("p:has-text('Parents & guardians')").first().isVisible()))
  fail("expanded roster card missing the guardians section");
if (!(await page.locator("main a:has-text('Edit')").first().isVisible()))
  fail("expanded roster card missing a visible Edit link");
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

// Position matrix: blended view is read-only; rating happens in quick entry.
await page.goto(BASE + "/matrix");
const matrixText = await page.textContent("main");
if (!matrixText?.includes("Position matrix")) fail("matrix page incomplete");
if (!matrixText?.includes("Rate players")) fail("matrix missing quick-entry button");
const gridInputs = await page.locator("main input").count();
if (gridInputs > 0) fail("blended matrix should have no editable inputs");
await page.screenshot({ path: `${SHOTS}/06-matrix.png`, fullPage: true });

// Quick entry: a tap saves under the signed-in coach's initials (Coach
// Demo → CD) and survives reload; Clear my row empties it again.
await page.goto(BASE + "/matrix/quick");
await page.locator("button[data-pos='P'][data-val='7']").click();
await page.waitForTimeout(800);
await page.goto(BASE + "/matrix/quick");
const tappedCls = await page
  .locator("button[data-pos='P'][data-val='7']")
  .first()
  .getAttribute("class");
if (!tappedCls?.includes("bg-team-orange")) fail("quick entry tap did not persist");
page.once("dialog", (d) => d.accept());
await page.locator("button:has-text('Clear my row')").click();
await page.waitForTimeout(800);
await page.goto(BASE + "/matrix/quick");
const clearedCls = await page
  .locator("button[data-pos='P'][data-val='7']")
  .first()
  .getAttribute("class");
if (clearedCls?.includes("bg-team-orange")) fail("clear my row did not clear");

// Depth chart: the role tap-grid. A tap cycles blank → primary and saves;
// reload proves persistence; five more taps cycle back to blank.
await page.goto(BASE + "/depth");
const depthPageText = await page.textContent("main");
if (!depthPageText?.includes("Depth chart")) fail("depth page incomplete");
if (!depthPageText?.includes("Never")) fail("depth legend missing");
const firstCell = page.locator("button[data-cell]").first();
const cellKey = await firstCell.getAttribute("data-cell");
await firstCell.click();
await page.waitForTimeout(800);
await page.goto(BASE + "/depth");
const cellAfter = page.locator(`button[data-cell='${cellKey}']`);
if ((await cellAfter.textContent())?.trim().charAt(0) !== "P") {
  fail("depth chart tap did not persist as primary");
}
// That primary now leads the roster card's position chips in orange.
await page.goto(BASE + "/roster");
if ((await page.locator("summary span[title^='Primary']").count()) === 0)
  fail("roster cards missing the depth-chart primary chip");
await page.goto(BASE + "/depth");
for (let i = 0; i < 5; i++) {
  await cellAfter.click();
  await page.waitForTimeout(250);
}
await page.waitForTimeout(800);
await page.goto(BASE + "/depth");
const cellCleared = await page
  .locator(`button[data-cell='${cellKey}']`)
  .textContent();
if (cellCleared?.trim().charAt(0) === "P") fail("depth chart cycle did not clear");
await page.screenshot({ path: `${SHOTS}/07-depth.png`, fullPage: true });

// Practice stations: with a full demo roster and no never-cells, every
// station gets at least one kid. (Reason chips need depth-chart calls,
// which the cycle test above cleared — structure is what we assert.)
await page.goto(BASE + "/practice");
const practiceText = await page.textContent("main");
if (!practiceText?.includes("Practice stations")) fail("practice page incomplete");
for (const pos of ["SS", "CF", "1B"]) {
  if (!practiceText?.includes(pos)) fail(`practice grid missing ${pos} station`);
}
if (practiceText?.includes("No one to station here"))
  fail("practice left a station empty with a full roster");
await page.screenshot({ path: `${SHOTS}/07b-practice.png`, fullPage: true });

// /lineup is retired — it forwards to Game day.
await page.goto(BASE + "/lineup");
await page.waitForURL("**/games");

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

// Player edit page loads for the coach (name in the card header links it).
await page.goto(BASE + "/roster");
await page.click("summary a[href^='/roster/']");
await page.waitForURL("**/roster/**");
const editText = await page.textContent("main");
if (!editText?.includes("Careful zone")) fail("player edit page incomplete");

// BARS feedback: dimension-first entry with the anchors on screen. Rate
// Milo's hitting (D1) twice to build a 4 -> 5 trend, and confirm the tap
// persists across a reload.
await page.goto(BASE + "/rate");
const rateIndex = await page.textContent("main");
if (!rateIndex?.includes("Response to failure")) fail("BARS dimension cards missing");
if (!rateIndex?.includes("Behaviorally anchored")) fail("BARS framing missing");
if (!rateIndex?.includes("Not observed")) fail("not-observed guidance missing");
await page.goto(BASE + "/rate/d1");
const d1Text = await page.textContent("main");
if (!d1Text?.includes("The standard")) fail("D1 anchors missing the standard marker");
if (!d1Text?.includes("Works counts")) fail("D1 level-4 anchor text missing");
const miloRow = page.locator("[data-player-row='Milo Vance']");
await miloRow.locator("button[data-level='4']").click();
await page.waitForTimeout(700);
await miloRow.locator("button[data-level='5']").click();
await page.waitForTimeout(700);
await page.goto(BASE + "/rate/d1");
const lvl5cls = await page
  .locator("[data-player-row='Milo Vance'] button[data-level='5']")
  .getAttribute("class");
if (!lvl5cls?.includes("bg-team-orange")) fail("BARS tap did not persist");
// Not observed is first-class: mark Eli N/O and make sure it sticks.
await page
  .locator("[data-player-row='Eli Brooks'] button[data-level='0']")
  .click();
await page.waitForTimeout(700);

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

// Practice squad is opt-in: Ryder (practice) isn't seeded into the game
// or its batting order, but one tap adds him — bench every inning, last
// batting spot — and from there he's a regular.
const orderBefore = await page.locator("ol").first().textContent();
if (orderBefore?.includes("Ryder")) fail("practice player seeded into the game by default");
if ((await page.locator("button:has-text('+ Ryder Q.')").count()) === 0)
  fail("practice player missing from the add-player chips");
await page.click("button:has-text('+ Ryder Q.')");
await page.waitForTimeout(1000);
const orderAfter = await page.locator("ol").first().textContent();
if (!orderAfter?.includes("Ryder")) fail("added practice player missing from batting order");
// Batting order generator: applies an order and explains its choices.
page.once("dialog", (d) => d.accept());
await page.click("button:has-text('Suggest order')");
await page.waitForTimeout(1000);
const orderText = await page.textContent("main");
if (!orderText?.includes("leadoff")) fail("batting order generator notes missing");
// No scoring/clock UI — GameChanger records games. The board plans:
// pitch counting (safety) still works.
const stripText = await page.textContent("main");
if (stripText?.includes("Start game") || stripText?.match(/1\s*–\s*0|Crushers\s*\+1/))
  fail("scorekeeping UI should be gone");
// Game-context dial (depth chart modes) lives in the coach strip.
if ((await page.locator("[data-testid='mode-toggle']").count()) !== 1)
  fail("mode toggle missing from coach view");
if (!stripText?.includes("Up big")) fail("develop mode button missing");
await page.click("button:has-text('+5')");
await page.waitForTimeout(600);
const liveText = await page.textContent("main");
if (!liveText?.includes("5 pitches")) fail("pitch count did not update");

// ⚡ Auto-arrange (the Lineup lab, absorbed): field stays fully staffed.
page.once("dialog", (d) => d.accept());
await page.click("button:has-text('Auto-arrange')");
await page.waitForTimeout(1000);
const afterArrange = await page.locator("button:has-text('—')").count();
if (afterArrange > 0) fail("auto-arrange left slots empty");

// Dugout board: the player-safe view — no suggestions, no pitch numbers.
await page.click("button:has-text('Dugout board')");
await page.waitForTimeout(300);
const boardText = await page.textContent("main");
if (boardText?.includes("Coach's assist")) fail("board mode shows suggestions");
if (boardText?.includes("left today")) fail("board mode shows pitch numbers");
if (boardText?.includes("Up big")) fail("board mode shows the mode toggle");
if (!boardText?.includes("Batting order")) fail("board mode missing batting order");
await page.screenshot({ path: `${SHOTS}/10b-board.png`, fullPage: true });
await page.click("button:has-text('Coach view')");
await page.waitForTimeout(300);

// The "who's up" marker: starts at batter 1, advances by tap, and the
// spot lives server-side so every dugout device agrees after reload.
const upRow1 = await page
  .locator("li", { has: page.locator("span:text-is('Up')") })
  .first()
  .textContent();
if (!upRow1?.includes("1.")) fail("up-now marker should start at batter 1");
await page.click("[data-testid=next-batter]");
await page.waitForTimeout(900);
await page.reload();
await page.waitForTimeout(800);
const upRowAfter = await page
  .locator("li", { has: page.locator("span:text-is('Up')") })
  .first()
  .textContent();
if (!upRowAfter?.includes("2.")) fail("Next batter did not persist the marker server-side");

// Pitching-first game plan: declare a different arm for inning 2, plan
// the whole game, and the stepper shows the new pitcher in inning 2 with
// every slot filled.
await page.click("summary:has-text('Pitching plan')");
const planSelects = page.locator("[data-testid=pitch-plan] select");
const inn1Pitcher = await planSelects.nth(0).inputValue();
const inn2Options = await planSelects
  .nth(1)
  .locator("option")
  .evaluateAll((os) => os.map((o) => ({ v: o.value, t: o.textContent })));
const alt = inn2Options.find((o) => o.v && o.v !== inn1Pitcher && !o.t?.includes("resting"));
if (!alt) fail("no alternate pitcher available for the plan test");
await planSelects.nth(1).selectOption(alt.v);
page.once("dialog", (d) => d.accept());
await page.click("button:has-text('Plan all')");
await page.waitForTimeout(1800);
// Step to inning 2: the declared arm is on the mound, field fully staffed.
await page.locator("button:has-text('▶')").first().click();
await page.waitForTimeout(900);
const inn2Empty = await page.locator("button:has-text('—')").count();
if (inn2Empty > 0) fail(`game plan left ${inn2Empty} slots empty in inning 2`);
const pChip2 = await page.locator("button:has(span:text-is('P'))").first().textContent();
const altFirst = alt.t?.split(" · ")[0] ?? "";
if (!pChip2?.includes(altFirst)) fail(`inning 2 pitcher should be ${altFirst}, chip says: ${pChip2}`);
// Back to inning 1 — its pitcher was pinned to the original arm.
await page.locator("button:has-text('◀')").first().click();
await page.waitForTimeout(900);
await page.screenshot({ path: `${SHOTS}/10c-pitch-plan.png`, fullPage: true });

// The plan outranks Auto-arrange: run it from inning 1, and inning 2
// must still show the declared alt arm — the solver arranges AROUND
// each inning's planned pitcher, never over him.
page.once("dialog", (d) => d.accept());
await page.click("button:has-text('Auto-arrange')");
await page.waitForTimeout(1800);
await page.locator("button:has-text('▶')").first().click();
await page.waitForTimeout(900);
const pChipAuto = await page.locator("button:has(span:text-is('P'))").first().textContent();
if (!pChipAuto?.includes(altFirst))
  fail(`auto-arrange overrode the pitching plan: inning 2 P should be ${altFirst}, chip says: ${pChipAuto}`);
const autoEmpty = await page.locator("button:has-text('—')").count();
if (autoEmpty > 0) fail(`auto-arrange left ${autoEmpty} slots empty in inning 2`);
await page.locator("button:has-text('◀')").first().click();
await page.waitForTimeout(900);

// Move the pitcher to the bench (tap pitcher, tap bench button).
const pitcherBtn = page.locator("button:has(span:text-is('P'))").first();
await pitcherBtn.click();
// Selecting a fielder shows that position's depth chart in the island.
await page.waitForTimeout(300);
const depthText = await page.textContent("main");
if (!depthText?.includes("P depth")) fail("depth chart missing for selected P");
if (!depthText?.includes("✎ Depth chart")) fail("island missing the depth chart link");
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

// Drag & drop: pull the catcher to the bench with the mouse; the assist
// island must flag the hole and its best suggestion must refill it.
const cChip = page.locator("button:has(span:text-is('C'))").first();
const cBox = await cChip.boundingBox();
const bBox = await page.locator("[data-drop='BENCH']").boundingBox();
await page.mouse.move(cBox.x + cBox.width / 2, cBox.y + cBox.height / 2);
await page.mouse.down();
await page.mouse.move(bBox.x + 50, bBox.y + 14, { steps: 10 });
await page.mouse.up();
await page.waitForTimeout(900);
const afterDrag = await page.textContent("main");
if (!afterDrag?.includes("C is empty")) fail("drag to bench did not vacate C");
if (!afterDrag?.includes("Coach's assist")) fail("assist island missing");
await page.locator("p:has-text('C is empty') button").first().click();
await page.waitForTimeout(900);
const afterAssist = await page.textContent("main");
if (afterAssist?.includes("C is empty")) fail("assist fill did not refill C");

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

// GameChanger portal, combined web export: ONE wide file (banner row +
// every section side by side) fills all four tables. Non-players' all-zero
// section rows are dropped, so pitching/catching count only Milo.
const gcCombined = [
  ",,,Batting,,,,,,,,,,,,,Pitching,,,,,,,,,,,Fielding,,,,,,,,,,,,",
  "Number,Last,First,GP,AB,H,2B,3B,HR,RBI,R,BB,SO,SB,HBP,SF,IP,GP,BF,#P,H,R,ER,BB,SO,ERA,WHIP,TC,A,PO,FPCT,E,DP,INN,PB,SB,SBATT,CS,CS%",
  "1,Vance,Milo,2,4,2,1,0,0,3,2,1,1,1,0,0,1.2,1,8,30,2,1,1,2,3,4.20,1.80,5,2,3,1.000,0,1,3.0,1,2,3,1,33.3",
  "2,Brooks,Eli,2,3,1,0,0,0,0,1,0,2,0,0,0,0.0,0,0,0,0,0,0,0,0,-,-,2,0,1,.500,1,0,0.0,0,0,0,0,-",
  "Totals,,,2,7,3,1,0,0,3,3,1,3,1,0,0,1.2,1,8,30,2,1,1,2,3,4.20,1.80,7,2,4,.857,1,1,3.0,1,2,3,1,33.3",
  "Glossary,,,GP = Games played,AB = At bats,H = Hits",
].join("\n");
await page.locator("[data-testid=gc-portal] input[type=file]").setInputFiles([
  { name: "combined.csv", mimeType: "text/csv", buffer: Buffer.from(gcCombined) },
]);
await page.locator("[data-testid=gc-result]").waitFor({ timeout: 20000 });
const gcCombinedResult = await page.textContent("[data-testid=gc-result]");
if (!gcCombinedResult?.includes("combined export"))
  fail(`gc combined drop not recognized: ${gcCombinedResult}`);
if (!gcCombinedResult?.match(/2 batting/)) fail("gc combined batting count off");
if (!gcCombinedResult?.match(/1 pitching/)) fail("gc combined pitching count off");
if (!gcCombinedResult?.match(/2 fielding/)) fail("gc combined fielding count off");
if (!gcCombinedResult?.match(/1 catching/)) fail("gc combined catching count off");

// GameChanger portal: drop batting + pitching CSVs together; the server
// sniffs which is which and imports both as the replaceable GC snapshot.
const gcBatting = [
  "Last,First,AB,R,H,2B,3B,HR,RBI,BB,K,SB",
  "Vance,Milo,6,2,3,1,0,1,4,1,2,1",
  "Brooks,Eli,5,1,1,0,0,0,0,2,1,0",
].join("\n");
// Pitching in GC's INN/ERA header style (no IP column) — the variant that
// slipped past the first detector in the field.
const gcPitching = [
  "Last,First,GP,INN,H,R,ER,BB,SO,ERA,WHIP",
  "Castillo,Leo,3,4.2,4,3,2,3,7,2.57,1.50",
].join("\n");
const gcFielding = ["Last,First,TC,PO,A,E,DP,FPCT", "Porter,Max,24,15,7,2,1,.917"].join("\n");
const gcCatching = ["Last,First,INN,PB,SB,CS,CS%", "Brooks,Eli,21.2,3,7,4,.364"].join("\n");
await page.locator("[data-testid=gc-portal] input[type=file]").setInputFiles([
  { name: "batting.csv", mimeType: "text/csv", buffer: Buffer.from(gcBatting) },
  { name: "pitching.csv", mimeType: "text/csv", buffer: Buffer.from(gcPitching) },
  { name: "fielding.csv", mimeType: "text/csv", buffer: Buffer.from(gcFielding) },
  { name: "catching.csv", mimeType: "text/csv", buffer: Buffer.from(gcCatching) },
]);
// The combined result is still on screen — wait for THIS drop's summary.
await page
  .locator("[data-testid=gc-result] p:has-text('batting.csv')")
  .waitFor({ timeout: 20000 });
const gcResult = await page.textContent("[data-testid=gc-result]");
if (!gcResult?.match(/2 batting lines/)) fail(`gc portal batting import off: ${gcResult}`);
if (!gcResult?.match(/1 pitching lines/)) fail("gc portal pitching import off");
if (!gcResult?.match(/1 fielding lines/)) fail("gc portal fielding import off");
if (!gcResult?.match(/1 catching lines/)) fail("gc portal catching import off");
// The tables re-render after the action's revalidate — wait for the
// per-kind values (which differ from the combined drop's) to land
// before reading, or this read races the refresh.
await page.getByText("4.2", { exact: false }).first().waitFor({ timeout: 15000 });
await page.getByText(".917", { exact: false }).first().waitFor({ timeout: 15000 });
await page.getByText("21.2", { exact: false }).first().waitFor({ timeout: 15000 });
const statsAfterGc = await page.textContent("main");
if (!statsAfterGc?.includes(".500")) fail("GC batting not in tables (Milo 3-for-6 → .500)");
if (!statsAfterGc?.includes("4.2")) fail("GC pitching not in tables (Leo 4.2 IP)");
if (!statsAfterGc?.includes(".917")) fail("GC fielding not in tables (Max FPCT .917)");
if (!statsAfterGc?.includes("21.2")) fail("GC catching not in tables (Eli 21.2 INN)");

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
// Reports live under Performance now — no Future-preview banner here.
if (reportsText?.includes("not in use yet")) fail("reports still carry the preview banner");
await page
  .locator("section div", { hasText: "Milo Vance" })
  .locator("button:has-text('Generate draft')")
  .first()
  .click();
await page.waitForURL("**/reports/**");
const draftText = await page.inputValue("textarea[name='finalText']");
if (!draftText.includes("Dear Milo's family,")) fail("report draft missing greeting");
// The draft carries the BARS data and the scale explanation.
if (!draftText.includes("How to read our development levels"))
  fail("report draft missing the BARS explanation");
if (!draftText.toLowerCase().includes("takes a plan to the plate"))
  fail("report draft missing the anchor language for Milo's hitting");
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

// Drill library: seeded with the starter set (feeds guided workouts);
// the one-click loader appears only on an empty library.
await page.goto(BASE + "/drills");
if ((await page.locator("button:has-text('Load starter drills')").count()) > 0) {
  await page.click("button:has-text('Load starter drills')");
}
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

// Restore the seeded password so later suites (qa-sweep) can log in.
await page.goto(BASE + "/account");
await page.fill("#current", "family-demo-2");
await page.fill("#next", "family-demo");
await page.fill("#confirm", "family-demo");
await page.click("button:has-text('Update password')");
await page.waitForURL("**saved=password**");

console.log("SMOKE OK");
await browser.close();
process.exit(0);
