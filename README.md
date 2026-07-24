# SystèmeDrone — Calculateur de devis

Appli web statique pour estimer le prix d'un nettoyage de toiture / murs par drone.
Reprend la formule et la grille tarifaire de la note :

```
Prix = S_T × C_T + S_M × C_M
```

## Fichiers
- `index.html` — l'interface (formulaire + estimation en direct)
- `styles.css` — le design
- `pricing.js` — la logique de tarification (grille C_T / C_M)
- `app.js` — l'interactivité + génération de la demande de devis par email

## Lancer en local
```bash
npx serve .          # ou : python3 -m http.server 8000
```
Puis ouvrir http://localhost:8000

## Déployer sur Vercel
```bash
npm i -g vercel
vercel        # preview
vercel --prod # production
```
Aucun build nécessaire : c'est un site statique.

## Modifier les tarifs
Tout est dans `pricing.js` :
- `GRILLE` = coefficients toiture (€/m²) par [préventif/curatif][avec/sans étage][tranche de surface]
- Les tranches de surface : `< 100`, `100–199`, `200–299`, `300+`
- `GRILLE_MURS` = coefficients murs (identique à la toiture par défaut — la grille C_M
  était vide sur la note, à ajuster si le tarif mur doit différer)
