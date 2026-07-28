(function (global) {
  "use strict";
  const text = (parent, tag, value, className) => { const node = document.createElement(tag); if (className) node.className = className; node.textContent = value; parent.appendChild(node); return node; };
  const km = value => Number.isFinite(value) ? `${value.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} km` : "N/D";
  const money = value => Number.isFinite(Number(value)) ? `US$ ${Number(value).toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MM` : "Sin información";
  const percent = value => Number.isFinite(value) ? `${value.toLocaleString("es-CL", { maximumFractionDigits: 1 })} %` : "N/D";
  const ranks = ["①","②","③","④","⑤","⑥","⑦","⑧","⑨","⑩"];
  function setAppState(kind, title = "", message = "", step = 0, map = null) {
    const loading = kind === "loading";
    const resolved = kind === "resolved";
    const statusView = document.getElementById("status-view");
    const report = document.getElementById("report");
    const spinner = document.querySelector(".spinner");
    const loadingSteps = document.getElementById("loading-steps");

    document.documentElement.dataset.appState = kind;
    document.body.classList.toggle("is-loading", loading);
    document.getElementById("status-title").textContent = title;
    document.getElementById("status-message").textContent = message;
    statusView.hidden = resolved;
    report.hidden = !resolved;
    spinner.hidden = !loading;
    spinner.style.animation = loading ? "" : "none";
    loadingSteps.hidden = !loading;
    document.getElementById("status-back").hidden = loading;
    document.querySelectorAll("#loading-steps li").forEach((item, index) => {
      item.classList.toggle("active", loading && index <= step);
    });

    if (resolved && map) requestAnimationFrame(() => map.invalidateSize());
  }
  function kpi(container, label, value, note) { const card = document.createElement("article"); card.className = "kpi-card"; text(card, "span", label); text(card, "strong", value); if (note) text(card, "small", note); container.appendChild(card); }
  function renderTiming(result) {
    const chart = document.getElementById("timing-chart"); chart.replaceChildren();
    const rows = result.averageEvaluationBySector || [];
    if (!rows.length) { text(chart,"p","No hay plazos de evaluación disponibles.","empty-chart"); return; }
    const max = rows[0].averageMonths;
    rows.forEach(row => {
      const item=document.createElement("div"); item.className="timing-row";
      if (row.sector === result.dominantSector) item.classList.add("is-dominant");
      const labels=document.createElement("div"); labels.className="timing-labels";
      text(labels,"span",row.sector);
      text(labels,"strong",`${row.averageMonths.toLocaleString("es-CL",{minimumFractionDigits:1,maximumFractionDigits:1})} meses (${row.projectCount.toLocaleString("es-CL")})`);
      const track=document.createElement("div"); track.className="timing-track";
      const bar=document.createElement("span"); bar.style.width=`${max ? row.averageMonths/max*100 : 0}%`;
      const tooltip=`${row.sector}\n\nPromedio:\n${row.averageMonths.toLocaleString("es-CL",{minimumFractionDigits:1,maximumFractionDigits:1})} meses\n\nProyectos utilizados:\n${row.projectCount.toLocaleString("es-CL")}`;
      item.title=tooltip; item.setAttribute("aria-label",tooltip.replace(/\n+/g," ")); track.appendChild(bar); item.append(labels,track); chart.appendChild(item);
    });
  }
  function summary(result) {
    const level = result.total >= 15 ? "alta" : result.total >= 8 ? "moderada" : "baja";
    return `El punto consultado se relaciona con un entorno de concentración ${level} de proyectos ambientales. El análisis identifica ${result.base.length} proyectos aprobados que definen un radio de ${km(result.radiusMeters / 1000)} y ${result.total} proyectos totales dentro de él. El sector ${result.dominantSector} representa el ${percent(result.dominantSectorShare)} del grupo base, mientras la inversión aprobada dentro del radio alcanza ${money(result.approvedInvestment)}. El proyecto aprobado más cercano se localiza a ${km(result.approvedPointStats.minKm)}.`;
  }
  function render(result, meta) {
    document.getElementById("coordinates").textContent = `${result.query.lat.toFixed(6)}, ${result.query.lon.toFixed(6)}`; document.getElementById("generated-at").textContent = new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short" }).format(meta.generatedAt);
    document.getElementById("summary-text").textContent = summary(result); document.getElementById("analysis-radius").textContent=km(result.radiusMeters/1000);
    const primary = document.getElementById("primary-kpis"); primary.replaceChildren();
    kpi(primary, "Proyectos aprobados", String(result.base.length), "Grupo base más cercano"); kpi(primary, "Inversión aprobada", money(result.approvedInvestment), "Dentro del radio"); kpi(primary, "Sector dominante", result.dominantSector, percent(result.dominantSectorShare)); kpi(primary,"Total dentro del radio",String(result.total)); kpi(primary,"Proyecto más cercano",km(result.approvedPointStats.minKm));
    renderTiming(result);
    const stats = [["Distancia media al punto", result.approvedPointStats.meanKm], ["Distancia mínima", result.approvedPointStats.minKm], ["Distancia media entre aprobados", result.approvedPairStats.meanKm], ["Distancia mínima entre aprobados", result.approvedPairStats.minKm], ["Distancia media del sector dominante", result.dominantPairStats.meanKm], ["Distancia mínima del sector dominante", result.dominantPairStats.minKm]];
    const dl = document.getElementById("spatial-stats"); dl.replaceChildren(); stats.forEach(([label,value]) => { const wrap = document.createElement("div"); text(wrap,"dt",label); text(wrap,"dd",km(value)); dl.appendChild(wrap); });
    const list = document.getElementById("projects"); list.replaceChildren(); document.getElementById("project-count").textContent = `${result.base.length} proyectos seleccionados`;
    result.base.forEach((item,index) => { const p = item.feature.properties || {}; const article = document.createElement("article"); article.className="project"; text(article,"span",ranks[index]||String(index+1),"rank"); const body=document.createElement("div"); body.className="project-body"; const fullName=String(p.nombre_proyecto || "Proyecto sin nombre"); const shortName=fullName.length>92?`${fullName.slice(0,89).trim()}…`:fullName; const heading=text(body,"h3",shortName); heading.title=fullName; const tags=document.createElement("div"); tags.className="tags"; text(tags,"span",GeoQueryAnalysis.normalizeSector(p.sector),"sector"); body.appendChild(tags); article.appendChild(body); const facts=document.createElement("div"); facts.className="project-facts"; text(facts,"strong",km(item.distance_km));
      if (safeUrl(p.web)) { const link=text(facts,"a","Abrir expediente →"); link.href=p.web; link.target="_blank"; link.rel="noopener noreferrer"; } else text(facts,"span","Sin expediente disponible","no-link"); article.appendChild(facts); list.appendChild(article); });
  }
  function safeUrl(value) { try { const url=new URL(value); return ["http:","https:"].includes(url.protocol); } catch (_) { return false; } }
  global.GeoQueryRender={ setAppState, render, km };
})(window);
