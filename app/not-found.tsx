export default function NotFound() {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg, #0f0f0f)', color: 'var(--text, #f0f0f0)',
      fontFamily: "'Sora', sans-serif", padding: 24, textAlign: 'center'
    }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Page not found</div>
      <div style={{ fontSize: 12, color: 'var(--text4, #666)', marginBottom: 24 }}>
        This page doesn't exist. Head back to the tracker.
      </div>
      <a
        href="/"
        style={{
          padding: '10px 24px', borderRadius: 8,
          background: '#4CAF7D', color: '#fff', fontWeight: 700,
          textDecoration: 'none', fontFamily: "'Sora', sans-serif", fontSize: 13
        }}
      >
        Go home
      </a>
    </div>
  )
}
