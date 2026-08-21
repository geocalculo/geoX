# GeoQuery UI v1

GeoEVA `geoeva/geoquery/geoquery.html` is the structural reference implementation for GeoQuery UI v1.

## Load order

1. `geoquery-tokens.css`
2. `geoquery-base.css`
3. `geoquery-components.css`
4. `geoquery-layouts.css`
5. `geoquery-responsive.css`
6. site theme CSS
7. site-specific analytical CSS

The shared layer owns the common visual grammar. Site CSS should only define theme values and analytical components that are genuinely specific to that GeoQuery.

## Shared component contract

Use the `gq-*` classes as the stable API for common report anatomy:

- `gq-hero`, `gq-container`, `gq-kicker`
- `gq-card` and card modifiers
- `gq-actions`, `gq-button` and button modifiers
- `gq-query-summary`
- `gq-executive-summary`
- `gq-kpi-grid`, `gq-kpi`
- `gq-list-map` with layout modifiers
- `gq-map-panel`
- `gq-chart-panel`, `gq-chart-legend`
- `gq-comparison-grid`, `gq-comparison-column`
- `gq-stats-grid`
- `gq-status-view`, `gq-spinner`, `gq-loading-steps`
- `gq-table`

## Migration rule

During migration, legacy site classes may coexist with `gq-*` classes. Do not remove legacy classes until the shared implementation has been visually and functionally validated.

## 80/20 rule

Approximately 80% of typography, spacing, cards, buttons, KPI layout, list/map layout, chart containers and responsive behavior should come from `shared/geoquery`.

Approximately 20% may remain site-specific: palette, semantic colors, domain-specific charts, Leaflet markers, specialized tables and analytical widgets.

## Reference implementation

GeoEVA is the reference for structure, not for subject-specific content. GeoMA, GeoNOXA, GeoNEMO and GeoIPT should adopt the shared anatomy while retaining their own analytical logic and domain identity.
