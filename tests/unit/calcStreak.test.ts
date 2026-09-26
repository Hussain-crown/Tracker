import { describe, it, expect } from 'vitest'
import { calcStreak, isHabitDayActive } from '@/lib/utils'

const dAgo = (base: string[]) => (n: number) => base[n] ?? `missing-${n}`

describe('isHabitDayActive', () => {
  it('is false for an undefined day', () => {
    expect(isHabitDayActive(undefined)).toBe(false)
  })

  it('is false when only interruptions were logged', () => {
    expect(isHabitDayActive({ interruptions: 5 })).toBe(false)
  })

  it('is true when any loggable field is nonzero', () => {
    expect(isHabitDayActive({ convo: 1 })).toBe(true)
    expect(isHabitDayActive({ launch: 1 })).toBe(true)
  })
})

describe('calcStreak', () => {
  it('counts consecutive active days back from today', () => {
    // day 0 (today) through day 2 active, day 3 inactive
    const days = ['t0', 't1', 't2', 't3']
    const habits: Record<string, Record<string, number>> = {
      t0: { convo: 1 }, t1: { mg1: 1 }, t2: { contact: 1 }, t3: {},
    }
    expect(calcStreak(habits, dAgo(days))).toBe(3)
  })

  it('does not zero out the streak before today has been logged', () => {
    // today has no entry yet, but yesterday and the day before were active
    const days = ['t0', 't1', 't2']
    const habits: Record<string, Record<string, number>> = {
      t1: { convo: 1 }, t2: { mg1: 1 },
    }
    expect(calcStreak(habits, dAgo(days))).toBe(2)
  })

  it('is 0 when neither today nor yesterday is active', () => {
    const days = ['t0', 't1']
    const habits: Record<string, Record<string, number>> = { t1: {} }
    expect(calcStreak(habits, dAgo(days))).toBe(0)
  })

  it('respects the maxDays cap', () => {
    const days = Array.from({ length: 5 }, (_, i) => `t${i}`)
    const habits: Record<string, Record<string, number>> = Object.fromEntries(
      days.map(d => [d, { convo: 1 }])
    )
    expect(calcStreak(habits, dAgo(days), 3)).toBe(3)
  })
})
