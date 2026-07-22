# features/gis

Mapa interativo de vulnerabilidades (`pages/MapPage.tsx`, rota `/mapa`) — todas as AVUs georreferenciadas, coloridas por status/urgência.

**Status:** implementado na Sprint 7, revisado (layout/camadas/painel) numa sprint seguinte.

- `markerColor.ts` (+ `.test.ts`) — `computeMarkerColor(avu, referenceDate?)`, função pura que decide a cor do marcador (Cinza/Azul/Laranja/Verde/Vermelho/Amarelo — precedência documentada no arquivo; SLA vencido/próximo tem prioridade sobre o status bruto; Cancelada/Reprovada não têm cor e ficam fora do mapa).
- `mapStyles.ts` — abstração de provedor de mapa (`MapStyleOption[]`): cada opção resolve pra uma URL de style.json (vetorial) ou um `StyleSpecification` inline (raster). "Padrão" (MapLibre demotiles) e "Escuro" (CARTO Dark Matter, raster livre, sem API key) sempre disponíveis; "Satélite"/"Híbrido" (MapTiler) só ficam habilitadas se `VITE_MAPTILER_KEY` estiver configurada no `.env` — sem a chave, aparecem desabilitadas no controle e o resto do mapa funciona normalmente. Trocar de provedor no futuro é só editar este arquivo, `BaseMap` não conhece detalhes de nenhum provedor.
- `components/mapStyleControl.ts` — `IControl` "vanilla" (não React) do MapLibre que renderiza o `<select>` de camadas no canto superior direito do mapa, empilhado com o `NavigationControl` nativo (zoom).
- `components/BaseMap.tsx` — mapa base (MapLibre GL). Capacidades independentes, ligadas por prop: `markers` (pontos simples, usado pela aba "Localização" do detalhe da AVU), `heatmapPoints` (camada `heatmap` nativa, Sprint 6), `clusteredMarkers` (fonte GeoJSON `cluster: true` + 3 layers — clustering é comportamento nativo do MapLibre/supercluster, não lógica nossa) com `selectedMarkerId`/`flyTo` para sincronização com a tabela, mais `defaultStyleId`/`showStyleControl` pra troca de camada. Trocar de estilo (`map.setStyle()`) descarta fontes/camadas antigas — por isso há um `styleVersion` interno que força heatmap/cluster/realce a se recriarem depois da troca.
- `components/MapLegend.tsx` — legenda das 6 cores.
- `components/AvuMapPanel.tsx` — painel lateral no clique do marcador: número, fotos, descrição, categoria, subcategoria, responsável, prazo, status, nota SAP, OM, empresa executante, fiscal, local, projeto, gerência, data de criação + botão "Ver detalhes do AVU".

Os filtros e os dados (`DashboardFilters`/`DashboardFiltersBar`/`listAvusForDashboard`, `features/dashboard/`) são os mesmos do Dashboard Executivo — este módulo não duplica busca de dados nem barra de filtros, só reaproveita. `pages/MapPage.tsx` mostra uma indicação clara (overlay sobre o próprio mapa, não só na tabela) quando os filtros não retornam nenhuma AVU, ou nenhuma AVU georreferenciada.

**Cuidado ao mexer em `BaseMap.tsx`**: não gate a adição de fontes/camadas em `map.isStyleLoaded()`/evento `load` — eles só ficam `true`/disparam quando **todos** os tiles do style base terminam de carregar, o que pode nunca acontecer numa rede lenta/instável (travou o clustering e teria travado o heatmap na verificação da Sprint 7). Em vez disso, tente adicionar a fonte direto num `try/catch` e, se o style ainda não aceitar, tente de novo no próximo `styledata`. Cada camada opcional (`heatmapPoints`/`clusteredMarkers`) também precisa remover sua própria fonte/camadas quando a prop correspondente some (ex.: troca de aba Marcadores↔Mapa de calor) — senão elas ficam sobrepostas.

## Preparado para o futuro

A arquitetura atual já habilita os próximos passos sem reescrita:

- **Rotas/geofencing**: a mesma fonte GeoJSON clusterizada de `BaseMap` é a base pra desenhar polígonos e rodar checagens de `turf.js` (ponto-em-polígono) depois — é adicionar camadas, não trocar a fundação.
- **Captura de GPS**: já existe e funciona desde a Sprint 4 (`navigator.geolocation` em `EvidenceUploadForm`, `features/contractors/`) — o mesmo padrão é reaproveitável aqui pra, por exemplo, o fiscal marcar a localização exata em campo.
- **App mobile**: a camada `services/`/`features` já é isolada da UI (ver `CLAUDE.md`) — a lógica de cor/filtro/dados deste módulo não depende do DOM nem do MapLibre especificamente.
- **Mapas offline**: MapLibre GL suporta cache de tiles e troca de estilo via um parâmetro (`style` em `BaseMap`) — não é uma reescrita, é configuração.
