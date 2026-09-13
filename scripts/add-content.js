#!/usr/bin/env node
"use strict";
/*
 * One-off helper to push new categories/words to an ALREADY RUNNING
 * Woordschat server. The app's seed content (in server.js) only applies on
 * a brand-new deployment's first boot — an existing deployment already has
 * its own data/state.json, so new starter content needs to be merged in
 * through the admin API instead.
 *
 * This script is idempotent: it only adds categories/words whose id isn't
 * already present, so it's safe to run more than once.
 *
 * Usage:
 *   node scripts/add-content.js <server-url> <admin-pin>
 *
 * Example:
 *   node scripts/add-content.js https://eole.home.plcc.be 5678
 *   node scripts/add-content.js http://127.0.0.1:3210 5678   (run from the Docker host)
 */

const NEW_CATEGORIES = [
  { id: "nombres", name: "Les nombres (0-20)", emoji: "🔢" },
  { id: "jours", name: "Les jours de la semaine", emoji: "📅" }
];

const NEW_WORDS = [
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
];

async function main() {
  const [, , serverUrl, pin] = process.argv;
  if (!serverUrl || !pin) {
    console.error("Usage: node scripts/add-content.js <server-url> <admin-pin>");
    process.exit(1);
  }
  const base = serverUrl.replace(/\/$/, "");

  console.log("Fetching current state from " + base + " ...");
  const stateRes = await fetch(base + "/api/state");
  if (!stateRes.ok) throw new Error("GET /api/state failed: " + stateRes.status);
  const state = await stateRes.json();
  const wordbank = state.wordbank;

  let addedCats = 0, addedWords = 0;
  NEW_CATEGORIES.forEach((c) => {
    if (!wordbank.categories.some((x) => x.id === c.id)) {
      wordbank.categories.push(c);
      addedCats++;
    }
  });
  NEW_WORDS.forEach((w) => {
    if (!wordbank.words.some((x) => x.id === w.id)) {
      wordbank.words.push(w);
      addedWords++;
    }
  });

  if (addedCats === 0 && addedWords === 0) {
    console.log("Nothing to add — this content is already present on the server.");
    return;
  }

  console.log("Adding " + addedCats + " new categorie(s) and " + addedWords + " new word(s)...");
  const putRes = await fetch(base + "/api/admin/wordbank", {
    method: "PUT",
    headers: { "Content-Type": "application/json", "X-Admin-Pin": pin },
    body: JSON.stringify(wordbank)
  });
  if (!putRes.ok) {
    const body = await putRes.text().catch(() => "");
    throw new Error("PUT /api/admin/wordbank failed: " + putRes.status + " " + body);
  }
  console.log("Done — the new categories will show up on every device within ~25s.");
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
