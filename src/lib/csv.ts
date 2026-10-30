export interface ExportCol { key: string; label: string }

const esc = (v: unknown) => {
  const s = v == null ? '' : String(v)
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
/** CSV com ';' e BOM, para abrir corretamente no Excel em português. */
export function toCSV(cols: ExportCol[], rows: Record<string, unknown>[]): string {
  return '\ufeff' + [cols.map((c) => esc(c.label)).join(';'), ...rows.map((r) => cols.map((c) => esc(r[c.key])).join(';'))].join('\r\n')
}
export function downloadFile(name: string, content: string | Blob, mime = 'text/csv;charset=utf-8') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}
export function exportCSV(name: string, cols: ExportCol[], rows: Record<string, unknown>[]) {
  downloadFile(`${name.endsWith('.csv') ? name : `${name}.csv`}`, toCSV(cols, rows))
}
export function parseCSV(text: string): string[][] {
  const t = text.replace(/^\ufeff/, '')
  const first = t.split(/\r?\n/)[0] ?? ''
  const d = (first.match(/;/g)?.length ?? 0) >= (first.match(/,/g)?.length ?? 0) ? ';' : ','
  const rows: string[][] = []; let row: string[] = []; let cur = ''; let q = false
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (q) { if (c === '"') { if (t[i + 1] === '"') { cur += '"'; i++ } else q = false } else cur += c }
    else if (c === '"') q = true
    else if (c === d) { row.push(cur); cur = '' }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.some((x) => x.trim() !== '')) rows.push(row); row = [] }
    else cur += c
  }
  row.push(cur); if (row.some((x) => x.trim() !== '')) rows.push(row)
  return rows
}
