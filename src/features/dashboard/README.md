# features/dashboard

Dashboard Executivo (`pages/DashboardPage.tsx`, rota `/`) — KPIs, indicadores de tempo médio, gráficos, ranking de áreas críticas e mapa de calor, todos derivados de dados reais.

**Status:** implementado na Sprint 6.

- `types.ts` — `DashboardFilters` (as 9 dimensões pedidas: período, gerência, categoria, status, projeto, local, empresa, responsável, emitente), `DashboardBucket` (os 7 buckets de KPI usados no drill-down).
- `dashboardService.ts` — `listAvusForDashboard(filters)`, lê `avu_dashboard_view` (`supabase/migrations/0007_dashboard_executivo.sql`) com os filtros aplicados no servidor — mesmo padrão de `planningService.listAvusForPlanning`.
- `analytics.ts` — funções puras testadas que derivam **tudo** a partir do array já filtrado: `avuMatchesBucket` (fonte única de verdade dos buckets, reaproveitada no drill-down de `pages/AvusPage.tsx`), `computeKpis`, `computeAverageCycleTimeDays`/`computeAverageCycleTimeByGroup`, `groupCount`, `computeCriticalAreasRanking` (reaproveita `features/avus/risk.ts`), `computeTemporalSeries`, `computeHeatmapPoints`.
- `components/` — `DashboardFiltersBar`, `DashboardKpis` (clicáveis, abrem `/avus` com o bucket + filtros atuais), `CycleTimeIndicators`, `GroupBarChart` (genérico, reaproveitado 5x), `CriticalAreasRanking`, `VulnerabilityHeatmap` (usa a prop `heatmapPoints` nova de `features/gis/components/BaseMap.tsx`), `TemporalChart`.

Um único fetch alimenta o dashboard inteiro — não há uma consulta por indicador — então os filtros atualizam tudo junto e não há N+1.
