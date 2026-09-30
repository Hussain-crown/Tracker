'use client'
import React, { useEffect, useState } from 'react'
import { authFetch } from '@/lib/authFetch'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { buildStaticShortcut, buildMultiPromptShortcut } from '@/lib/appleShortcut'

const GOLD='var(--gold)'; const GREEN='var(--green)'

const CARD: React.CSSProperties = {background:'var(--s1)',border:'1px solid var(--br)',borderRadius:'var(--r2)',padding:'20px'}

function downloadShortcut(filename: string, plist: string) {
  const blob = new Blob([plist], { type: 'application/x-plist' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

interface HabitWidget { key: string; label: string }
const HABIT_WIDGETS: HabitWidget[] = [
  { key: 'convo',   label: 'Log Convo' },
  { key: 'mg1',     label: 'Log MG1' },
  { key: 'mpa',     label: 'Log MPA' },
  { key: 'contact', label: 'Log Contact' },
]

export default function Settings(){
  // Only ever held in memory for this page visit -- the server stores just
  // the hash, never the plaintext, so this is the one place it's known.
  // Auto-generated on first visit (no manual "Generate Key" step) so the
  // shortcuts below are ready to download the moment someone opens Settings.
  const [key,setKey]       = useState<string|null>(null)
  const [hasKey,setHasKey] = useState(false)
  const [busy,setBusy]     = useState(false)
  const [copied,setCopied] = useState(false)
  const [showAdvanced,setShowAdvanced] = useState(false)

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
    if(!confirm('Get a new key? Any shortcuts built with the old one will stop working — you\'ll need to re-download them.')) return
    setBusy(true)
    try{ const r=await authFetch('/api/keys',{method:'POST'}); const d=await r.json(); if(d.key){setKey(d.key);setHasKey(true)} }catch{}
    setBusy(false)
  }
  async function revoke() {
    if (!confirm('Revoke your key? Every shortcut you\'ve installed will stop working.')) return
    setBusy(true)
    try { const r = await authFetch('/api/keys', { method: 'DELETE' }); if (r.ok) { setKey(null); setHasKey(false) } } catch {}
    setBusy(false)
  }
  async function copyKey() {
    if (!key) return
    try { await navigator.clipboard.writeText(key); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch {}
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : ''

  function getHabitWidget(w: HabitWidget){
    if(!key) return
    const plist = buildStaticShortcut({
      name: w.label,
      url: `${origin}/api/log-habit`,
      apiKey: key,
      jsonBody: { [w.key]: '1' },
    })
    downloadShortcut(`${w.label}.shortcut`, plist)
  }
  function getProspectShortcut(){
    if(!key) return
    const plist = buildMultiPromptShortcut({
      name: 'Log New Prospect',
      url: `${origin}/api/log-prospect`,
      apiKey: key,
      prompts: [{ fieldKey: 'name', prompt: "Prospect's name?" }],
    })
    downloadShortcut('Log New Prospect.shortcut', plist)
  }
  function getStageShortcut(){
    if(!key) return
    const plist = buildMultiPromptShortcut({
      name: 'Update Candidate Stage',
      url: `${origin}/api/stage-candidate`,
      apiKey: key,
      prompts: [
        { fieldKey: 'name', prompt: "Candidate's name?" },
        { fieldKey: 'stage', prompt: 'New stage? (Pre-Filter, MG1, MG2, FU1, FU2, FU3, Activation, ...)' },
      ],
    })
    downloadShortcut('Update Candidate Stage.shortcut', plist)
  }

  const needsKeyFirst = hasKey && !key

  return(
    <ErrorBoundary label="Settings">
    <div style={{animation:'fade-in 0.3s ease',paddingBottom:48,display:'flex',flexDirection:'column',gap:16}}>
      <div style={{fontSize:16,fontWeight:800}}>iOS Shortcuts</div>
      <div style={{fontSize:12,color:'var(--text3)',lineHeight:1.6}}>
        One-tap Home Screen or Today View widgets that log straight to your own account — no app to open. Your key was set up automatically; just download the shortcuts you want below.
      </div>

      {needsKeyFirst && (
        <div style={{...CARD,borderLeft:`3px solid ${GOLD}`}}>
          <div style={{fontSize:12,color:'var(--text3)',lineHeight:1.6,marginBottom:10}}>
            You already have a key from a previous visit, but its plaintext value isn't kept on the server (it's hashed at rest) — so it's not available here to build a fresh shortcut file. Get a new one to enable downloads below.
          </div>
          <button onClick={regenerate} disabled={busy}
            style={{padding:'9px 18px',borderRadius:'var(--r)',border:'none',background:`linear-gradient(135deg,var(--gold),var(--gold3))`,color:'#000',fontWeight:700,fontSize:12,cursor:'pointer',fontFamily:'inherit',opacity:busy?0.6:1}}>
            {busy?'…':'Get New Key & Shortcuts'}
          </button>
        </div>
      )}

      <div style={CARD}>
        <div style={{fontSize:9,color:'var(--text4)',letterSpacing:'2px',fontWeight:700,marginBottom:4,textTransform:'uppercase' as const}}>Habit Widgets</div>
        <div style={{fontSize:11,color:'var(--text4)',marginBottom:14,lineHeight:1.5}}>Each one logs a single +1 the moment you tap it — add to your Home Screen or Today View from the Shortcuts app.</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))',gap:8}}>
          {HABIT_WIDGETS.map(w=>(
            <button key={w.key} onClick={()=>getHabitWidget(w)} disabled={!key}
              style={{padding:'12px 14px',borderRadius:'var(--r)',border:'1px solid var(--br)',background:'var(--s0)',color:key?'var(--text2)':'var(--text4)',fontSize:12,fontWeight:600,cursor:key?'pointer':'not-allowed',fontFamily:'inherit',textAlign:'left' as const}}>
              📲 {w.label}
            </button>
          ))}
        </div>
      </div>

      <div style={CARD}>
        <div style={{fontSize:9,color:'var(--text4)',letterSpacing:'2px',fontWeight:700,marginBottom:4,textTransform:'uppercase' as const}}>Prospect & Candidate Shortcuts</div>
        <div style={{fontSize:11,color:'var(--text4)',marginBottom:14,lineHeight:1.5}}>
          These ask a quick question when you tap them. This is a trickier part of Apple's Shortcuts file format to build sight-unseen — if either fails to import cleanly, use the manual setup below the download instead.
        </div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap' as const}}>
          <button onClick={getProspectShortcut} disabled={!key}
            style={{padding:'12px 14px',borderRadius:'var(--r)',border:'1px solid var(--br)',background:'var(--s0)',color:key?'var(--text2)':'var(--text4)',fontSize:12,fontWeight:600,cursor:key?'pointer':'not-allowed',fontFamily:'inherit'}}>
            📲 Log New Prospect
          </button>
          <button onClick={getStageShortcut} disabled={!key}
            style={{padding:'12px 14px',borderRadius:'var(--r)',border:'1px solid var(--br)',background:'var(--s0)',color:key?'var(--text2)':'var(--text4)',fontSize:12,fontWeight:600,cursor:key?'pointer':'not-allowed',fontFamily:'inherit'}}>
            📲 Update Candidate Stage
          </button>
        </div>
      </div>

      <button onClick={()=>setShowAdvanced(s=>!s)} style={{background:'none',border:'none',color:'var(--text4)',cursor:'pointer',fontFamily:'inherit',fontSize:11,textAlign:'left' as const,padding:0,textDecoration:'underline'}}>
        {showAdvanced?'Hide':'Show'} advanced (raw key, manual setup, revoke)
      </button>

      {showAdvanced && (
        <div style={CARD}>
          <div style={{fontSize:9,color:'var(--text4)',letterSpacing:'2px',fontWeight:700,marginBottom:10,textTransform:'uppercase' as const}}>API Key</div>
          {key ? (
            <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap' as const,marginBottom:16}}>
              <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11,background:'var(--s0)',border:'1px solid var(--br2)',padding:'7px 12px',borderRadius:'var(--r)',flex:'1 1 200px',color:'var(--text3)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' as const}}>
                {key}
              </div>
              <button onClick={copyKey}
                style={{padding:'7px 14px',borderRadius:'var(--r)',border:`1px solid ${copied?GREEN+'50':'var(--br)'}`,background:copied?`${GREEN}10`:'transparent',color:copied?GREEN:'var(--text3)',fontSize:11,cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap' as const,fontWeight:copied?700:400}}>
                {copied?'✓ Copied':'Copy Key'}
              </button>
            </div>
          ) : (
            <div style={{fontSize:12,color:'var(--text4)',fontStyle:'italic',marginBottom:16}}>Key is active but hidden for security — click "Get New Key & Shortcuts" above to see a fresh one.</div>
          )}
          <div style={{display:'flex',gap:8,marginBottom:20}}>
            <button onClick={regenerate} disabled={busy}
              style={{padding:'7px 14px',borderRadius:'var(--r)',border:'1px solid var(--br)',background:'transparent',color:'var(--text3)',fontSize:11,cursor:'pointer',fontFamily:'inherit'}}>
              {busy?'…':'Regenerate'}
            </button>
            <button onClick={revoke} disabled={busy}
              style={{padding:'7px 14px',borderRadius:'var(--r)',border:'1px solid rgba(224,85,85,0.25)',background:'rgba(224,85,85,0.06)',color:'#E05555',fontSize:11,cursor:'pointer',fontFamily:'inherit'}}>
              {busy?'…':'Revoke'}
            </button>
          </div>

          <div style={{fontSize:9,color:'var(--text4)',letterSpacing:'2px',fontWeight:700,marginBottom:10,textTransform:'uppercase' as const}}>Manual Setup (fallback)</div>
          <div style={{fontSize:11,color:'var(--text4)',marginBottom:10,lineHeight:1.6}}>
            In the Shortcuts app: new shortcut → "Get Contents of URL" → Method POST → Headers: <code>x-api-key</code> → your key above → Body: JSON, matching one of the shapes below.
          </div>
          <div style={{background:'var(--s0)',borderRadius:'var(--r)',padding:'10px 12px',fontFamily:"'JetBrains Mono',monospace",fontSize:10,color:'var(--text3)',lineHeight:1.9}}>
            <div style={{color:'var(--text4)',marginBottom:6}}>// {origin}/api/log-habit — any count fields, all additive</div>
            <div style={{marginBottom:10}}>{`{ "convo":1, "mg1":1, "mpa":0, "contact":0, "catch_up":0, "dtm":0, "pre_filter":0, "launch":0 }`}</div>
            <div style={{color:'var(--text4)',marginBottom:6}}>// {origin}/api/log-prospect — name required</div>
            <div style={{marginBottom:10}}>{`{ "name":"Jane Smith", "phone":"0412345678", "email":"jane@email.com" }`}</div>
            <div style={{color:'var(--text4)',marginBottom:6}}>// {origin}/api/stage-candidate — stage required, plus name/email/id</div>
            <div>{`{ "stage":"MG2", "name":"Jane Smith" }`}</div>
          </div>
        </div>
      )}
    </div>
    </ErrorBoundary>
  )
}
