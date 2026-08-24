from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
HTML_PATH = ROOT / "geoipt" / "geoquery" / "geoquery.html"
CSS_PATH = ROOT / "geoipt" / "geoquery" / "geoquery.css"

html = HTML_PATH.read_text(encoding="utf-8")

# Idempotencia: si ya no existe CSS inline, no volver a migrar.
match = re.search(r"\n\s*<style>\s*\n(?P<css>.*?)\n\s*</style>", html, flags=re.S)
if not match:
    print("GeoIPT GeoQuery ya no contiene bloque <style>; sin cambios.")
    raise SystemExit(0)

css = match.group("css").rstrip() + "\n"
CSS_PATH.write_text(css, encoding="utf-8")

shared_stack = """\n  <link rel=\"stylesheet\" href=\"../../shared/geoquery/geoquery-tokens.css\" />
  <link rel=\"stylesheet\" href=\"../../shared/geoquery/geoquery-base.css\" />
  <link rel=\"stylesheet\" href=\"../../shared/geoquery/geoquery-components.css\" />
  <link rel=\"stylesheet\" href=\"../../shared/geoquery/geoquery-layouts.css\" />
  <link rel=\"stylesheet\" href=\"../../shared/geoquery/geoquery-responsive.css\" />
  <link rel=\"stylesheet\" href=\"geoipt-theme.css\" />
  <link rel=\"stylesheet\" href=\"geoquery.css\" />"""

html = html[:match.start()] + shared_stack + html[match.end():]

# Puente de clases: mantiene clases legacy y añade el contrato visual gq-*.
replacements = {
    'class="main-header geoquery-section"': 'class="main-header geoquery-section gq-hero"',
    'class="sr-only"': 'class="sr-only gq-sr-only"',
    'class="top-actions"': 'class="top-actions gq-actions"',
    'class="back-button"': 'class="back-button gq-button gq-button--secondary"',
    'class="download-button"': 'class="download-button gq-button gq-button--primary"',
    'class="content geoquery-analysis"': 'class="content geoquery-analysis gq-container"',
    'class="cards"': 'class="cards gq-kpi-grid"',
    'class="card"': 'class="card gq-kpi"',
    'class="geoquery-primary-grid"': 'class="geoquery-primary-grid gq-list-map gq-list-map--50-50"',
    'class="geoquery-secondary-grid"': 'class="geoquery-secondary-grid gq-section-stack"',
    'class="panel geoquery-section"': 'class="panel geoquery-section gq-card"',
    'class="panel visual-panel geoquery-section"': 'class="panel visual-panel geoquery-section gq-card gq-map-panel"',
    'class="actions"': 'class="actions gq-actions"',
}
for old, new in replacements.items():
    html = html.replace(old, new)

HTML_PATH.write_text(html, encoding="utf-8")
print(f"CSS extraído a {CSS_PATH.relative_to(ROOT)} ({len(css)} bytes)")
print("HTML conectado al stack shared GeoQuery y clases gq-* añadidas.")
