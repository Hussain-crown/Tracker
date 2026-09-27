import { describe, it, expect, vi, afterEach } from 'vitest'
import { exportAsCsv, exportAsJson, exportForGoogleSheets, exportAsPdfSummary, type ExportableData } from '@/lib/exportData'

const EMPTY: ExportableData = { habits: [], leads: [], contactLogs: [], wins: [], weeklyReviews: [], moodEntries: [], candidates: [] }

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
    exportAsJson({ ...EMPTY, habits: [{ date: '2026-01-01' }] })
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
      ...EMPTY,
      habits: [{ date: '2026-01-01', convo: 3 }],
      contactLogs: [{ id: '1', notes: 'hi' }],
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
    exportAsCsv(EMPTY)
    vi.runAllTimers()
    expect(clicks).toHaveLength(0)
  })

  it('includes the newer mood_entries and candidates sections', () => {
    vi.useFakeTimers()
    const clicks = captureDownloads()
    exportAsCsv({ ...EMPTY, moodEntries: [{ id: '1', text: 'ok' }], candidates: [{ id: 'c1', name: 'Test' }] })
    vi.runAllTimers()
    expect(clicks.map(c => c.filename).sort()).toEqual(
      expect.arrayContaining([expect.stringContaining('-mood_entries.csv'), expect.stringContaining('-candidates.csv')])
    )
  })
})

describe('exportForGoogleSheets', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers() })

  it('behaves the same as exportAsCsv (Sheets imports CSV directly)', () => {
    vi.useFakeTimers()
    const clicks = captureDownloads()
    exportForGoogleSheets({ ...EMPTY, habits: [{ date: '2026-01-01', convo: 1 }] })
    vi.runAllTimers()
    expect(clicks).toHaveLength(1)
    expect(clicks[0].filename).toContain('-habits.csv')
  })
})

describe('exportAsPdfSummary', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers() })

  it('opens a new window, writes a printable summary, and calls print', () => {
    vi.useFakeTimers()
    const printSpy = vi.fn()
    const writeSpy = vi.fn()
    const win = { document: { write: writeSpy, close: vi.fn() }, focus: vi.fn(), print: printSpy }
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(win as any)

    exportAsPdfSummary({ ...EMPTY, habits: [{ date: '2026-01-01', convo: 2 }] })
    vi.runAllTimers()

    expect(openSpy).toHaveBeenCalled()
    expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('habits'))
    expect(printSpy).toHaveBeenCalled()
  })

  it('does nothing crash-worthy when the popup is blocked', () => {
    vi.spyOn(window, 'open').mockReturnValue(null)
    expect(() => exportAsPdfSummary({ ...EMPTY, habits: [{ date: '2026-01-01' }] })).not.toThrow()
  })
})
