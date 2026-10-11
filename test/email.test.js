// Tests de l'envoi du devis par email — aucune dépendance : `node test/email.test.js`
// L'appel à Resend est simulé : aucun email ne part.
const { lireDemande, construireEmail } = require("../api/_email.js");
const handler = require("../api/devis.js");

let ko = 0;
const t = (nom, attendu, obtenu) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? "✓" : "✗"} ${nom}${ok ? "" : `\n    attendu ${JSON.stringify(attendu)}, obtenu ${JSON.stringify(obtenu)}`}`);
};

const DEMANDE = {
  prenom: "Jeanne", nom: "Martin", adresse: "1 rue des Lilas, 44000 Nantes",
  email: "jeanne@exemple.fr", tel: "06 12 34 56 78",
  type: "curatif", etage: "avec", typeToit: "ardoise",
  surfaceToit: 150, surfaceMur: 40,
};

console.log("— Lecture de la demande —");
t("demande complète acceptée", [], lireDemande(DEMANDE).erreurs);
t("téléphone seul accepté", [], lireDemande({ ...DEMANDE, email: "" }).erreurs);
t("ni email ni téléphone refusé", true, lireDemande({ ...DEMANDE, email: "", tel: "" }).erreurs.length > 0);
t("email invalide refusé", true, lireDemande({ ...DEMANDE, email: "pas-un-email" }).erreurs.length > 0);
t("type inconnu refusé", true, lireDemande({ ...DEMANDE, type: "luxe" }).erreurs.length > 0);
t("corps absent refusé", true, lireDemande(null).erreurs.length > 0);
t("champ trop long tronqué", 200, lireDemande({ ...DEMANDE, nom: "x".repeat(5000) }).demande.nom.length);

console.log("\n— Contenu de l'email —");
const DEVIS = {
  st: 150, sm: 40, ct: 4.5, cm: 4, prixToit: 675, prixMur: 160, total: 835,
  trancheToit: "101 à 200 m²", trancheMur: "moins de 50 m²",
};
const mail = construireEmail(lireDemande(DEMANDE).demande, DEVIS, "v-test");
const contient = (s, ...bouts) => bouts.every((b) => s.includes(b));
t("sujet : nom et total", true, contient(mail.sujet, "Jeanne Martin", "835"));
t("texte : coordonnées", true, contient(mail.texte, "Jeanne Martin", "1 rue des Lilas", "jeanne@exemple.fr", "06 12 34 56 78"));
t("texte : prestation", true, contient(mail.texte, "Curatif", "Avec étage", "ardoise"));
t("texte : détail du prix", true, contient(mail.texte, "150 m²", "40 m²", "675", "160", "835", "4,5"));
t("texte : version de la grille", true, mail.texte.includes("v-test"));
t("html : mêmes informations", true, contient(mail.html, "Jeanne Martin", "jeanne@exemple.fr", "835", "v-test"));
const piege = construireEmail(lireDemande({ ...DEMANDE, nom: "<script>alert(1)</script>" }).demande, DEVIS, "v");
t("html : saisie échappée", false, piege.html.includes("<script>"));

console.log("\n— La route /api/devis —");
const appeler = async (corps, { method = "POST", reponseResend = { ok: true } } = {}) => {
  const envois = [];
  global.fetch = async (url, opts) => {
    envois.push({ url, corps: JSON.parse(opts.body) });
    return { ok: reponseResend.ok, status: reponseResend.ok ? 200 : 500, text: async () => "" };
  };
  const res = {
    statut: 0, json: null, headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(s) { this.statut = s; return this; },
    json(j) { this.json = j; return this; },
  };
  await handler({ method, body: corps }, res);
  return { res, envois };
};

(async () => {
  process.env.RESEND_API_KEY = "test";
  process.env.DEVIS_EXPEDITEUR = "SystèmeDrone <devis@systemedrone.fr>";
  delete process.env.DEVIS_DESTINATAIRE;

  let { res, envois } = await appeler({ ...DEMANDE, total: 1 });
  t("envoi réussi → 200", 200, res.statut);
  t("un seul appel à Resend", 1, envois.length);
  const [interne, client] = envois[0].corps;
  t("deux emails : SystèmeDrone et le client", 2, envois[0].corps.length);
  t("copie interne à SystèmeDrone", ["contact@systemedrone.fr"], interne.to);
  t("copie interne : répondre écrit au client", "jeanne@exemple.fr", interne.reply_to);
  t("récapitulatif envoyé au client", ["jeanne@exemple.fr"], client.to);
  t("le client ne voit jamais l'adresse interne", false, JSON.stringify(client).includes("contact@systemedrone.fr"));
  t("le client répond à l'expéditeur", [undefined, undefined], [client.reply_to, client.bcc]);
  t("prix recalculé, pas celui du client", true, res.json.total > 1 && client.text.includes("Total"));

  process.env.DEVIS_DESTINATAIRE = "prive@gmail.com";
  ({ envois } = await appeler(DEMANDE));
  t("DEVIS_DESTINATAIRE respecté", ["prive@gmail.com"], envois[0].corps[0].to);
  t("DEVIS_DESTINATAIRE absent de l'email client", false, JSON.stringify(envois[0].corps[1]).includes("prive@gmail.com"));
  delete process.env.DEVIS_DESTINATAIRE;

  ({ res, envois } = await appeler({ ...DEMANDE, email: "" }));
  t("sans email client → seulement SystèmeDrone", [["contact@systemedrone.fr"]], envois[0].corps.map((e) => e.to));

  ({ res, envois } = await appeler({ ...DEMANDE, tel: "", email: "" }));
  t("demande invalide → 400, rien n'est envoyé", [400, 0], [res.statut, envois.length]);

  ({ res, envois } = await appeler({ ...DEMANDE, surfaceToit: 0, surfaceMur: 0 }));
  t("aucune surface → 400", 400, res.statut);

  ({ res } = await appeler(DEMANDE, { method: "GET" }));
  t("GET → 405", 405, res.statut);

  console.log("  (l'erreur Resend ci-dessous est attendue)");
  ({ res } = await appeler(DEMANDE, { reponseResend: { ok: false } }));
  t("Resend en échec → 502", 502, res.statut);

  console.log(ko === 0 ? "\nTous les tests passent." : `\n${ko} test(s) en échec.`);
  process.exit(ko === 0 ? 0 : 1);
})();
