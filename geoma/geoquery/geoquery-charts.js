(function(){
  "use strict";
  let surfaceChart=null,distanceChart=null,renderTimer=null;
  const palette=["#0f4c81","#1d6fa5","#2f8fc0","#49a8d1","#70bfdc","#98d3e6","#b9e1ed","#6b8fb3"];
  function parseLocaleNumber(text){
    const s=String(text||"").trim().replace(/\s/g,"");
    if(!s)return NaN;
    const cleaned=s.replace(/\./g,"").replace(",",".").replace(/[^0-9.+-]/g,"");
    return Number(cleaned);
  }
  function parseAreaHa(text){
    const n=parseLocaleNumber(text);
    return Number.isFinite(n)?n:NaN;
  }
  function parseDistanceKm(text){
    const raw=String(text||"").trim().toLowerCase();
    const n=parseLocaleNumber(raw);
    if(!Number.isFinite(n))return NaN;
    return raw.includes(" m")&&!raw.includes("km")?n/1000:n;
  }
  function collect(){
    const rows=[...document.querySelectorAll("#nearest-list .nearest-item")];
    const grouped=new Map();
    rows.forEach(row=>{
      const meta=String(row.querySelector(".nearest-meta")?.textContent||"");
      const parts=meta.split("·").map(x=>x.trim());
      const type=parts[0]||"Sin tipo";
      const area=parseAreaHa(parts[2]||"");
      const distance=parseDistanceKm(row.querySelector(".nearest-distance")?.textContent||"");
      if(!grouped.has(type))grouped.set(type,{type,area:0,distanceSum:0,count:0});
      const g=grouped.get(type);
      if(Number.isFinite(area))g.area+=area;
      if(Number.isFinite(distance)){g.distanceSum+=distance;g.count+=1;}
    });
    return [...grouped.values()].map(g=>({...g,meanDistance:g.count?g.distanceSum/g.count:0})).sort((a,b)=>b.area-a.area);
  }
  function render(){
    if(typeof Chart==="undefined")return;
    const data=collect();
    if(!data.length)return;
    const labels=data.map(d=>d.type);
    const colors=data.map((_,i)=>palette[i%palette.length]);
    const surfaceCanvas=document.getElementById("surface-type-chart");
    const distanceCanvas=document.getElementById("distance-type-chart");
    if(!surfaceCanvas||!distanceCanvas)return;
    if(surfaceChart)surfaceChart.destroy();
    if(distanceChart)distanceChart.destroy();
    surfaceChart=new Chart(surfaceCanvas,{type:"doughnut",data:{labels,datasets:[{data:data.map(d=>Number(d.area.toFixed(2))),backgroundColor:colors,borderColor:"#ffffff",borderWidth:2}]},options:{responsive:true,maintainAspectRatio:false,cutout:"58%",plugins:{legend:{position:"bottom",labels:{boxWidth:12,boxHeight:12,usePointStyle:true,padding:14,font:{size:12}}},tooltip:{callbacks:{label(ctx){const total=ctx.dataset.data.reduce((a,b)=>a+b,0),v=ctx.raw,p=total?100*v/total:0;return `${ctx.label}: ${new Intl.NumberFormat("es-CL",{maximumFractionDigits:1}).format(v)} ha (${p.toFixed(1)}%)`;}}}}}});
    distanceChart=new Chart(distanceCanvas,{type:"bar",data:{labels,datasets:[{label:"Distancia media al POI",data:data.map(d=>Number(d.meanDistance.toFixed(2))),backgroundColor:colors,borderColor:colors,borderWidth:1,borderRadius:5}]},options:{indexAxis:"y",responsive:true,maintainAspectRatio:false,scales:{x:{beginAtZero:true,title:{display:true,text:"Distancia media (km)"},grid:{color:"rgba(100,116,139,.14)"}},y:{grid:{display:false}}},plugins:{legend:{display:false},tooltip:{callbacks:{label(ctx){const d=data[ctx.dataIndex];return ` ${ctx.raw.toLocaleString("es-CL",{maximumFractionDigits:2})} km · n = ${d.count}`;}}}}}});
  }
  function scheduleRender(){clearTimeout(renderTimer);renderTimer=setTimeout(render,60);}
  const list=document.getElementById("nearest-list");
  if(list)new MutationObserver(scheduleRender).observe(list,{childList:true,subtree:true,characterData:true});
  document.querySelectorAll('input[name="nearest-limit"]').forEach(el=>el.addEventListener("change",scheduleRender));
  window.addEventListener("load",scheduleRender);
})();
