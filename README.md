# SystèmeDrone — Calculateur de devis

Appli web statique pour estimer le prix d'un nettoyage de toiture / murs par drone.
Le formulaire se parcourt étape par étape : une seule question s'affiche à la fois.
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
- `api/devis.js` — la fonction Vercel qui envoie le devis par email
- `api/_email.js` — le contenu de cet email (récapitulatif du devis et des coordonnées)
- `test/pricing.test.js` — les tests de la tarification
- `test/email.test.js` — les tests de l'envoi par email (aucun email réel n'est envoyé)

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
node test/email.test.js
```
Aucune dépendance. À relancer après toute modification de `pricing.js` ou de la
forme de `config.json`.

## Déployer sur Vercel
```bash
npm i -g vercel
vercel        # preview
vercel --prod # production
```
Aucun build nécessaire : un site statique, plus une fonction (`api/devis.js`).

## L'envoi du devis par email

Au clic sur « Demander mon devis », le navigateur envoie la demande à
`/api/devis`. La fonction **recalcule le prix** à partir de `config.json` (le
montant affiché dans le navigateur n'est jamais repris tel quel), puis envoie
par [Resend](https://resend.com) un email récapitulant le devis — prestation,
surfaces, détail du prix, total, version de la grille — et les coordonnées
saisies :

- si le client a laissé un email, il reçoit le récapitulatif, envoyé depuis
  `DEVIS_EXPEDITEUR`, avec SystèmeDrone en copie cachée (`DEVIS_DESTINATAIRE`,
  qui n'apparaît jamais chez le client) ; sinon, l'email part à SystèmeDrone
  seul ;
- « Répondre » côté client écrit à `DEVIS_EXPEDITEUR`. Client et SystèmeDrone
  ayant reçu le même message, les réponses se rangent dans un seul fil des
  deux côtés ;
- pour répondre au client depuis Gmail sous l'adresse `devis@`, ajouter
  `DEVIS_EXPEDITEUR` dans Gmail → Comptes et importation → « Envoyer des
  e-mails en tant que » (SMTP `smtp.resend.com`, port 465, utilisateur
  `resend`, mot de passe : une clé API Resend). « Répondre » sur la copie
  écrit alors directement au client.

**À configurer une fois** dans Vercel → Settings → Environment Variables :

| Variable | Rôle |
| --- | --- |
| `RESEND_API_KEY` | la clé API Resend |
| `DEVIS_EXPEDITEUR` | l'adresse d'envoi, sur un domaine vérifié chez Resend — ex. `SystèmeDrone <devis@systemedrone.fr>`. Les réponses des clients y arrivent : la rediriger (OVH → Emails → Redirections) vers la boîte qui traite les devis |
| `DEVIS_DESTINATAIRE` | qui reçoit les demandes (défaut : `contact@systemedrone.fr`) ; jamais montrée au client |

Sans ces variables, la demande échoue proprement : le client voit un message
l'invitant à écrire à contact@systemedrone.fr. En local avec `npx serve`, la
route n'existe pas ; utiliser `vercel dev` pour tester l'envoi.

---

## Modifier les tarifs

### Depuis le CMS (sans toucher au code)

Le dépôt est prêt pour [Pages CMS](https://pagescms.org) — rien à héberger, le
schéma d'édition est dans `.pages.yml`.

**Mise en place, une seule fois :** aller sur [app.pagescms.org](https://app.pagescms.org),
se connecter avec le compte GitHub qui héberge ce dépôt, et l'y ajouter. Le CMS
lit `.pages.yml` et génère le formulaire d'édition automatiquement.

**Au quotidien :** ouvrir « Grille tarifaire », modifier les paliers,
enregistrer. Le CMS pousse un commit, Vercel redéploie, les
nouveaux tarifs sont en ligne en une vingtaine de secondes.

Penser à mettre à jour le champ **Version** (la date du jour) à chaque changement
de prix : il accompagne chaque demande de devis, et c'est ce qui permettra plus
tard de savoir sur quels tarifs un devis donné a été établi.

### La forme du config

```json
{
  "version": "2026-09-11",
  "toiture": {
    "paliers": [
      { "a_partir_de": 0,   "preventif_sans": 5, "preventif_avec": 5.5, "curatif_sans": 5.5, "curatif_avec": 6 },
      { "a_partir_de": 101, "preventif_sans": 4, "preventif_avec": 4.5, "curatif_sans": 4.5, "curatif_avec": 5 },
      { "a_partir_de": 301, "preventif_sans": 3, "preventif_avec": 3.5, "curatif_sans": 3.5, "curatif_avec": 4 }
    ]
  },
  "murs": { "paliers": [ ... ] }
}
```

**Une ligne par palier**, avec sa surface de départ et ses quatre prix — la
forme d'une grille tarifaire papier. L'exemple ci-dessus décrit trois tranches :
moins de 101 m², 101 à 300 m², 301 m² et plus.

Cette forme remplace l'ancienne (une liste de seuils + quatre listes de prix
dont les longueurs devaient concorder) : le client y avait saisi autant de
seuils que de prix, le config était refusé et le site tournait sur la grille de
repli sans que personne ne le voie. Chaque palier portant désormais ses propres
prix, ce décalage ne peut plus exister.

- **L'ordre des lignes est libre**, elles sont triées au chargement.
- **Le palier le plus bas couvre aussi les surfaces plus petites** : sans
  palier « à partir de 0 », un toit de 30 m² est facturé au prix du premier.
- Le CMS refuse d'enregistrer une case vide ou une valeur négative. Seul
  défaut qu'il ne voit pas : deux paliers à la même surface — `pricing.js` le
  refuse.

**Les intitulés affichés (« 101 à 200 m² ») sont calculés à partir des paliers.**
Il n'y a rien à saisir, et un intitulé ne peut plus contredire le seuil qu'il
annonce — c'est arrivé une fois, le seuil étant passé de 100 à 80 m² sans que
l'intitulé suivant ne bouge.

**Toiture et murs ont chacun leurs propres paliers.** Une façade fait rarement la
surface d'un toit : avec des paliers communs, la dégressivité pensée pour la
toiture ne jouait quasiment jamais sur les murs. Chaque surface est classée sur
les paliers de sa propre grille.

Ne mettre aucun palier dans `murs` (ou omettre la section) revient à facturer
les murs exactement comme la toiture, paliers compris.

> ⚠️ **Les tarifs murs actuellement dans `config.json` sont provisoires** — des
> valeurs de remplissage cohérentes, en attendant les vraies. C'est ce que
> signale le suffixe du champ `version`.

### Le garde-fou

Un tarif mal saisi ne casse pas le site, il sortirait des devis faux — le pire
des bugs, silencieux. `pricing.js` valide donc le config au chargement : au moins un
palier pour la toiture, surfaces de départ entières, positives et toutes
différentes, quatre coefficients numériques et strictement positifs par palier.

Si quelque chose cloche, le config est **refusé en bloc** et l'appli repart sur la
grille de repli embarquée dans `pricing.js`, en détaillant le problème dans la
console du navigateur. Le calculateur ne sort jamais un prix faux ni un 0 € muet.

C'est aussi pour ça que les tarifs de repli doivent rester en phase avec
`config.json` : ils sont le dernier filet. Après un gros changement de grille,
les reporter dans `CONFIG_DEFAUT` (`pricing.js`).
