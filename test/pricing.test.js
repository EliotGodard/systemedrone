// Tests de la tarification — aucune dépendance : `node test/pricing.test.js`
//
// Deux niveaux, délibérément séparés :
//   1. `config.json` appartient à l'éditeur (il le modifie depuis le CMS). On ne
//      teste donc que sa *forme*, jamais ses montants — sinon toute hausse de
//      tarif ferait rougir la suite de tests sans qu'il y ait le moindre bug.
//   2. le calcul est vérifié sur une grille figée ci-dessous, indépendante des
//      tarifs réellement pratiqués.
const fs = require("fs");
const path = require("path");
const { creerCalculateur, validerConfig } = require("../pricing.js");

let ko = 0;
const t = (nom, attendu, obtenu) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? "✓" : "✗"} ${nom}${ok ? "" : `\n    attendu ${JSON.stringify(attendu)}, obtenu ${JSON.stringify(obtenu)}`}`);
};
const copie = (o) => JSON.parse(JSON.stringify(o));

// ── Grille de test, volontairement figée ──────────────────────────────────
const GRILLE = {
  version: "test",
  tranches: [
    { max: 100, label: "moins de 100 m²" },
    { max: 200, label: "100 à 199 m²" },
    { max: 300, label: "200 à 299 m²" },
    { max: null, label: "300 m² et +" },
  ],
  toiture: {
    preventif: { sans: [5, 4, 3, 2], avec: [5.5, 4.5, 3.5, 2.5] },
    curatif: { sans: [5.5, 4.5, 3.5, 2.5], avec: [6, 5, 4, 3] },
  },
  murs: null,
};

console.log("— Le config livré —");

const livre = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "config.json"), "utf8"));
t("config.json valide", [], validerConfig(livre));
const enLigne = creerCalculateur(livre);
t("version renseignée", true, typeof enLigne.version === "string" && enLigne.version.length > 0);
t("sort un prix > 0", true,
  enLigne.calculerDevis({ type: "curatif", etage: "avec", surfaceToit: 150, surfaceMur: 40 }).total > 0);
t("libellés de tranches cohérents avec les seuils", [], (() => {
  // Piège vécu : l'éditeur change un seuil et oublie l'intitulé en face.
  const soucis = [];
  livre.tranches.forEach((tr, i) => {
    const bas = i === 0 ? 0 : livre.tranches[i - 1].max;
    const chiffres = (tr.label.match(/\d+/g) || []).map(Number);
    if (i === 0 && tr.max != null && chiffres[0] !== tr.max) soucis.push(tr.label);
    if (i > 0 && chiffres[0] !== bas) soucis.push(tr.label);
  });
  return soucis;
})());

console.log("\n— Le calcul, sur la grille de test —");

const { calculerDevis } = creerCalculateur(GRILLE);
t("curatif/avec 150 m² + 40 m² de murs", 990,
  calculerDevis({ type: "curatif", etage: "avec", surfaceToit: 150, surfaceMur: 40 }).total);
t("préventif/sans 80 m²", 400, calculerDevis({ type: "preventif", etage: "sans", surfaceToit: 80 }).total);
t("préventif/sans 300 m² — dernière tranche", 600, calculerDevis({ type: "preventif", etage: "sans", surfaceToit: 300 }).total);
t("bornes de tranche : 99 m² puis 100 m²", [495, 400], [
  calculerDevis({ type: "preventif", etage: "sans", surfaceToit: 99 }).total,
  calculerDevis({ type: "preventif", etage: "sans", surfaceToit: 100 }).total,
]);
t("libellé de tranche", "200 à 299 m²",
  calculerDevis({ type: "curatif", etage: "avec", surfaceToit: 250 }).trancheToit);
t("surface nulle → 0 €", 0, calculerDevis({ type: "curatif", etage: "avec", surfaceToit: 0, surfaceMur: 0 }).total);
t("surface négative ignorée", 0, calculerDevis({ type: "curatif", etage: "avec", surfaceToit: -50 }).total);
t("toit et murs classés chacun sur sa propre surface", ["200 à 299 m²", "moins de 100 m²"], (() => {
  const d = calculerDevis({ type: "curatif", etage: "avec", surfaceToit: 250, surfaceMur: 40 });
  return [d.trancheToit, d.trancheMur];
})());
t("tarif modifié pris en compte", 800, (() => {
  const g = copie(GRILLE);
  g.toiture.preventif.sans = [10, 9, 8, 7];
  return creerCalculateur(g).calculerDevis({ type: "preventif", etage: "sans", surfaceToit: 80 }).total;
})());
t("nombre de tranches libre (grille à 2 paliers)", [400, 600], (() => {
  const g = copie(GRILLE);
  g.tranches = [{ max: 150, label: "moins de 150 m²" }, { max: null, label: "150 m² et +" }];
  // Retirer une tranche impose de retirer le coefficient sur les quatre lignes.
  g.toiture = { preventif: { sans: [4, 3], avec: [4, 3] }, curatif: { sans: [4, 3], avec: [4, 3] } };
  const c = creerCalculateur(g);
  return [
    c.calculerDevis({ type: "preventif", etage: "sans", surfaceToit: 100 }).total,
    c.calculerDevis({ type: "preventif", etage: "sans", surfaceToit: 200 }).total,
  ];
})());

console.log("\n— La grille murs —");

t("murs absents → tarif toiture", 990, (() => {
  const g = copie(GRILLE);
  delete g.murs; // ce que le CMS écrit : il n'enregistre pas les champs vides
  return creerCalculateur(g).calculerDevis({ type: "curatif", etage: "avec", surfaceToit: 150, surfaceMur: 40 }).total;
})());
t("grille murs vide acceptée", [], (() => {
  const g = copie(GRILLE);
  g.murs = { preventif: { sans: [], avec: [] }, curatif: { sans: [], avec: [] } };
  return validerConfig(g);
})());
t("grille murs vide → tarif toiture", 990, (() => {
  const g = copie(GRILLE);
  g.murs = { preventif: { sans: [], avec: [] }, curatif: { sans: [], avec: [] } };
  return creerCalculateur(g).calculerDevis({ type: "curatif", etage: "avec", surfaceToit: 150, surfaceMur: 40 }).total;
})());
t("grille murs distincte appliquée", 870, (() => {
  const g = copie(GRILLE);
  g.murs = {
    preventif: { sans: [1, 1, 1, 1], avec: [1, 1, 1, 1] },
    curatif: { sans: [2, 2, 2, 2], avec: [3, 3, 3, 3] },
  };
  return creerCalculateur(g).calculerDevis({ type: "curatif", etage: "avec", surfaceToit: 150, surfaceMur: 40 }).total;
})());
t("grille murs à moitié remplie refusée", true, (() => {
  const g = copie(GRILLE);
  g.murs = { preventif: { sans: [1, 1, 1, 1], avec: [] }, curatif: { sans: [], avec: [] } };
  return validerConfig(g).length > 0;
})());

console.log("\n— Les garde-fous —");

const casse = (mut) => { const g = copie(GRILLE); mut(g); return validerConfig(g).length > 0; };
t("coefficient négatif refusé", true, casse((g) => (g.toiture.curatif.avec[0] = -3)));
t("coefficient non numérique refusé", true, casse((g) => (g.toiture.preventif.sans[2] = "trois")));
t("ligne de grille manquante refusée", true, casse((g) => delete g.toiture.curatif.sans));
t("nb de coefficients ≠ nb de tranches refusé", true, casse((g) => g.tranches.push({ max: null, label: "x" })));
t("seuils de tranches décroissants refusés", true, casse((g) => (g.tranches[1].max = 50)));
t("dernière tranche plafonnée refusée", true, casse((g) => (g.tranches[3].max = 400)));
t("dernière tranche sans `max` acceptée", [], (() => {
  const g = copie(GRILLE);
  delete g.tranches[3].max; // ce que le CMS écrit pour « et plus »
  return validerConfig(g);
})());
t("config absent refusé", true, validerConfig(null).length > 0);

console.log("  (l'erreur de config ci-dessous est attendue)");
const repli = creerCalculateur({ toiture: "n'importe quoi" });
t("repli → prix de la grille embarquée", 990,
  repli.calculerDevis({ type: "curatif", etage: "avec", surfaceToit: 150, surfaceMur: 40 }).total);
t("repli → version « repli »", "repli", repli.version);

console.log(ko === 0 ? "\nTous les tests passent." : `\n${ko} test(s) en échec.`);
process.exit(ko === 0 ? 0 : 1);
