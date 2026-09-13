// End-to-end multi-device sync test against the REAL running server, using
// two isolated browser contexts (separate localStorage/cookies, exactly like
// two different phones) to prove: a word/category added from one device's
// admin panel appears on the other device automatically, without reloading
// the page or touching the first device again.
const { chromium } = require("playwright");

const BASE = "http://127.0.0.1:3000";

function click(el) { return el.click(); }

async function loginAdmin(page) {
  await page.click('button:has-text("Espace parent")');
  for (const d of "1234") {
    await page.click(`.key-btn:text-is("${d}")`);
    await page.waitForTimeout(50);
  }
  await page.waitForSelector('h2:has-text("Espace parent")', { timeout: 3000 });
}

(async () => {
  const browser = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    args: ["--no-sandbox"]
  });

  const ctxParent = await browser.newContext();
  const ctxChild = await browser.newContext();
  const parent = await ctxParent.newPage();
  const child = await ctxChild.newPage();

  parent.on("pageerror", (e) => { console.error("PARENT PAGE ERROR:", e); process.exitCode = 1; });
  child.on("pageerror", (e) => { console.error("CHILD PAGE ERROR:", e); process.exitCode = 1; });

  await parent.goto(BASE, { waitUntil: "networkidle" });
  await child.goto(BASE, { waitUntil: "networkidle" });

  console.log("category picker visible on child before change:", await child.locator(".cat-scroll").count() > 0);

  // Parent adds a new category + word via the admin panel
  await loginAdmin(parent);
  await parent.click('.tab-btn:has-text("Catégories")');
  await parent.fill("#new-cat-name", "La nourriture");
  await parent.fill("#new-cat-emoji", "🍎");
  await parent.click('button:has-text("Ajouter la catégorie")');
  await parent.waitForTimeout(300);

  await parent.click('.tab-btn:has-text("Mots")');
  await parent.selectOption("#new-cat", { label: "🍎 La nourriture" });
  await parent.fill("#new-fr", "La pomme");
  await parent.fill("#new-nl", "De appel");
  await parent.click('button:has-text("Ajouter le mot")');
  await parent.waitForTimeout(300);

  // Verify the parent device itself sees it immediately (no server round-trip needed there)
  const parentWordCount = await parent.locator(".word-row").count();
  console.log("parent sees word rows after adding:", parentWordCount);

  // The CHILD device has NOT reloaded and did nothing manually.
  // Force what the periodic 25s poll / visibilitychange handler would do,
  // by dispatching a visibilitychange event (same code path), then wait a beat.
  await child.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await child.waitForTimeout(700);

  const childHasCatPicker = await child.locator(".cat-scroll").count() > 0;
  const childChips = await child.locator(".cat-chip").allTextContents();
  console.log("child now sees category picker:", childHasCatPicker, "chips:", childChips.map(s => s.trim()));

  // Also confirm a fresh THIRD device (never opened before) gets it straight away on load
  const ctxFresh = await browser.newContext();
  const fresh = await ctxFresh.newPage();
  fresh.on("pageerror", (e) => { console.error("FRESH PAGE ERROR:", e); process.exitCode = 1; });
  await fresh.goto(BASE, { waitUntil: "networkidle" });
  await fresh.waitForTimeout(500);
  const freshChips = await fresh.locator(".cat-chip").allTextContents();
  console.log("fresh device (first ever load) sees chips:", freshChips.map(s => s.trim()));

  // Now verify PROGRESS also syncs: child plays and finishes a session, parent's
  // admin stats should reflect it after a resync.
  await child.click('.mode-card >> nth=0'); // entrainement
  await child.waitForSelector(".q-card", { timeout: 3000 });
  // Answer whatever type of question comes up, a handful of times, to finish a session
  for (let i = 0; i < 14; i++) {
    const hasQcm = await child.locator(".opt-btn").count() > 0;
    const hasVf = await child.locator(".opt-vf-btn").count() > 0;
    const hasTexte = await child.locator(".text-input").count() > 0;
    if (hasQcm) {
      await child.locator(".opt-btn").first().click();
    } else if (hasVf) {
      await child.locator(".opt-vf-btn").first().click();
    } else if (hasTexte) {
      await child.fill(".text-input", "x");
      await child.click('button:has-text("Valider")');
    } else {
      break;
    }
    await child.waitForTimeout(150);
    const cont = child.locator('button:has-text("Continuer")');
    if (await cont.count() > 0) { await cont.click(); await child.waitForTimeout(150); }
    if (await child.locator(".summary-score").count() > 0) break;
  }
  await child.waitForTimeout(600); // let the debounced progress push land

  await parent.click('.tab-btn:has-text("Stats")');
  await parent.waitForTimeout(200);
  // force a resync on the parent's view to pull the child's freshly pushed progress
  await parent.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await parent.waitForTimeout(600);
  await parent.click('.tab-btn:has-text("Mots")'); // bounce tabs to force a re-render read of DB.progress
  await parent.click('.tab-btn:has-text("Stats")');
  const statBoxes = await parent.locator(".stat-box .n").allTextContents();
  console.log("parent Stats tab after child played (sessions/time should be >0):", statBoxes);

  await browser.close();
  console.log("E2E SYNC TEST DONE");
})();
