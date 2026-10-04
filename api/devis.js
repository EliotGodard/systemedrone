// POST /api/devis — envoie par email le récapitulatif d'une demande de devis.
//
// Le prix est recalculé ici à partir de `config.json` : on ne fait jamais
// confiance au montant affiché dans le navigateur.
//
// Variables d'environnement (Vercel → Settings → Environment Variables) :
//   RESEND_API_KEY      clé API Resend (https://resend.com)
//   DEVIS_EXPEDITEUR    adresse d'envoi, sur un domaine vérifié chez Resend
//                       (ex. « SystèmeDrone <devis@systemedrone.fr> »)
//   DEVIS_DESTINATAIRE  qui reçoit les demandes (défaut : contact@systemedrone.fr)
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

  // Le client reçoit son récapitulatif s'il a laissé un email ; SystèmeDrone
  // en reçoit toujours une copie, et peut lui répondre directement.
  const envoi = {
    from: DEVIS_EXPEDITEUR,
    to: demande.email ? [demande.email] : [destinataire],
    subject: sujet,
    text: texte,
    html,
  };
  if (demande.email) {
    envoi.bcc = [destinataire];
    envoi.reply_to = destinataire;
  }

  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(envoi),
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
