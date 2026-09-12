// Interface du calculateur de devis — SystèmeDrone
// Parcours en étapes : une seule question affichée à la fois, centrée à l'écran.
// Les tarifs viennent de `config.json` ; le wizard n'est monté qu'une fois
// le calculateur prêt (voir le démarrage en bas de fichier).
(function () {
  const { creerCalculateur } = window.SystemeDrone;

  function init(calculateur) {
    const { calculerDevis } = calculateur;
    // Version de la grille utilisée — à joindre à la demande de devis.
    const versionTarifs = calculateur.version;

    // Rien n'est présélectionné : chaque choix vient d'un clic de l'utilisateur.
    const state = { type: null, etage: null, typeToit: null };

    const euro = (n) =>
      new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

    const $ = (id) => document.getElementById(id);
    const els = {
      surfaceToit: $("surfaceToit"), surfaceMur: $("surfaceMur"),
      prix: $("prix"), prixSub: $("prixSub"), detail: $("detail"),
      error: $("error"),
      prev: $("prev"), next: $("next"), send: $("send"),
      bar: $("bar"), stepNum: $("stepNum"), stepTotal: $("stepTotal"),
      area: document.querySelector(".steps-area"),
      precision: $("precisionToit"), autreToit: $("autreToit"),
    };

    const steps = [...document.querySelectorAll(".step")];
    const LAST = steps.length - 1;
    const STEP_SURFACES = 3;
    const STEP_RESULTAT = 4;
    const STEP_CONTACT = 5; // dernière étape : le prix est connu, on demande où l'envoyer
    // Étape → clé de `state` à renseigner pour pouvoir continuer
    const CHOIX = { 0: "type", 1: "etage", 2: "typeToit" };
    const STEP_TOIT = 2;
    let current = 0;

    els.stepTotal.textContent = String(steps.length);

    // ── Navigation entre étapes ───────────────────────────────────────────
    function showStep(i) {
      current = Math.min(Math.max(i, 0), LAST);
      steps.forEach((s, idx) => {
        s.hidden = idx !== current;
        if (idx === current) { s.style.animation = "none"; void s.offsetWidth; s.style.animation = ""; }
      });

      els.error.hidden = true;
      els.prev.hidden = current === 0;
      els.send.hidden = current !== LAST;
      majNav();

      els.bar.style.width = ((current + 1) / steps.length) * 100 + "%";
      els.stepNum.textContent = String(current + 1);

      if (current === STEP_RESULTAT) render();

      // Focus sur le premier champ de l'étape (sans voler le focus sur mobile)
      const first = steps[current].querySelector("input, select");
      if (first && window.matchMedia("(min-width: 700px)").matches) first.focus();

      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    // Fige la hauteur de la carte sur l'étape la plus haute (message d'erreur inclus),
    // pour que la carte garde exactement la même taille d'une étape à l'autre.
    function figerHauteur() {
      const errHidden = els.error.hidden, errText = els.error.textContent;
      els.area.style.minHeight = "0px";
      els.error.hidden = false;
      els.error.textContent = "M"; // gabarit : un message d'une ligne

      const precHidden = els.precision.hidden;
      els.precision.hidden = false;

      let max = 0;
      steps.forEach((_, i) => {
        steps.forEach((s, j) => { s.style.animation = "none"; s.hidden = j !== i; });
        max = Math.max(max, els.area.offsetHeight);
      });

      steps.forEach((s, j) => { s.style.animation = ""; s.hidden = j !== current; });
      els.precision.hidden = precHidden;
      els.error.hidden = errHidden;
      els.error.textContent = errText;
      els.area.style.minHeight = max + "px";
    }

    // L'étape « matériau » attend une précision libre quand « Autre » est choisi.
    function attendPrecision() { return current === STEP_TOIT && state.typeToit === "autre"; }

    // Sur les étapes à choix unique, le clic fait avancer : pas de « Continuer ».
    function majNav() {
      els.next.hidden = current === LAST || (CHOIX[current] !== undefined && !attendPrecision());
    }

    function erreur(msg) {
      els.error.textContent = msg;
      els.error.hidden = false;
    }

    // Validation de l'étape courante. Le message est reposé à zéro à chaque
    // tentative : sinon une erreur corrigée reste affichée sur l'étape finale,
    // qui ne change pas de vue en cas de succès.
    function valide() {
      els.error.hidden = true;
      if (CHOIX[current] && !state[CHOIX[current]]) {
        erreur("⚠️ Sélectionnez une option pour continuer.");
        return false;
      }
      if (attendPrecision() && !val("autreToit")) {
        erreur("⚠️ Précisez le type de toiture.");
        els.autreToit.focus();
        return false;
      }
      if (current === STEP_SURFACES && currentDevis().total <= 0) {
        erreur("⚠️ Indiquez au moins une surface à traiter.");
        els.surfaceToit.focus();
        return false;
      }
      if (current === STEP_CONTACT && !val("email") && !val("tel")) {
        erreur("⚠️ Renseignez un email ou un téléphone pour être recontacté.");
        $("email").focus();
        return false;
      }
      return true;
    }

    els.next.addEventListener("click", () => { if (valide()) showStep(current + 1); });
    els.prev.addEventListener("click", () => showStep(current - 1));

    // Entrée = étape suivante (sauf sur la dernière étape → soumission)
    $("devis").addEventListener("keydown", (e) => {
      if (e.key !== "Enter" || current === LAST) return;
      e.preventDefault();
      if (valide()) showStep(current + 1);
    });

    // ── Groupes de boutons segmentés ──────────────────────────────────────
    function bindSeg(groupId, key) {
      const group = $(groupId);
      const auto = group.classList.contains("auto");
      group.addEventListener("click", (e) => {
        const btn = e.target.closest("button");
        if (!btn) return;
        state[key] = btn.dataset.val;
        if (key === "typeToit") {
          els.precision.hidden = state.typeToit !== "autre";
          if (!els.precision.hidden) els.autreToit.focus();
        }
        render();
        majNav();
        // Un choix unique fait avancer tout seul, sauf s'il reste à préciser le matériau
        if (auto && current < LAST && !attendPrecision()) setTimeout(() => showStep(current + 1), 220);
      });
    }
    bindSeg("type", "type");
    bindSeg("etage", "etage");
    bindSeg("typeToit", "typeToit");

    els.surfaceToit.addEventListener("input", render);
    els.surfaceMur.addEventListener("input", render);
    els.autreToit.addEventListener("input", render);

    // Libellé du matériau : la précision saisie prend le pas sur « autre »
    function libelleToit() {
      if (state.typeToit === "autre") return val("autreToit") || "autre";
      return state.typeToit || "";
    }

    const DEVIS_VIDE = { st: 0, sm: 0, ct: 0, cm: 0, prixToit: 0, prixMur: 0, total: 0, trancheToit: null, trancheMur: null };

    function currentDevis() {
      // Tant que la prestation n'est pas choisie, aucun coefficient n'est applicable.
      if (!state.type || !state.etage) return DEVIS_VIDE;
      return calculerDevis({
        type: state.type,
        etage: state.etage,
        surfaceToit: els.surfaceToit.value,
        surfaceMur: els.surfaceMur.value,
      });
    }

    // ── Affichage du prix ─────────────────────────────────────────────────
    function render() {
      const d = currentDevis();

      // Étape résultat
      els.prix.textContent = euro(d.total);
      if (d.total > 0) {
        els.prixSub.textContent =
          (state.type === "preventif" ? "Préventif" : "Curatif") +
          " · " + (state.etage === "avec" ? "avec étage" : "sans étage") +
          " · " + libelleToit();
      } else {
        els.prixSub.textContent = "Renseignez une surface pour voir le prix";
      }

      const lines = [];
      if (d.st > 0) {
        lines.push(`<div class="line"><span>Toiture <span class="muted">${d.st} m²</span></span><b>${euro(d.prixToit)}</b></div>`);
      }
      if (d.sm > 0) {
        lines.push(`<div class="line"><span>Murs <span class="muted">${d.sm} m²</span></span><b>${euro(d.prixMur)}</b></div>`);
      }
      if (lines.length) {
        lines.push(`<div class="line total"><span>Total estimé</span><b>${euro(d.total)}</b></div>`);
      }
      els.detail.innerHTML = lines.join("");
    }

    // ── Soumission ────────────────────────────────────────────────────────
    // TODO : définir ce qui se passe au clic sur « Demander mon devis »
    // (envoi, page de confirmation…). `versionTarifs` accompagne la demande
    // pour savoir plus tard sur quelle grille le devis a été établi.
    $("devis").addEventListener("submit", (e) => {
      e.preventDefault();
      if (!valide()) return;
      const d = currentDevis();
      console.debug("[SystèmeDrone] demande de devis", {
        prenom: val("prenom"), nom: val("nom"), adresse: val("adresse"),
        email: val("email"), tel: val("tel"),
        type: state.type, etage: state.etage, typeToit: libelleToit(),
        surfaceToit: d.st, surfaceMur: d.sm, total: d.total,
        versionTarifs,
      });
    });

    function val(id) { return ($(id).value || "").trim(); }

    render();
    showStep(0);
    figerHauteur();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(figerHauteur);

    let resizeTimer;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(figerHauteur, 150);
    });
  }

  // ── Démarrage : charger les tarifs, puis monter le formulaire ─────────
  fetch("config.json", { cache: "no-cache" })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status))))
    .catch((e) => {
      console.warn("[SystèmeDrone] config.json illisible, tarifs de repli :", e.message);
      return null;
    })
    .then((cfg) => init(creerCalculateur(cfg)));
})();
