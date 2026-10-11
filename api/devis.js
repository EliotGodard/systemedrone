// POST /api/devis — envoie par email le récapitulatif d'une demande de devis.
//
// Le prix est recalculé ici à partir de `config.json` : on ne fait jamais
// confiance au montant affiché dans le navigateur.
//
// Variables d'environnement (Vercel → Settings → Environment Variables) :
//   RESEND_API_KEY      clé API Resend (https://resend.com)
//   DEVIS_EXPEDITEUR    adresse d'envoi, sur un domaine vérifié chez Resend
//                       (ex. « SystèmeDrone <devis@systemedrone.fr> »). C'est
//                       aussi là qu'arrivent les réponses des clients.
//   DEVIS_DESTINATAIRE  qui reçoit les demandes (défaut : contact@systemedrone.fr).
//                       Jamais montrée au client : elle peut rester privée.
const { creerCalculateur } = require("../pricing.js");
const config = require("../config.json");
const { lireDemande, construireEmail } = require("./_email.js");

const calculateur = creerCalculateur(config);

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ erreur: "Méthode non autorisée" });
  }

  const { RESEND_API_KEY, DEVIS_EXPEDITEUR } = process.env;
  const destinataire = process.env.DEVIS_DESTINATAIRE || "contact@systemedrone.fr";
  if (!RESEND_API_KEY || !DEVIS_EXPEDITEUR) {
    console.error("[devis] RESEND_API_KEY ou DEVIS_EXPEDITEUR non configuré");
    return res.status(500).json({ erreur: "Envoi indisponible pour le moment" });
  }

  let corps = req.body;
  if (typeof corps === "string") {
    try { corps = JSON.parse(corps); } catch { corps = null; }
  }
  const { demande, erreurs } = lireDemande(corps);
  if (erreurs.length) return res.status(400).json({ erreur: erreurs.join(", ") });

  const devis = calculateur.calculerDevis(demande);
  if (devis.total <= 0) return res.status(400).json({ erreur: "aucune surface à traiter" });

  const { sujet, texte, html } = construireEmail(demande, devis, calculateur.version);

  // Deux emails distincts, pour que l'adresse de SystèmeDrone n'apparaisse
  // jamais chez le client :
  //  - SystèmeDrone reçoit sa copie, où « Répondre » écrit au client ;
  //  - le client reçoit son récapitulatif (s'il a laissé un email) ; sans
  //    reply_to, « Répondre » écrit à l'expéditeur, DEVIS_EXPEDITEUR.
  const envois = [{
    from: DEVIS_EXPEDITEUR,
    to: [destinataire],
    subject: "Nouvelle demande — " + sujet,
    text: texte,
    html,
    ...(demande.email && { reply_to: demande.email }),
  }];
  if (demande.email) {
    envois.push({ from: DEVIS_EXPEDITEUR, to: [demande.email], subject: sujet, text: texte, html });
  }

  try {
    const r = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(envois),
    });
    if (!r.ok) {
      console.error("[devis] Resend a refusé l'envoi :", r.status, await r.text());
      return res.status(502).json({ erreur: "L'email n'a pas pu être envoyé" });
    }
  } catch (e) {
    console.error("[devis] Resend injoignable :", e.message);
    return res.status(502).json({ erreur: "L'email n'a pas pu être envoyé" });
  }

  return res.status(200).json({ ok: true, total: devis.total, versionTarifs: calculateur.version });
};
