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

const palier = (a_partir_de, preventif_sans, preventif_avec, curatif_sans, curatif_avec) =>
  ({ a_partir_de, preventif_sans, preventif_avec, curatif_sans, curatif_avec });

const CONFIG_DEFAUT = {
  version: "repli",
  toiture: {
    paliers: [
      palier(50, 4.5, 4, 5, 5.5),
      palier(101, 3.5, 3.5, 4, 4.5),
      palier(201, 2.5, 2.5, 3, 3.5),
      palier(300, 2, 2, 2, 2),
    ],
  },
  murs: {
    paliers: [
      palier(50, 3.5, 4, 4, 4.5),
      palier(101, 3, 3.5, 3.5, 4),
      palier(201, 2.5, 3, 3, 3.5),
      palier(301, 2, 2.5, 2, 3),
    ],
  },
};

const TYPES = ["preventif", "curatif"];
const ETAGES = ["sans", "avec"];

// ---------------------------------------------------------------------------
// Paliers et tranches
//
// Dans le config, une grille est une liste de paliers, un par ligne : la
// surface à partir de laquelle il s'applique et ses quatre coefficients.
// C'est la forme d'une grille tarifaire papier, et elle rend impossible le
// décalage entre nombre de seuils et nombre de prix — chaque seuil porte ses
// prix. L'ordre des lignes n'importe pas, elles sont triées ici.
//
// Le palier le plus bas couvre aussi les surfaces plus petites : « à partir
// de 50 » en premier palier ne laisse pas les toits de 30 m² sans prix.
//
// En interne, la grille est remise sous forme de seuils : [101, 201, 300]
// décrit quatre tranches (moins de 101 / 101 à 200 / 201 à 299 / 300 et +),
// chaque seuil étant la borne haute exclue de sa tranche.
//
// Les intitulés sont calculés à partir des seuils : plus rien à maintenir à la
// main, donc plus aucun risque qu'un intitulé contredise le seuil qu'il annonce.
// ---------------------------------------------------------------------------
const COLONNES = TYPES.flatMap((type) => ETAGES.map((etage) => ({ type, etage, champ: `${type}_${etage}` })));

function versTranches(paliers) {
  const tries = [...paliers].sort((a, b) => a.a_partir_de - b.a_partir_de);
  const grille = { tranches: tries.slice(1).map((p) => p.a_partir_de) };
  TYPES.forEach((type) => {
    grille[type] = {};
    ETAGES.forEach((etage) => (grille[type][etage] = tries.map((p) => p[`${type}_${etage}`])));
  });
  return grille;
}

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
// Le CMS bloque déjà les cases vides et les valeurs négatives ; restent les
// doublons, qu'il ne peut pas voir d'une ligne à l'autre.
// ---------------------------------------------------------------------------
const nomPalier = (p, i) =>
  p && Number.isFinite(p.a_partir_de) ? `palier « à partir de ${p.a_partir_de} m² »` : `palier ${i + 1}`;

function verifierGrille(nom, grille, err) {
  const paliers = grille && grille.paliers;
  if (!Array.isArray(paliers) || paliers.length === 0) {
    err.push(`${nom} : au moins un palier attendu`);
    return;
  }

  const vus = new Set();
  paliers.forEach((p, i) => {
    if (!p || typeof p !== "object") {
      err.push(`${nom}, palier ${i + 1} : illisible`);
      return;
    }
    const seuil = p.a_partir_de;
    if (!(Number.isInteger(seuil) && seuil >= 0)) {
      err.push(`${nom}, ${nomPalier(p, i)} : surface de départ entière ≥ 0 attendue (reçu ${JSON.stringify(seuil)})`);
    } else if (vus.has(seuil)) {
      err.push(`${nom} : deux paliers commencent à ${seuil} m²`);
    }
    vus.add(seuil);

    COLONNES.forEach(({ champ }) => {
      const c = p[champ];
      if (!(Number.isFinite(c) && c > 0)) {
        err.push(`${nom}, ${nomPalier(p, i)}, ${champ} : coefficient invalide (${JSON.stringify(c)})`);
      }
    });
  });
}

// Une grille murs sans aucun palier n'est pas renseignée : c'est ce que le CMS
// écrit quand l'éditeur laisse la section de côté. Elle vaut alors « mêmes
// tarifs et mêmes paliers que la toiture ».
function grilleRenseignee(grille) {
  return !!grille && Array.isArray(grille.paliers) && grille.paliers.length > 0;
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
    toiture: versTranches(config.toiture.paliers),
    murs: versTranches((grilleRenseignee(config.murs) ? config.murs : config.toiture).paliers),
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
    grilleRenseignee, versTranches, CONFIG_DEFAUT,
  };
}
