(function (global) {
  "use strict";
  const SECTOR_COLORS = Object.freeze({
    "Minería": "#e7c98d",
    "Energía": "#f3dc83",
    "Infraestructura": "#a9cce3",
    "Inmobiliario": "#d7b9dc",
    "Saneamiento Ambiental": "#a9d9cf",
    "Agropecuario": "#b9d89b",
    "Pesca y Acuicultura": "#9fd5df",
    "Forestal": "#b8d2a4",
    "Equipamiento": "#c7c9df",
    "Otros": "#d4d9df"
  });
  const sectorColor = sector => {
    if (SECTOR_COLORS[sector]) return SECTOR_COLORS[sector];
    if (/infraestructura/i.test(sector)) return SECTOR_COLORS.Infraestructura;
    if (/inmobiliari/i.test(sector)) return SECTOR_COLORS.Inmobiliario;
    return SECTOR_COLORS.Otros;
  };
  const text = (parent, tag, value, className) => { const node = document.createElement(tag); if (className) node.className = className; node.textContent = value; parent.appendChild(node); return node; };
  const km = value => Number.isFinite(value) ? `${value.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} km` : "N/D";
  const money = value => Number.isFinite(Number(value)) ? `US$ ${Number(value).toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MM` : "Sin información";
  const percent = value => Number.isFinite(value) ? `${value.toLocaleString("es-CL", { maximumFractionDigits: 1 })} %` : "N/D";
  const wholePercent = value => Number.isFinite(value) ? `${value.toLocaleString("es-CL", { maximumFractionDigits: 0 })} %` : "N/D";
  function setAppState(kind, title = "", message = "", step = 0) {
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

  }
  function kpi(container, label, value, note) { const card = document.createElement("article"); card.className = "kpi-card"; text(card, "span", label); text(card, "strong", value); if (note) text(card, "small", note); container.appendChild(card); }
  const timingValue = row => Number.isFinite(row?.averageMonths) ? `${row.averageMonths.toLocaleString("es-CL", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} meses (${row.projectCount.toLocaleString("es-CL")})` : "Sin datos";
  function renderTiming(rows, nationalRows, max) {
    const chart = document.getElementById("timing-comparison-chart"); chart.replaceChildren();
    if (![...rows, ...nationalRows].some(row => Number.isFinite(row.averageMonths))) { text(chart, "p", "No existen datos válidos de tramitación para comparar.", "empty-chart"); return; }
    const nationalBySector = new Map(nationalRows.map(row => [row.sector, row]));
    rows.forEach(cluster => {
      const national = nationalBySector.get(cluster.sector) || { sector: cluster.sector, averageMonths: null, projectCount: 0 };
      const group = document.createElement("div"); group.className = "timing-group";
      text(group, "h3", cluster.sector, "timing-sector");
      [["Clúster", cluster, "cluster"], ["Nacional", national, "national"]].forEach(([label, row, kind]) => {
        const line = document.createElement("div"); line.className = `timing-bar-line ${kind}`;
        text(line, "span", label, "timing-series-label");
        const track = document.createElement("div"); track.className = "timing-track";
        const barWidth = max && Number.isFinite(row.averageMonths) ? row.averageMonths / max * 100 : 0;
        const bar = document.createElement("span"); bar.className = "timing-bar"; bar.style.width = `${barWidth}%`;
        const value = text(track, "strong", timingValue(row), "timing-value");
        value.style.setProperty("--bar-end", `${barWidth}%`);
        track.prepend(bar); line.append(track); group.append(line);
        const tooltip = `${cluster.sector} · ${label}: ${timingValue(row)}`;
        line.title = tooltip; line.setAttribute("aria-label", tooltip); value.setAttribute("aria-hidden", "true");
      });
      chart.appendChild(group);
    });
  }
  function visibleInvestmentRows(rows) {
    if (rows.length <= 6) return rows;
    const leading = rows.slice(0, 5); const rest = rows.slice(5);
    const investment = rest.reduce((sum, row) => sum + row.investment, 0);
    const total = rows.reduce((sum, row) => sum + row.investment, 0);
    return [...leading, { sector: "Otros sectores", investment, percentage: total ? investment / total * 100 : 0 }];
  }
  function renderInvestment(distribution) {
    const chart = document.getElementById("investment-chart"); chart.replaceChildren();
    const rows = visibleInvestmentRows(distribution.rows);
    if (!rows.length || !distribution.total) { text(chart, "p", "No existe inversión válida informada en el grupo base.", "empty-chart"); return; }
    const visual = document.createElement("div"); visual.className = "donut-wrap";
    const donut = document.createElementNS("http://www.w3.org/2000/svg", "svg"); donut.setAttribute("viewBox", "0 0 160 160"); donut.setAttribute("class", "donut"); donut.setAttribute("aria-hidden", "true");
    const radius = 58; const circumference = 2 * Math.PI * radius; let offset = 0;
    rows.forEach((row, index) => {
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      const length = row.investment / distribution.total * circumference;
      circle.setAttribute("cx", "80"); circle.setAttribute("cy", "80"); circle.setAttribute("r", String(radius)); circle.setAttribute("fill", "none"); circle.setAttribute("stroke", sectorColor(row.sector === "Otros sectores" ? "Otros" : row.sector)); circle.setAttribute("stroke-width", "24"); circle.setAttribute("stroke-dasharray", `${length} ${circumference - length}`); circle.setAttribute("stroke-dashoffset", String(-offset));
      offset += length; donut.appendChild(circle);
    });
    const center = document.createElement("div"); center.className = "donut-center"; text(center, "span", "Inversión total"); text(center, "strong", money(distribution.total));
    visual.append(donut, center);
    const legend = document.createElement("ul"); legend.className = "investment-legend";
    rows.forEach((row, index) => {
      const item = document.createElement("li"); const heading = document.createElement("div");
      const swatch = document.createElement("i"); swatch.style.backgroundColor = sectorColor(row.sector === "Otros sectores" ? "Otros" : row.sector); heading.append(swatch); text(heading, "strong", row.sector); item.append(heading);
      text(item, "span", `${money(row.investment)} · ${percent(row.percentage)}`);
      item.title = `${row.sector}\n${money(row.investment)}\n${percent(row.percentage)}`; legend.appendChild(item);
    });
    chart.append(visual, legend);
  }
  function summary(result) {
    const dominantInvestment = result.sectorDominanteInversion;
    return `El clúster de análisis concentra una inversión aprobada de ${money(result.inversionAprobadaGrupoBase)}, de los cuales el sector ${dominantInvestment.nombre} aporta ${money(dominantInvestment.inversion)}, equivalentes al ${wholePercent(dominantInvestment.porcentaje)} de la inversión aprobada, consolidándose como la actividad predominante por inversión del entorno. El grupo base está conformado por los 10 proyectos aprobados más cercanos, que definen un radio de análisis de ${km(result.radiusMeters / 1000)}, dentro del cual se registran ${result.total} proyectos sometidos al Sistema de Evaluación de Impacto Ambiental. El proyecto aprobado más cercano se localiza a ${km(result.approvedPointStats.minKm)} del punto consultado.`;
  }
  function render(result, meta) {
    document.getElementById("coordinates").textContent = `${result.query.lat.toFixed(6)}, ${result.query.lon.toFixed(6)}`; document.getElementById("generated-at").textContent = new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short" }).format(meta.generatedAt);
    document.getElementById("summary-text").textContent = summary(result); document.getElementById("analysis-radius").textContent=km(result.radiusMeters/1000);
    const primary = document.getElementById("primary-kpis"); primary.replaceChildren();
    kpi(primary, "Proyectos aprobados", String(result.base.length), "Grupo base más cercano"); kpi(primary, "Inversión aprobada", money(result.inversionAprobadaGrupoBase), "Grupo base más cercano"); kpi(primary, "Sector dominante por cantidad", result.sectorDominanteCantidad.nombre, `${result.sectorDominanteCantidad.cantidad} proyectos · ${percent(result.sectorDominanteCantidad.porcentaje)}`); kpi(primary, "Sector dominante por inversión", result.sectorDominanteInversion.nombre, `${money(result.sectorDominanteInversion.inversion)} · ${percent(result.sectorDominanteInversion.porcentaje)}`); kpi(primary,"Total dentro del radio",String(result.total)); kpi(primary,"Proyecto más cercano",km(result.approvedPointStats.minKm));
    renderTiming(result.clusterEvaluationBySector, result.nationalEvaluationByClusterSectors, result.sharedEvaluationMax);
    renderInvestment(result.baseInvestmentDistribution);
    const centroid = result.base.length ? `${(result.base.reduce((sum,item)=>sum+item.lat,0)/result.base.length).toFixed(6)}, ${(result.base.reduce((sum,item)=>sum+item.lon,0)/result.base.length).toFixed(6)}` : "N/D";
    const stats = [["Distancia media al punto", result.approvedPointStats.meanKm], ["Distancia mínima", result.approvedPointStats.minKm], ["Distancia media entre aprobados", result.approvedPairStats.meanKm], ["Distancia mínima entre aprobados", result.approvedPairStats.minKm], ["Distancia media del sector dominante por cantidad", result.dominantQuantityPairStats.meanKm], ["Distancia mínima del sector dominante por cantidad", result.dominantQuantityPairStats.minKm]];
    const dl = document.getElementById("spatial-stats"); dl.replaceChildren(); stats.forEach(([label,value]) => { const wrap = document.createElement("div"); text(wrap,"dt",label); text(wrap,"dd",km(value)); dl.appendChild(wrap); }); const centroidWrap=document.createElement("div"); text(centroidWrap,"dt","Centroide"); text(centroidWrap,"dd",centroid); dl.appendChild(centroidWrap);
    const list = document.getElementById("projects"); list.replaceChildren(); document.getElementById("project-count").textContent = `${result.base.length} proyectos seleccionados`;
    result.base.forEach((item,index) => { const p = item.feature.properties || {}; const article = document.createElement("article"); article.className="project"; text(article,"span",String(index+1),"rank"); const fullName=String(p.nombre_proyecto || "Proyecto sin nombre"); const name=safeUrl(p.web)?text(article,"a",fullName,"project-name"):text(article,"span",fullName,"project-name"); name.title=fullName; if(name.tagName==="A"){name.href=p.web;name.target="_blank";name.rel="noopener noreferrer";} const sector=GeoQueryAnalysis.normalizeSector(p.sector); const sectorChip=text(article,"span",sector,"sector"); sectorChip.style.setProperty("--sector-color",sectorColor(sector)); text(article,"strong",km(item.distance_km),"project-distance"); list.appendChild(article); });
  }
  function safeUrl(value) { try { const url=new URL(value); return ["http:","https:"].includes(url.protocol); } catch (_) { return false; } }
  global.GeoQueryRender={ setAppState, render, km, summary, sectorColor, SECTOR_COLORS };
})(window);
