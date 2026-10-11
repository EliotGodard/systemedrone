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
const { creerCalculateur, validerConfig, libelleTranche, trancheIndex, versTranches } = require("../pricing.js");

let ko = 0;
const t = (nom, attendu, obtenu) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? "✓" : "✗"} ${nom}${ok ? "" : `\n    attendu ${JSON.stringify(attendu)}, obtenu ${JSON.stringify(obtenu)}`}`);
};
const copie = (o) => JSON.parse(JSON.stringify(o));
// Un palier, dans l'ordre des colonnes du CMS.
const P = (a_partir_de, preventif_sans, preventif_avec, curatif_sans, curatif_avec) =>
  ({ a_partir_de, preventif_sans, preventif_avec, curatif_sans, curatif_avec });
// Même prix dans les quatre colonnes, pour les cas où seul le palier compte.
const U = (a_partir_de, prix) => P(a_partir_de, prix, prix, prix, prix);

// ── Grille de test, volontairement figée ──────────────────────────────────
const GRILLE = {
  version: "test",
  toiture: {
    paliers: [
      P(0, 5, 5.5, 5.5, 6),
      P(100, 4, 4.5, 4.5, 5),
      P(200, 3, 3.5, 3.5, 4),
      P(300, 2, 2.5, 2.5, 3),
    ],
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

console.log("\n— Les paliers, remis sous forme de seuils —");

t("le premier palier ne fait pas seuil", [101, 201, 300],
  versTranches([U(50, 4), U(101, 3), U(201, 2), U(300, 1)]).tranches);
t("chaque colonne devient une ligne de la grille", { sans: [5, 4], avec: [6, 5] },
  versTranches([P(0, 9, 9, 5, 6), P(100, 9, 9, 4, 5)]).curatif);
t("paliers triés, quel que soit l'ordre de saisie", { tranches: [100, 200], sans: [5, 4, 3] }, (() => {
  const g = versTranches([U(200, 3), U(0, 5), U(100, 4)]);
  return { tranches: g.tranches, sans: g.preventif.sans };
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
t("intitulé remonté avec le devis", "200 à 299 m²",
  calculerDevis({ type: "curatif", etage: "avec", surfaceToit: 250 }).trancheToit);
t("surface nulle → 0 €", 0, calculerDevis({ type: "curatif", etage: "avec", surfaceToit: 0, surfaceMur: 0 }).total);
t("surface négative ignorée", 0, calculerDevis({ type: "curatif", etage: "avec", surfaceToit: -50 }).total);
t("tarif modifié pris en compte", 800, (() => {
  const g = copie(GRILLE);
  g.toiture.paliers.forEach((p, i) => (p.preventif_sans = 10 - i));
  return creerCalculateur(g).calculerDevis({ type: "preventif", etage: "sans", surfaceToit: 80 }).total;
})());
t("nombre de tranches libre (2 paliers)", [400, 600], (() => {
  const g = copie(GRILLE);
  g.toiture = { paliers: [U(0, 4), U(150, 3)] };
  const c = creerCalculateur(g);
  return [
    c.calculerDevis({ type: "preventif", etage: "sans", surfaceToit: 100 }).total,
    c.calculerDevis({ type: "preventif", etage: "sans", surfaceToit: 200 }).total,
  ];
})());
t("aucun seuil = tarif unique", 1000, (() => {
  const g = copie(GRILLE);
  g.toiture = { paliers: [U(0, 4)] };
  return creerCalculateur(g).calculerDevis({ type: "preventif", etage: "sans", surfaceToit: 250 }).total;
})());
t("pas de palier à 0 → le plus bas couvre les petites surfaces", [120, 400, "moins de 101 m²"], (() => {
  const g = copie(GRILLE);
  g.toiture = { paliers: [U(50, 4), U(101, 3)] };
  const c = creerCalculateur(g);
  const d = c.calculerDevis({ type: "preventif", etage: "sans", surfaceToit: 30 });
  return [d.total, c.calculerDevis({ type: "preventif", etage: "sans", surfaceToit: 100 }).total, d.trancheToit];
})());
t("la grille du client : 101 = « à partir de 101 »", ["101 à 200 m²", 3.5], (() => {
  const g = copie(GRILLE);
  g.toiture = { paliers: [U(50, 4.5), U(101, 3.5), U(201, 2.5), U(300, 2)] };
  const d = creerCalculateur(g).calculerDevis({ type: "preventif", etage: "sans", surfaceToit: 101 });
  return [d.trancheToit, d.ct];
})());

console.log("\n— Les murs, avec leurs propres seuils —");

const MIXTE = copie(GRILLE);
MIXTE.murs = { paliers: [U(0, 3), U(40, 2), U(80, 1)] };
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
  validerConfig(MIXTE)); // 4 paliers côté toit, 3 côté murs
t("murs absents → seuils et tarifs de la toiture", 990, (() => {
  const g = copie(GRILLE);
  delete g.murs; // ce que le CMS écrit quand la section est laissée vide
  return creerCalculateur(g).calculerDevis({ type: "curatif", etage: "avec", surfaceToit: 150, surfaceMur: 40 }).total;
})());
t("murs sans palier acceptés", [], (() => {
  const g = copie(GRILLE);
  g.murs = { paliers: [] };
  return validerConfig(g);
})());
t("murs sans palier → tarif toiture", 990, (() => {
  const g = copie(GRILLE);
  g.murs = { paliers: [] };
  return creerCalculateur(g).calculerDevis({ type: "curatif", etage: "avec", surfaceToit: 150, surfaceMur: 40 }).total;
})());
t("palier murs incomplet refusé", true, (() => {
  const g = copie(GRILLE);
  g.murs = { paliers: [U(0, 3), { a_partir_de: 40, preventif_sans: 2 }] };
  return validerConfig(g).length > 0;
})());

console.log("\n— Les garde-fous —");

const casse = (mut) => { const g = copie(GRILLE); mut(g); return validerConfig(g).length > 0; };
const pal = (g, i) => g.toiture.paliers[i];
t("coefficient négatif refusé", true, casse((g) => (pal(g, 0).curatif_avec = -3)));
t("coefficient nul refusé", true, casse((g) => (pal(g, 0).curatif_avec = 0)));
t("coefficient non numérique refusé", true, casse((g) => (pal(g, 2).preventif_sans = "trois")));
t("case vide refusée", true, casse((g) => (pal(g, 1).curatif_sans = "")));
t("colonne manquante refusée", true, casse((g) => delete pal(g, 1).curatif_sans));
t("deux paliers à la même surface refusés", true, casse((g) => (pal(g, 2).a_partir_de = 100)));
t("surface de départ non entière refusée", true, casse((g) => (pal(g, 1).a_partir_de = 99.5)));
t("surface de départ négative refusée", true, casse((g) => (pal(g, 1).a_partir_de = -10)));
t("surface de départ vide refusée", true, casse((g) => (pal(g, 1).a_partir_de = "")));
t("paliers dans le désordre acceptés", [], (() => {
  const g = copie(GRILLE);
  g.toiture.paliers.reverse();
  return validerConfig(g);
})());
t("toiture sans palier refusée", true, casse((g) => (g.toiture.paliers = [])));
t("toiture absente refusée", true, casse((g) => delete g.toiture));
t("config absent refusé", true, validerConfig(null).length > 0);

console.log("  (l'erreur de config ci-dessous est attendue)");
const repli = creerCalculateur({ toiture: "n'importe quoi" });
t("repli → prix de la grille embarquée", true,
  repli.calculerDevis({ type: "curatif", etage: "avec", surfaceToit: 150, surfaceMur: 40 }).total > 0);
t("repli → version « repli »", "repli", repli.version);

console.log(ko === 0 ? "\nTous les tests passent." : `\n${ko} test(s) en échec.`);
process.exit(ko === 0 ? 0 : 1);
