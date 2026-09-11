// Tests de la tarification — aucune dépendance : `node test/pricing.test.js`
// À relancer après toute modification de pricing.js ou de la forme de config.json.
const fs = require("fs");
const path = require("path");
const { creerCalculateur, validerConfig } = require("../pricing.js");

const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "config.json"), "utf8"));

let ko = 0;
const t = (nom, attendu, obtenu) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? "✓" : "✗"} ${nom}${ok ? "" : `\n    attendu ${JSON.stringify(attendu)}, obtenu ${JSON.stringify(obtenu)}`}`);
};

// ── Le config livré est valide ────────────────────────────────────────────
t("config.json valide", [], validerConfig(cfg));

const { calculerDevis, version } = creerCalculateur(cfg);
t("version remontée", cfg.version, version);

// ── Calcul : Prix = S_T × C_T + S_M × C_M ─────────────────────────────────
t("curatif/avec 150 m² + 40 m² de murs", 990,
  calculerDevis({ type: "curatif", etage: "avec", surfaceToit: 150, surfaceMur: 40 }).total);
t("préventif/sans 80 m²", 400,
  calculerDevis({ type: "preventif", etage: "sans", surfaceToit: 80 }).total);
t("préventif/sans 300 m² — dernière tranche", 600,
  calculerDevis({ type: "preventif", etage: "sans", surfaceToit: 300 }).total);
t("bornes de tranche : 99 m² puis 100 m²", [495, 400], [
  calculerDevis({ type: "preventif", etage: "sans", surfaceToit: 99 }).total,
  calculerDevis({ type: "preventif", etage: "sans", surfaceToit: 100 }).total,
]);
t("libellé de tranche", "200 à 299 m²",
  calculerDevis({ type: "curatif", etage: "avec", surfaceToit: 250 }).trancheToit);
t("surface nulle → 0 €", 0,
  calculerDevis({ type: "curatif", etage: "avec", surfaceToit: 0, surfaceMur: 0 }).total);
t("surface négative ignorée", 0,
  calculerDevis({ type: "curatif", etage: "avec", surfaceToit: -50 }).total);
t("murs à null = tarif de la toiture", true,
  calculerDevis({ type: "curatif", etage: "avec", surfaceMur: 150 }).cm === cfg.toiture.curatif.avec[1]);

// ── Grille murs : vide = tarif toiture, partielle = erreur ────────────────
const mursVidesCMS = JSON.parse(JSON.stringify(cfg));
mursVidesCMS.murs = {
  preventif: { sans: [], avec: [] },
  curatif: { sans: [], avec: [] },
};
t("grille murs vide acceptée (ce que le CMS écrit)", [], validerConfig(mursVidesCMS));
t("grille murs vide → tarif toiture", 990,
  creerCalculateur(mursVidesCMS).calculerDevis({ type: "curatif", etage: "avec", surfaceToit: 150, surfaceMur: 40 }).total);

const mursPropres = JSON.parse(JSON.stringify(cfg));
mursPropres.murs = {
  preventif: { sans: [1, 1, 1, 1], avec: [1, 1, 1, 1] },
  curatif: { sans: [2, 2, 2, 2], avec: [3, 3, 3, 3] },
};
t("grille murs distincte appliquée", 870,
  creerCalculateur(mursPropres).calculerDevis({ type: "curatif", etage: "avec", surfaceToit: 150, surfaceMur: 40 }).total);

const mursPartiels = JSON.parse(JSON.stringify(cfg));
mursPartiels.murs = {
  preventif: { sans: [1, 1, 1, 1], avec: [] },
  curatif: { sans: [], avec: [] },
};
t("grille murs à moitié remplie refusée", true, validerConfig(mursPartiels).length > 0);

// ── Un config cassé est refusé plutôt que de sortir des devis faux ────────
const casse = (mut) => {
  const c = JSON.parse(JSON.stringify(cfg));
  mut(c);
  return validerConfig(c).length > 0;
};
t("coefficient négatif refusé", true, casse((c) => (c.toiture.curatif.avec[0] = -3)));
t("coefficient non numérique refusé", true, casse((c) => (c.toiture.preventif.sans[2] = "trois")));
t("ligne de grille manquante refusée", true, casse((c) => delete c.toiture.curatif.sans));
t("nb de coefficients ≠ nb de tranches refusé", true, casse((c) => c.tranches.push({ max: null, label: "x" })));
t("seuils de tranches décroissants refusés", true, casse((c) => (c.tranches[1].max = 50)));
t("dernière tranche plafonnée refusée", true, casse((c) => (c.tranches[3].max = 400)));
t("config absent refusé", true, validerConfig(null).length > 0);

// ── Repli : un config invalide ne doit jamais fausser un prix ─────────────
console.log("  (l'erreur de config ci-dessous est attendue)");
const repli = creerCalculateur({ toiture: "n'importe quoi" });
t("repli → prix corrects", 990,
  repli.calculerDevis({ type: "curatif", etage: "avec", surfaceToit: 150, surfaceMur: 40 }).total);
t("repli → version « repli »", "repli", repli.version);

// ── Un tarif changé dans le config change bien le prix ────────────────────
const modifie = JSON.parse(JSON.stringify(cfg));
modifie.toiture.preventif.sans = [10, 9, 8, 7];
t("tarif modifié pris en compte", 800,
  creerCalculateur(modifie).calculerDevis({ type: "preventif", etage: "sans", surfaceToit: 80 }).total);

console.log(ko === 0 ? "\nTous les tests passent." : `\n${ko} test(s) en échec.`);
process.exit(ko === 0 ? 0 : 1);
