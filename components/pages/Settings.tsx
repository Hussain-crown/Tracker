'use client'
import React, { useEffect, useState } from 'react'
import { authFetch } from '@/lib/authFetch'
import { ErrorBoundary } from '@/components/ErrorBoundary'

const GOLD='var(--gold)'; const GREEN='var(--green)'

const CARD: React.CSSProperties = {background:'var(--s1)',border:'1px solid var(--br)',borderRadius:'var(--r2)',padding:'20px'}

export default function Settings(){
  const [apiKey,setApiKey]       = useState<string|null>(null)
  const [hasApiKey,setHasApiKey] = useState(false)
  const [busy,setBusy]           = useState(false)
  const [copied,setCopied]       = useState(false)

  async function loadKeyStatus(){
    try{ const r=await authFetch('/api/keys'); const d=await r.json(); setHasApiKey(!!d.hasKey); setApiKey(null) }catch{}
  }
  useEffect(()=>{ loadKeyStatus() },[])

  async function generateKey(){
    setBusy(true)
    try{ const r=await authFetch('/api/keys',{method:'POST'}); const d=await r.json(); setApiKey(d.key??null); setHasApiKey(!!d.key) }catch{}
    setBusy(false)
  }
  async function revokeKey(){
    if(!confirm('Revoke this API key? Any existing shortcuts using it will stop working.')) return
    setBusy(true)
    try{ const r=await authFetch('/api/keys',{method:'DELETE'}); if(r.ok){setApiKey(null);setHasApiKey(false)} }catch{}
    setBusy(false)
  }
  async function copyKey(){
    if(!apiKey) return
    try{ await navigator.clipboard.writeText(apiKey); setCopied(true); setTimeout(()=>setCopied(false),2000) }catch{}
  }

  const steps=[
    {n:1,t:'Copy your API key',d:'Hit "Generate Key" above, then copy it.'},
    {n:2,t:'Open iOS Shortcuts app',d:'Create a new shortcut → Add Action → "Get Contents of URL"'},
    {n:3,t:'Configure the action',d:'Method: POST · URL: this app\'s domain + /api/log-habit (or /api/log-prospect, /api/stage-candidate) · Headers: x-api-key → paste your key'},
    {n:4,t:'Set the request body',d:'Request Body: JSON · Add fields depending on the endpoint (see below)'},
    {n:5,t:'Add to Home Screen',d:'Tap ··· → Add to Home Screen. One tap logs your activity instantly.'},
    {n:6,t:'Optional: Siri',d:'Name it "Log habits" → say "Hey Siri, log habits" for voice entry.'},
  ]

  return(
    <ErrorBoundary label="Settings">
    <div style={{animation:'fade-in 0.3s ease',paddingBottom:48,display:'flex',flexDirection:'column',gap:16}}>
      <div style={{fontSize:16,fontWeight:800}}>iOS Shortcut</div>
      <div style={{fontSize:12,color:'var(--text3)',lineHeight:1.6}}>
        Log habits, prospects, and candidate stage changes directly from your iPhone — one tap, no app needed. Each team member generates their own key here; logging always applies to your own account.
      </div>

      <div style={CARD}>
        <div style={{fontSize:9,color:'var(--text4)',letterSpacing:'2px',fontWeight:700,marginBottom:10,textTransform:'uppercase' as const}}>API Key</div>
        {apiKey ? (
          <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap' as const}}>
            <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11,background:'var(--s0)',border:'1px solid var(--br2)',padding:'7px 12px',borderRadius:'var(--r)',flex:'1 1 200px',color:'var(--text3)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' as const}}>
              {apiKey.slice(0,16)}{'•'.repeat(Math.max(0,apiKey.length-16))}
            </div>
            <button onClick={copyKey}
              style={{padding:'7px 14px',borderRadius:'var(--r)',border:`1px solid ${copied?GREEN+'50':'var(--br)'}`,background:copied?`${GREEN}10`:'transparent',color:copied?GREEN:'var(--text3)',fontSize:11,cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap' as const,fontWeight:copied?700:400}}>
              {copied?'✓ Copied':'Copy Key'}
            </button>
            <button onClick={revokeKey} disabled={busy}
              style={{padding:'7px 14px',borderRadius:'var(--r)',border:'1px solid rgba(224,85,85,0.25)',background:'rgba(224,85,85,0.06)',color:'#E05555',fontSize:11,cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap' as const}}>
              {busy?'…':'Revoke'}
            </button>
          </div>
        ) : hasApiKey ? (
          <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap' as const}}>
            <div style={{fontSize:12,color:'var(--text4)',fontStyle:'italic',flex:'1 1 200px'}}>Key is active but hidden for security — regenerate to get a new copyable key.</div>
            <button onClick={generateKey} disabled={busy}
              style={{padding:'7px 14px',borderRadius:'var(--r)',border:'1px solid var(--br)',background:'transparent',color:'var(--text3)',fontSize:11,cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap' as const}}>
              {busy?'…':'Regenerate'}
            </button>
            <button onClick={revokeKey} disabled={busy}
              style={{padding:'7px 14px',borderRadius:'var(--r)',border:'1px solid rgba(224,85,85,0.25)',background:'rgba(224,85,85,0.06)',color:'#E05555',fontSize:11,cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap' as const}}>
              {busy?'…':'Revoke'}
            </button>
          </div>
        ) : (
          <button onClick={generateKey} disabled={busy}
            style={{display:'block',padding:'9px 18px',borderRadius:'var(--r)',border:'none',background:`linear-gradient(135deg,var(--gold),var(--gold3))`,color:'#000',fontWeight:700,fontSize:12,cursor:'pointer',fontFamily:'inherit',opacity:busy?0.6:1}}>
            {busy?'Generating…':'Generate Key'}
          </button>
        )}
      </div>

      <div style={CARD}>
        <div style={{fontSize:9,color:'var(--text4)',letterSpacing:'2px',fontWeight:700,marginBottom:10,textTransform:'uppercase' as const}}>Shortcut Setup</div>
        {steps.map(s=>(
          <div key={s.n} style={{display:'flex',gap:10,padding:'10px 0',borderBottom:'1px solid var(--br)'}}>
            <div style={{width:22,height:22,borderRadius:'50%',background:'rgba(200,162,74,0.12)',border:`1.5px solid ${GOLD}50`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,fontSize:10,fontWeight:700,color:GOLD}}>{s.n}</div>
            <div>
              <div style={{fontSize:12,fontWeight:600,color:'var(--text2)',marginBottom:2}}>{s.t}</div>
              <div style={{fontSize:11,color:'var(--text4)',lineHeight:1.55}}>{s.d}</div>
            </div>
          </div>
        ))}
        <div style={{marginTop:12,background:'var(--s0)',borderRadius:'var(--r)',padding:'10px 12px',fontFamily:"'JetBrains Mono',monospace",fontSize:10,color:'var(--text3)',lineHeight:1.9}}>
          <div style={{color:'var(--text4)',marginBottom:6}}>// /api/log-habit — every field optional except at least one, all additive</div>
          <div style={{marginBottom:10}}>{`{ "date":"2026-01-15", "convo":3, "mg1":1, "mpa":0, "contact":5, "catch_up":1, "dtm":0, "pre_filter":1, "launch":0 }`}</div>
          <div style={{color:'var(--text4)',marginBottom:6}}>// /api/log-prospect — name required</div>
          <div style={{marginBottom:10}}>{`{ "name":"Jane Smith", "phone":"0412345678", "email":"jane@email.com", "notes":"Met at gym" }`}</div>
          <div style={{color:'var(--text4)',marginBottom:6}}>// /api/stage-candidate — stage required, plus id/email/name to identify them</div>
          <div>{`{ "stage":"MG2", "name":"Jane Smith" }`}</div>
        </div>
      </div>
    </div>
    </ErrorBoundary>
  )
}
