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
const { creerCalculateur, validerConfig, libelleTranche, trancheIndex } = require("../pricing.js");

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
  toiture: {
    tranches: [100, 200, 300],
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

console.log("\n— Les intitulés, calculés à partir des seuils —");

t("quatre tranches depuis trois seuils",
  ["moins de 80 m²", "80 à 199 m²", "200 à 299 m²", "300 m² et +"],
  [0, 1, 2, 3].map((i) => libelleTranche([80, 200, 300], i)));
t("deux tranches", ["moins de 150 m²", "150 m² et +"],
  [0, 1].map((i) => libelleTranche([150], i)));
t("aucun seuil → tarif unique", ["toute surface"], [libelleTranche([], 0)]);
t("milliers formatés à la française", "1 000 à 1 999 m²",
  libelleTranche([1000, 2000], 1).replace(/ | /g, " "));
t("surface → tranche", [0, 0, 1, 2, 3, 3], [0, 79, 80, 200, 300, 5000].map((s) => trancheIndex([80, 200, 300], s)));

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
t("intitulé remonté avec le devis", "200 à 299 m²",
  calculerDevis({ type: "curatif", etage: "avec", surfaceToit: 250 }).trancheToit);
t("surface nulle → 0 €", 0, calculerDevis({ type: "curatif", etage: "avec", surfaceToit: 0, surfaceMur: 0 }).total);
t("surface négative ignorée", 0, calculerDevis({ type: "curatif", etage: "avec", surfaceToit: -50 }).total);
t("tarif modifié pris en compte", 800, (() => {
  const g = copie(GRILLE);
  g.toiture.preventif.sans = [10, 9, 8, 7];
  return creerCalculateur(g).calculerDevis({ type: "preventif", etage: "sans", surfaceToit: 80 }).total;
})());
t("nombre de tranches libre (2 paliers)", [400, 600], (() => {
  const g = copie(GRILLE);
  g.toiture = {
    tranches: [150],
    preventif: { sans: [4, 3], avec: [4, 3] },
    curatif: { sans: [4, 3], avec: [4, 3] },
  };
  const c = creerCalculateur(g);
  return [
    c.calculerDevis({ type: "preventif", etage: "sans", surfaceToit: 100 }).total,
    c.calculerDevis({ type: "preventif", etage: "sans", surfaceToit: 200 }).total,
  ];
})());
t("aucun seuil = tarif unique", 1000, (() => {
  const g = copie(GRILLE);
  g.toiture = {
    tranches: [],
    preventif: { sans: [4], avec: [4] },
    curatif: { sans: [4], avec: [4] },
  };
  return creerCalculateur(g).calculerDevis({ type: "preventif", etage: "sans", surfaceToit: 250 }).total;
})());

console.log("\n— Les murs, avec leurs propres seuils —");

const MIXTE = copie(GRILLE);
MIXTE.murs = {
  tranches: [40, 80],
  preventif: { sans: [3, 2, 1], avec: [3, 2, 1] },
  curatif: { sans: [3, 2, 1], avec: [3, 2, 1] },
};
t("murs classés sur leurs seuils, pas ceux du toit",
  ["200 à 299 m²", "40 à 79 m²"], (() => {
    const d = creerCalculateur(MIXTE).calculerDevis({ type: "curatif", etage: "avec", surfaceToit: 250, surfaceMur: 60 });
    return [d.trancheToit, d.trancheMur];
  })());
t("prix murs sur la grille murs", [4, 2], (() => {
  const d = creerCalculateur(MIXTE).calculerDevis({ type: "curatif", etage: "avec", surfaceToit: 250, surfaceMur: 60 });
  return [d.ct, d.cm];
})());
t("nb de tranches murs indépendant de la toiture", [],
  validerConfig(MIXTE)); // 3 seuils côté toit, 2 côté murs
t("murs absents → seuils et tarifs de la toiture", 990, (() => {
  const g = copie(GRILLE);
  delete g.murs; // ce que le CMS écrit quand la section est laissée vide
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
t("grille murs à moitié remplie refusée", true, (() => {
  const g = copie(GRILLE);
  g.murs = { tranches: [40], preventif: { sans: [1, 1], avec: [] }, curatif: { sans: [], avec: [] } };
  return validerConfig(g).length > 0;
})());
t("murs renseignés sans seuils refusés", true, (() => {
  const g = copie(GRILLE);
  g.murs = {
    preventif: { sans: [3, 2], avec: [3, 2] },
    curatif: { sans: [3, 2], avec: [3, 2] },
  };
  return validerConfig(g).length > 0;
})());

console.log("\n— Les garde-fous —");

const casse = (mut) => { const g = copie(GRILLE); mut(g); return validerConfig(g).length > 0; };
t("coefficient négatif refusé", true, casse((g) => (g.toiture.curatif.avec[0] = -3)));
t("coefficient non numérique refusé", true, casse((g) => (g.toiture.preventif.sans[2] = "trois")));
t("ligne de grille manquante refusée", true, casse((g) => delete g.toiture.curatif.sans));
t("un coefficient de trop refusé", true, casse((g) => g.toiture.preventif.sans.push(1)));
t("un seuil ajouté sans coefficient refusé", true, casse((g) => g.toiture.tranches.push(400)));
t("seuils décroissants refusés", true, casse((g) => (g.toiture.tranches[1] = 50)));
t("seuil non entier refusé", true, casse((g) => (g.toiture.tranches[0] = 99.5)));
t("seuil nul refusé", true, casse((g) => (g.toiture.tranches[0] = 0)));
t("seuils manquants refusés", true, casse((g) => delete g.toiture.tranches));
t("config absent refusé", true, validerConfig(null).length > 0);

console.log("  (l'erreur de config ci-dessous est attendue)");
const repli = creerCalculateur({ toiture: "n'importe quoi" });
t("repli → prix de la grille embarquée", true,
  repli.calculerDevis({ type: "curatif", etage: "avec", surfaceToit: 150, surfaceMur: 40 }).total > 0);
t("repli → version « repli »", "repli", repli.version);

console.log(ko === 0 ? "\nTous les tests passent." : `\n${ko} test(s) en échec.`);
process.exit(ko === 0 ? 0 : 1);
