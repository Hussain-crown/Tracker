'use client'
import { useEffect } from 'react'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { void error }, [error])

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg, #0f0f0f)', color: 'var(--text, #f0f0f0)',
      fontFamily: "'Sora', sans-serif", padding: 24, textAlign: 'center'
    }}>
      <div style={{ fontSize: 32, marginBottom: 16 }}>⚠️</div>
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Something went wrong</div>
      <div style={{ fontSize: 12, color: 'var(--text4, #666)', marginBottom: 24 }}>
        {error.message || 'An unexpected error occurred.'}
      </div>
      <button
        onClick={reset}
        style={{
          padding: '10px 24px', borderRadius: 8, border: 'none',
          background: '#4CAF7D', color: '#fff', fontWeight: 700,
          cursor: 'pointer', fontFamily: "'Sora', sans-serif", fontSize: 13
        }}
      >
        Try again
      </button>
    </div>
  )
}
