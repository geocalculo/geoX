(function exposeGeoXLabelFormatter(global) {
  const GEOEVA_SECTOR_EQUIVALENCES = new Map([
    ["Saneamiento Ambiental", "Saneamiento"],
    ["Infraestructura de Transporte", "Transporte"],
    ["Infraestructura Hidráulica", "Hidráulica"],
    ["Infraestructura Energética", "Energía"],
    ["Energía", "Energía"],
    ["Minería", "Minería"],
    ["Inmobiliarios", "Inmobiliario"],
    ["Equipamiento", "Equipamiento"],
    ["Agropecuario", "Agropecuario"],
    ["Pesca y Acuicultura", "Acuicultura"],
    ["Forestal", "Forestal"],
    ["Instalaciones fabriles varias", "Industrial"],
    ["Otros", "Otros"],
    ["Planificación Territorial e Inmobiliarios en Zonas Latentes o Saturadas", "Planificación"],
    ["Desarrollo Urbano", "Urbano"],
    ["Turismo", "Turismo"]
  ]);

  const GEOEVA_EMPTY_WORDS = new Set(["de", "del", "la", "las", "los", "y", "en", "para", "con", "e"]);
  const GEOEVA_FALLBACK_WORD_EQUIVALENCES = new Map([
    ["transporte", "Transporte"],
    ["hidráulica", "Hidráulica"],
    ["hidraulica", "Hidráulica"],
    ["energética", "Energía"],
    ["energetica", "Energía"],
    ["energía", "Energía"],
    ["energia", "Energía"],
    ["urbano", "Urbano"],
    ["portuaria", "Portuaria"],
    ["portuario", "Portuaria"]
  ]);

  function cleanLabelText(text) {
    if (text === null || text === undefined) return "";
    return String(text).trim().replace(/\s+/g, " ");
  }

  function removeParentheses(text) {
    return cleanLabelText(cleanLabelText(text).replace(/\s*\([^)]*\)\s*/g, " "));
  }

  function normalizeLookupKey(text) {
    return cleanLabelText(text).toLocaleLowerCase("es-CL");
  }

  function shortenGeoevaSector(text) {
    const cleaned = cleanLabelText(text);
    if (!cleaned) return "Proyecto";

    const directMatch = Array.from(GEOEVA_SECTOR_EQUIVALENCES.entries())
      .find(([source]) => normalizeLookupKey(source) === normalizeLookupKey(cleaned));
    if (directMatch) return directMatch[1];

    const withoutParentheses = removeParentheses(cleaned)
      .replace(/[\/|;:,_–—-]+/g, " ");

    const meaningfulWords = cleanLabelText(withoutParentheses)
      .split(" ")
      .filter((word) => word && !GEOEVA_EMPTY_WORDS.has(word.toLocaleLowerCase("es-CL")));

    const equivalentWord = meaningfulWords
      .map((word) => GEOEVA_FALLBACK_WORD_EQUIVALENCES.get(word.toLocaleLowerCase("es-CL")))
      .find(Boolean);
    if (equivalentWord) return equivalentWord;

    const shortened = meaningfulWords.slice(0, 2).join(" ");
    return shortened || "Proyecto";
  }

  function formatLabelText(siteId, layerId, rawText) {
    const text = cleanLabelText(rawText);

    if (siteId === "geonoxa" && layerId === "geonoxa_zonas") {
      return removeParentheses(text);
    }

    if (siteId === "geoeva") {
      return shortenGeoevaSector(text);
    }

    return text;
  }

  global.GeoXLabelFormatter = {
    cleanLabelText,
    removeParentheses,
    shortenGeoevaSector,
    formatLabelText
  };
}(window));
