'use client'
import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'

// Next only renders this for errors thrown by the ROOT layout itself —
// app/error.tsx can't catch those, so without this file a root-layout crash
// bypasses Sentry (and the app) entirely with no report and a blank page.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { Sentry.captureException(error) }, [error])

  return (
    <html>
      <body style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: '#0f0f0f', color: '#f0f0f0',
        fontFamily: "'Sora', sans-serif", padding: 24, textAlign: 'center'
      }}>
        <div style={{ fontSize: 32, marginBottom: 16 }}>⚠️</div>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Something went wrong</div>
        <div style={{ fontSize: 12, color: '#666', marginBottom: 24 }}>
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
      </body>
    </html>
  )
}
