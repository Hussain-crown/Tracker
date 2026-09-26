import { describe, it, expect, vi, afterEach } from 'vitest'
import { exportAsCsv, exportAsJson } from '@/lib/exportData'

function captureDownloads() {
  const clicks: { filename: string; type: string; text: string }[] = []
  const originalCreateElement = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    const el = originalCreateElement(tag)
    if (tag === 'a') {
      vi.spyOn(el, 'click').mockImplementation(() => {
        clicks.push({ filename: (el as HTMLAnchorElement).download, type: '', text: '' })
      })
    }
    return el
  })
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:mock'), revokeObjectURL: vi.fn() })
  return clicks
}

describe('exportAsJson', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers() })

  it('triggers a single JSON download containing all sections', () => {
    const clicks = captureDownloads()
    exportAsJson({ habits: [{ date: '2026-01-01' }], leads: [], contactLogs: [], wins: [], weeklyReviews: [] })
    expect(clicks).toHaveLength(1)
    expect(clicks[0].filename).toMatch(/^tracker-export-\d{4}-\d{2}-\d{2}\.json$/)
  })
})

describe('exportAsCsv', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers() })

  it('triggers one download per non-empty section, spaced out', () => {
    vi.useFakeTimers()
    const clicks = captureDownloads()
    exportAsCsv({
      habits: [{ date: '2026-01-01', convo: 3 }],
      leads: [],
      contactLogs: [{ id: '1', notes: 'hi' }],
      wins: [],
      weeklyReviews: [],
    })
    vi.runAllTimers()
    expect(clicks.map(c => c.filename).sort()).toEqual(
      expect.arrayContaining([expect.stringContaining('-habits.csv'), expect.stringContaining('-contact_logs.csv')])
    )
    expect(clicks).toHaveLength(2)
  })

  it('produces nothing when every section is empty', () => {
    vi.useFakeTimers()
    const clicks = captureDownloads()
    exportAsCsv({ habits: [], leads: [], contactLogs: [], wins: [], weeklyReviews: [] })
    vi.runAllTimers()
    expect(clicks).toHaveLength(0)
  })
})
