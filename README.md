# SystèmeDrone — Calculateur de devis

Appli web statique pour estimer le prix d'un nettoyage de toiture / murs par drone.
Le formulaire se parcourt étape par étape : une seule question s'affiche, centrée à l'écran.
Reprend la formule et la grille tarifaire de la note :

```
Prix = S_T × C_T + S_M × C_M
```

## Fichiers
- `index.html` — l'interface (parcours en 6 étapes, une question à la fois)
- `styles.css` — le design
- `config.json` — **les tarifs**, édités depuis le CMS (voir plus bas)
- `pricing.js` — la logique de tarification, calculée à partir de `config.json`
- `app.js` — la navigation entre étapes et le calcul en direct
- `.pages.yml` — le schéma d'édition du CMS
- `test/pricing.test.js` — les tests de la tarification

## Lancer en local
```bash
npx serve .          # ou : python3 -m http.server 8000
```
Puis ouvrir http://localhost:8000

Il faut un serveur : `app.js` charge `config.json` par `fetch`, ce qu'un simple
double-clic sur `index.html` (`file://`) ne permet pas. Dans ce cas l'appli se
rabat sur les tarifs de repli et le prévient dans la console.

## Tests
```bash
node test/pricing.test.js
```
Aucune dépendance. À relancer après toute modification de `pricing.js` ou de la
forme de `config.json`.

## Déployer sur Vercel
```bash
npm i -g vercel
vercel        # preview
vercel --prod # production
```
Aucun build nécessaire : c'est un site statique.

---

## Modifier les tarifs

### Depuis le CMS (sans toucher au code)

Le dépôt est prêt pour [Pages CMS](https://pagescms.org) — rien à héberger, le
schéma d'édition est dans `.pages.yml`.

**Mise en place, une seule fois :** aller sur [app.pagescms.org](https://app.pagescms.org),
se connecter avec le compte GitHub qui héberge ce dépôt, et l'y ajouter. Le CMS
lit `.pages.yml` et génère le formulaire d'édition automatiquement.

**Au quotidien :** ouvrir « Grille tarifaire », modifier les seuils et les
coefficients, enregistrer. Le CMS pousse un commit, Vercel redéploie, les
nouveaux tarifs sont en ligne en une vingtaine de secondes.

Penser à mettre à jour le champ **Version** (la date du jour) à chaque changement
de prix : il accompagne chaque demande de devis, et c'est ce qui permettra plus
tard de savoir sur quels tarifs un devis donné a été établi.

### La forme du config

```json
{
  "version": "2026-09-11",
  "toiture": {
    "tranches": [80, 200, 300],
    "preventif": { "sans": [5, 4, 3, 2],       "avec": [5.5, 4.5, 3.5, 2.5] },
    "curatif":   { "sans": [5.5, 4.5, 3.5, 2.5], "avec": [6, 5, 4, 3] }
  },
  "murs": {
    "tranches": [40, 80, 150],
    "preventif": { "sans": [...], "avec": [...] },
    "curatif":   { "sans": [...], "avec": [...] }
  }
}
```

**`tranches` ne contient que les seuils.** Chacun est la borne haute *exclue* de
sa tranche : `[80, 200, 300]` décrit quatre tranches — moins de 80 m², 80 à
199 m², 200 à 299 m², 300 m² et plus. Il y a donc toujours **un coefficient de
plus que de seuils**. Une liste vide décrit un tarif unique, sans dégressivité.

**Les intitulés affichés (« 80 à 199 m² ») sont calculés à partir des seuils.**
Il n'y a rien à saisir, et un intitulé ne peut plus contredire le seuil qu'il
annonce — c'est arrivé une fois, le seuil étant passé de 100 à 80 m² sans que
l'intitulé suivant ne bouge.

**Toiture et murs ont chacun leurs propres seuils.** Une façade fait rarement la
surface d'un toit : avec des paliers communs, la dégressivité pensée pour la
toiture ne jouait quasiment jamais sur les murs. Chaque surface est classée sur
les seuils de sa propre grille.

Laisser toute la section `murs` vide (ou l'omettre) revient à facturer les murs
exactement comme la toiture, seuils compris.

> ⚠️ **Les tarifs murs actuellement dans `config.json` sont provisoires** — des
> valeurs de remplissage cohérentes, en attendant les vraies. C'est ce que
> signale le suffixe du champ `version`.

### Le garde-fou

Un tarif mal saisi ne casse pas le site, il sortirait des devis faux — le pire
des bugs, silencieux. `pricing.js` valide donc le config au chargement : seuils
entiers, positifs et strictement croissants, coefficients numériques et
strictement positifs, un coefficient de plus que de seuils, grille complète.

Si quelque chose cloche, le config est **refusé en bloc** et l'appli repart sur la
grille de repli embarquée dans `pricing.js`, en détaillant le problème dans la
console du navigateur. Le calculateur ne sort jamais un prix faux ni un 0 € muet.

C'est aussi pour ça que les tarifs de repli doivent rester en phase avec
`config.json` : ils sont le dernier filet. Après un gros changement de grille,
les reporter dans `CONFIG_DEFAUT` (`pricing.js`).
