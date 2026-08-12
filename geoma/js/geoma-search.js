(function (global) {
  "use strict";
  const CATALOG_PATH = "capas_tosearch/catalogo.json";
  const SEARCH_PATH = "capas_tosearch/";
  const MAX_RESULTS = 30;
  const HIGHLIGHT_MS = 5000;

  function clean(value) {
    if (value == null) return "";
    const text = String(value).trim();
    return /^(null|undefined)$/i.test(text) ? "" : text;
  }
  function normalize(value) {
    return clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  }
  function formatArea(value) {
    const squareMetres = Number(value);
    if (!Number.isFinite(squareMetres)) return "";
    return squareMetres >= 1000000
      ? `${new Intl.NumberFormat("es-CL", {maximumFractionDigits: 2}).format(squareMetres / 1000000)} km²`
      : `${new Intl.NumberFormat("es-CL", {maximumFractionDigits: 0}).format(squareMetres)} m²`;
  }

  function createSearch(map, options = {}) {
    const fetchJson = options.fetchJson || (async (path) => {
      const response = await fetch(path);
      if (!response.ok) throw new Error(`${path} respondió HTTP ${response.status}`);
      return response.json();
    });
    const schedule = options.schedule || ((callback) => global.requestIdleCallback ? global.requestIdleCallback(callback, {timeout: 800}) : setTimeout(callback, 0));
    let fields = {name: "Nombre", type: "Tipo", commune: "Comuna", region: "Region", province: "Provincia", area: "st_area_sh", diameter: null};
    let catalog = [], items = [], loadingPromise = null, activeIndex = -1, visibleResults = [], highlight = null, highlightTimer = null;
    const property = (props, key) => key ? clean(props[key]) : "";

    function makeItem(feature, entry) {
      const props = feature?.properties || {};
      const name = property(props, fields.name), type = property(props, fields.type), commune = property(props, fields.commune);
      const region = property(props, fields.region) || clean(entry.region), province = property(props, fields.province), area = property(props, fields.area), diameter = property(props, fields.diameter);
      const title = name || [type, commune].filter(Boolean).join(" - ") || "Masa de agua sin nombre";
      const primary = [name, type, commune].map(normalize);
      return {feature, entry, props, title, type, commune, region, province, area, diameter, primary, searchText: normalize([...primary, province, region].join(" "))};
    }
    function find(query) {
      const normalizedQuery = normalize(query);
      const words = normalizedQuery.split(" ").filter(Boolean);
      if (!words.length || normalizedQuery.length < 2) return [];
      const score = (item) => words.reduce((sum, word) => sum + (item.primary[0].startsWith(word) ? 30 : item.primary[0].includes(word) ? 20 : item.primary[1].includes(word) ? 10 : item.primary[2].includes(word) ? 5 : 0), 0);
      return items.filter((item) => words.every((word) => item.searchText.includes(word)))
        .sort((a, b) => score(b) - score(a) || a.title.localeCompare(b.title, "es")).slice(0, MAX_RESULTS);
    }
    function clearResults() {
      visibleResults = []; activeIndex = -1;
      const container = document.getElementById("search-results"), input = document.getElementById("search-box");
      if (!container) return;
      container.replaceChildren(); container.hidden = true; container.classList.remove("is-open"); input?.setAttribute("aria-expanded", "false");
    }
    function clearSearch() {
      const input = document.getElementById("search-box");
      if (input) input.value = "";
      clearResults();
      if (highlight) map.removeLayer(highlight);
      highlight = null;
      clearTimeout(highlightTimer);
    }
    function render(results) {
      const container = document.getElementById("search-results"), input = document.getElementById("search-box");
      if (!container) return;
      clearResults(); if (!results.length) return; visibleResults = results;
      results.forEach((item, index) => {
        const button = document.createElement("button"), title = document.createElement("span"), detail = document.createElement("span");
        button.type = "button"; button.className = "search-result-item"; button.setAttribute("role", "option");
        title.className = "search-result-title";
        title.textContent = [item.title, item.type, item.commune].filter((value, position, all) => value && all.indexOf(value) === position).join(" · ");
        detail.className = "search-result-detail";
        detail.textContent = [item.region, item.area && `Superficie: ${formatArea(item.area)}`, item.diameter && `Diámetro equivalente: ${item.diameter}`].filter(Boolean).join(" · ");
        button.append(title, detail); button.addEventListener("click", () => select(index)); container.appendChild(button);
      });
      container.hidden = false; container.classList.add("is-open"); input?.setAttribute("aria-expanded", "true");
    }
    function geometryBounds(feature) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      (function visit(value) {
        if (!Array.isArray(value)) return;
        if (value.length >= 2 && Number.isFinite(Number(value[0])) && Number.isFinite(Number(value[1]))) {
          const point = global.L.CRS.EPSG3857.unproject(global.L.point(Number(value[0]), Number(value[1])));
          minX = Math.min(minX, point.lng); maxX = Math.max(maxX, point.lng); minY = Math.min(minY, point.lat); maxY = Math.max(maxY, point.lat);
        } else value.forEach(visit);
      })(feature?.geometry?.coordinates);
      return [minX, minY, maxX, maxY].every(Number.isFinite) ? global.L.latLngBounds([minY, minX], [maxY, maxX]) : null;
    }
    function select(index) {
      const item = visibleResults[index]; if (!item) return;
      const input = document.getElementById("search-box"); if (input) input.value = item.title; clearResults();
      const bounds = geometryBounds(item.feature); if (bounds) map.fitBounds(bounds, {padding: [40, 40], maxZoom: 15});
      if (highlight) map.removeLayer(highlight); clearTimeout(highlightTimer);
      highlight = global.L.geoJSON(item.feature, {coordsToLatLng: (coordinates) => global.L.CRS.EPSG3857.unproject(global.L.point(coordinates)), style: {color: "#ffcc00", weight: 4, opacity: 1, fillColor: "#ffeb3b", fillOpacity: 0.22}, interactive: false, className: "geoma-search-highlight"}).addTo(map);
      highlightTimer = setTimeout(() => { if (highlight) map.removeLayer(highlight); highlight = null; }, HIGHLIGHT_MS);
    }
    async function loadAll() {
      if (loadingPromise) return loadingPromise;
      loadingPromise = (async () => {
        for (const entry of catalog) {
          try {
            const data = await fetchJson(SEARCH_PATH + encodeURIComponent(entry.file));
            items.push(...(data.features || []).map((feature) => makeItem(feature, entry)));
            const input = document.getElementById("search-box"); if (input?.value) render(find(input.value));
            await new Promise((resolve) => schedule(resolve));
          } catch (error) { console.warn(`[GeoMA Search] no se pudo cargar ${entry.file}`, error); }
        }
        console.info(`[GeoMA Search] índice cargado: ${items.length} masas de agua`); return items;
      })(); return loadingPromise;
    }
    async function init() {
      const data = await fetchJson(CATALOG_PATH); catalog = (data.layers || []).filter((entry) => entry.enabled !== false); fields = {...fields, ...(data.search_fields || {})};
      const input = document.getElementById("search-box"), searchButton = document.getElementById("btn-search"), clearButton = document.getElementById("btn-clear");
      input.addEventListener("focus", loadAll, {once: true}); input.addEventListener("input", () => { loadAll(); render(find(input.value)); });
      searchButton?.addEventListener("click", () => { input.focus(); loadAll(); render(find(input.value)); });
      clearButton?.addEventListener("click", clearSearch);
      input.addEventListener("keydown", (event) => {
        if (event.key === "Escape") return clearResults(); if (!visibleResults.length) return;
        if (event.key === "Enter") { event.preventDefault(); return select(Math.max(activeIndex, 0)); }
        if (!["ArrowDown", "ArrowUp"].includes(event.key)) return; event.preventDefault();
        activeIndex = event.key === "ArrowDown" ? Math.min(activeIndex + 1, visibleResults.length - 1) : Math.max(activeIndex - 1, 0);
        [...document.querySelectorAll("#search-results .search-result-item")].forEach((button, i) => button.classList.toggle("is-active", i === activeIndex));
      });
      document.addEventListener("click", (event) => { if (!event.target.closest("#search-box-wrapper") && event.target !== searchButton) clearResults(); }); return catalog;
    }
    return {init, loadAll, find, render, select, clearResults, clearSearch, geometryBounds, makeItem, get items() { return items; }};
  }
  function init(map, options) {
    const search = createSearch(map, options);
    search.init();
    return search;
  }
  global.GeoMASearch = {createSearch, init, normalize, clean, formatArea, CATALOG_PATH, MAX_RESULTS};
})(window);
