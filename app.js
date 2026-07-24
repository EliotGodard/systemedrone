// Interface du calculateur de devis — SystèmeDrone
(function () {
  const { calculerDevis } = window.SystemeDrone;

  const state = { type: "preventif", etage: "sans" };

  const euro = (n) =>
    new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
  const euroM2 = (n) =>
    new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 2 }).format(n) + " €/m²";

  const $ = (id) => document.getElementById(id);
  const els = {
    surfaceToit: $("surfaceToit"), surfaceMur: $("surfaceMur"),
    prix: $("prix"), prixSub: $("prixSub"), detail: $("detail"),
  };

  // Groupes de boutons segmentés
  function bindSeg(groupId, key) {
    const group = $(groupId);
    group.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      state[key] = btn.dataset.val;
      [...group.querySelectorAll("button")].forEach((b) =>
        b.setAttribute("aria-pressed", String(b === btn))
      );
      render();
    });
  }
  bindSeg("type", "type");
  bindSeg("etage", "etage");

  els.surfaceToit.addEventListener("input", render);
  els.surfaceMur.addEventListener("input", render);

  function currentDevis() {
    return calculerDevis({
      type: state.type,
      etage: state.etage,
      surfaceToit: els.surfaceToit.value,
      surfaceMur: els.surfaceMur.value,
    });
  }

  function render() {
    const d = currentDevis();
    els.prix.textContent = euro(d.total);

    if (d.total > 0) {
      els.prixSub.textContent =
        (state.type === "preventif" ? "Préventif" : "Curatif") +
        " · " + (state.etage === "avec" ? "avec étage" : "sans étage");
    } else {
      els.prixSub.textContent = "Renseignez une surface pour voir le prix";
    }

    const lines = [];
    if (d.st > 0) {
      lines.push(`<div class="line"><span>Toiture <span class="muted">${d.st} m² · ${d.trancheToit} · ${euroM2(d.ct)}</span></span><b>${euro(d.prixToit)}</b></div>`);
    }
    if (d.sm > 0) {
      lines.push(`<div class="line"><span>Murs <span class="muted">${d.sm} m² · ${d.trancheMur} · ${euroM2(d.cm)}</span></span><b>${euro(d.prixMur)}</b></div>`);
    }
    if (lines.length) {
      lines.push(`<div class="line total"><span>Total estimé</span><b>${euro(d.total)}</b></div>`);
    }
    els.detail.innerHTML = lines.join("");
  }

  // Soumission → récapitulatif
  const dialog = $("confirm");
  const recap = $("recap");

  $("devis").addEventListener("submit", (e) => {
    e.preventDefault();
    const d = currentDevis();
    if (d.total <= 0) {
      els.surfaceToit.focus();
      els.prixSub.textContent = "⚠️ Indiquez d'abord une surface à traiter";
      return;
    }
    const rows = [];
    if (d.st > 0) rows.push(`<div><span>Toiture (${d.st} m²)</span><span>${euro(d.prixToit)}</span></div>`);
    if (d.sm > 0) rows.push(`<div><span>Murs (${d.sm} m²)</span><span>${euro(d.prixMur)}</span></div>`);
    rows.push(`<div class="big"><span>Total estimé</span><span>${euro(d.total)}</span></div>`);
    recap.innerHTML = rows.join("");
    if (typeof dialog.showModal === "function") dialog.showModal();
    else buildMailto(d); // fallback
  });

  $("closeModal").addEventListener("click", () => dialog.close());
  $("sendMail").addEventListener("click", () => buildMailto(currentDevis()));

  function val(id) { return ($(id).value || "").trim(); }

  function buildMailto(d) {
    const prestation = state.type === "preventif" ? "Préventif (sale)" : "Curatif (très sale)";
    const etage = state.etage === "avec" ? "Avec étage" : "Sans étage";
    const lignes = [
      "Demande de devis — nettoyage par drone",
      "",
      `Nom : ${val("prenom")} ${val("nom")}`.trim(),
      `Adresse : ${val("adresse")}`,
      `Email : ${val("email")}`,
      `Téléphone : ${val("tel")}`,
      "",
      `Type de toiture : ${$("typeToit").value}`,
      `Prestation : ${prestation}`,
      `Configuration : ${etage}`,
      d.st > 0 ? `Toiture : ${d.st} m² → ${euro(d.prixToit)} (${euroM2(d.ct)})` : null,
      d.sm > 0 ? `Murs : ${d.sm} m² → ${euro(d.prixMur)} (${euroM2(d.cm)})` : null,
      "",
      `TOTAL ESTIMÉ : ${euro(d.total)}`,
      "",
      "(Estimation générée depuis le calculateur en ligne)",
    ].filter(Boolean);

    const subject = encodeURIComponent(`Devis toiture — ${val("prenom")} ${val("nom")} — ${euro(d.total)}`.trim());
    const body = encodeURIComponent(lignes.join("\n"));
    window.location.href = `mailto:contact@systemedrone.fr?subject=${subject}&body=${body}`;
  }

  render();
})();
