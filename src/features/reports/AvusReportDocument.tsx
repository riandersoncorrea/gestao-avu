import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import { avuStatusLabel } from '@/features/avus/components/AvuStatusBadge'
import { formatDate, formatDateTime } from '@/utils/format'
import type { Avu } from '@/features/avus/types'

const COLUMN_WIDTHS = {
  numero: 70,
  status: 75,
  prioridade: 45,
  local: 75,
  responsavel: 85,
  prazo: 55,
  descricao: undefined, // flex — ocupa o resto da largura
}

const styles = StyleSheet.create({
  page: { padding: 28, fontSize: 8, fontFamily: 'Helvetica' },
  title: { fontSize: 14, fontWeight: 700, marginBottom: 2 },
  subtitle: { fontSize: 8, color: '#666666', marginBottom: 14 },
  headerRow: { flexDirection: 'row', backgroundColor: '#1F6357', paddingVertical: 4, paddingHorizontal: 3 },
  headerCell: { color: '#FFFFFF', fontSize: 7, fontWeight: 700 },
  row: { flexDirection: 'row', paddingVertical: 4, paddingHorizontal: 3, borderBottomWidth: 0.5, borderBottomColor: '#DDDDDD' },
  cell: { fontSize: 7, paddingRight: 4 },
  colNumero: { width: COLUMN_WIDTHS.numero },
  colStatus: { width: COLUMN_WIDTHS.status },
  colPrioridade: { width: COLUMN_WIDTHS.prioridade },
  colLocal: { width: COLUMN_WIDTHS.local },
  colResponsavel: { width: COLUMN_WIDTHS.responsavel },
  colPrazo: { width: COLUMN_WIDTHS.prazo },
  colDescricao: { flex: 1 },
})

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

export function AvusReportDocument({ avus, filtersSummary }: { avus: Avu[]; filtersSummary: string }) {
  return (
    <Document title="Relatório de AVUs">
      <Page size="A4" orientation="landscape" style={styles.page}>
        <Text style={styles.title}>Relatório de AVUs</Text>
        <Text style={styles.subtitle}>
          Gerado em {formatDateTime(new Date())} · {avus.length} registro(s) · {filtersSummary}
        </Text>

        <View style={styles.headerRow} fixed>
          <Text style={[styles.headerCell, styles.colNumero]}>Número AVU</Text>
          <Text style={[styles.headerCell, styles.colStatus]}>Status</Text>
          <Text style={[styles.headerCell, styles.colPrioridade]}>Prioridade</Text>
          <Text style={[styles.headerCell, styles.colLocal]}>Local</Text>
          <Text style={[styles.headerCell, styles.colResponsavel]}>Responsável</Text>
          <Text style={[styles.headerCell, styles.colPrazo]}>Prazo</Text>
          <Text style={[styles.headerCell, styles.colDescricao]}>Descrição</Text>
        </View>

        {avus.map((avu) => (
          <View key={avu.id} style={styles.row} wrap={false}>
            <Text style={[styles.cell, styles.colNumero]}>{avu.numeroAvu}</Text>
            <Text style={[styles.cell, styles.colStatus]}>{avuStatusLabel(avu.status)}</Text>
            <Text style={[styles.cell, styles.colPrioridade]}>{avu.prioridade}</Text>
            <Text style={[styles.cell, styles.colLocal]}>{avu.local ?? '—'}</Text>
            <Text style={[styles.cell, styles.colResponsavel]}>{avu.responsavel?.fullName ?? '—'}</Text>
            <Text style={[styles.cell, styles.colPrazo]}>{avu.dataLimite ? formatDate(avu.dataLimite) : '—'}</Text>
            <Text style={[styles.cell, styles.colDescricao]}>{truncate(avu.descricao, 90)}</Text>
          </View>
        ))}
      </Page>
    </Document>
  )
}
