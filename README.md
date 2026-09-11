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

**Au quotidien :** ouvrir « Grille tarifaire », modifier les coefficients,
enregistrer. Le CMS pousse un commit, Vercel redéploie, les nouveaux tarifs sont
en ligne en une vingtaine de secondes.

Penser à mettre à jour le champ **Version** (la date du jour) à chaque changement
de prix : il accompagne chaque demande de devis, et c'est ce qui permettra plus
tard de savoir sur quels tarifs un devis donné a été établi.

### À la main

Éditer `config.json` directement, puis `git commit` :

```json
{
  "version": "2026-09-11",
  "tranches": [
    { "max": 100,  "label": "moins de 100 m²" },
    { "max": null, "label": "300 m² et +" }
  ],
  "toiture": {
    "preventif": { "sans": [...], "avec": [...] },
    "curatif":   { "sans": [...], "avec": [...] }
  },
  "murs": null
}
```

- `tranches` — les paliers de surface, du plus petit au plus grand. `max` est la
  borne **exclue** (`max: 100` = « moins de 100 m² »). La dernière tranche n'a pas
  de plafond : `max: null`.
- `toiture` — un coefficient en €/m² par tranche, **dans l'ordre des tranches**,
  pour chacune des quatre combinaisons préventif/curatif × sans/avec étage.
- `murs` — `null`, absent ou entièrement vide pour facturer les murs au même tarif
  que la toiture ; sinon la même structure que `toiture`. Une grille murs
  *partiellement* remplie est en revanche une erreur.

Ajouter ou retirer une tranche demande d'ajouter ou retirer le coefficient
correspondant sur **les quatre lignes** de la grille.

### Le garde-fou

Un tarif mal saisi ne casse pas le site, il sortirait des devis faux — le pire
des bugs, silencieux. `pricing.js` valide donc le config au chargement :
coefficients numériques et strictement positifs, seuils de tranches croissants,
nombre de coefficients égal au nombre de tranches, grille complète.

Si quelque chose cloche, le config est **refusé en bloc** et l'appli repart sur la
grille de repli embarquée dans `pricing.js`, en détaillant le problème dans la
console du navigateur. Le calculateur ne sort jamais un prix faux ni un 0 € muet.

C'est aussi pour ça que les tarifs de repli doivent rester en phase avec
`config.json` : ils sont le dernier filet. Après un gros changement de grille,
les reporter dans `CONFIG_DEFAUT` (`pricing.js`).
