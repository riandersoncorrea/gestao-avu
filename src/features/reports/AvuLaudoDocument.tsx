import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import { formatDate, formatDateTime } from '@/utils/format'
import type { AvuLaudoData } from './types'

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, fontFamily: 'Helvetica' },
  title: { fontSize: 16, fontWeight: 700, marginBottom: 4 },
  subtitle: { fontSize: 9, color: '#666666', marginBottom: 20 },
  section: { marginBottom: 12 },
  row: { flexDirection: 'row', marginBottom: 12 },
  col: { flex: 1, paddingRight: 12 },
  label: { fontSize: 8, color: '#666666', marginBottom: 2, textTransform: 'uppercase' },
  value: { fontSize: 11 },
  photosHeading: { fontSize: 12, fontWeight: 700, marginTop: 12, marginBottom: 8 },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  photoItem: { width: 150, marginRight: 10, marginBottom: 10 },
  photo: { width: 150, height: 110, objectFit: 'cover' },
  photoCaption: { fontSize: 7, color: '#666666', marginTop: 2 },
  emptyPhotos: { fontSize: 9, color: '#999999', fontStyle: 'italic' },
})

function PhotoGallery({ photos }: { photos: AvuLaudoData['fotosAntes'] }) {
  if (photos.length === 0) {
    return <Text style={styles.emptyPhotos}>Nenhuma foto registrada.</Text>
  }
  return (
    <View style={styles.photoGrid}>
      {photos.map((foto) => (
        <View key={foto.id} style={styles.photoItem} wrap={false}>
          <Image src={foto.url} style={styles.photo} />
          <Text style={styles.photoCaption}>{foto.nomeArquivo}</Text>
        </View>
      ))}
    </View>
  )
}

export function AvuLaudoDocument({ data }: { data: AvuLaudoData }) {
  return (
    <Document title={`Laudo ${data.numeroAvu}`}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Laudo de Vulnerabilidade — {data.numeroAvu}</Text>
        <Text style={styles.subtitle}>Gerado em {formatDateTime(new Date())}</Text>

        <View style={styles.section}>
          <Text style={styles.label}>Descrição</Text>
          <Text style={styles.value}>{data.descricao}</Text>
        </View>

        <View style={styles.row}>
          <View style={styles.col}>
            <Text style={styles.label}>Data de criação</Text>
            <Text style={styles.value}>{formatDate(data.dataCriacao)}</Text>
          </View>
          <View style={styles.col}>
            <Text style={styles.label}>Data de conclusão</Text>
            <Text style={styles.value}>{data.dataConclusao ? formatDate(data.dataConclusao) : '—'}</Text>
          </View>
          <View style={styles.col}>
            <Text style={styles.label}>Responsável</Text>
            <Text style={styles.value}>{data.responsavelNome}</Text>
          </View>
        </View>

        <View style={styles.row}>
          <View style={styles.col}>
            <Text style={styles.label}>Ordem de Manutenção (OM)</Text>
            <Text style={styles.value}>{data.ordemManutencao ?? '—'}</Text>
          </View>
          <View style={styles.col}>
            <Text style={styles.label}>Nota SAP</Text>
            <Text style={styles.value}>{data.notaSap ?? '—'}</Text>
          </View>
          <View style={styles.col} />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Conclusão</Text>
          <Text style={styles.value}>{data.conclusao}</Text>
        </View>

        <Text style={styles.photosHeading}>Fotos antes ({data.fotosAntes.length})</Text>
        <PhotoGallery photos={data.fotosAntes} />

        <Text style={styles.photosHeading}>Fotos depois ({data.fotosDepois.length})</Text>
        <PhotoGallery photos={data.fotosDepois} />
      </Page>
    </Document>
  )
}
