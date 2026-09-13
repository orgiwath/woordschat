"use strict";
/*
 * Woordschat — backend
 *
 * A deliberately small server: the whole app state (word bank, categories,
 * progress, settings) is one JSON document, persisted as a single file on
 * disk. There is only one child using the app, so there's no need for a
 * relational database or user accounts — every device that opens the app
 * reads/writes the same document, which is exactly what makes new words
 * show up everywhere automatically.
 *
 * Endpoints:
 *   GET  /api/state            -> { wordbank, progress, childName }  (public, no pin)
 *   PUT  /api/progress         -> replaces the progress object       (public, no pin)
 *   POST /api/admin/login      -> { pin } -> { ok }                  (checks the pin)
 *   PUT  /api/admin/wordbank   -> replaces { categories, words }     (requires X-Admin-Pin header)
 *   PUT  /api/admin/settings   -> replaces { pin, childName }        (requires X-Admin-Pin header, current pin)
 *   GET  /health               -> { ok:true }                       (for Docker healthcheck / uptime checks)
 */

const express = require("express");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "state.json");
const DEFAULT_PIN = "1234";

/* Same starter vocabulary as the original client-only version, so a brand
   new deployment isn't empty on first boot. */
const SEED_WORDBANK = {
  categories: [
    { id: "kennismaking", name: "Faire connaissance", emoji: "👋" },
    { id: "nombres", name: "Les nombres (0-20)", emoji: "🔢" },
    { id: "jours", name: "Les jours de la semaine", emoji: "📅" }
  ],
  words: [
    { id: "w1", category: "kennismaking", fr: "Bonjour", nl: "Hallo", alt: ["Dag", "Goedendag"] },
    { id: "w2", category: "kennismaking", fr: "Au revoir", nl: "Tot ziens", alt: ["Dag", "Doei"] },
    { id: "w3", category: "kennismaking", fr: "Comment vas-tu ?", nl: "Hoe gaat het met jou?", alt: ["Hoe gaat het?"] },
    { id: "w4", category: "kennismaking", fr: "Je vais bien", nl: "Het gaat goed", alt: ["Het gaat goed met mij"] },
    { id: "w5", category: "kennismaking", fr: "Je ne vais pas bien", nl: "Het gaat niet goed", alt: ["Het gaat niet zo goed"] },
    { id: "w6", category: "kennismaking", fr: "Comment t'appelles-tu ?", nl: "Hoe heet je?", alt: [] },
    { id: "w7", category: "kennismaking", fr: "Je m'appelle Charlie", nl: "Ik heet Charlie", alt: [] },
    { id: "w8", category: "kennismaking", fr: "Quel âge as-tu ?", nl: "Hoe oud ben je?", alt: [] },
    { id: "w9", category: "kennismaking", fr: "J'ai treize ans", nl: "Ik ben dertien jaar", alt: ["Ik ben dertien jaar oud"] },
    { id: "w10", category: "kennismaking", fr: "Où habites-tu ?", nl: "Waar woon je?", alt: [] },
    { id: "w11", category: "kennismaking", fr: "J'habite à Sydney", nl: "Ik woon in Sydney", alt: [] },
    { id: "n0", category: "nombres", fr: "Zéro", nl: "Nul", alt: [] },
    { id: "n1", category: "nombres", fr: "Un", nl: "Een", alt: [] },
    { id: "n2", category: "nombres", fr: "Deux", nl: "Twee", alt: [] },
    { id: "n3", category: "nombres", fr: "Trois", nl: "Drie", alt: [] },
    { id: "n4", category: "nombres", fr: "Quatre", nl: "Vier", alt: [] },
    { id: "n5", category: "nombres", fr: "Cinq", nl: "Vijf", alt: [] },
    { id: "n6", category: "nombres", fr: "Six", nl: "Zes", alt: [] },
    { id: "n7", category: "nombres", fr: "Sept", nl: "Zeven", alt: [] },
    { id: "n8", category: "nombres", fr: "Huit", nl: "Acht", alt: [] },
    { id: "n9", category: "nombres", fr: "Neuf", nl: "Negen", alt: [] },
    { id: "n10", category: "nombres", fr: "Dix", nl: "Tien", alt: [] },
    { id: "n11", category: "nombres", fr: "Onze", nl: "Elf", alt: [] },
    { id: "n12", category: "nombres", fr: "Douze", nl: "Twaalf", alt: [] },
    { id: "n13", category: "nombres", fr: "Treize", nl: "Dertien", alt: [] },
    { id: "n14", category: "nombres", fr: "Quatorze", nl: "Veertien", alt: [] },
    { id: "n15", category: "nombres", fr: "Quinze", nl: "Vijftien", alt: [] },
    { id: "n16", category: "nombres", fr: "Seize", nl: "Zestien", alt: [] },
    { id: "n17", category: "nombres", fr: "Dix-sept", nl: "Zeventien", alt: [] },
    { id: "n18", category: "nombres", fr: "Dix-huit", nl: "Achttien", alt: [] },
    { id: "n19", category: "nombres", fr: "Dix-neuf", nl: "Negentien", alt: [] },
    { id: "n20", category: "nombres", fr: "Vingt", nl: "Twintig", alt: [] },
    { id: "j1", category: "jours", fr: "Lundi", nl: "Maandag", alt: [] },
    { id: "j2", category: "jours", fr: "Mardi", nl: "Dinsdag", alt: [] },
    { id: "j3", category: "jours", fr: "Mercredi", nl: "Woensdag", alt: [] },
    { id: "j4", category: "jours", fr: "Jeudi", nl: "Donderdag", alt: [] },
    { id: "j5", category: "jours", fr: "Vendredi", nl: "Vrijdag", alt: [] },
    { id: "j6", category: "jours", fr: "Samedi", nl: "Zaterdag", alt: [] },
    { id: "j7", category: "jours", fr: "Dimanche", nl: "Zondag", alt: [] }
  ]
};

function defaultState() {
  return {
    wordbank: JSON.parse(JSON.stringify(SEED_WORDBANK)),
    progress: {
      xp: 0, streak: 0, bestStreak: 0, lastActiveDate: null, lastActiveAt: null,
      wordStats: {}, badges: {}, modesUsed: {}, totalCorrect: 0,
      totalTimeSec: 0, sessionsCount: 0, history: [], dailyLog: {}
    },
    settings: { pin: DEFAULT_PIN, childName: "Charlie" }
  };
}

function loadStateFromDisk() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed && parsed.wordbank && parsed.progress && parsed.settings) return parsed;
    }
  } catch (e) {
    console.error("[woordschat] could not read state file, starting fresh:", e.message);
  }
  return defaultState();
}

let state = loadStateFromDisk();
let writeChain = Promise.resolve();

/* Serializes writes so two near-simultaneous saves can't corrupt the file;
   writes to a temp file and renames it into place, which is atomic on the
   same filesystem, so a crash mid-write never leaves a half-written file. */
function persist() {
  writeChain = writeChain.then(function () {
    try {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      const tmp = DATA_FILE + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(state));
      fs.renameSync(tmp, DATA_FILE);
    } catch (e) {
      console.error("[woordschat] failed to persist state:", e.message);
    }
  });
  return writeChain;
}
persist(); // make sure a state file exists right away on first boot

const app = express();
app.set("trust proxy", 1); // behind Nginx
app.use(express.json({ limit: "2mb" }));

function isValidWordbank(wb) {
  return !!wb && Array.isArray(wb.categories) && Array.isArray(wb.words);
}
function isValidProgress(p) {
  return !!p && typeof p === "object" && typeof p.xp === "number";
}
function requireAdminPin(req, res, next) {
  const pin = req.get("X-Admin-Pin");
  if (pin && pin === state.settings.pin) return next();
  return res.status(403).json({ ok: false, error: "invalid_pin" });
}

app.get("/api/state", function (req, res) {
  res.json({ wordbank: state.wordbank, progress: state.progress, childName: state.settings.childName });
});

app.put("/api/progress", function (req, res) {
  if (!isValidProgress(req.body)) return res.status(400).json({ ok: false, error: "invalid_progress" });
  state.progress = req.body;
  persist();
  res.json({ ok: true });
});

app.post("/api/admin/login", function (req, res) {
  const pin = req.body && req.body.pin;
  res.json({ ok: pin === state.settings.pin });
});

app.put("/api/admin/wordbank", requireAdminPin, function (req, res) {
  if (!isValidWordbank(req.body)) return res.status(400).json({ ok: false, error: "invalid_wordbank" });
  state.wordbank = req.body;
  persist();
  res.json({ ok: true });
});

app.put("/api/admin/settings", requireAdminPin, function (req, res) {
  const pin = req.body && req.body.pin;
  const childName = req.body && req.body.childName;
  if (!/^\d{4}$/.test(String(pin || ""))) return res.status(400).json({ ok: false, error: "invalid_pin_format" });
  state.settings = { pin: pin, childName: childName || state.settings.childName };
  persist();
  res.json({ ok: true });
});

app.get("/health", function (req, res) { res.json({ ok: true }); });

app.use(express.static(path.join(__dirname, "public")));

app.listen(PORT, function () {
  console.log("[woordschat] listening on port " + PORT + " (data: " + DATA_FILE + ")");
});
