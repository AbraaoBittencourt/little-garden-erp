import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { getSchool, schoolName } from './school'
import type { ExportCol } from './csv'
import { formatDateTime } from './format'

const FOREST: [number, number, number] = [53, 71, 53]

async function header(doc: jsPDF, title: string, filters?: string) {
  const s = await getSchool()
  const w = doc.internal.pageSize.getWidth()
  doc.setFillColor(...FOREST); doc.rect(0, 0, w, 22, 'F')
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(13)
  doc.text(schoolName(s).toUpperCase(), 12, 14)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8)
  doc.text(`Gerado em ${formatDateTime(new Date().toISOString())}`, w - 12, 14, { align: 'right' })
  doc.setTextColor(...FOREST); doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.text(title, 12, 32)
  let y = 32
  if (filters) { doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(115, 119, 111); doc.text(`Filtros: ${filters}`, 12, 38); y = 38 }
  return y + 4
}

export async function tablePDF(opts: { title: string; filters?: string; columns: ExportCol[]; rows: Record<string, unknown>[]; filename: string }) {
  const landscape = opts.columns.length > 5
  const doc = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' })
  const startY = await header(doc, opts.title, opts.filters)
  autoTable(doc, {
    startY, head: [opts.columns.map((c) => c.label)],
    body: opts.rows.map((r) => opts.columns.map((c) => (r[c.key] == null ? '' : String(r[c.key])))),
    styles: { fontSize: 8, cellPadding: 1.8, textColor: [53, 71, 53] },
    headStyles: { fillColor: FOREST, textColor: 255 }, alternateRowStyles: { fillColor: [247, 243, 237] },
    didDrawPage: () => {
      const n = doc.getNumberOfPages(); doc.setFontSize(8); doc.setTextColor(115, 119, 111)
      doc.text(`Página ${n}`, doc.internal.pageSize.getWidth() - 12, doc.internal.pageSize.getHeight() - 8, { align: 'right' })
    },
  })
  doc.save(opts.filename)
}

export async function textPDF(opts: { title: string; body: string; filename: string }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const y0 = await header(doc, opts.title)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(40, 40, 40)
  const lines = doc.splitTextToSize(opts.body, 186) as string[]
  let y = y0 + 6
  for (const l of lines) {
    if (y > 282) { doc.addPage(); y = 20 }
    doc.text(l, 12, y); y += 5.6
  }
  doc.save(opts.filename)
}
