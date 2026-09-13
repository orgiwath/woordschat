const { JSDOM } = require("jsdom");
const fs = require("fs");

const html = fs.readFileSync("public/index.html", "utf8");

(async () => {
  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    resources: "usable",
    url: "https://example.com/",
    pretendToBeVisual: true
  });
  const { window } = dom;

  // stub speechSynthesis
  window.speechSynthesis = { getVoices: () => [], cancel: () => {}, speak: () => {} };
  window.SpeechSynthesisUtterance = function (t) { this.text = t; };

  window.confirm = () => true;

  window.onerror = (msg, src, line, col, err) => {
    console.error("WINDOW ERROR:", msg, "line", line, err && err.stack);
    process.exitCode = 1;
  };

  await new Promise((r) => setTimeout(r, 300));

  const doc = window.document;
  function click(el) { el.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); }
  function q(sel) { return doc.querySelector(sel); }
  function qa(sel) { return Array.from(doc.querySelectorAll(sel)); }

  console.log("== HOME ==");
  console.log("brand:", q(".brand-name") && q(".brand-name").textContent);
  console.log("mode cards:", qa(".mode-card").length);

  // Start "Entrainement"
  console.log("== START ENTRAINEMENT ==");
  click(qa(".mode-card")[0]);
  await new Promise((r) => setTimeout(r, 50));
  console.log("screen has q-card:", !!q(".q-card"));

  // Answer several questions regardless of type
  for (let i = 0; i < 12; i++) {
    if (!q(".q-card")) break;
    // qcm/ecoute options
    let opt = q(".opt-btn");
    let vf = q(".opt-vf-btn");
    let input = q(".text-input");
    if (opt) {
      click(opt);
    } else if (vf) {
      click(vf);
    } else if (input) {
      input.value = "test";
      const submitBtn = qa(".btn-primary").find((b) => b.textContent.includes("Valider"));
      click(submitBtn);
    } else {
      console.log("no interactive element found at step", i, doc.getElementById("app").innerHTML.slice(0, 200));
      break;
    }
    await new Promise((r) => setTimeout(r, 20));
    const cont = qa(".btn-primary").find((b) => b.textContent.includes("Continuer"));
    if (cont) {
      click(cont);
      await new Promise((r) => setTimeout(r, 20));
    }
  }
  console.log("== after loop, on summary?", !!q(".summary-score"), q(".summary-score") && q(".summary-score").textContent);

  // back home
  const homeBtn = qa("button").find((b) => b.textContent.includes("accueil"));
  if (homeBtn) { click(homeBtn); await new Promise((r) => setTimeout(r, 20)); }
  console.log("back home, brand visible:", !!q(".brand-name"));

  // Association mode
  console.log("== ASSOCIATION ==");
  const FR_TO_NL = {
    "Bonjour": "Hallo", "Au revoir": "Tot ziens", "Comment vas-tu ?": "Hoe gaat het met jou?",
    "Je vais bien": "Het gaat goed", "Je ne vais pas bien": "Het gaat niet goed",
    "Comment t'appelles-tu ?": "Hoe heet je?", "Je m'appelle Charlie": "Ik heet Charlie",
    "Quel âge as-tu ?": "Hoe oud ben je?", "J'ai treize ans": "Ik ben dertien jaar",
    "Où habites-tu ?": "Waar woon je?", "J'habite à Sydney": "Ik woon in Sydney"
  };
  click(qa(".mode-card")[1]);
  await new Promise((r) => setTimeout(r, 20));
  let leftItems = qa(".assoc-col")[0].children;
  let rightItems = qa(".assoc-col")[1].children;
  console.log("assoc items L/R:", leftItems.length, rightItems.length);
  let safety = 0;
  while (doc.querySelectorAll(".assoc-item.matched").length < leftItems.length * 2 && safety < 30) {
    safety++;
    if (q(".summary-score") || !qa(".assoc-col")[0]) break;
    let ls = Array.from(qa(".assoc-col")[0].children).filter((x) => !x.classList.contains("matched"));
    let rs = Array.from(qa(".assoc-col")[1].children).filter((x) => !x.classList.contains("matched"));
    if (!ls.length || !rs.length) break;
    const l = ls[0];
    const wantedNl = FR_TO_NL[l.textContent.trim()];
    const r = rs.find((x) => x.textContent.trim() === wantedNl) || rs[0];
    click(l);
    await new Promise((res) => setTimeout(res, 5));
    click(r);
    await new Promise((res) => setTimeout(res, 5));
    // if mismatch, wait for the 550ms auto-clear before next attempt
    await new Promise((res) => setTimeout(res, 600));
  }
  console.log("assoc matched count:", doc.querySelectorAll(".assoc-item.matched").length, "safety loops:", safety);
  await new Promise((r) => setTimeout(r, 900));
  console.log("assoc finished -> summary?", !!q(".summary-score"), q(".summary-score") && q(".summary-score").textContent);
  if (!q(".summary-score")) console.log("APP HTML SNIPPET:", doc.getElementById("app").innerHTML.slice(0, 400));

  const backBtn2 = qa("button").find((b) => b.textContent.includes("Retour"));
  if (backBtn2) { click(backBtn2); await new Promise((r) => setTimeout(r, 20)); }
  console.log("home again:", !!q(".brand-name"));

  // Admin flow
  console.log("== ADMIN ==");
  const parentLink = qa("button").find((b) => b.textContent.includes("Espace parent"));
  click(parentLink);
  await new Promise((r) => setTimeout(r, 20));
  console.log("pin screen visible:", !!q(".pin-dots"));
  for (const digit of "1234") {
    const key = qa(".key-btn").find((b) => b.textContent.trim() === digit);
    click(key);
    await new Promise((r) => setTimeout(r, 10));
  }
  await new Promise((r) => setTimeout(r, 20));
  console.log("admin screen visible:", !!q(".stat-grid"));

  // add a word
  q("#new-fr").value = "Merci";
  q("#new-nl").value = "Dank je wel";
  const addBtn = qa("button").find((b) => b.textContent.includes("Ajouter le mot"));
  click(addBtn);
  await new Promise((r) => setTimeout(r, 20));
  console.log("word count text:", q(".field-label") && q(".card .field-label").textContent);

  // categories tab
  const catTab = qa(".tab-btn").find((b) => b.textContent.includes("Catégories"));
  click(catTab);
  await new Promise((r) => setTimeout(r, 20));
  console.log("categories admin visible:", qa(".word-row").length);

  // settings tab
  const setTab = qa(".tab-btn").find((b) => b.textContent.includes("Réglages"));
  click(setTab);
  await new Promise((r) => setTimeout(r, 20));
  console.log("settings visible:", qa(".card").length);

  console.log("localStorage keys:", Object.keys(window.localStorage));
  console.log("STATE progress xp:", JSON.parse(window.localStorage.getItem("woordschat_v1")).progress.xp);

  // Settings tab: change pin + name
  q("input[value]") && null;
  const nameField = qa(".card input[type=text]")[0];
  if (nameField) { nameField.value = "Charlotte"; }
  const pinField = qa(".card input").find((i) => i.getAttribute("maxlength") === "4");
  if (pinField) { pinField.value = "5678"; }
  const saveSettingsBtn = qa("button").find((b) => b.textContent.trim() === "Enregistrer");
  click(saveSettingsBtn);
  await new Promise((r) => setTimeout(r, 20));
  const dbAfter = JSON.parse(window.localStorage.getItem("woordschat_v1"));
  console.log("settings saved -> name:", dbAfter.settings.childName, "pin:", dbAfter.settings.pin);

  // Reset progress
  const resetBtn = qa("button").find((b) => b.textContent.includes("Réinitialiser"));
  click(resetBtn);
  await new Promise((r) => setTimeout(r, 20));
  const dbAfterReset = JSON.parse(window.localStorage.getItem("woordschat_v1"));
  console.log("progress reset -> xp:", dbAfterReset.progress.xp, "badges:", Object.keys(dbAfterReset.progress.badges).length);

  // Edit an existing word (switch back to "Mots" tab first)
  const wordsTab = qa(".tab-btn").find((b) => b.textContent.includes("Mots"));
  click(wordsTab);
  await new Promise((r) => setTimeout(r, 20));
  const editBtn = qa(".icon-sm").find((b) => b.getAttribute("aria-label") === "Modifier");
  click(editBtn);
  await new Promise((r) => setTimeout(r, 20));
  console.log("edit form title:", q(".card .field-label") && q(".card .field-label").textContent);
  const frInput = q("#new-fr");
  frInput.value = "Bonjour !";
  const saveEditBtn = qa("button").find((b) => b.textContent.includes("Enregistrer les modifications"));
  click(saveEditBtn);
  await new Promise((r) => setTimeout(r, 20));
  const dbAfterEdit = JSON.parse(window.localStorage.getItem("woordschat_v1"));
  console.log("word edited ok:", dbAfterEdit.wordbank.words.some((w) => w.fr === "Bonjour !"), "count unchanged:", dbAfterEdit.wordbank.words.length);

  // Categories tab: try deleting a category that still has words (should be blocked)
  const catTab2 = qa(".tab-btn").find((b) => b.textContent.includes("Catégories"));
  click(catTab2);
  await new Promise((r) => setTimeout(r, 20));
  const delCatBtn = qa(".icon-sm")[0];
  click(delCatBtn);
  await new Promise((r) => setTimeout(r, 20));
  const dbAfterCatDel = JSON.parse(window.localStorage.getItem("woordschat_v1"));
  console.log("category still present after blocked delete:", dbAfterCatDel.wordbank.categories.length === 1);

  // Sync status card on settings tab (replaces the old manual export/import blob)
  const setTab2 = qa(".tab-btn").find((b) => b.textContent.includes("Réglages"));
  click(setTab2);
  await new Promise((r) => setTimeout(r, 20));
  console.log("sync status card present:", qa(".field-label").some((l) => l.textContent.includes("Synchronisation")));
  const syncBtn = qa("button").find((b) => b.textContent.includes("Forcer la synchronisation"));
  console.log("force-sync button present:", !!syncBtn);
  if (syncBtn) { click(syncBtn); await new Promise((r) => setTimeout(r, 20)); }
  console.log("no textarea-based export/import left:", qa("textarea").length === 0);

  // quick smoke test of Chrono mode (don't wait the full 60s)
  const backToHome = qa("button").find((b) => b.textContent.includes("Retour"));
  if (backToHome) { click(backToHome); await new Promise((r) => setTimeout(r, 20)); }
  console.log("== CHRONO ==");
  click(qa(".mode-card")[2]);
  await new Promise((r) => setTimeout(r, 20));
  console.log("chrono timer visible:", q(".timer-pill") && q(".timer-pill").textContent);
  const chronoOpt = q(".opt-btn") || q(".opt-vf-btn");
  click(chronoOpt);
  await new Promise((r) => setTimeout(r, 20));
  const cont2 = qa(".btn-primary").find((b) => b.textContent.includes("Continuer"));
  if (cont2) click(cont2);
  await new Promise((r) => setTimeout(r, 2200));
  console.log("chrono timer after ~2s:", q(".timer-pill") && q(".timer-pill").textContent);
  const backFromChrono = qa("button").find((b) => b.textContent.includes("Retour"));
  if (backFromChrono) click(backFromChrono);
  await new Promise((r) => setTimeout(r, 20));
  console.log("left chrono cleanly, home visible:", !!q(".brand-name"));

  // Re-enter admin (pin was changed to 5678 earlier) to check the Stats tab
  const parentLink2 = qa("button").find((b) => b.textContent.includes("Espace parent"));
  click(parentLink2);
  await new Promise((r) => setTimeout(r, 20));
  for (const digit of "5678") {
    const key = qa(".key-btn").find((b) => b.textContent.trim() === digit);
    click(key);
    await new Promise((r) => setTimeout(r, 10));
  }
  await new Promise((r) => setTimeout(r, 20));
  console.log("re-entered admin:", !!q(".stat-grid"));

  // Stats tab
  const statsTab = qa(".tab-btn").find((b) => b.textContent.includes("Stats"));
  click(statsTab);
  await new Promise((r) => setTimeout(r, 20));
  console.log("stats stat-boxes:", qa(".stat-box").length);
  console.log("heat cells:", qa(".heat-cell").length);
  console.log("session rows:", qa(".session-row").length);
  const firstColoredCell = qa(".heat-cell").find((c) => c.style.background && c.style.background !== "transparent");
  if (firstColoredCell) {
    click(firstColoredCell);
    await new Promise((r) => setTimeout(r, 20));
    console.log("clicked a heat cell without crashing");
  }
  const dbFinal = JSON.parse(window.localStorage.getItem("woordschat_v1"));
  console.log("totalTimeSec:", dbFinal.progress.totalTimeSec, "sessionsCount:", dbFinal.progress.sessionsCount, "lastActiveAt:", dbFinal.progress.lastActiveAt, "bestStreak:", dbFinal.progress.bestStreak);
  console.log("dailyLog keys:", Object.keys(dbFinal.progress.dailyLog || {}));

  // Go home and do one more full session to confirm stats actually accumulate
  const backHome3 = qa("button").find((b) => b.textContent.includes("Retour"));
  if (backHome3) { click(backHome3); await new Promise((r) => setTimeout(r, 20)); }
  click(qa(".mode-card")[0]);
  await new Promise((r) => setTimeout(r, 20));
  for (let i = 0; i < 10; i++) {
    if (!q(".q-card")) break;
    let opt = q(".opt-btn");
    let vf = q(".opt-vf-btn");
    let input = q(".text-input");
    if (opt) click(opt);
    else if (vf) click(vf);
    else if (input) { input.value = "test"; click(qa(".btn-primary").find((b) => b.textContent.includes("Valider"))); }
    await new Promise((r) => setTimeout(r, 15));
    const cont = qa(".btn-primary").find((b) => b.textContent.includes("Continuer"));
    if (cont) { click(cont); await new Promise((r) => setTimeout(r, 15)); }
  }
  const dbAfterRealSession = JSON.parse(window.localStorage.getItem("woordschat_v1"));
  console.log("after one real session -> totalTimeSec:", dbAfterRealSession.progress.totalTimeSec, "sessionsCount:", dbAfterRealSession.progress.sessionsCount, "lastActiveAt set:", !!dbAfterRealSession.progress.lastActiveAt, "dailyLog:", JSON.stringify(dbAfterRealSession.progress.dailyLog));

  console.log("DONE - no crashes if you see this line");
  process.exit(process.exitCode || 0);
})();
