from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
SITES = ["geoipt", "geoeva", "geonemo", "geonoxa", "geoma"]
DISPLAY = {"geoipt":"GeoIPT","geoeva":"GeoEVA","geonemo":"GeoNEMO","geonoxa":"GeoNOXA","geoma":"GeoMA"}
INDEX_STACK = [
    "../shared/geox-tokens.css",
    "../shared/geox-index-base.css",
    "../shared/geox-map-controls.css",
    "css/index.css",
    "../shared/geox-label-controls.css",
]
GQ_STACK = [
    "../../shared/geoquery/geoquery-tokens.css",
    "../../shared/geoquery/geoquery-base.css",
    "../../shared/geoquery/geoquery-components.css",
    "../../shared/geoquery/geoquery-layouts.css",
    "../../shared/geoquery/geoquery-responsive.css",
]
GQ_REQUIRED = ["gq-hero", "gq-actions", "gq-button", "gq-card"]


def ordered(text, parts):
    positions = [text.find(p) for p in parts]
    return all(p >= 0 for p in positions) and positions == sorted(positions)


def line_count(path):
    return len(path.read_text(encoding="utf-8", errors="ignore").splitlines()) if path.exists() else 0


def repo_reference_count(token, excluded):
    count = 0
    for path in ROOT.rglob("*"):
        if not path.is_file() or path == excluded or ".git" in path.parts:
            continue
        if path.suffix.lower() not in {".html", ".css", ".js", ".json", ".md", ".py", ".yml", ".yaml"}:
            continue
        try:
            if token in path.read_text(encoding="utf-8", errors="ignore"):
                count += 1
        except OSError:
            pass
    return count

rows = []
issues = []

for site in SITES:
    index = ROOT / site / "index.html"
    index_text = index.read_text(encoding="utf-8", errors="ignore") if index.exists() else ""
    idx_stack = ordered(index_text, INDEX_STACK)
    footer_ok = all(name in index_text for name in DISPLAY.values()) and 'aria-current="page"' in index_text

    gq = ROOT / site / "geoquery" / "geoquery.html"
    gq_text = gq.read_text(encoding="utf-8", errors="ignore") if gq.exists() else ""
    gq_stack = ordered(gq_text, GQ_STACK)
    no_inline_style = "<style" not in gq_text.lower()
    gq_classes = sum(1 for cls in GQ_REQUIRED if cls in gq_text)
    theme = f"{site}-theme.css" if site != "geoeva" else "geoeva-theme.css"
    theme_ok = theme in gq_text

    rows.append((DISPLAY[site], idx_stack, footer_ok, gq_stack, theme_ok, no_inline_style, gq_classes, line_count(ROOT/site/"css"/"index.css")))
    if not idx_stack: issues.append(f"{DISPLAY[site]}: orden/carga de CSS index no cumple contrato.")
    if not footer_ok: issues.append(f"{DISPLAY[site]}: navegación transversal incompleta o sin aria-current.")
    if not gq_stack: issues.append(f"{DISPLAY[site]}: GeoQuery no carga el stack shared completo en orden.")
    if not theme_ok: issues.append(f"{DISPLAY[site]}: tema GeoQuery no detectado.")
    if not no_inline_style: issues.append(f"{DISPLAY[site]}: conserva bloque <style> inline en GeoQuery.")

legacy_candidates = []
geoipt_css = ROOT / "geoipt" / "css"
if geoipt_css.exists():
    for path in sorted(geoipt_css.glob("*.css")):
        if path.name == "index.css":
            continue
        refs = repo_reference_count(path.name, path)
        legacy_candidates.append((path.name, line_count(path), refs, "Huérfano candidato" if refs == 0 else "Referenciado"))

semantic = {}
for site in SITES:
    gq = ROOT / site / "geoquery" / "geoquery.html"
    text = gq.read_text(encoding="utf-8", errors="ignore") if gq.exists() else ""
    semantic[DISPLAY[site]] = {
        "Exportar KML": text.count("Exportar KML"),
        "Descargar KML": text.count("Descargar KML"),
        "GeoQuery 2.0": text.count("GeoQuery 2.0"),
    }

out = []
out.append("# GeoX UI · Auditoría automática de rama de mejora\n")
out.append("Generado por `tools/audit_geox_ui.py`. Este informe es estático: no reemplaza la validación visual ni funcional.\n")
out.append("## Contrato transversal\n")
out.append("| Sitio | Index shared | Footer | GeoQuery shared | Tema | Sin style inline | Clases gq (de 4) | Líneas index.css |")
out.append("|---|---|---|---|---|---|---:|---:|")
for row in rows:
    site, a,b,c,d,e,f,g = row
    yn = lambda x: "Sí" if x else "No"
    out.append(f"| {site} | {yn(a)} | {yn(b)} | {yn(c)} | {yn(d)} | {yn(e)} | {f} | {g} |")

out.append("\n## CSS legacy GeoIPT\n")
out.append("| Archivo | Líneas | Referencias detectadas | Clasificación preliminar |")
out.append("|---|---:|---:|---|")
for name, lines, refs, status in legacy_candidates:
    out.append(f"| `{name}` | {lines} | {refs} | {status} |")
out.append("\n> Un archivo marcado como huérfano candidato no se elimina automáticamente. Debe revisarse también su relación con PDF, cargas dinámicas y rutas históricas.\n")

out.append("## Variantes semánticas GeoQuery\n")
out.append("| Sitio | Exportar KML | Descargar KML | GeoQuery 2.0 |")
out.append("|---|---:|---:|---:|")
for site, vals in semantic.items():
    out.append(f"| {site} | {vals['Exportar KML']} | {vals['Descargar KML']} | {vals['GeoQuery 2.0']} |")

out.append("\n## Incidencias estáticas\n")
if issues:
    out.extend(f"- {issue}" for issue in issues)
else:
    out.append("- Sin incumplimientos estructurales detectados por el auditor estático.")

out.append("\n## Criterio de cierre\n")
out.append("La rama sólo puede cerrarse después de validar desktop/mobile y regresión funcional de GIS, cálculos, KML y PDF.\n")

(ROOT / "GEOX_UI_AUDIT_IMPROVEMENT.md").write_text("\n".join(out) + "\n", encoding="utf-8")
print("Generado GEOX_UI_AUDIT_IMPROVEMENT.md")
