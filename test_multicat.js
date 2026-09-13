const { JSDOM } = require("jsdom");
const fs = require("fs");
const html = fs.readFileSync("public/index.html", "utf8");

(async () => {
  const dom = new JSDOM(html, { runScripts: "dangerously", resources: "usable", url: "https://example.com/", pretendToBeVisual: true });
  const { window } = dom;
  window.speechSynthesis = { getVoices: () => [], cancel: () => {}, speak: () => {} };
  window.SpeechSynthesisUtterance = function (t) { this.text = t; };
  window.confirm = () => true;
  window.onerror = (msg, src, line, col, err) => { console.error("WINDOW ERROR:", msg, "line", line, err && err.stack); process.exitCode = 1; };
  await new Promise((r) => setTimeout(r, 300));
  const doc = window.document;
  function click(el) { el.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); }
  function q(sel) { return doc.querySelector(sel); }
  function qa(sel) { return Array.from(doc.querySelectorAll(sel)); }

  // With only 1 seed category, the category picker should be hidden entirely
  console.log("category picker hidden with 1 category:", !q(".cat-scroll"));

  // Add a 2nd category via admin, then verify the picker appears and multi-select works
  const parentLink = qa("button").find((b) => b.textContent.includes("Espace parent"));
  click(parentLink);
  await new Promise((r) => setTimeout(r, 20));
  for (const d of "1234") { click(qa(".key-btn").find((b) => b.textContent.trim() === d)); await new Promise((r) => setTimeout(r, 10)); }
  await new Promise((r) => setTimeout(r, 20));
  click(qa(".tab-btn").find((b) => b.textContent.includes("Catégories")));
  await new Promise((r) => setTimeout(r, 20));
  q("#new-cat-name").value = "La nourriture";
  q("#new-cat-emoji").value = "🍎";
  click(qa("button").find((b) => b.textContent.includes("Ajouter la catégorie")));
  await new Promise((r) => setTimeout(r, 20));
  console.log("category count now:", JSON.parse(window.localStorage.getItem("woordschat_v1")).wordbank.categories.length);

  // add one word into the new category so it's selectable/usable
  click(qa(".tab-btn").find((b) => b.textContent.includes("Mots")));
  await new Promise((r) => setTimeout(r, 20));
  const catSelect = q("#new-cat");
  catSelect.value = Array.from(catSelect.options).find((o) => o.textContent.includes("nourriture")).value;
  q("#new-fr").value = "La pomme";
  q("#new-nl").value = "De appel";
  click(qa("button").find((b) => b.textContent.includes("Ajouter le mot")));
  await new Promise((r) => setTimeout(r, 20));

  // back to home
  const backBtn = qa("button").find((b) => b.textContent.includes("Retour"));
  click(backBtn);
  await new Promise((r) => setTimeout(r, 20));

  console.log("category picker visible with 2 categories:", !!q(".cat-scroll"));
  const chips = qa(".cat-chip");
  console.log("chip count (Toutes + 2 cats):", chips.length, chips.map((c) => c.textContent.trim()));

  // select just "Faire connaissance" then also toggle "La nourriture" -> both active, "Toutes" inactive
  const chipConnaissance = chips.find((c) => c.textContent.includes("connaissance"));
  const chipNourriture = chips.find((c) => c.textContent.includes("nourriture"));
  const chipToutes = chips.find((c) => c.textContent.includes("Toutes"));
  click(chipConnaissance);
  await new Promise((r) => setTimeout(r, 10));
  click(chipNourriture);
  await new Promise((r) => setTimeout(r, 10));
  const chips2 = qa(".cat-chip");
  console.log("after selecting both: toutes active?", chips2.find((c) => c.textContent.includes("Toutes")).classList.contains("active"),
    "connaissance active?", chips2.find((c) => c.textContent.includes("connaissance")).classList.contains("active"),
    "nourriture active?", chips2.find((c) => c.textContent.includes("nourriture")).classList.contains("active"));

  // start a session scoped to just "La nourriture" (deselect connaissance first)
  click(qa(".cat-chip").find((c) => c.textContent.includes("connaissance")));
  await new Promise((r) => setTimeout(r, 10));
  click(qa(".mode-card")[0]);
  await new Promise((r) => setTimeout(r, 20));
  console.log("session started scoped to 1 category, has q-card:", !!q(".q-card"));
  console.log("question prompt (should be about pomme/appel):", q(".q-prompt") && q(".q-prompt").textContent);

  console.log("MULTI-CAT TEST DONE");
  process.exit(process.exitCode || 0);
})();
