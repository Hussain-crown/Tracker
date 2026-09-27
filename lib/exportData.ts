// Client-side export for the current user's own data. No server round trip
// needed -- the stores already hold everything RLS lets this user see.

function toCsv(rows: object[]): string {
  if (!rows.length) return ''
  const asRecords = rows as Record<string, unknown>[]
  const headers = Array.from(asRecords.reduce((set, r) => { Object.keys(r).forEach(k => set.add(k)); return set }, new Set<string>()))
  const escape = (v: unknown): string => {
    if (v === null || v === undefined) return ''
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [headers.join(',')]
  for (const row of asRecords) lines.push(headers.map(h => escape(row[h])).join(','))
  return lines.join('\n')
}

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export interface ExportableData {
  habits: object[]
  leads: object[]
  contactLogs: object[]
  wins: object[]
  weeklyReviews: object[]
  moodEntries: object[]
  candidates: object[]
}

function sections(data: ExportableData): [string, object[]][] {
  return [
    ['habits', data.habits],
    ['leads', data.leads],
    ['contact_logs', data.contactLogs],
    ['wins', data.wins],
    ['weekly_reviews', data.weeklyReviews],
    ['mood_entries', data.moodEntries],
    ['candidates', data.candidates],
  ]
}

export function exportAsJson(data: ExportableData) {
  const stamp = new Date().toISOString().slice(0, 10)
  download(`tracker-export-${stamp}.json`, JSON.stringify(data, null, 2), 'application/json')
}

export function exportAsCsv(data: ExportableData) {
  const stamp = new Date().toISOString().slice(0, 10)
  // Triggering several downloads back-to-back in the same tick gets some
  // browsers to silently block everything after the first as a popup-style
  // flood -- spacing them out avoids that.
  sections(data).filter(([, rows]) => rows.length).forEach(([name, rows], i) => {
    setTimeout(() => download(`tracker-export-${stamp}-${name}.csv`, toCsv(rows), 'text/csv'), i * 400)
  })
}

// Google Sheets has no public write API this app is set up to call (that
// would need its own OAuth consent screen and scope, which this app's
// Google sign-in doesn't currently request) -- the honest, working option
// today is a CSV built for a clean File > Import into Sheets: comma-
// separated, one table, UTF-8. Same file exportAsCsv writes per table.
export function exportForGoogleSheets(data: ExportableData) {
  exportAsCsv(data)
}

// No PDF library is worth adding for a data export -- the browser's own
// print-to-PDF does the job with zero new dependencies. Opens a plain,
// printable summary in a new tab; the person picks "Save as PDF" from the
// print dialog themselves.
export function exportAsPdfSummary(data: ExportableData) {
  const stamp = new Date().toISOString().slice(0, 10)
  const table = (title: string, rows: object[]): string => {
    if (!rows.length) return ''
    const records = rows as Record<string, unknown>[]
    const headers = Array.from(records.reduce((set, r) => { Object.keys(r).forEach(k => set.add(k)); return set }, new Set<string>()))
    const cell = (v: unknown) => v === null || v === undefined ? '' : (typeof v === 'object' ? JSON.stringify(v) : String(v))
    return `
      <h2>${title} (${rows.length})</h2>
      <table>
        <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
        <tbody>${records.map(r => `<tr>${headers.map(h => `<td>${cell(r[h])}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>`
  }
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Tracker export ${stamp}</title>
    <style>
      body{font-family:system-ui,sans-serif;color:#111;padding:24px}
      h1{font-size:18px} h2{font-size:14px;margin-top:24px;border-bottom:1px solid #ccc;padding-bottom:4px}
      table{border-collapse:collapse;width:100%;font-size:10px;margin-top:8px}
      th,td{border:1px solid #ddd;padding:4px 6px;text-align:left;word-break:break-word}
      th{background:#f3f3f3}
      @media print { h2 { page-break-before:auto } }
    </style></head><body>
    <h1>Tracker data export — ${stamp}</h1>
    ${sections(data).map(([name, rows]) => table(name, rows)).join('')}
  </body></html>`
  const win = window.open('', '_blank')
  if (!win) return
  win.document.write(html)
  win.document.close()
  win.focus()
  // Give the new tab a moment to lay out the tables before the print dialog opens.
  setTimeout(() => win.print(), 300)
}
