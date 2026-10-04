// Construction de l'email récapitulatif d'une demande de devis — SystèmeDrone
// Fonctions pures, sans réseau : testées par `test/email.test.js`.
// (Le préfixe `_` empêche Vercel d'exposer ce fichier comme une route.)

const LIBELLES = {
  type: { preventif: "Préventif (toiture sale)", curatif: "Curatif (toiture très sale)" },
  etage: { sans: "Sans étage (plain-pied)", avec: "Avec étage (R+1 et plus)" },
};

const LONGUEUR_MAX = 200;
const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

const texte = (v) => (typeof v === "string" ? v.trim().slice(0, LONGUEUR_MAX) : "");

// Contrôle et nettoie la demande reçue du navigateur. Les montants envoyés par
// le client sont ignorés : le prix est toujours recalculé côté serveur.
function lireDemande(corps) {
  const c = corps && typeof corps === "object" ? corps : {};
  const d = {
    prenom: texte(c.prenom), nom: texte(c.nom), adresse: texte(c.adresse),
    email: texte(c.email), tel: texte(c.tel),
    type: c.type, etage: c.etage, typeToit: texte(c.typeToit),
    surfaceToit: c.surfaceToit, surfaceMur: c.surfaceMur,
  };
  const erreurs = [];
  if (!LIBELLES.type[d.type]) erreurs.push("type de prestation invalide");
  if (!LIBELLES.etage[d.etage]) erreurs.push("étage invalide");
  if (!d.email && !d.tel) erreurs.push("email ou téléphone requis");
  if (d.email && !EMAIL_RE.test(d.email)) erreurs.push("email invalide");
  return { demande: d, erreurs };
}

const euro = (n) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
const euroM2 = (n) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n) + "/m²";

const echapper = (s) =>
  String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

// Rend le sujet, le texte brut et le HTML de l'email à partir de la demande
// et du devis recalculé.
function construireEmail(demande, devis, versionTarifs) {
  const nomComplet = [demande.prenom, demande.nom].filter(Boolean).join(" ") || "Client";

  const coordonnees = [
    ["Nom", nomComplet],
    ["Adresse du bâtiment", demande.adresse || "—"],
    ["Email", demande.email || "—"],
    ["Téléphone", demande.tel || "—"],
  ];
  const prestation = [
    ["Prestation", LIBELLES.type[demande.type]],
    ["Bâtiment", LIBELLES.etage[demande.etage]],
    ["Type de toiture", demande.typeToit || "—"],
  ];
  const lignesPrix = [];
  if (devis.st > 0) {
    lignesPrix.push([`Toiture — ${devis.st} m² (${devis.trancheToit}, ${euroM2(devis.ct)})`, euro(devis.prixToit)]);
  }
  if (devis.sm > 0) {
    lignesPrix.push([`Murs — ${devis.sm} m² (${devis.trancheMur}, ${euroM2(devis.cm)})`, euro(devis.prixMur)]);
  }
  lignesPrix.push(["Total estimé TTC", euro(devis.total)]);

  const mention =
    "Estimation indicative TTC, hors accès particulier. Le devis définitif est établi après visite ou étude de photos.";

  const sujet = `Demande de devis — ${nomComplet} — ${euro(devis.total)}`;

  const blocTexte = (titre, lignes) => [titre, ...lignes.map(([k, v]) => `  ${k} : ${v}`)].join("\n");
  const corpsTexte = [
    "Récapitulatif de votre demande de devis SystèmeDrone",
    "",
    blocTexte("Vos coordonnées", coordonnees),
    "",
    blocTexte("Prestation", prestation),
    "",
    blocTexte("Estimation", lignesPrix),
    "",
    mention,
    `Grille tarifaire : ${versionTarifs}`,
  ].join("\n");

  const blocHtml = (titre, lignes, total) =>
    `<h2 style="font-size:16px;margin:24px 0 8px">${echapper(titre)}</h2>` +
    `<table style="border-collapse:collapse;width:100%;max-width:560px">` +
    lignes
      .map(([k, v], i) => {
        const gras = total && i === lignes.length - 1;
        const style = `padding:6px 0;border-bottom:1px solid #e5e2da${gras ? ";font-weight:bold" : ""}`;
        return `<tr><td style="${style}">${echapper(k)}</td><td style="${style};text-align:right">${echapper(v)}</td></tr>`;
      })
      .join("") +
    `</table>`;

  const corpsHtml =
    `<div style="font-family:Georgia,serif;color:#222;font-size:15px;line-height:1.5">` +
    `<h1 style="font-size:20px;margin:0 0 4px">Récapitulatif de votre demande de devis</h1>` +
    `<p style="margin:0;color:#666">SystèmeDrone — nettoyage de toitures et de murs par drone</p>` +
    blocHtml("Vos coordonnées", coordonnees) +
    blocHtml("Prestation", prestation) +
    blocHtml("Estimation", lignesPrix, true) +
    `<p style="color:#666;font-size:13px;margin-top:16px">${echapper(mention)}<br>Grille tarifaire : ${echapper(versionTarifs)}</p>` +
    `</div>`;

  return { sujet, texte: corpsTexte, html: corpsHtml };
}

module.exports = { lireDemande, construireEmail, echapper };
