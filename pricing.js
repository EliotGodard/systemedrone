// ---------------------------------------------------------------------------
// Logique de tarification — SystèmeDrone
// D'après la note : Prix = S_T × C_T + S_M × C_M
//   S_T = surface toiture (m²)   C_T = coeff. toiture (€/m²)
//   S_M = surface murs   (m²)    C_M = coeff. murs    (€/m²)
// Le coefficient dépend de : préventif/curatif, avec/sans étage, tranche de surface.
//
// Les tarifs vivent dans `config.json`, éditable depuis le CMS sans toucher au
// code. La grille ci-dessous n'est qu'un repli : elle sert uniquement si le
// fichier est absent, illisible ou invalide, pour que le calculateur ne sorte
// jamais un prix faux ni un 0 € silencieux.
// ---------------------------------------------------------------------------

const CONFIG_DEFAUT = {
  version: "repli",
  tranches: [
    { max: 100, label: "moins de 100 m²" },
    { max: 200, label: "100 à 199 m²" },
    { max: 300, label: "200 à 299 m²" },
    { max: null, label: "300 m² et +" },
  ],
  toiture: {
    preventif: { sans: [5.0, 4.0, 3.0, 2.0], avec: [5.5, 4.5, 3.5, 2.5] },
    curatif: { sans: [5.5, 4.5, 3.5, 2.5], avec: [6.0, 5.0, 4.0, 3.0] },
  },
  murs: null, // null = mêmes tarifs que la toiture
};

const TYPES = ["preventif", "curatif"];
const ETAGES = ["sans", "avec"];

// ---------------------------------------------------------------------------
// Validation : un tarif mal saisi ne casse pas le site, il sort des devis faux.
// On préfère refuser le config et repartir sur la grille embarquée.
// ---------------------------------------------------------------------------
function validerConfig(cfg) {
  const err = [];
  if (!cfg || typeof cfg !== "object") return ["config absent ou illisible"];

  const tranches = cfg.tranches;
  if (!Array.isArray(tranches) || tranches.length === 0) {
    err.push("`tranches` doit être une liste non vide");
  } else {
    tranches.forEach((t, i) => {
      const derniere = i === tranches.length - 1;
      if (!t || typeof t !== "object") { err.push(`tranche ${i + 1} : objet attendu`); return; }
      if (derniere) {
        if (t.max !== null && t.max !== undefined) {
          err.push("la dernière tranche doit avoir `max: null` (pas de plafond)");
        }
      } else if (!(Number.isFinite(t.max) && t.max > 0)) {
        err.push(`tranche ${i + 1} : \`max\` doit être un nombre > 0`);
      }
      if (!t.label) err.push(`tranche ${i + 1} : \`label\` manquant`);
    });

    const seuils = tranches.slice(0, -1).map((t) => t.max);
    if (seuils.some((v, i) => i > 0 && !(v > seuils[i - 1]))) {
      err.push("les seuils de tranches doivent être strictement croissants");
    }
  }

  const verifierGrille = (nom, grille) => {
    if (!grille || typeof grille !== "object") { err.push(`\`${nom}\` manquant`); return; }
    TYPES.forEach((type) =>
      ETAGES.forEach((etage) => {
        const ligne = grille[type] && grille[type][etage];
        if (!Array.isArray(ligne)) {
          err.push(`${nom}.${type}.${etage} : liste de coefficients attendue`);
          return;
        }
        if (Array.isArray(tranches) && ligne.length !== tranches.length) {
          err.push(`${nom}.${type}.${etage} : ${ligne.length} coefficient(s) pour ${tranches.length} tranche(s)`);
        }
        ligne.forEach((c, i) => {
          if (!(Number.isFinite(c) && c > 0)) {
            err.push(`${nom}.${type}.${etage}, tranche ${i + 1} : coefficient invalide (${c})`);
          }
        });
      })
    );
  };

  verifierGrille("toiture", cfg.toiture);
  if (cfg.murs) verifierGrille("murs", cfg.murs);

  return err;
}

// Tranche de surface → index de colonne dans la grille
function trancheIndex(tranches, surface) {
  const i = tranches.findIndex((t) => t.max === null || t.max === undefined || surface < t.max);
  return i === -1 ? tranches.length - 1 : i;
}

// ---------------------------------------------------------------------------
// Fabrique le calculateur à partir d'un config (celui de `config.json`, ou
// `null` si le chargement a échoué → repli).
// ---------------------------------------------------------------------------
function creerCalculateur(configBrut) {
  const erreurs = validerConfig(configBrut);
  const valide = erreurs.length === 0;
  const config = valide ? configBrut : CONFIG_DEFAUT;

  if (!valide && typeof console !== "undefined") {
    console.error(
      "[SystèmeDrone] config.json refusé, tarifs de repli utilisés :\n- " + erreurs.join("\n- ")
    );
  }

  const grilleMurs = config.murs || config.toiture;

  const coefficient = (grille, { type, etage, surface }) => {
    const ligne = grille[type] && grille[type][etage];
    if (!ligne) return 0;
    return ligne[trancheIndex(config.tranches, surface)];
  };

  const libelleTranche = (surface) => config.tranches[trancheIndex(config.tranches, surface)].label;

  function calculerDevis({ type, etage, surfaceToit, surfaceMur }) {
    const st = Math.max(0, Number(surfaceToit) || 0);
    const sm = Math.max(0, Number(surfaceMur) || 0);

    const ct = st > 0 ? coefficient(config.toiture, { type, etage, surface: st }) : 0;
    const cm = sm > 0 ? coefficient(grilleMurs, { type, etage, surface: sm }) : 0;

    const prixToit = st * ct;
    const prixMur = sm * cm;

    return {
      st, sm, ct, cm, prixToit, prixMur,
      total: prixToit + prixMur,
      trancheToit: st > 0 ? libelleTranche(st) : null,
      trancheMur: sm > 0 ? libelleTranche(sm) : null,
    };
  }

  return {
    calculerDevis,
    config,
    erreurs,
    // Version de la grille ayant servi au calcul : à joindre à toute demande
    // de devis, pour savoir plus tard sur quels tarifs elle a été établie.
    version: config.version,
  };
}

// Export pour le navigateur + tests éventuels
if (typeof window !== "undefined") {
  window.SystemeDrone = { creerCalculateur, validerConfig, CONFIG_DEFAUT };
}
if (typeof module !== "undefined") {
  module.exports = { creerCalculateur, validerConfig, trancheIndex, CONFIG_DEFAUT };
}
