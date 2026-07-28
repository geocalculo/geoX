(function (global) {
  "use strict";
  const text = (parent, tag, value, className) => { const node = document.createElement(tag); if (className) node.className = className; node.textContent = value; parent.appendChild(node); return node; };
  const km = value => Number.isFinite(value) ? `${value.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} km` : "N/D";
  const money = value => Number.isFinite(Number(value)) ? `US$ ${Number(value).toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MM` : "Sin información";
  const percent = value => Number.isFinite(value) ? `${value.toLocaleString("es-CL", { maximumFractionDigits: 1 })} %` : "N/D";
  function setStatus(kind, title, message, step = 0) {
    document.getElementById("status-title").textContent = title; document.getElementById("status-message").textContent = message;
    document.querySelector(".spinner").hidden = kind !== "loading"; document.getElementById("loading-steps").hidden = kind !== "loading";
    document.getElementById("status-back").hidden = kind === "loading";
    document.querySelectorAll("#loading-steps li").forEach((item, index) => item.classList.toggle("active", index <= step));
  }
  function kpi(container, label, value, note) { const card = document.createElement("article"); card.className = "kpi-card"; text(card, "span", label); text(card, "strong", value); if (note) text(card, "small", note); container.appendChild(card); }
  function summary(result) {
    const level = result.total >= 15 ? "alta" : result.total >= 8 ? "moderada" : "baja";
    return `El punto consultado se relaciona con un entorno de concentración ${level} de proyectos ambientales. El análisis identifica ${result.base.length} proyectos aprobados que definen un radio de ${km(result.radiusMeters / 1000)} y ${result.total} proyectos totales dentro de él. El sector ${result.dominantSector} representa el ${percent(result.dominantSectorShare)} del grupo base, mientras la inversión aprobada dentro del radio alcanza ${money(result.approvedInvestment)}. El proyecto aprobado más cercano se localiza a ${km(result.approvedPointStats.minKm)}.`;
  }
  function render(result, meta) {
    document.getElementById("coordinates").textContent = `${result.query.lat.toFixed(6)}, ${result.query.lon.toFixed(6)}`; document.getElementById("generated-at").textContent = new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short" }).format(meta.generatedAt);
    document.getElementById("summary-text").textContent = summary(result);
    const primary = document.getElementById("primary-kpis"); primary.replaceChildren();
    kpi(primary, "Proyectos aprobados", String(result.base.length), "Grupo base más cercano"); kpi(primary, "Inversión aprobada", money(result.approvedInvestment), "Dentro del radio"); kpi(primary, "Sector dominante", result.dominantSector, percent(result.dominantSectorShare)); kpi(primary, "Radio del análisis", km(result.radiusMeters / 1000), "Hasta el último proyecto base");
    const secondary = document.getElementById("secondary-kpis"); secondary.replaceChildren(); [["Total dentro del radio", result.total], ["En calificación", result.inQualification], ["Rechazados", result.rejected], ["Proyecto más cercano", km(result.approvedPointStats.minKm)]].forEach(([a,b]) => kpi(secondary,a,String(b)));
    const stats = [["Distancia media desde el punto a aprobados", result.approvedPointStats.meanKm], ["Distancia mínima desde el punto a aprobados", result.approvedPointStats.minKm], ["Distancia media desde el punto al sector dominante", result.dominantPointStats.meanKm], ["Distancia media entre proyectos aprobados", result.approvedPairStats.meanKm], ["Distancia mínima entre proyectos aprobados", result.approvedPairStats.minKm], ["Distancia media entre proyectos del sector dominante", result.dominantPairStats.meanKm], ["Distancia mínima entre proyectos del sector dominante", result.dominantPairStats.minKm]];
    const dl = document.getElementById("spatial-stats"); dl.replaceChildren(); stats.forEach(([label,value]) => { const wrap = document.createElement("div"); text(wrap,"dt",label); text(wrap,"dd",km(value)); dl.appendChild(wrap); });
    const list = document.getElementById("projects"); list.replaceChildren(); document.getElementById("project-count").textContent = `${result.base.length} proyectos seleccionados`;
    result.base.forEach((item,index) => { const p = item.feature.properties || {}; const article = document.createElement("article"); article.className="project"; text(article,"span",String(index+1),"rank"); const body=document.createElement("div"); body.className="project-body"; text(body,"h3",String(p.nombre_proyecto || "Proyecto sin nombre")); text(body,"p",String(p.titular || "Titular no informado"),"holder"); const tags=document.createElement("div"); tags.className="tags"; [GeoQueryAnalysis.normalizeSector(p.sector), String(p.estado || "Estado no informado"), p.region, p.comuna].filter(Boolean).forEach((v,i)=>text(tags,"span",String(v),i===0?"sector":"")); body.appendChild(tags); article.appendChild(body); const facts=document.createElement("div"); facts.className="project-facts"; text(facts,"strong",km(item.distance_km)); text(facts,"span",money(p.inversion_mmusd));
      if (safeUrl(p.web)) { const link=text(facts,"a","Ver expediente ↗"); link.href=p.web; link.target="_blank"; link.rel="noopener noreferrer"; } article.appendChild(facts); list.appendChild(article); });
    document.getElementById("status-view").hidden=true; document.getElementById("report").hidden=false;
  }
  function safeUrl(value) { try { const url=new URL(value); return ["http:","https:"].includes(url.protocol); } catch (_) { return false; } }
  global.GeoQueryRender={ setStatus, render, km };
})(window);
