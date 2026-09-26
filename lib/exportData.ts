// Client-side CSV export for the current user's own data. No server round
// trip needed -- the stores already hold everything RLS lets this user see.

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
}

export function exportAsJson(data: ExportableData) {
  const stamp = new Date().toISOString().slice(0, 10)
  download(`tracker-export-${stamp}.json`, JSON.stringify(data, null, 2), 'application/json')
}

export function exportAsCsv(data: ExportableData) {
  const stamp = new Date().toISOString().slice(0, 10)
  const sections: [string, object[]][] = [
    ['habits', data.habits],
    ['leads', data.leads],
    ['contact_logs', data.contactLogs],
    ['wins', data.wins],
    ['weekly_reviews', data.weeklyReviews],
  ]
  // Triggering several downloads back-to-back in the same tick gets some
  // browsers to silently block everything after the first as a popup-style
  // flood -- spacing them out avoids that.
  sections.filter(([, rows]) => rows.length).forEach(([name, rows], i) => {
    setTimeout(() => download(`tracker-export-${stamp}-${name}.csv`, toCsv(rows), 'text/csv'), i * 400)
  })
}
