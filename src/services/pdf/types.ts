export interface PdfSection {
  heading: string
  body: string
}

export interface PdfDocumentDefinition {
  title: string
  subtitle?: string
  sections: PdfSection[]
  generatedAt: string
}
