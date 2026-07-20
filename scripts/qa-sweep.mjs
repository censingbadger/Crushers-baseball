/*
 * Exploratory QA sweep: visits every page as coach and as parent, at
 * desktop and phone widths, and reports anything unhealthy — bad status,
 * console/page errors, Next error boundaries, or sideways scrolling.
 *
 *   npm run seed && npm run dev &
 *   node scripts/qa-sweep.mjs
 *
 * Env: BASE_URL (default http://localhost:3000), CHROMIUM_PATH,
 * SHOTS_DIR (default .data/qa). Exits 1 if any problem is found.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SHOTS = process.env.SHOTS_DIR ?? ".data/qa";
mkdirSync(SHOTS, { recursive: true });

const COACH_PAGES = [
  "/", "/schedule", "/schedule/new", "/roster", "/roster/new", "/players",
  "/availability", "/progress", "/stats", "/games", "/rate", "/reports",
  "/matrix", "/matrix?rater=AB", "/depth", "/practice", "/lineup", "/weekend", "/drills",
  "/families", "/import", "/account",
];
const PARENT_PAGES = [
  "/", "/schedule", "/roster", "/players", "/availability", "/progress",
  "/stats", "/account",
];
const VIEWPORTS = [
  { name: "desktop", width: 1180, height: 900 },
  { name: "phone", width: 390, height: 844 },
];

const problems = [];
const note = (where, what) => {
  problems.push(`${where}: ${what}`);
  console.error(`✗ ${where}: ${what}`);
};

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
});

async function login(page, email, password) {
  await page.goto(`${BASE}/login`);
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click("button[type=submit]");
  await page.waitForURL(`${BASE}/`);
}

async function sweep(role, email, password, pages) {
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
    });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text());
    });
    page.on("pageerror", (e) => consoleErrors.push(String(e)));
    await login(page, email, password);

    for (const path of pages) {
      consoleErrors.length = 0;
      const where = `${role}/${vp.name} ${path}`;
      let response;
      try {
        response = await page.goto(BASE + path, { timeout: 30000 });
      } catch (e) {
        note(where, `navigation failed: ${String(e).slice(0, 120)}`);
        continue;
      }
      const status = response?.status() ?? 0;
      if (status >= 400) note(where, `HTTP ${status}`);
      await page.waitForTimeout(350);
      const html = await page.content();
      if (html.includes("__next_error__")) note(where, "error boundary rendered");
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      if (overflow > 2) note(where, `horizontal overflow ${overflow}px`);
      const realErrors = consoleErrors.filter(
        (e) =>
          !e.includes("Failed to load resource") && // 404 favicons etc.
          !e.includes("shorthand"), // React style-shorthand dev warning
      );
      for (const e of realErrors.slice(0, 2)) {
        note(where, `console: ${e.slice(0, 140)}`);
      }
      const slug = `${role}-${vp.name}${path.replace(/[/?=]/g, "_")}`;
      await page.screenshot({ path: `${SHOTS}/${slug}.png`, fullPage: true });
    }
    await context.close();
  }
}

await sweep("coach", "coach@demo.crushersblue.example", "dugout-demo", COACH_PAGES);
await sweep("parent", "parent@demo.crushersblue.example", "family-demo", PARENT_PAGES);

// Dugout deep-pass: quick game → dashboard renders the field at both sizes.
{
  const context = await browser.newContext({ viewport: { width: 1180, height: 900 } });
  const page = await context.newPage();
  await login(page, "coach@demo.crushersblue.example", "dugout-demo");
  await page.goto(`${BASE}/games`);
  await page.selectOption("#eventId", "");
  await page.fill("#label", "QA Quick Game");
  await page.click("button:has-text('Create game')");
  try {
    await page.waitForURL("**/game/**", { timeout: 20000 });
    const text = await page.textContent("main");
    if (!text?.includes("Batting order")) note("dugout", "batting order missing");
    const empty = await page.locator("button:has-text('—')").count();
    if (empty > 0) note("dugout", `${empty} field slots empty after solver seed`);
    await page.screenshot({ path: `${SHOTS}/dugout-desktop.png`, fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(400);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    if (overflow > 2) note("dugout/phone", `horizontal overflow ${overflow}px`);
    await page.screenshot({ path: `${SHOTS}/dugout-phone.png`, fullPage: true });
  } catch (e) {
    note("dugout", `quick game failed: ${String(e).slice(0, 140)}`);
  }
  await context.close();
}

await browser.close();
writeFileSync(
  `${SHOTS}/report.txt`,
  problems.length ? problems.join("\n") + "\n" : "clean sweep\n",
);
if (problems.length > 0) {
  console.error(`\nQA SWEEP: ${problems.length} problem(s) — see ${SHOTS}/report.txt`);
  process.exit(1);
}
console.log("QA SWEEP CLEAN");
process.exit(0);
