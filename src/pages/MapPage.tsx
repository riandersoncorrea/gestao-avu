import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/Card";
import { Tabs } from "@/components/Tabs";
import { DataTable, type DataTableColumn } from "@/components/DataTable";
import { DashboardFiltersBar } from "@/features/dashboard/components/DashboardFiltersBar";
import { listAvusForDashboard } from "@/features/dashboard/dashboardService";
import { computeHeatmapPoints } from "@/features/dashboard/analytics";
import {
  EMPTY_DASHBOARD_FILTERS,
  type DashboardAvu,
  type DashboardFilters,
} from "@/features/dashboard/types";
import {
  BaseMap,
  type ClusteredMarker,
  type FlyToTarget,
} from "@/features/gis/components/BaseMap";
import { MapLegend } from "@/features/gis/components/MapLegend";
import { AvuMapPanel } from "@/features/gis/components/AvuMapPanel";
import { computeMarkerColor } from "@/features/gis/markerColor";
import { AvuStatusBadge } from "@/features/avus/components/AvuStatusBadge";
import { SlaBadge } from "@/features/avus/components/SlaBadge";
import { formatDate } from "@/utils/format";

type ViewMode = "markers" | "heatmap";

const VIEW_TABS: { key: ViewMode; label: string }[] = [
  { key: "markers", label: "Marcadores" },
  { key: "heatmap", label: "Mapa de calor" },
];

const COLUMNS: DataTableColumn<DashboardAvu>[] = [
  {
    key: "numero",
    header: "Número",
    render: (avu) => <span className="font-medium">{avu.numeroAvu}</span>,
  },
  {
    key: "descricao",
    header: "Descrição",
    render: (avu) => (
      <span className="line-clamp-1 max-w-xs">{avu.descricao}</span>
    ),
  },
  {
    key: "categoria",
    header: "Categoria",
    render: (avu) => avu.categoria ?? "—",
  },
  {
    key: "status",
    header: "Status",
    render: (avu) => <AvuStatusBadge status={avu.status} />,
  },
  {
    key: "prazo",
    header: "Prazo",
    render: (avu) => (
      <div className="flex flex-col gap-1">
        <span className="text-xs text-gray-500">
          {avu.dataLimite ? formatDate(avu.dataLimite) : "—"}
        </span>
        <SlaBadge dataLimite={avu.dataLimite} status={avu.status} />
      </div>
    ),
  },
  {
    key: "empresa",
    header: "Empresa",
    render: (avu) => avu.empresaExecutante ?? "—",
  },
  {
    key: "responsavel",
    header: "Responsável",
    render: (avu) => avu.responsavel?.fullName ?? "—",
  },
];

export function MapPage() {
  const [filters, setFilters] = useState<DashboardFilters>(
    EMPTY_DASHBOARD_FILTERS,
  );
  const [viewMode, setViewMode] = useState<ViewMode>("markers");
  const [selectedAvuId, setSelectedAvuId] = useState<string | null>(null);
  const [flyTo, setFlyTo] = useState<FlyToTarget | null>(null);

  const avusQuery = useQuery({
    queryKey: ["map", filters],
    queryFn: () => listAvusForDashboard(filters),
  });
  const avus = avusQuery.data ?? [];

  // O mapa só plota quem tem coordenadas e não é Cancelada/Reprovada (sem cor definida) —
  // a tabela abaixo continua mostrando todas as AVUs filtradas, coordenadas ou não.
  const clusteredMarkers: ClusteredMarker[] = useMemo(
    () =>
      avus.flatMap((avu) => {
        if (avu.latitude === null || avu.longitude === null) return [];
        const colorInfo = computeMarkerColor(avu);
        if (!colorInfo) return [];
        return [
          {
            id: avu.id,
            longitude: avu.longitude,
            latitude: avu.latitude,
            color: colorInfo.color,
          },
        ];
      }),
    [avus],
  );

  const heatmapPoints = useMemo(() => computeHeatmapPoints(avus), [avus]);
  const selectedAvu = avus.find((avu) => avu.id === selectedAvuId) ?? null;

  const noAvusAtAll = !avusQuery.isLoading && avus.length === 0;
  const noGeoreferencedAvus =
    !avusQuery.isLoading && avus.length > 0 && clusteredMarkers.length === 0;

  function selectAvu(avu: DashboardAvu) {
    setSelectedAvuId(avu.id);
    if (avu.latitude !== null && avu.longitude !== null) {
      setFlyTo({ longitude: avu.longitude, latitude: avu.latitude });
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Mapa"
        description="Mapa interativo de vulnerabilidades — todas as AVUs georreferenciadas dos filtros atuais."
      />

      <DashboardFiltersBar filters={filters} onChange={setFilters} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          tabs={VIEW_TABS}
          activeKey={viewMode}
          onChange={(key) => setViewMode(key as ViewMode)}
        />
        {viewMode === "markers" && <MapLegend />}
      </div>

      {/* O mapa é o elemento principal da página — altura generosa (viewport), não uma
          caixa pequena e secundária. */}
      <Card className="overflow-hidden">
        <div className="relative h-[70vh] min-h-[420px]">
          {viewMode === "markers" ? (
            <BaseMap
              clusteredMarkers={clusteredMarkers}
              onClusteredMarkerClick={setSelectedAvuId}
              selectedMarkerId={selectedAvuId}
              flyTo={flyTo}
            />
          ) : (
            <BaseMap heatmapPoints={heatmapPoints} />
          )}

          {(noAvusAtAll || (viewMode === "markers" && noGeoreferencedAvus)) && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="pointer-events-auto rounded-xl border border-gray-200 bg-white/95 px-5 py-3 text-center shadow-sm">
                <p className="text-sm font-medium text-graphite-700">
                  {noAvusAtAll
                    ? "Nenhuma AVU encontrada com os filtros atuais."
                    : "Nenhuma AVU georreferenciada encontrada com os filtros atuais."}
                </p>
              </div>
            </div>
          )}
        </div>
      </Card>

      <Card>
        <CardContent className="p-0">
          <DataTable
            data={avus}
            columns={COLUMNS}
            getRowId={(avu) => avu.id}
            isLoading={avusQuery.isLoading}
            emptyMessage="Nenhuma AVU encontrada com os filtros atuais."
            onRowClick={selectAvu}
            getRowClassName={(avu) =>
              avu.id === selectedAvuId ? "bg-primary-50" : undefined
            }
          />
        </CardContent>
      </Card>

      {selectedAvu && (
        <AvuMapPanel avu={selectedAvu} onClose={() => setSelectedAvuId(null)} />
      )}
    </div>
  );
}
