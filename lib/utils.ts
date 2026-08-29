export const uid      = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
export const now      = () => new Date().toISOString()
// Brisbane UTC+10, no daylight saving — always use local date, not UTC
export const today    = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Brisbane' })
