// ---------------------------------------------------------------------------
// Logique de tarification — SystèmeDrone
// D'après la note : Prix = S_T × C_T + S_M × C_M
//   S_T = surface toiture (m²)   C_T = coeff. toiture (€/m²)
//   S_M = surface murs   (m²)    C_M = coeff. murs    (€/m²)
// Le coefficient dépend de : préventif/curatif, avec/sans étage, tranche de surface.
// ---------------------------------------------------------------------------

// Grille C_T (€/m²) — tranches de surface : [ <100, 100–199, 200–299, 300+ ]
const GRILLE = {
  preventif: {
    sans: [5.0, 4.0, 3.0, 2.0],
    avec: [5.5, 4.5, 3.5, 2.5],
  },
  curatif: {
    sans: [5.5, 4.5, 3.5, 2.5],
    avec: [6.0, 5.0, 4.0, 3.0],
  },
};

// La grille C_M (murs) était vide sur la note → on réutilise la même grille par
// défaut. Ajuste ces valeurs si le tarif mur doit différer du tarif toiture.
const GRILLE_MURS = GRILLE;

// Tranche de surface → index de colonne (0,100,200,300+)
function trancheIndex(surface) {
  if (surface < 100) return 0;
  if (surface < 200) return 1;
  if (surface < 300) return 2;
  return 3;
}

function libelleTranche(i) {
  return ["moins de 100 m²", "100 à 199 m²", "200 à 299 m²", "300 m² et +"][i];
}

// Coefficient €/m² pour une grille donnée
function coefficient(grille, { type, etage, surface }) {
  const idx = trancheIndex(surface);
  return grille[type][etage][idx];
}

// Calcul complet du devis
function calculerDevis({ type, etage, surfaceToit, surfaceMur }) {
  const st = Math.max(0, Number(surfaceToit) || 0);
  const sm = Math.max(0, Number(surfaceMur) || 0);

  const ct = st > 0 ? coefficient(GRILLE, { type, etage, surface: st }) : 0;
  const cm = sm > 0 ? coefficient(GRILLE_MURS, { type, etage, surface: sm }) : 0;

  const prixToit = st * ct;
  const prixMur = sm * cm;
  const total = prixToit + prixMur;

  return {
    st, sm, ct, cm, prixToit, prixMur, total,
    trancheToit: st > 0 ? libelleTranche(trancheIndex(st)) : null,
    trancheMur: sm > 0 ? libelleTranche(trancheIndex(sm)) : null,
  };
}

// Export pour le navigateur + tests éventuels
if (typeof window !== "undefined") {
  window.SystemeDrone = { calculerDevis, GRILLE };
}
if (typeof module !== "undefined") {
  module.exports = { calculerDevis, coefficient, trancheIndex, GRILLE };
}
