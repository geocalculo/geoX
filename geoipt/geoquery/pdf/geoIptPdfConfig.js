(function () {
  "use strict";
  window.geoIptPdfConfig = {
    siteId: "geoipt",
    engine: "direct",
    title: "GeoIPT | Reporte del punto consultado",
    filenamePrefix: "GeoIPT_Reporte",
    modelKey: "__geoiptReportModel",
    accent: "#1d4ed8",
    layout: { marginLeft: 10, marginRight: 10, marginTop: 13, marginBottom: 14, headerHeight: 8, footerHeight: 8, sectionGap: 4, panelGap: 3 }
  };

  /*
   * GeoX UI v1 bridge.
   * GeoIPT mantiene temporalmente su CSS/JS legacy embebido en geoquery.html.
   * Este puente conecta el contrato visual shared sin alterar el motor analítico
   * ni la configuración PDF anterior. Puede retirarse cuando el HTML monolítico
   * sea separado físicamente en la fase de limpieza final.
   */
  const sharedStyles = [
    "../../shared/geoquery/geoquery-tokens.css",
    "../../shared/geoquery/geoquery-base.css",
    "../../shared/geoquery/geoquery-components.css",
    "../../shared/geoquery/geoquery-layouts.css",
    "../../shared/geoquery/geoquery-responsive.css",
    "geoipt-theme.css"
  ];

  sharedStyles.forEach((href) => {
    if (document.querySelector(`link[data-geoipt-gq-shared][href="${href}"]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.dataset.geoiptGqShared = "true";
    document.head.appendChild(link);
  });

  const applyGeoQuerySharedClasses = () => {
    const header = document.getElementById("geoquery-header");
    header?.classList.add("gq-hero");

    const actions = document.querySelector("nav.top-actions");
    actions?.classList.add("gq-actions");

    const back = document.getElementById("back-link");
    back?.classList.add("gq-button", "gq-button--secondary");

    document.querySelectorAll(".download-button").forEach((button) => {
      button.classList.add("gq-button", "gq-button--primary");
    });

    const summaryCards = document.querySelector("#geoquery-summary-cards .cards");
    summaryCards?.classList.add("gq-kpi-grid");
    summaryCards?.querySelectorAll(".card").forEach((card) => {
      card.classList.add("gq-kpi");
    });

    const primary = document.querySelector(".geoquery-primary-grid");
    primary?.classList.add("gq-list-map", "gq-list-map--50-50");

    document.querySelectorAll(".panel").forEach((panel) => {
      panel.classList.add("gq-card");
    });

    document.getElementById("geoquery-map-panel")?.classList.add("gq-map-panel");
    document.getElementById("geoquery-downloads-panel")?.classList.add("gq-actions");

    document.querySelectorAll(".sr-only").forEach((node) => {
      node.classList.add("gq-sr-only");
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyGeoQuerySharedClasses, { once: true });
  } else {
    applyGeoQuerySharedClasses();
  }
})();
