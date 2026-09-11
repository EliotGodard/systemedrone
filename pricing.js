// ---------------------------------------------------------------------------
// Logique de tarification — SystèmeDrone
// D'après la note : Prix = S_T × C_T + S_M × C_M
//   S_T = surface toiture (m²)   C_T = coeff. toiture (€/m²)
//   S_M = surface murs   (m²)    C_M = coeff. murs    (€/m²)
// Le coefficient dépend de : préventif/curatif, avec/sans étage, tranche de surface.
// Toiture et murs ont chacun leurs propres seuils : des murs font rarement la
// surface d'un toit, leur dégressivité ne peut pas suivre les mêmes paliers.
//
// Les tarifs vivent dans `config.json`, éditable depuis le CMS sans toucher au
// code. La grille ci-dessous n'est qu'un repli : elle sert uniquement si le
// fichier est absent, illisible ou invalide, pour que le calculateur ne sorte
// jamais un prix faux ni un 0 € silencieux. À garder en phase avec config.json.
// ---------------------------------------------------------------------------

const CONFIG_DEFAUT = {
  version: "repli",
  toiture: {
    tranches: [80, 200, 300],
    preventif: { sans: [5.0, 4.0, 3.0, 2.0], avec: [5.5, 4.5, 3.5, 2.5] },
    curatif: { sans: [5.5, 4.5, 3.5, 2.5], avec: [6.0, 5.0, 4.0, 3.0] },
  },
  murs: {
    tranches: [40, 80, 150],
    preventif: { sans: [4.0, 3.5, 3.0, 2.5], avec: [4.5, 4.0, 3.5, 3.0] },
    curatif: { sans: [4.5, 4.0, 3.5, 3.0], avec: [5.0, 4.5, 4.0, 3.5] },
  },
};

const TYPES = ["preventif", "curatif"];
const ETAGES = ["sans", "avec"];

// ---------------------------------------------------------------------------
// Tranches
//
// `tranches` ne contient que les seuils : [80, 200, 300] décrit quatre tranches
// (moins de 80 / 80 à 199 / 200 à 299 / 300 et +). Un seuil est la borne haute
// exclue de sa tranche. Il y a donc toujours un coefficient de plus que de
// seuils — une liste vide décrit un tarif unique, sans dégressivité.
//
// Les intitulés sont calculés à partir des seuils : plus rien à maintenir à la
// main, donc plus aucun risque qu'un intitulé contredise le seuil qu'il annonce.
// ---------------------------------------------------------------------------
const nombre = (n) => new Intl.NumberFormat("fr-FR").format(n);

function libelleTranche(tranches, i) {
  const bas = i === 0 ? null : tranches[i - 1];
  const haut = i < tranches.length ? tranches[i] : null;
  if (haut === null) return bas === null ? "toute surface" : `${nombre(bas)} m² et +`;
  if (bas === null) return `moins de ${nombre(haut)} m²`;
  return `${nombre(bas)} à ${nombre(haut - 1)} m²`;
}

function trancheIndex(tranches, surface) {
  const i = tranches.findIndex((seuil) => surface < seuil);
  return i === -1 ? tranches.length : i;
}

// ---------------------------------------------------------------------------
// Validation : un tarif mal saisi ne casse pas le site, il sort des devis faux.
// On préfère refuser le config et repartir sur la grille embarquée.
// ---------------------------------------------------------------------------
function verifierGrille(nom, grille, err) {
  if (!grille || typeof grille !== "object") {
    err.push(`\`${nom}\` manquant`);
    return;
  }

  const tranches = grille.tranches;
  let attendus = null;
  if (!Array.isArray(tranches)) {
    err.push(`${nom}.tranches : liste de seuils attendue (ex. [80, 200, 300])`);
  } else {
    let croissance = true;
    tranches.forEach((seuil, i) => {
      if (!(Number.isInteger(seuil) && seuil > 0)) {
        err.push(`${nom}.tranches, seuil ${i + 1} : entier > 0 attendu (reçu ${JSON.stringify(seuil)})`);
      }
      if (i > 0 && !(seuil > tranches[i - 1]) && croissance) {
        err.push(`${nom}.tranches : les seuils doivent être strictement croissants`);
        croissance = false;
      }
    });
    attendus = tranches.length + 1;
  }

  TYPES.forEach((type) =>
    ETAGES.forEach((etage) => {
      const ligne = grille[type] && grille[type][etage];
      if (!Array.isArray(ligne)) {
        err.push(`${nom}.${type}.${etage} : liste de coefficients attendue`);
        return;
      }
      if (attendus !== null && ligne.length !== attendus) {
        err.push(`${nom}.${type}.${etage} : ${ligne.length} coefficient(s) pour ${attendus} tranche(s)`);
      }
      ligne.forEach((c, i) => {
        if (!(Number.isFinite(c) && c > 0)) {
          err.push(`${nom}.${type}.${etage}, tranche ${i + 1} : coefficient invalide (${JSON.stringify(c)})`);
        }
      });
    })
  );
}

// Une grille sans aucun coefficient n'est pas renseignée : c'est ce que le CMS
// écrit quand l'éditeur laisse une section de côté. Pour les murs, cela vaut
// « mêmes tarifs et mêmes seuils que la toiture ». Une grille à moitié
// remplie, elle, reste une erreur.
function grilleRenseignee(grille) {
  if (!grille || typeof grille !== "object") return false;
  return TYPES.some((type) =>
    ETAGES.some((etage) => {
      const ligne = grille[type] && grille[type][etage];
      return Array.isArray(ligne) ? ligne.length > 0 : ligne != null;
    })
  );
}

function validerConfig(cfg) {
  if (!cfg || typeof cfg !== "object") return ["config absent ou illisible"];
  const err = [];
  verifierGrille("toiture", cfg.toiture, err);
  if (grilleRenseignee(cfg.murs)) verifierGrille("murs", cfg.murs, err);
  return err;
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

  const grilles = {
    toiture: config.toiture,
    murs: grilleRenseignee(config.murs) ? config.murs : config.toiture,
  };

  const coefficient = (grille, { type, etage, surface }) => {
    const ligne = grille[type] && grille[type][etage];
    if (!ligne) return 0;
    return ligne[trancheIndex(grille.tranches, surface)];
  };

  const libelle = (grille, surface) => libelleTranche(grille.tranches, trancheIndex(grille.tranches, surface));

  function calculerDevis({ type, etage, surfaceToit, surfaceMur }) {
    const st = Math.max(0, Number(surfaceToit) || 0);
    const sm = Math.max(0, Number(surfaceMur) || 0);

    const ct = st > 0 ? coefficient(grilles.toiture, { type, etage, surface: st }) : 0;
    const cm = sm > 0 ? coefficient(grilles.murs, { type, etage, surface: sm }) : 0;

    const prixToit = st * ct;
    const prixMur = sm * cm;

    return {
      st, sm, ct, cm, prixToit, prixMur,
      total: prixToit + prixMur,
      trancheToit: st > 0 ? libelle(grilles.toiture, st) : null,
      trancheMur: sm > 0 ? libelle(grilles.murs, sm) : null,
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
  module.exports = {
    creerCalculateur, validerConfig, trancheIndex, libelleTranche,
    grilleRenseignee, CONFIG_DEFAUT,
  };
}
