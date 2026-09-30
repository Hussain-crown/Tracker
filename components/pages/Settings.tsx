'use client'
import React, { useEffect, useState } from 'react'
import { authFetch } from '@/lib/authFetch'
import { ErrorBoundary } from '@/components/ErrorBoundary'

const GOLD='var(--gold)'; const GREEN='var(--green)'

const CARD: React.CSSProperties = {background:'var(--s1)',border:'1px solid var(--br)',borderRadius:'var(--r2)',padding:'20px'}

export default function Settings(){
  // Only ever held in memory for this page visit -- the server stores just
  // the hash, never the plaintext, so this is the one place it's known.
  // Auto-generated on first visit (no manual "Generate Key" step) so it's
  // ready to paste into a shortcut the moment someone opens Settings.
  //
  // A downloadable pre-built .shortcut file was tried here first and pulled:
  // iOS now refuses to import ANY unsigned shortcut file, from any source
  // (download, AirDrop, Files) -- "Importing unsigned shortcut files is not
  // supported." Only a shortcut built by hand in the Shortcuts app, or
  // shared via a real iCloud link created from an actual device, can be
  // installed. There's no code-side fix for that; manual setup below is the
  // only path that actually works.
  const [key,setKey]       = useState<string|null>(null)
  const [hasKey,setHasKey] = useState(false)
  const [busy,setBusy]     = useState(false)
  const [copied,setCopied] = useState(false)

  async function ensureKey(){
    try{
      const r = await authFetch('/api/keys')
      const d = await r.json()
      setHasKey(!!d.hasKey)
      if(!d.hasKey){
        const gr = await authFetch('/api/keys',{method:'POST'})
        const gd = await gr.json()
        if(gd.key){ setKey(gd.key); setHasKey(true) }
      }
    }catch{}
  }
  useEffect(()=>{ ensureKey() },[])

  async function regenerate(){
    if(!confirm('Get a new key? Any shortcuts already built with the old one will stop working until you paste the new key into them.')) return
    setBusy(true)
    try{ const r=await authFetch('/api/keys',{method:'POST'}); const d=await r.json(); if(d.key){setKey(d.key);setHasKey(true)} }catch{}
    setBusy(false)
  }
  async function revoke() {
    if (!confirm('Revoke your key? Every shortcut you\'ve built will stop working.')) return
    setBusy(true)
    try { const r = await authFetch('/api/keys', { method: 'DELETE' }); if (r.ok) { setKey(null); setHasKey(false) } } catch {}
    setBusy(false)
  }
  async function copyKey() {
    if (!key) return
    try { await navigator.clipboard.writeText(key); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch {}
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const needsKeyFirst = hasKey && !key

  return(
    <ErrorBoundary label="Settings">
    <div style={{animation:'fade-in 0.3s ease',paddingBottom:48,display:'flex',flexDirection:'column',gap:16}}>
      <div style={{fontSize:16,fontWeight:800}}>iOS Shortcuts</div>
      <div style={{fontSize:12,color:'var(--text3)',lineHeight:1.6}}>
        Build a shortcut once in the Shortcuts app using your key below, then add it to your Home Screen or Today View as a one-tap widget. Your key was generated automatically — no setup step needed to get one.
      </div>

      <div style={CARD}>
        <div style={{fontSize:9,color:'var(--text4)',letterSpacing:'2px',fontWeight:700,marginBottom:10,textTransform:'uppercase' as const}}>Your API Key</div>
        {key ? (
          <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap' as const}}>
            <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11,background:'var(--s0)',border:'1px solid var(--br2)',padding:'7px 12px',borderRadius:'var(--r)',flex:'1 1 200px',color:'var(--text3)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' as const}}>
              {key}
            </div>
            <button onClick={copyKey}
              style={{padding:'7px 14px',borderRadius:'var(--r)',border:`1px solid ${copied?GREEN+'50':'var(--br)'}`,background:copied?`${GREEN}10`:'transparent',color:copied?GREEN:'var(--text3)',fontSize:11,cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap' as const,fontWeight:copied?700:400}}>
              {copied?'✓ Copied':'Copy Key'}
            </button>
          </div>
        ) : needsKeyFirst ? (
          <div>
            <div style={{fontSize:12,color:'var(--text4)',fontStyle:'italic',marginBottom:10}}>
              You have a key from a previous visit, but its plaintext isn't kept on the server (it's hashed at rest) — get a new one to see and copy it.
            </div>
            <button onClick={regenerate} disabled={busy}
              style={{padding:'9px 18px',borderRadius:'var(--r)',border:'none',background:`linear-gradient(135deg,var(--gold),var(--gold3))`,color:'#000',fontWeight:700,fontSize:12,cursor:'pointer',fontFamily:'inherit',opacity:busy?0.6:1}}>
              {busy?'…':'Get New Key'}
            </button>
          </div>
        ) : (
          <div style={{fontSize:12,color:'var(--text4)'}}>Setting up…</div>
        )}
        {key && (
          <div style={{display:'flex',gap:8,marginTop:12}}>
            <button onClick={regenerate} disabled={busy}
              style={{padding:'7px 14px',borderRadius:'var(--r)',border:'1px solid var(--br)',background:'transparent',color:'var(--text3)',fontSize:11,cursor:'pointer',fontFamily:'inherit'}}>
              {busy?'…':'Regenerate'}
            </button>
            <button onClick={revoke} disabled={busy}
              style={{padding:'7px 14px',borderRadius:'var(--r)',border:'1px solid rgba(224,85,85,0.25)',background:'rgba(224,85,85,0.06)',color:'#E05555',fontSize:11,cursor:'pointer',fontFamily:'inherit'}}>
              {busy?'…':'Revoke'}
            </button>
          </div>
        )}
      </div>

      <div style={CARD}>
        <div style={{fontSize:9,color:'var(--text4)',letterSpacing:'2px',fontWeight:700,marginBottom:10,textTransform:'uppercase' as const}}>Build It (one-time, per shortcut)</div>
        {[
          {n:1,t:'Open Shortcuts → New Shortcut',d:'Tap the + button, then "Add Action" and search for "Get Contents of URL".'},
          {n:2,t:'Set Method to POST',d:'Tap "Show More" under the URL field to reveal Method, Headers, and Body.'},
          {n:3,t:'Add a header',d:<>Key: <code>x-api-key</code> · Value: your key above.</>},
          {n:4,t:'Set the Request Body',d:'Request Body: JSON, then add the fields for whichever endpoint you\'re building (see below).'},
          {n:5,t:'Name it and save',d:'Tap the shortcut name at the top to rename it, then tap Done.'},
        ].map(s=>(
          <div key={s.n} style={{display:'flex',gap:10,padding:'10px 0',borderBottom:'1px solid var(--br)'}}>
            <div style={{width:22,height:22,borderRadius:'50%',background:'rgba(200,162,74,0.12)',border:`1.5px solid ${GOLD}50`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,fontSize:10,fontWeight:700,color:GOLD}}>{s.n}</div>
            <div>
              <div style={{fontSize:12,fontWeight:600,color:'var(--text2)',marginBottom:2}}>{s.t}</div>
              <div style={{fontSize:11,color:'var(--text4)',lineHeight:1.55}}>{s.d}</div>
            </div>
          </div>
        ))}
        <div style={{marginTop:12,background:'var(--s0)',borderRadius:'var(--r)',padding:'10px 12px',fontFamily:"'JetBrains Mono',monospace",fontSize:10,color:'var(--text3)',lineHeight:1.9}}>
          <div style={{color:'var(--text4)',marginBottom:6}}>// {origin}/api/log-habit — any count fields, all additive (e.g. a "Log Convo" shortcut just sends convo:1)</div>
          <div style={{marginBottom:10}}>{`{ "convo":1, "mg1":0, "mpa":0, "contact":0, "catch_up":0, "dtm":0, "pre_filter":0, "launch":0 }`}</div>
          <div style={{color:'var(--text4)',marginBottom:6}}>// {origin}/api/log-prospect — name required. Add an "Ask for Input" action before this one and use its output as the name value for a shortcut that asks each time.</div>
          <div style={{marginBottom:10}}>{`{ "name":"Jane Smith", "phone":"0412345678", "email":"jane@email.com" }`}</div>
          <div style={{color:'var(--text4)',marginBottom:6}}>// {origin}/api/stage-candidate — stage required, plus name/email/id to find them</div>
          <div>{`{ "stage":"MG2", "name":"Jane Smith" }`}</div>
        </div>
      </div>

      <div style={CARD}>
        <div style={{fontSize:9,color:'var(--text4)',letterSpacing:'2px',fontWeight:700,marginBottom:10,textTransform:'uppercase' as const}}>Add It as a Widget</div>
        <div style={{fontSize:11,color:'var(--text4)',lineHeight:1.6}}>
          Once a shortcut is saved, long-press your Home Screen → tap the <strong>+</strong> in the top corner → search "Shortcuts" → pick the small widget size → choose your shortcut. It now runs with a single tap, no app to open. The same shortcut can also be added to Today View (swipe right from the Lock Screen or Home Screen → Edit → Add Widget → Shortcuts).
        </div>
      </div>
    </div>
    </ErrorBoundary>
  )
}
