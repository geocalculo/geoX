from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def write(path, text):
    (ROOT / path).write_text(text, encoding="utf-8")


def replace_required(text, old, new, label):
    if old not in text:
        if new in text:
            return text
        raise RuntimeError(f"No se encontró patrón requerido: {label}")
    return text.replace(old, new)


# 1) Unificar ancho efectivo con el token shared (1240 px por defecto).
for path in ["geoipt/geoquery/geoquery.css", "geonoxa/geoquery/geoquery.css"]:
    text = read(path)
    text = text.replace("1120px", "var(--gq-content-max-width)")
    write(path, text)

# GeoNEMO conserva fórmulas antiguas de 1320 px en hero/acciones/layout.
path = "geonemo/geoquery/geoquery.css"
text = read(path).replace("1320px", "var(--gq-content-max-width)")
write(path, text)

# 2) Footer común: clase visual shared y texto estable por sitio.
footer_style_path = "shared/geoquery/geoquery-components.css"
text = read(footer_style_path)
footer_rule = "\n.gq-footer { min-height: 34px; display: flex; align-items: center; justify-content: center; padding: 8px 16px; border-top: 1px solid var(--site-border); background: var(--site-primary-strong); color: #e2e8f0; font-size: .75rem; text-align: center; }\n"
if ".gq-footer" not in text:
    text = text.rstrip() + "\n" + footer_rule
write(footer_style_path, text)

# Insertar footer en GeoIPT si aún no existe.
path = "geoipt/geoquery/geoquery.html"
text = read(path)
if 'class="gq-footer"' not in text:
    old = "    </main>\n  </div>\n\n  <script src=\"https://unpkg.com/leaflet@1.9.4/dist/leaflet.js\"></script>"
    new = "    </main>\n    <footer class=\"gq-footer\">GeoQuery · GeoIPT · Resultados territoriales referenciales</footer>\n  </div>\n\n  <script src=\"https://unpkg.com/leaflet@1.9.4/dist/leaflet.js\"></script>"
    text = replace_required(text, old, new, "footer GeoIPT")
write(path, text)

# Insertar footer en GeoEVA.
path = "geoeva/geoquery/geoquery.html"
text = read(path)
if 'class="gq-footer"' not in text:
    old = "  </main>\n  <script src=\"https://unpkg.com/leaflet@1.9.4/dist/leaflet.js\" crossorigin=\"\"></script>"
    new = "  </main>\n  <footer class=\"gq-footer\">GeoQuery · GeoEVA · Resultados territoriales referenciales</footer>\n  <script src=\"https://unpkg.com/leaflet@1.9.4/dist/leaflet.js\" crossorigin=\"\"></script>"
    text = replace_required(text, old, new, "footer GeoEVA")
write(path, text)

# GeoNEMO: convertir footer existente a clase shared.
path = "geonemo/geoquery/geoquery.html"
text = read(path)
text = replace_required(
    text,
    "<footer>GeoQuery · Informe Ejecutivo Territorial · Resultados territoriales referenciales</footer>",
    "<footer class=\"gq-footer\">GeoQuery · GeoNEMO · Resultados territoriales referenciales</footer>",
    "footer GeoNEMO",
)
write(path, text)

# Insertar footer en GeoNOXA.
path = "geonoxa/geoquery/geoquery.html"
text = read(path)
if 'class="gq-footer"' not in text:
    old = "    </main>\n  </div>\n\n  <script src=\"https://unpkg.com/leaflet@1.9.4/dist/leaflet.js\"></script>"
    new = "    </main>\n    <footer class=\"gq-footer\">GeoQuery · GeoNOXA · Resultados territoriales referenciales</footer>\n  </div>\n\n  <script src=\"https://unpkg.com/leaflet@1.9.4/dist/leaflet.js\"></script>"
    text = replace_required(text, old, new, "footer GeoNOXA")
write(path, text)

# GeoMA: convertir footer existente a clase shared.
path = "geoma/geoquery/geoquery.html"
text = read(path)
text = replace_required(
    text,
    "<footer>GeoQuery · GeoMA · Resultados territoriales referenciales</footer>",
    "<footer class=\"gq-footer\">GeoQuery · GeoMA · Resultados territoriales referenciales</footer>",
    "footer GeoMA",
)
write(path, text)

# 3) Declarar gq-footer en el contrato de clases si todavía no está.
path = "GEOX_UI_STANDARD.md"
text = read(path)
if "- `gq-footer`" not in text:
    text = text.replace("- `gq-table`\n", "- `gq-table`\n- `gq-footer`\n")
write(path, text)

print("Anatomía GeoQuery normalizada: ancho, footer y contrato shared.")
