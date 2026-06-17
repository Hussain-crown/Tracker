export const uid      = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
export const now      = () => new Date().toISOString()
// Brisbane UTC+10, no daylight saving — always use local date, not UTC
export const today    = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Brisbane' })
export const monthStr = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Brisbane' }).slice(0, 7)
export const prevMonthStr = () => {
  const d = new Date(); d.setMonth(d.getMonth() - 1)
  return d.toLocaleDateString('en-CA', { timeZone: 'Australia/Brisbane' }).slice(0, 7)
}
export const startOfWeek = () => {
  const d = new Date(today() + 'T00:00:00')
  d.setDate(d.getDate() - d.getDay())
  return d.toLocaleDateString('en-CA', { timeZone: 'Australia/Brisbane' })
}
