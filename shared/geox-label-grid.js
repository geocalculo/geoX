(function exposeGeoXLabelGrid(global) {
  const GRID_COLUMNS = 3;
  const GRID_ROWS = 3;
  const CSS_PX_PER_CM = 96 / 2.54;
  const DEFAULT_LABELS_PER_CM2 = 2;
  let labelsPerCm2 = DEFAULT_LABELS_PER_CM2;

  function pxAreaToCm2(widthPx, heightPx) {
    const areaPx = Math.max(0, Number(widthPx) || 0) * Math.max(0, Number(heightPx) || 0);
    return areaPx / (CSS_PX_PER_CM * CSS_PX_PER_CM);
  }

  function getStableId(candidate, index) {
    return String(candidate.id ?? candidate.fid ?? candidate.name ?? candidate.text ?? index);
  }

  function normalizeLabelsPerCm2(value) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : DEFAULT_LABELS_PER_CM2;
  }

  async function loadCapacityConfig(configPath = "capas_panel/label_capacity_config.json") {
    try {
      const configUrl = new URL(configPath, global.location.href).toString();
      const response = await fetch(configUrl, { cache: "no-store" });
      if (!response.ok) throw new Error(`No se pudo cargar ${configPath}`);

      const config = await response.json();
      labelsPerCm2 = normalizeLabelsPerCm2(config && config.labels_per_cm2);
    } catch (error) {
      labelsPerCm2 = DEFAULT_LABELS_PER_CM2;
      console.warn("GeoX labels: usando capacidad interna por defecto", error);
    }

    return labelsPerCm2;
  }

  function getLabelsPerCm2() {
    return labelsPerCm2;
  }

  function selectFromCell(candidates, maxLabels, center) {
    const byTextCounts = new Map();
    const ordered = candidates
      .map((candidate, index) => ({
        ...candidate,
        originalIndex: candidate.originalIndex ?? index,
        stableId: getStableId(candidate, index),
        distanceToCenter: Math.hypot(candidate.point.x - center.x, candidate.point.y - center.y)
      }))
      .sort((a, b) => {
        if (a.distanceToCenter !== b.distanceToCenter) return a.distanceToCenter - b.distanceToCenter;
        return a.stableId.localeCompare(b.stableId, "es");
      });

    const selected = [];
    const uniquePass = ordered.filter((candidate) => {
      const key = candidate.text.toLocaleLowerCase("es-CL");
      if (byTextCounts.has(key)) return false;
      byTextCounts.set(key, 1);
      return true;
    });

    for (const candidate of uniquePass) {
      if (selected.length >= maxLabels) break;
      selected.push(candidate);
    }

    for (const candidate of ordered) {
      if (selected.length >= maxLabels) break;
      if (selected.includes(candidate)) continue;
      const key = candidate.text.toLocaleLowerCase("es-CL");
      const count = byTextCounts.get(key) || 0;
      if (count >= 2) continue;
      byTextCounts.set(key, count + 1);
      selected.push(candidate);
    }

    return selected;
  }

  function selectLabels(map, rawCandidates, options = {}) {
    if (!map || typeof map.getSize !== "function" || typeof map.latLngToContainerPoint !== "function") return [];

    const size = map.getSize();
    const cellWidth = size.x / GRID_COLUMNS;
    const cellHeight = size.y / GRID_ROWS;
    const cells = Array.from({ length: GRID_COLUMNS * GRID_ROWS }, (_, index) => {
      const col = index % GRID_COLUMNS;
      const row = Math.floor(index / GRID_COLUMNS);
      const areaCm2 = pxAreaToCm2(cellWidth, cellHeight);
      return {
        index,
        col,
        row,
        widthPx: cellWidth,
        heightPx: cellHeight,
        areaCm2,
        maxLabels: Math.floor(areaCm2 * getLabelsPerCm2()),
        center: { x: col * cellWidth + cellWidth / 2, y: row * cellHeight + cellHeight / 2 },
        candidates: [],
        selected: [],
        final: []
      };
    });

    rawCandidates.forEach((candidate, index) => {
      const text = String(candidate.text || "").trim();
      if (!text || !candidate.latlng) return;
      const point = map.latLngToContainerPoint(candidate.latlng);
      if (!point || point.x < 0 || point.y < 0 || point.x > size.x || point.y > size.y) return;
      const col = Math.min(GRID_COLUMNS - 1, Math.max(0, Math.floor(point.x / cellWidth)));
      const row = Math.min(GRID_ROWS - 1, Math.max(0, Math.floor(point.y / cellHeight)));
      cells[row * GRID_COLUMNS + col].candidates.push({ ...candidate, text, point, originalIndex: candidate.originalIndex ?? index });
    });

    const selected = [];
    cells.forEach((cell) => {
      const labelsToShow = Math.min(cell.candidates.length, cell.maxLabels);
      cell.selected = selectFromCell(cell.candidates, labelsToShow, cell.center);
      selected.push(...cell.selected.map((candidate) => ({ ...candidate, cellIndex: cell.index })));
    });

    selected.sort((a, b) => {
      if (a.cellIndex !== b.cellIndex) return a.cellIndex - b.cellIndex;
      if (a.distanceToCenter !== b.distanceToCenter) return a.distanceToCenter - b.distanceToCenter;
      return a.stableId.localeCompare(b.stableId, "es");
    });

    const accepted = selected.map((candidate) => {
      cells[candidate.cellIndex].final.push(candidate);
      return { ...candidate };
    });

    if (options.debug) {
      cells.forEach((cell) => console.log("[GeoX labels grid]", {
        cell: cell.index,
        widthPx: Number(cell.widthPx.toFixed(2)),
        heightPx: Number(cell.heightPx.toFixed(2)),
        areaCm2: Number(cell.areaCm2.toFixed(2)),
        maxLabelsCell: cell.maxLabels,
        candidates: cell.candidates.length,
        selected: cell.selected.length,
        final: cell.final.length
      }));
    }

    return accepted;
  }

  global.GeoXLabelGrid = {
    GRID_COLUMNS,
    GRID_ROWS,
    DEFAULT_LABELS_PER_CM2,
    loadCapacityConfig,
    getLabelsPerCm2,
    pxAreaToCm2,
    selectLabels
  };
}(window));
