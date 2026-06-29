'use client'
import React, { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase/client'
import type { Candidate, ContactLog } from '@/lib/stores/types'

const GOLD='#C8A24A'; const GREEN='#4CAF7D'; const RED='#E05555'
const BLUE='#5B9BD5'

const STAGE_COLORS: Record<string,string> = {
  'Pre-Filter': BLUE,
  'MG1': '#9B5BD5',
  'MG2': '#4ECDC4',
  'FU1': GOLD,
  'FU2': GOLD,
  'FU3': '#E8913A',
  'Offer Questions': '#E8913A',
  'Offer Call': GREEN,
}

const STAGE_MAP: Record<string,string> = {
  'Pre-Filter': 'Pre-Filter', 'PF Completed': 'Pre-Filter',
  'MG1 Booked': 'MG1', 'MG1 Completed': 'MG1', 'MG1': 'MG1',
  'MG2 Booked': 'MG2', 'MG2 Completed': 'MG2', 'MG2': 'MG2',
  'FU1': 'FU1', 'FU2': 'FU2', 'FU3': 'FU3', 'Follow-Up': 'FU1',
  'Offer Questions': 'Offer Questions', 'Offer': 'Offer Call', 'Offer Call': 'Offer Call',
}

const STAGE_ORDER = ['Pre-Filter','MG1','MG2','FU1','FU2','FU3','Offer Questions','Offer Call']

function normStage(s: string) { return STAGE_MAP[s] ?? 'Pre-Filter' }
function daysSince(d: string) { return d ? Math.floor((Date.now() - new Date(d).getTime()) / 86400000) : 999 }
function fmtDate(d: string) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'Australia/Brisbane' })
}

function healthScore(c: Candidate): number {
  if (typeof c.hxl_score === 'number') return c.hxl_score
  const h = c.hunger ?? 5; const l = c.looking ?? 5
  return Math.min(100, Math.round(h * l))
}

function scoreColor(s: number) {
  if (s >= 70) return GREEN
  if (s >= 40) return GOLD
  return RED
}

function parseNotes(raw: string): Record<string,any> {
  try { return JSON.parse(raw || '{}') } catch { return {} }
}

interface Props { iboNumber: string }

type SubTab = 'focus'|'active'|'funnel'|'launched'|'archive'
type DrawerTab = 'profile'|'history'

export default function Candidates({ iboNumber }: Props) {
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [logsMap, setLogsMap]       = useState<Record<string, ContactLog[]>>({})
  const [loading, setLoading]       = useState(true)
  const [tab, setTab]               = useState<SubTab>('focus')
  const [selected, setSelected]     = useState<Candidate|null>(null)
  const [drawerTab, setDrawerTab]   = useState<DrawerTab>('profile')

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const token = session?.access_token || ''
        const resp = await fetch('/api/team/my-candidates', {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!resp.ok) return
        const { candidates: data, logs } = await resp.json()
        setCandidates((data || []) as Candidate[])
        const map: Record<string, ContactLog[]> = {}
        for (const l of (logs || [])) {
          if (!map[l.entity_id]) map[l.entity_id] = []
          map[l.entity_id].push(l as ContactLog)
        }
        setLogsMap(map)
      } catch {}
      setLoading(false)
    }
    load()
  }, [iboNumber]) // eslint-disable-line

  const active   = useMemo(() => candidates.filter(c => c.status === 'active'), [candidates])
  const launched = useMemo(() => candidates.filter(c => c.status === 'launched'), [candidates])
  const archived = useMemo(() => candidates.filter(c => c.status === 'disqualified' || c.status === 'archived'), [candidates])

  const focus = useMemo(() => active.filter(c => {
    const logs = (logsMap[c.id] || []).sort((a,b) => b.created_at.localeCompare(a.created_at))
    const daysSinceContact = daysSince(logs[0]?.created_at ?? c.updated_at)
    const nextDue = logs.find(l => l.next_date)?.next_date
    return (nextDue && nextDue < new Date().toISOString().slice(0,10)) || daysSinceContact >= 7
  }), [active, logsMap])

  // Intelligence strip counts
  const hotCount    = active.filter(c => healthScore(c) >= 70).length
  const stallingCnt = active.filter(c => {
    const logs = logsMap[c.id] || []
    const last = [...logs].sort((a,b) => b.created_at.localeCompare(a.created_at))[0]
    return daysSince(last?.created_at ?? c.updated_at) >= 14
  }).length
  const atOfferCnt  = active.filter(c => {
    const s = normStage(c.stage)
    return s === 'Offer Call' || s === 'Offer Questions'
  }).length

  const TABS: { id: SubTab; label: string }[] = [
    { id: 'focus',    label: `Focus · ${focus.length}` },
    { id: 'active',   label: `Active · ${active.length}` },
    { id: 'funnel',   label: 'Funnel' },
    { id: 'launched', label: `Launched · ${launched.length}` },
    { id: 'archive',  label: `Archive · ${archived.length}` },
  ]

  function openDrawer(c: Candidate) { setSelected(c); setDrawerTab('profile') }

  if (loading) {
    return (
      <div style={{padding:'48px',textAlign:'center',color:'#555',fontSize:13}}>
        Loading candidates…
      </div>
    )
  }

  return (
    <div style={{paddingBottom:80}}>
      {/* Intelligence strip */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:6,marginBottom:14}}>
        {[
          { l:'Active',   v: active.length,  c: GREEN },
          { l:'Hot 70+',  v: hotCount,        c: GOLD },
          { l:'Stalling', v: stallingCnt,     c: RED },
          { l:'At Offer', v: atOfferCnt,      c: '#9B5BD5' },
        ].map(k => (
          <div key={k.l} style={{background:'#0f0f17',border:`1px solid ${k.c}22`,borderRadius:10,padding:'10px 6px',textAlign:'center'}}>
            <div style={{fontSize:20,fontWeight:800,color:k.c,lineHeight:1,fontFamily:'monospace'}}>{k.v}</div>
            <div style={{fontSize:9,color:'#555',marginTop:3}}>{k.l}</div>
          </div>
        ))}
      </div>

      {/* Sub-tabs */}
      <div style={{display:'flex',overflowX:'auto',borderBottom:'1px solid #1f1f28',marginBottom:14}}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{padding:'8px 12px',border:'none',background:'transparent',cursor:'pointer',fontFamily:'inherit',
              fontSize:11,fontWeight:tab===t.id?700:400,
              color:tab===t.id?GOLD:'#555',
              borderBottom:`2px solid ${tab===t.id?GOLD:'transparent'}`,
              whiteSpace:'nowrap',flexShrink:0,transition:'color 0.15s'}}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Focus */}
      {tab === 'focus' && (
        focus.length === 0
          ? <EmptyState msg={active.length === 0 ? 'No active candidates yet.' : 'All caught up — no overdue follow-ups!'} />
          : focus.map(c => <CandCard key={c.id} c={c} logs={logsMap[c.id]||[]} onView={() => openDrawer(c)}/>)
      )}

      {/* Active */}
      {tab === 'active' && (
        active.length === 0
          ? <EmptyState msg="No active candidates yet."/>
          : active.map(c => <CandCard key={c.id} c={c} logs={logsMap[c.id]||[]} onView={() => openDrawer(c)}/>)
      )}

      {/* Funnel */}
      {tab === 'funnel' && <FunnelView candidates={active} logsMap={logsMap}/>}

      {/* Launched */}
      {tab === 'launched' && (
        launched.length === 0
          ? <EmptyState msg="No launched partners yet."/>
          : launched.map(c => (
            <div key={c.id} style={{background:'#0f0f17',border:'1px solid #1f1f28',borderRadius:12,padding:'14px 16px',marginBottom:8,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div>
                <div style={{fontSize:14,fontWeight:700,marginBottom:2}}>{c.name}</div>
                <div style={{fontSize:10,color:'#555'}}>{c.source||'Direct'} · {fmtDate(c.updated_at)}</div>
              </div>
              <span style={{fontSize:11,padding:'3px 10px',borderRadius:8,background:'rgba(76,175,125,0.15)',color:GREEN,fontWeight:600}}>Launched</span>
            </div>
          ))
      )}

      {/* Archive */}
      {tab === 'archive' && (
        archived.length === 0
          ? <EmptyState msg="No archived candidates."/>
          : archived.map(c => {
            const notes = parseNotes(c.interview_notes)
            const dqReason = notes._dq_reason || '—'
            return (
              <div key={c.id} style={{background:'#0f0f17',border:'1px solid #1f1f28',borderRadius:12,padding:'14px 16px',marginBottom:8,borderLeft:`3px solid ${RED}`}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
                  <div style={{fontSize:14,fontWeight:700}}>{c.name}</div>
                  <span style={{fontSize:10,padding:'2px 8px',borderRadius:8,background:'rgba(224,85,85,0.12)',color:RED,fontWeight:600}}>DQ</span>
                </div>
                <div style={{fontSize:10,color:'#555'}}>{dqReason} · {fmtDate(c.updated_at)}</div>
                {c.pain_point && <div style={{fontSize:11,color:'#444',marginTop:4,fontStyle:'italic'}}>"{c.pain_point.slice(0,80)}"</div>}
              </div>
            )
          })
      )}

      {/* Detail drawer */}
      {selected && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',zIndex:200,display:'flex',alignItems:'flex-end'}}
          onClick={() => setSelected(null)}>
          <div style={{width:'100%',maxWidth:600,margin:'0 auto',background:'#0f0f17',borderRadius:'16px 16px 0 0',maxHeight:'85vh',overflow:'hidden',display:'flex',flexDirection:'column'}}
            onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div style={{padding:'16px 18px',borderBottom:'1px solid #1f1f28',display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexShrink:0}}>
              <div>
                <div style={{fontSize:16,fontWeight:700,marginBottom:6}}>{selected.name}</div>
                <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                  <span style={{fontSize:11,padding:'2px 8px',borderRadius:8,background:`${STAGE_COLORS[normStage(selected.stage)]??GOLD}18`,color:STAGE_COLORS[normStage(selected.stage)]??GOLD,fontWeight:600}}>
                    {normStage(selected.stage)}
                  </span>
                  {selected.hxl_score !== undefined && (
                    <span style={{fontSize:11,padding:'2px 8px',borderRadius:8,background:`${scoreColor(healthScore(selected))}18`,color:scoreColor(healthScore(selected)),fontWeight:600}}>
                      ★ {healthScore(selected)}
                    </span>
                  )}
                </div>
              </div>
              <button onClick={() => setSelected(null)}
                style={{background:'none',border:'none',color:'#555',cursor:'pointer',fontSize:24,lineHeight:1,padding:'0 4px',flexShrink:0}}>×</button>
            </div>
            {/* Sub-tabs */}
            <div style={{display:'flex',borderBottom:'1px solid #1f1f28',flexShrink:0}}>
              {(['profile','history'] as DrawerTab[]).map(t => (
                <button key={t} onClick={() => setDrawerTab(t)}
                  style={{flex:1,padding:'10px',border:'none',background:'transparent',cursor:'pointer',fontFamily:'inherit',
                    fontSize:11,fontWeight:drawerTab===t?700:400,
                    color:drawerTab===t?GOLD:'#555',
                    borderBottom:`2px solid ${drawerTab===t?GOLD:'transparent'}`,transition:'color 0.15s'}}>
                  {t === 'profile' ? 'Profile' : 'History'}
                </button>
              ))}
            </div>
            {/* Content */}
            <div style={{flex:1,overflowY:'auto',padding:'16px 18px'}}>
              {drawerTab === 'profile' && <ProfileTab c={selected}/>}
              {drawerTab === 'history' && <HistoryTab logs={logsMap[selected.id]||[]}/>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── CandCard ────────────────────────────────────────────────
function CandCard({ c, logs, onView }: { c: Candidate; logs: ContactLog[]; onView: ()=>void }) {
  const stage = normStage(c.stage)
  const col   = STAGE_COLORS[stage] ?? GOLD
  const score = healthScore(c)
  const sorted = [...logs].sort((a,b) => b.created_at.localeCompare(a.created_at))
  const lastLog = sorted[0]
  const daysSinceContact = daysSince(lastLog?.created_at ?? c.updated_at)
  const alertColor = daysSinceContact >= 14 ? RED : daysSinceContact >= 7 ? GOLD : null
  const nextDue = sorted.find(l => l.next_date)?.next_date
  const isOverdue = nextDue && nextDue < new Date().toISOString().slice(0,10)
  const wa = c.phone ? `https://wa.me/${c.phone.replace(/\D/g,'').replace(/^0/,'61')}` : null
  const outColor: Record<string,string> = { Positive:GREEN, Negative:RED, Neutral:GOLD, 'No Show':RED, 'Not Yet':'#555' }

  return (
    <div style={{background:'#0f0f17',border:'1px solid #1f1f28',borderRadius:12,padding:'14px 16px',marginBottom:8,borderLeft:`3px solid ${col}`}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:6}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:14,fontWeight:700,marginBottom:4}}>{c.name}</div>
          <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
            <span style={{fontSize:10,padding:'2px 8px',borderRadius:8,background:`${col}15`,color:col,fontWeight:600}}>{stage}</span>
            {c.hxl_score !== undefined && (
              <span style={{fontSize:10,padding:'2px 8px',borderRadius:8,background:`${scoreColor(score)}15`,color:scoreColor(score),fontWeight:600}}>★ {score}</span>
            )}
            {alertColor && (
              <span style={{fontSize:10,padding:'2px 8px',borderRadius:8,background:`${alertColor}15`,color:alertColor,fontWeight:600}}>
                {daysSinceContact}d idle
              </span>
            )}
            {nextDue && (
              <span style={{fontSize:10,padding:'2px 8px',borderRadius:8,background:isOverdue?'rgba(224,85,85,0.12)':'rgba(200,162,74,0.1)',color:isOverdue?RED:GOLD,fontWeight:600}}>
                {isOverdue ? '⚠ ' : ''}{fmtDate(nextDue)}
              </span>
            )}
          </div>
        </div>
        <div style={{fontSize:10,color:'#555',marginLeft:8,flexShrink:0}}>{logs.length} touch{logs.length!==1?'es':''}</div>
      </div>
      {c.pain_point && (
        <div style={{fontSize:11,color:'#555',fontStyle:'italic',marginBottom:6}}>
          "{c.pain_point.slice(0,80)}{c.pain_point.length>80?'…':''}"
        </div>
      )}
      {lastLog && (
        <div style={{fontSize:10,color:'#444',marginBottom:8}}>
          Last: <span style={{color:outColor[lastLog.outcome]??'#888',fontWeight:600}}>{lastLog.outcome||lastLog.event_type}</span>
          {lastLog.notes ? ` · "${lastLog.notes.slice(0,50)}"` : ''} · {fmtDate(lastLog.created_at)}
        </div>
      )}
      <div style={{display:'flex',gap:8}}>
        <button onClick={onView}
          style={{padding:'5px 14px',borderRadius:8,border:'1px solid #2a2a35',background:'transparent',color:'#888',cursor:'pointer',fontSize:11,fontFamily:'inherit'}}>
          View →
        </button>
        {wa && (
          <a href={wa} target="_blank" rel="noreferrer"
            style={{padding:'5px 14px',borderRadius:8,border:`1px solid ${GREEN}33`,background:'transparent',color:GREEN,cursor:'pointer',fontSize:11,fontFamily:'inherit',textDecoration:'none'}}>
            WA
          </a>
        )}
      </div>
    </div>
  )
}

// ── Funnel view ─────────────────────────────────────────────
function FunnelView({ candidates, logsMap }: { candidates: Candidate[]; logsMap: Record<string,ContactLog[]> }) {
  const stageCounts = STAGE_ORDER.map(s => ({
    stage: s,
    count: candidates.filter(c => normStage(c.stage) === s).length,
    col: STAGE_COLORS[s] ?? GOLD,
  }))
  const max = Math.max(1, ...stageCounts.map(s => s.count))
  const total = candidates.length
  const totalTouches = Object.values(logsMap).reduce((sum, logs) => sum + logs.length, 0)

  const sourceBreakdown = useMemo(() => {
    const counts: Record<string,number> = {}
    candidates.forEach(c => { const src = c.source||'Unknown'; counts[src] = (counts[src]||0)+1 })
    return Object.entries(counts).sort((a,b) => b[1]-a[1]).slice(0,5)
  }, [candidates])

  return (
    <div>
      {/* Stats strip */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:8,marginBottom:12}}>
        <div style={{background:'#0f0f17',border:'1px solid #1f1f28',borderRadius:12,padding:'14px',textAlign:'center'}}>
          <div style={{fontSize:24,fontWeight:800,color:GREEN,fontFamily:'monospace'}}>{total}</div>
          <div style={{fontSize:9,color:'#555',marginTop:3}}>Active</div>
        </div>
        <div style={{background:'#0f0f17',border:'1px solid #1f1f28',borderRadius:12,padding:'14px',textAlign:'center'}}>
          <div style={{fontSize:24,fontWeight:800,color:GOLD,fontFamily:'monospace'}}>{totalTouches}</div>
          <div style={{fontSize:9,color:'#555',marginTop:3}}>Total Touches</div>
        </div>
      </div>

      {/* Conversion funnel */}
      <div style={{background:'#0f0f17',border:'1px solid #1f1f28',borderRadius:12,padding:'16px',marginBottom:12}}>
        <div style={{fontSize:9,color:GOLD,fontWeight:700,letterSpacing:'2px',textTransform:'uppercase',marginBottom:14}}>Stage Funnel</div>
        {stageCounts.map(s => (
          <div key={s.stage} style={{marginBottom:10}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:3}}>
              <span style={{fontSize:11,color:'#aaa'}}>{s.stage}</span>
              <span style={{fontSize:12,fontWeight:700,color:s.col,fontFamily:'monospace'}}>{s.count}</span>
            </div>
            <div style={{height:6,borderRadius:4,background:'#1f1f28',overflow:'hidden'}}>
              <div style={{height:'100%',borderRadius:4,background:s.col,width:`${(s.count/max)*100}%`,transition:'width 0.3s'}}/>
            </div>
          </div>
        ))}
      </div>

      {/* Source breakdown */}
      {sourceBreakdown.length > 0 && (
        <div style={{background:'#0f0f17',border:'1px solid #1f1f28',borderRadius:12,padding:'16px'}}>
          <div style={{fontSize:9,color:GOLD,fontWeight:700,letterSpacing:'2px',textTransform:'uppercase',marginBottom:12}}>Source Breakdown</div>
          {sourceBreakdown.map(([src, cnt]) => (
            <div key={src} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'5px 0',borderBottom:'1px solid #1a1a24'}}>
              <span style={{fontSize:11,color:'#aaa'}}>{src}</span>
              <span style={{fontSize:12,fontWeight:700,color:GOLD,fontFamily:'monospace'}}>{cnt}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Profile sub-tab ─────────────────────────────────────────
function ProfileTab({ c }: { c: Candidate }) {
  const notes = parseNotes(c.interview_notes)
  const profileNotes = notes.notes || ''
  const rows = [
    { l:'Email',          v: c.email },
    { l:'Phone',          v: c.phone },
    { l:'Source',         v: c.source },
    { l:'Stage',          v: normStage(c.stage) },
    { l:'Pain Point',     v: c.pain_point },
    { l:'Relationship',   v: c.relationship },
    { l:'Life Stage',     v: c.life_stage },
    { l:'Primary Driver', v: c.primary_driver },
  ].filter(f => f.v)

  return (
    <div>
      {rows.map(f => (
        <div key={f.l} style={{padding:'8px 0',borderBottom:'1px solid #1a1a24'}}>
          <div style={{fontSize:9,color:'#555',fontWeight:600,textTransform:'uppercase',letterSpacing:'1px',marginBottom:3}}>{f.l}</div>
          <div style={{fontSize:13,color:'#ddd'}}>{f.v}</div>
        </div>
      ))}
      {profileNotes && (
        <div style={{marginTop:12}}>
          <div style={{fontSize:9,color:'#555',fontWeight:600,textTransform:'uppercase',letterSpacing:'1px',marginBottom:6}}>Notes</div>
          <textarea readOnly value={profileNotes}
            style={{width:'100%',background:'#16161c',border:'1px solid #2a2a35',borderRadius:8,padding:'10px 12px',color:'#ddd',fontSize:12,lineHeight:1.7,boxSizing:'border-box',minHeight:80,resize:'vertical',fontFamily:'inherit'}}/>
        </div>
      )}
      {rows.length === 0 && !profileNotes && <EmptyState msg="No profile details available."/>}
    </div>
  )
}

// ── History sub-tab ─────────────────────────────────────────
function HistoryTab({ logs }: { logs: ContactLog[] }) {
  const sorted = [...logs].sort((a,b) => b.created_at.localeCompare(a.created_at))
  if (!sorted.length) return <EmptyState msg="No contact history yet."/>
  const outColor: Record<string,string> = { Positive:GREEN, Negative:RED, Neutral:GOLD, 'No Show':RED, 'Not Yet':'#555' }
  return (
    <div>
      {sorted.map(l => (
        <div key={l.id} style={{borderBottom:'1px solid #1a1a24',padding:'10px 0'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:3}}>
            <span style={{fontSize:12,fontWeight:700,color:outColor[l.outcome]??'#888'}}>{l.outcome||l.event_type}</span>
            <span style={{fontSize:10,color:'#555'}}>{fmtDate(l.created_at)}</span>
          </div>
          {l.notes && <div style={{fontSize:11,color:'#888',marginBottom:2}}>"{l.notes.slice(0,120)}"</div>}
          {l.next_date && <div style={{fontSize:10,color:GOLD}}>Next: {fmtDate(l.next_date)}</div>}
        </div>
      ))}
    </div>
  )
}

// ── Helper ──────────────────────────────────────────────────
function EmptyState({ msg }: { msg: string }) {
  return <div style={{textAlign:'center',padding:'48px 20px',color:'#444',fontSize:13}}>{msg}</div>
}
