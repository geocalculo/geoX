from pathlib import Path

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


def runtime_reference_paths(token, excluded):
    """Return execution-time references only; docs, audit files and tooling do not count."""
    refs = []
    for path in ROOT.rglob("*"):
        if not path.is_file() or path == excluded or ".git" in path.parts:
            continue
        if path.suffix.lower() not in {".html", ".css", ".js"}:
            continue
        if "tools" in path.parts or ".github" in path.parts:
            continue
        try:
            if token in path.read_text(encoding="utf-8", errors="ignore"):
                refs.append(path.relative_to(ROOT).as_posix())
        except OSError:
            pass
    return refs


rows = []
issues = []
copy_rows = []
anatomy_rows = []

shared_tokens = (ROOT / "shared/geoquery/geoquery-tokens.css").read_text(encoding="utf-8", errors="ignore")
shared_layouts = (ROOT / "shared/geoquery/geoquery-layouts.css").read_text(encoding="utf-8", errors="ignore")
shared_components = (ROOT / "shared/geoquery/geoquery-components.css").read_text(encoding="utf-8", errors="ignore")
shared_responsive = (ROOT / "shared/geoquery/geoquery-responsive.css").read_text(encoding="utf-8", errors="ignore")

width_token_ok = "--gq-content-max-width: 1240px" in shared_tokens
legacy_shell_adapter_ok = ".geoquery-analysis.content" in shared_layouts and ".top-actions.gq-actions" in shared_layouts
geonemo_axis_adapter_ok = "body > .gq-hero.hero" in shared_layouts and "body > nav.gq-actions.actions" in shared_layouts
mobile_shell_adapter_ok = ".geoquery-analysis.content" in shared_responsive and "body > .gq-hero.hero" in shared_responsive
footer_shared_ok = ".gq-footer" in shared_components and ".app > footer" in shared_components

if not width_token_ok: issues.append("Shared GeoQuery: el ancho común no está fijado en 1240 px mediante token.")
if not legacy_shell_adapter_ok: issues.append("Shared GeoQuery: faltan adaptadores de shell para GeoIPT/GeoNOXA.")
if not geonemo_axis_adapter_ok: issues.append("Shared GeoQuery: falta alineación del eje hero/acciones de GeoNEMO.")
if not mobile_shell_adapter_ok: issues.append("Shared GeoQuery: los adaptadores de shell no tienen cobertura mobile.")
if not footer_shared_ok: issues.append("Shared GeoQuery: footer existente no está cubierto por el componente compartido.")

for site in SITES:
    display = DISPLAY[site]
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

    expected_title = f"<title>GeoQuery | {display}</title>"
    expected_back = f"Volver a {display}"
    title_ok = expected_title in gq_text
    back_ok = expected_back in gq_text
    kml_ok = "Descargar KML" in gq_text and "Exportar KML" not in gq_text
    no_visible_version = "GeoQuery 2.0" not in gq_text and "GeoQuery <b>2.0</b>" not in gq_text
    copy_ok = title_ok and back_ok and kml_ok and no_visible_version

    hero_ok = "gq-hero" in gq_text
    actions_ok = "gq-actions" in gq_text and "gq-button" in gq_text
    cards_ok = "gq-card" in gq_text
    indicators_ok = "gq-kpi-grid" in gq_text or "gq-stats-grid" in gq_text
    if site == "geonemo":
        list_map_status = "Excepción dinámica"
        map_status = "Microinformes dinámicos"
        list_map_ok = True
        map_ok = True
    else:
        list_map_ok = "gq-list-map" in gq_text
        map_ok = "gq-map-panel" in gq_text
        list_map_status = "Sí" if list_map_ok else "No"
        map_status = "Sí" if map_ok else "No"
    anatomy_ok = hero_ok and actions_ok and cards_ok and indicators_ok and list_map_ok and map_ok

    rows.append((display, idx_stack, footer_ok, gq_stack, theme_ok, no_inline_style, gq_classes, line_count(ROOT/site/"css"/"index.css")))
    copy_rows.append((display, title_ok, back_ok, kml_ok, no_visible_version, copy_ok))
    anatomy_rows.append((display, hero_ok, actions_ok, cards_ok, indicators_ok, list_map_status, map_status, anatomy_ok))

    if not idx_stack: issues.append(f"{display}: orden/carga de CSS index no cumple contrato.")
    if not footer_ok: issues.append(f"{display}: navegación transversal incompleta o sin aria-current.")
    if not gq_stack: issues.append(f"{display}: GeoQuery no carga el stack shared completo en orden.")
    if not theme_ok: issues.append(f"{display}: tema GeoQuery no detectado.")
    if not no_inline_style: issues.append(f"{display}: conserva bloque <style> inline en GeoQuery.")
    if not title_ok: issues.append(f"{display}: título de documento no cumple `GeoQuery | [Sitio]`.")
    if not back_ok: issues.append(f"{display}: acción de retorno no identifica el sitio de destino.")
    if not kml_ok: issues.append(f"{display}: acción KML no cumple `Descargar KML` o conserva `Exportar KML`.")
    if not no_visible_version: issues.append(f"{display}: conserva `GeoQuery 2.0` como denominación visible.")
    if not anatomy_ok: issues.append(f"{display}: anatomía GeoQuery incompleta respecto de `GEOX_UI_ANATOMY.md`.")

legacy_candidates = []
geoipt_css = ROOT / "geoipt" / "css"
if geoipt_css.exists():
    for path in sorted(geoipt_css.glob("*.css")):
        if path.name == "index.css":
            continue
        refs = runtime_reference_paths(path.name, path)
        status = "Legacy activo" if refs else "Huérfano candidato"
        legacy_candidates.append((path.name, line_count(path), refs, status))

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

out.append("\n## Diccionario UI GeoQuery\n")
out.append("Contrato definido en `GEOX_UI_DICTIONARY.md`.\n")
out.append("| Sitio | Título estándar | Retorno identificado | Descargar KML | Sin GeoQuery 2.0 | Cumple |")
out.append("|---|---|---|---|---|---|")
for site, title_ok, back_ok, kml_ok, no_version, copy_ok in copy_rows:
    yn = lambda x: "Sí" if x else "No"
    out.append(f"| {site} | {yn(title_ok)} | {yn(back_ok)} | {yn(kml_ok)} | {yn(no_version)} | {yn(copy_ok)} |")

out.append("\n## Anatomía transversal GeoQuery\n")
out.append("Contrato definido en `GEOX_UI_ANATOMY.md`. El ancho efectivo común es 1240 px desde shared.\n")
out.append("| Sitio | Hero | Acciones | Cards | KPI/Stats | Lista + mapa | Mapa | Cumple |")
out.append("|---|---|---|---|---|---|---|---|")
for site, hero_ok, actions_ok, cards_ok, indicators_ok, list_map_status, map_status, anatomy_ok in anatomy_rows:
    yn = lambda x: "Sí" if x else "No"
    out.append(f"| {site} | {yn(hero_ok)} | {yn(actions_ok)} | {yn(cards_ok)} | {yn(indicators_ok)} | {list_map_status} | {map_status} | {yn(anatomy_ok)} |")
out.append("\nShared: token 1240 = %s; adaptador GeoIPT/GeoNOXA = %s; eje GeoNEMO = %s; mobile = %s; footer existente = %s.\n" % tuple("Sí" if x else "No" for x in [width_token_ok, legacy_shell_adapter_ok, geonemo_axis_adapter_ok, mobile_shell_adapter_ok, footer_shared_ok]))

out.append("\n## CSS legacy GeoIPT\n")
out.append("| Archivo | Líneas | Consumidores de ejecución | Clasificación |")
out.append("|---|---:|---|---|")
for name, lines, refs, status in legacy_candidates:
    ref_text = ", ".join(f"`{ref}`" for ref in refs) if refs else "—"
    out.append(f"| `{name}` | {lines} | {ref_text} | {status} |")
out.append("\n> La clasificación considera sólo referencias de ejecución en HTML/CSS/JS. Menciones en documentación, auditorías o herramientas no cuentan como uso funcional.\n")

out.append("## Incidencias estáticas\n")
if issues:
    out.extend(f"- {issue}" for issue in issues)
else:
    out.append("- Sin incumplimientos estructurales, anatómicos ni semánticos detectados por el auditor estático.")

out.append("\n## Criterio de cierre\n")
out.append("La rama sólo puede cerrarse después de validar desktop/mobile y regresión funcional de GIS, cálculos, KML y PDF.\n")

(ROOT / "GEOX_UI_AUDIT_IMPROVEMENT.md").write_text("\n".join(out) + "\n", encoding="utf-8")
print("Generado GEOX_UI_AUDIT_IMPROVEMENT.md")
