'use client'
import React, { useEffect, useState, useMemo } from 'react'
import { useStore } from '@/lib/stores'
import { uid, now } from '@/lib/utils'
import type { Lead } from '@/lib/stores/types'

const STAGES=['New','Connected','MPA','Catch-Up','DTM'] as const
type Stage=typeof STAGES[number]
type View='focus'|'leads'|'funnel'|'archived'

const STAGE_CFG:Record<Stage,{color:string;bg:string;next:Stage|null}>={
  'New':{color:'var(--blue)',bg:'rgba(91,155,213,0.12)',next:'Connected'},
  'Connected':{color:'var(--gold)',bg:'rgba(200,162,74,0.12)',next:'MPA'},
  'MPA':{color:'var(--green)',bg:'rgba(76,175,125,0.12)',next:'Catch-Up'},
  'Catch-Up':{color:'var(--purple)',bg:'rgba(155,91,213,0.12)',next:'DTM'},
  'DTM':{color:'var(--orange)',bg:'rgba(232,145,58,0.12)',next:null},
}

const SOURCES=['Instagram','Referral','Cold Approach','Facebook','Event','LinkedIn','Other']
const RELATIONS=['Close friend','Acquaintance','Stranger','Online only']
const AGE_RANGES=['Under 25','25-35','35-45','45+']
const LIFE_STAGES=['Student','Working','Business owner','Parent','Retired']
const DRIVERS=['Time freedom','Extra income','Full-time income','Business ownership','Products only']

function hxl(h:number,l:number){return Math.round(h*l)}
function hxlColor(s:number){return s>=70?'var(--green)':s>=40?'var(--gold)':'var(--red)'}
function healthScore(l:Lead):number{
  const hxlS=Math.min(100,hxl(l.hunger,l.looking))
  const daysSinceUpdate=Math.floor((Date.now()-new Date(l.updated_at).getTime())/86400000)
  const recency=Math.max(0,100-daysSinceUpdate*10)
  const stageDepth=([...STAGES].indexOf(l.stage as Stage)+1)*20
  return Math.round(hxlS*0.5+recency*0.3+stageDepth*0.2)
}
function healthColor(s:number){return s>=70?'var(--green)':s>=50?'var(--gold)':'var(--red)'}
function daysSince(d:string){return d?Math.floor((Date.now()-new Date(d).getTime())/86400000):999}
function isStale(l:Lead){return daysSince(l.updated_at)>=7}
function isOverdue(l:Lead){return !!(l.next_action_date&&l.next_action_date<new Date().toISOString().slice(0,10))}
function fmtDate(d:string){return new Date(d+'T00:00:00').toLocaleDateString('en-AU',{day:'numeric',month:'short'})}
function blankLead():Partial<Lead>{return{name:'',phone:'',instagram:'',contact:'',source:'Instagram',stage:'New',hunger:5,looking:5,relationship:'',age_range:'',life_stage:'',primary_driver:'',pain_point:'',archived:false,archived_reason:'',notes:'',next_action:'Call',next_action_date:'',score:0}}
function todayStr(){return new Date().toISOString().slice(0,10)}
function daysFromNow(n:number){const d=new Date();d.setDate(d.getDate()+n);return d.toISOString().slice(0,10)}

const GOLD='var(--gold)';const GREEN='var(--green)';const RED='var(--red)'
const CARD:React.CSSProperties={background:'var(--s1)',border:'1px solid var(--br)',borderRadius:'var(--r2)',padding:'16px'}
const SL:React.CSSProperties={fontSize:9,color:'var(--text3)',letterSpacing:'2px',textTransform:'uppercase' as const,fontWeight:700,marginBottom:6}
const INP:React.CSSProperties={background:'var(--s0)',border:'1px solid var(--br2)',borderRadius:'var(--r)',padding:'9px 12px',color:'var(--text)',fontSize:13,fontFamily:"'Sora',sans-serif",outline:'none',width:'100%',boxSizing:'border-box' as const}

interface LeadCardProps{l:Lead;openEdit:(l:Lead)=>void;advanceStage:(l:Lead)=>void}
function LeadCard({l,openEdit,advanceStage}:LeadCardProps){
  const cfg=STAGE_CFG[l.stage as Stage]??STAGE_CFG['New']
  const stale=isStale(l);const overdue=isOverdue(l)
  const days=daysSince(l.updated_at)
  const health=healthScore(l)
  return(
    <div style={{...CARD,marginBottom:10,borderLeft:`3px solid ${cfg.color}`,transition:'all 0.15s'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:14,fontWeight:700,marginBottom:3}}>{l.name}</div>
          <div style={{display:'flex',gap:6,flexWrap:'wrap' as const}}>
            <span style={{fontSize:10,padding:'2px 8px',borderRadius:8,background:cfg.bg,color:cfg.color,fontWeight:600}}>{l.stage}</span>
            {l.source&&<span style={{fontSize:10,padding:'2px 8px',borderRadius:8,background:'var(--s2)',color:'var(--text4)'}}>{l.source}</span>}
            {l.relationship&&<span style={{fontSize:10,padding:'2px 8px',borderRadius:8,background:'var(--s2)',color:'var(--text4)'}}>{l.relationship}</span>}
            {overdue&&<span style={{fontSize:10,padding:'2px 8px',borderRadius:8,background:'rgba(224,85,85,0.15)',color:RED,fontWeight:600}}>⛔ {daysSince(l.next_action_date||'')}d overdue</span>}
            {stale&&!overdue&&<span style={{fontSize:10,padding:'2px 8px',borderRadius:8,background:'rgba(200,162,74,0.1)',color:GOLD}}>{days}d no update</span>}
            {!stale&&!overdue&&<span style={{fontSize:10,color:'var(--text4)'}}>{days===0?'Today':days+'d ago'}</span>}
          </div>
        </div>
        <div style={{textAlign:'right' as const,flexShrink:0}}>
          <div className="mono" style={{fontSize:22,fontWeight:800,color:healthColor(health),lineHeight:1}}>{health}</div>
          <div style={{fontSize:8,color:'var(--text4)'}}>H{l.hunger}×L{l.looking}</div>
        </div>
      </div>
      {(l.primary_driver||l.pain_point)&&(
        <div style={{fontSize:11,color:'var(--text3)',marginBottom:8,lineHeight:1.5}}>
          {l.primary_driver&&<span style={{color:GOLD,fontWeight:600,marginRight:6}}>→ {l.primary_driver}</span>}
          {l.pain_point&&<span>"{l.pain_point.slice(0,60)}{l.pain_point.length>60?'…':''}"</span>}
        </div>
      )}
      {l.next_action&&(
        <div style={{fontSize:11,color:overdue?RED:'var(--text3)',marginBottom:8}}>
          <span style={{color:'var(--text4)'}}>Next: </span>
          <span style={{fontWeight:600}}>{l.next_action}</span>
          {l.next_action_date&&<span style={{color:overdue?RED:'var(--text4)',marginLeft:4}}>{fmtDate(l.next_action_date)}</span>}
        </div>
      )}
      <div style={{display:'flex',gap:6,flexWrap:'wrap' as const,marginTop:10}}>
        {STAGE_CFG[l.stage as Stage]?.next&&(
          <button onClick={()=>advanceStage(l)} style={{padding:'7px 12px',borderRadius:'var(--r)',border:'1px solid var(--br)',background:'var(--s2)',color:'var(--text3)',cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:11}}>
            → {STAGE_CFG[l.stage as Stage]?.next}
          </button>
        )}
        <button onClick={()=>openEdit(l)} style={{padding:'7px 12px',borderRadius:'var(--r)',border:'1px solid var(--br)',background:'transparent',color:'var(--text4)',cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:10}}>Edit</button>
      </div>
    </div>
  )
}

export default function Pipeline(){
  const{trackerLeads,userId,upsertTrackerLead,deleteTrackerLead}=useStore()

  const[view,setView]=useState<View>('focus')
  const[filter,setFilter]=useState<Stage|'all'|'archived'>('all')
  const[sortBy,setSortBy]=useState<'overdue'|'score'|'stale'|'date'>('overdue')
  const[search,setSearch]=useState('')
  const[open,setOpen]=useState(false)
  const[ed,setEd]=useState<Lead|null>(null)
  const[form,setForm]=useState<Partial<Lead>>(blankLead())
  const[err,setErr]=useState('')
  const[archiveModal,setArchiveModal]=useState<Lead|null>(null)
  const[banner,setBanner]=useState<{type:'error'|'success';msg:string}|null>(null)
  const[archiveReasonFilter,setArchiveReasonFilter]=useState<string>('all')

  useEffect(()=>{},[])

  async function safeWrite(fn:()=>Promise<void>,errMsg='Save failed'){
    try{await fn()}
    catch(e:any){setBanner({type:'error',msg:errMsg+': '+(e?.message||'unknown error')})}
  }

  const active=useMemo(()=>trackerLeads.filter(l=>!l.archived),[trackerLeads])
  const archived=useMemo(()=>trackerLeads.filter(l=>l.archived),[trackerLeads])

  const stageCounts=useMemo(()=>{
    const c:Record<string,number>={};STAGES.forEach(s=>{c[s]=active.filter(l=>l.stage===s).length});return c
  },[active])

  const today=todayStr()
  const weekAgo=daysFromNow(-7)
  const weekAhead=daysFromNow(7)

  const statsOverdue=useMemo(()=>active.filter(l=>l.next_action_date&&l.next_action_date<today),[active,today])
  const statsDTM=useMemo(()=>active.filter(l=>l.stage==='DTM'),[active])
  const statsHot=useMemo(()=>active.filter(l=>hxl(l.hunger,l.looking)>=70),[active])

  const focusGrouped=useMemo(()=>{
    const getHealth=(l:Lead)=>healthScore(l)
    const byHealth=(a:Lead,b:Lead)=>getHealth(b)-getHealth(a)
    const base=[...active]
    const overdue=base.filter(l=>l.next_action_date&&l.next_action_date<today).sort(byHealth)
    const dueToday=base.filter(l=>l.next_action_date===today).sort(byHealth)
    const dueWeek=base.filter(l=>l.next_action_date&&l.next_action_date>today&&l.next_action_date<=weekAhead).sort(byHealth)
    const warm=base.filter(l=>!l.next_action_date||l.next_action_date>weekAhead).sort(byHealth)
    return{overdue,dueToday,dueWeek,warm}
  },[active,today,weekAhead])

  const displayed=useMemo(()=>{
    let list=filter==='archived'?archived:active.filter(l=>filter==='all'||l.stage===filter)
    if(search)list=list.filter(l=>l.name.toLowerCase().includes(search.toLowerCase())||l.phone?.includes(search)||l.instagram?.includes(search))
    return [...list].sort((a,b)=>{
      if(sortBy==='overdue')return(isOverdue(b)?1:0)-(isOverdue(a)?1:0)||daysSince(a.next_action_date||a.updated_at)-daysSince(b.next_action_date||b.updated_at)
      if(sortBy==='score')return hxl(b.hunger,b.looking)-hxl(a.hunger,a.looking)
      if(sortBy==='stale')return daysSince(b.updated_at)-daysSince(a.updated_at)
      return b.created_at.localeCompare(a.created_at)
    })
  },[active,archived,filter,sortBy,search])

  const funnel=useMemo(()=>{
    const total=active.length||1
    return STAGES.map((s,i)=>{
      const stageLeads=active.filter(l=>l.stage===s)
      const avgDays=stageLeads.length>0?Math.round(stageLeads.reduce((acc,l)=>acc+daysSince(l.updated_at),0)/stageLeads.length):0
      return{stage:s,count:stageCounts[s]||0,pct:Math.round((stageCounts[s]||0)/total*100),convRate:i>0?Math.round((stageCounts[s]||0)/(stageCounts[STAGES[i-1]]||1)*100):100,avgDays}
    })
  },[active,stageCounts])

  const sourceBreakdown=useMemo(()=>{
    const map:Record<string,{total:number;dtm:number;score:number}>={};active.forEach(l=>{const s=l.source||'Other';if(!map[s])map[s]={total:0,dtm:0,score:0};map[s].total++;if(l.stage==='DTM'||l.stage==='Catch-Up')map[s].dtm++;map[s].score+=hxl(l.hunger,l.looking)});return Object.entries(map).map(([src,v])=>({src,total:v.total,dtm:v.dtm,avgScore:Math.round(v.score/v.total),convRate:Math.round(v.dtm/v.total*100)})).sort((a,b)=>b.dtm-a.dtm)
  },[active])

  const archiveReasons=useMemo(()=>['all',...Array.from(new Set(archived.map(l=>l.archived_reason||'Archived').filter(Boolean)))],[archived])
  const filteredArchive=useMemo(()=>archiveReasonFilter==='all'?archived:archived.filter(l=>(l.archived_reason||'Archived')===archiveReasonFilter),[archived,archiveReasonFilter])

  function openAdd(){setEd(null);setForm(blankLead());setErr('');setOpen(true)}
  function openEdit(l:Lead){setEd(l);setForm({...l});setErr('');setOpen(true)}

  async function saveLead(){
    if(!form.name?.trim()||!userId)return setErr('Name required')
    const score=hxl(form.hunger??5,form.looking??5)
    const l:Lead={id:ed?.id??uid(),user_id:userId,name:form.name.trim(),phone:form.phone||'',instagram:form.instagram||'',contact:form.phone||form.instagram||form.contact||'',source:form.source||'Instagram',stage:form.stage||'New',hunger:form.hunger??5,looking:form.looking??5,score,relationship:form.relationship||'',age_range:form.age_range||'',life_stage:form.life_stage||'',primary_driver:form.primary_driver||'',pain_point:form.pain_point||'',archived:false,archived_reason:'',notes:form.notes||'',next_action:form.next_action||'Call',next_action_date:form.next_action_date||'',created_at:ed?.created_at??now(),updated_at:now()}
    await safeWrite(async()=>{ await upsertTrackerLead(l) },'Save lead failed')
    setOpen(false)
  }

  async function archiveLead(l:Lead,reason=''){
    await safeWrite(async()=>{await upsertTrackerLead({...l,archived:true,archived_reason:reason,updated_at:now()})},'Archive lead failed')
  }

  async function restoreLead(l:Lead){await safeWrite(()=>upsertTrackerLead({...l,archived:false,archived_reason:'',updated_at:now()}),'Restore lead failed')}

  async function advanceStage(l:Lead){
    const cfg=STAGE_CFG[l.stage as Stage];if(!cfg?.next)return
    await safeWrite(async()=>{await upsertTrackerLead({...l,stage:cfg.next as Stage,updated_at:now()})},'Advance stage failed')
  }

  async function deleteLead(id:string){await safeWrite(()=>deleteTrackerLead(id),'Delete failed')}

  return(
    <div>
      {/* Banner */}
      {banner&&(
        <div style={{padding:'12px 16px',marginBottom:12,borderRadius:'var(--r)',background:banner.type==='error'?'rgba(224,85,85,0.1)':'rgba(76,175,125,0.1)',color:banner.type==='error'?RED:GREEN,fontSize:13}}>
          {banner.msg}
        </div>
      )}

      {/* View tabs */}
      <div style={{display:'flex',gap:8,marginBottom:16,borderBottom:'1px solid var(--br)',paddingBottom:10}}>
        {(['focus','leads','funnel','archived'] as View[]).map(v=>(
          <button key={v} onClick={()=>setView(v)} style={{padding:'6px 12px',borderRadius:'var(--r)',border:'none',background:view===v?'var(--gold)':'transparent',color:view===v?'#000':'var(--text3)',cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:11,fontWeight:view===v?700:400}}>
            {v==='focus'?'🎯 Focus':v==='leads'?'📋 All':v==='funnel'?'📊 Funnel':'🗄 Archive'}
          </button>
        ))}
      </div>

      {/* Stats strip */}
      <div style={{display:'flex',gap:10,marginBottom:16,overflowX:'auto'}}>
        {[{label:`Active`,val:active.length},{label:`Hot`,val:statsHot.length},{label:`DTM`,val:statsDTM.length},{label:`Overdue`,val:statsOverdue.length}].map(s=>(
          <div key={s.label} style={{padding:'8px 12px',borderRadius:'var(--r)',background:'var(--s1)',border:'1px solid var(--br)',whiteSpace:'nowrap' as const}}>
            <div style={{fontSize:11,fontWeight:700,color:'var(--text)'}}>{s.val}</div>
            <div style={{fontSize:9,color:'var(--text4)'}}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filter & sort (for leads view) */}
      {view==='leads'&&(
        <div style={{display:'flex',gap:8,marginBottom:14}}>
          <select value={filter} onChange={e=>setFilter(e.target.value as any)} style={{...INP,flex:1} as React.CSSProperties}>
            <option value="all">All stages</option>
            {STAGES.map(s=><option key={s} value={s}>{s}</option>)}
            <option value="archived">Archived</option>
          </select>
          <select value={sortBy} onChange={e=>setSortBy(e.target.value as any)} style={{...INP,flex:1} as React.CSSProperties}>
            <option value="overdue">Sort: Overdue</option>
            <option value="score">Sort: Score</option>
            <option value="stale">Sort: Stale</option>
            <option value="date">Sort: Date</option>
          </select>
          <input type="text" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search…" style={{...INP,flex:1} as React.CSSProperties}/>
        </div>
      )}

      {/* Focus view */}
      {view==='focus'&&(
        <>
          {focusGrouped.overdue.length>0&&(
            <div style={{marginBottom:20}}>
              <div style={{...SL}}>⚠️ Overdue ({focusGrouped.overdue.length})</div>
              {focusGrouped.overdue.map(l=><LeadCard key={l.id} l={l} openEdit={openEdit} advanceStage={advanceStage}/>)}
            </div>
          )}
          {focusGrouped.dueToday.length>0&&(
            <div style={{marginBottom:20}}>
              <div style={{...SL}}>📅 Due today ({focusGrouped.dueToday.length})</div>
              {focusGrouped.dueToday.map(l=><LeadCard key={l.id} l={l} openEdit={openEdit} advanceStage={advanceStage}/>)}
            </div>
          )}
          {focusGrouped.dueWeek.length>0&&(
            <div style={{marginBottom:20}}>
              <div style={{...SL}}>📋 Due this week ({focusGrouped.dueWeek.length})</div>
              {focusGrouped.dueWeek.map(l=><LeadCard key={l.id} l={l} openEdit={openEdit} advanceStage={advanceStage}/>)}
            </div>
          )}
          {focusGrouped.warm.length>0&&(
            <div style={{marginBottom:20}}>
              <div style={{...SL}}>🔥 Warm & monitoring ({focusGrouped.warm.length})</div>
              {focusGrouped.warm.map(l=><LeadCard key={l.id} l={l} openEdit={openEdit} advanceStage={advanceStage}/>)}
            </div>
          )}
        </>
      )}

      {/* Leads view */}
      {view==='leads'&&(
        <div>
          {displayed.length===0?(
            <div style={{textAlign:'center' as const,padding:'40px 20px',color:'var(--text4)',fontSize:13}}>
              No leads found
            </div>
          ):(
            displayed.map(l=><LeadCard key={l.id} l={l} openEdit={openEdit} advanceStage={advanceStage}/>)
          )}
        </div>
      )}

      {/* Funnel view */}
      {view==='funnel'&&(
        <>
          <div style={{...CARD,marginBottom:16}}>
            <div style={{...SL}}>Conversion funnel</div>
            {funnel.map((f,i)=>(
              <div key={f.stage} style={{marginBottom:16}}>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                  <div style={{fontSize:12,fontWeight:600}}>{f.stage}</div>
                  <div style={{fontSize:11,color:'var(--text4)'}}>{f.count} leads · {f.convRate}% conv rate</div>
                </div>
                <div style={{display:'flex',gap:8,alignItems:'center'}}>
                  <div style={{flex:1,height:8,background:'var(--s2)',borderRadius:4,overflow:'hidden'}}>
                    <div style={{height:'100%',width:`${f.pct}%`,background:STAGE_CFG[f.stage].color}}/>
                  </div>
                  <div style={{fontSize:10,color:'var(--text4)',width:30,textAlign:'right' as const}}>{f.avgDays}d avg</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{...CARD,marginBottom:16}}>
            <div style={{...SL}}>Source breakdown</div>
            {sourceBreakdown.map(s=>(
              <div key={s.src} style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderBottom:'1px solid var(--br2)',fontSize:12}}>
                <div>{s.src}</div>
                <div style={{display:'flex',gap:12,color:'var(--text4)',fontSize:10}}>
                  <span>{s.total} leads</span>
                  <span style={{color:s.convRate>=50?GREEN:GOLD}}>{s.convRate}% to DTM</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Archive view */}
      {view==='archived'&&(
        <>
          <div style={{marginBottom:14}}>
            <select value={archiveReasonFilter} onChange={e=>setArchiveReasonFilter(e.target.value)} style={{...INP} as React.CSSProperties}>
              {archiveReasons.map(r=><option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          {filteredArchive.length===0?(
            <div style={{textAlign:'center' as const,padding:'40px 20px',color:'var(--text4)'}}>No archived leads</div>
          ):(
            filteredArchive.map(l=>(
              <div key={l.id} style={{...CARD,marginBottom:10,borderLeft:`3px solid ${RED}`,opacity:0.7}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
                  <div>
                    <div style={{fontSize:14,fontWeight:700,marginBottom:3}}>{l.name}</div>
                    {l.archived_reason&&<div style={{fontSize:10,color:RED,marginBottom:4}}>{l.archived_reason}</div>}
                  </div>
                </div>
                <button onClick={()=>restoreLead(l)} style={{padding:'6px 12px',borderRadius:'var(--r)',border:`1px solid ${GREEN}`,background:'transparent',color:GREEN,cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:10}}>Restore</button>
              </div>
            ))
          )}
        </>
      )}

      {/* FAB */}
      <button onClick={openAdd} style={{position:'fixed',bottom:20,right:20,width:56,height:56,borderRadius:'50%',border:'none',background:GOLD,color:'#000',fontSize:24,fontWeight:900,cursor:'pointer',boxShadow:'0 8px 16px rgba(0,0,0,0.3)',zIndex:50}}>+</button>

      {/* Edit modal */}
      {open&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.92)',zIndex:100,display:'flex',alignItems:'flex-start',justifyContent:'center',padding:'20px',overflowY:'auto',backdropFilter:'blur(8px)'}}>
          <div style={{background:'var(--s1)',border:'1px solid var(--br)',borderRadius:'var(--r3)',padding:'20px',maxWidth:500,width:'100%',marginTop:20}}>
            <div style={{fontSize:16,fontWeight:700,marginBottom:16}}>
              {ed?'Edit Lead':'Add Lead'}
              <button onClick={()=>setOpen(false)} style={{float:'right',border:'none',background:'none',color:'var(--text3)',cursor:'pointer',fontSize:20}}>×</button>
            </div>
            {err&&<div style={{padding:'8px 12px',borderRadius:'var(--r)',background:'rgba(224,85,85,0.1)',color:RED,fontSize:12,marginBottom:12}}>{err}</div>}
            <div style={{marginBottom:12}}>
              <div style={{fontSize:10,color:'var(--text3)',marginBottom:4,fontWeight:600}}>Name *</div>
              <input value={form.name||''} onChange={e=>setForm({...form,name:e.target.value})} style={{...INP} as React.CSSProperties} placeholder="Lead name"/>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
              {[
                {l:'Hunger',k:'hunger',v:form.hunger??5},
                {l:'Looking',k:'looking',v:form.looking??5},
              ].map(f=>(
                <div key={f.k}>
                  <div style={{fontSize:10,color:'var(--text3)',marginBottom:4,fontWeight:600}}>{f.l} ({f.v})</div>
                  <input type="range" min={1} max={10} value={f.v} onChange={e=>setForm({...form,[f.k]:Number(e.target.value)})} style={{width:'100%',accentColor:GOLD}}/>
                </div>
              ))}
            </div>
            {[
              {l:'Stage',k:'stage',opts:['New',...STAGES.slice(1)]},
              {l:'Source',k:'source',opts:SOURCES},
              {l:'Relationship',k:'relationship',opts:['',... RELATIONS]},
              {l:'Age Range',k:'age_range',opts:['',... AGE_RANGES]},
              {l:'Life Stage',k:'life_stage',opts:['',... LIFE_STAGES]},
              {l:'Primary Driver',k:'primary_driver',opts:['',... DRIVERS]},
            ].map(f=>(
              <div key={f.k} style={{marginBottom:12}}>
                <div style={{fontSize:10,color:'var(--text3)',marginBottom:4,fontWeight:600}}>{f.l}</div>
                <select value={(form as any)[f.k]||''} onChange={e=>setForm({...form,[f.k]:e.target.value})} style={{...INP} as React.CSSProperties}>
                  {f.opts.map(o=><option key={o} value={o}>{o||`Select ${f.l.toLowerCase()}…`}</option>)}
                </select>
              </div>
            ))}
            <div style={{marginBottom:12}}>
              <div style={{fontSize:10,color:'var(--text3)',marginBottom:4,fontWeight:600}}>Phone</div>
              <input value={form.phone||''} onChange={e=>setForm({...form,phone:e.target.value})} style={{...INP} as React.CSSProperties} placeholder="+61…"/>
            </div>
            <div style={{marginBottom:12}}>
              <div style={{fontSize:10,color:'var(--text3)',marginBottom:4,fontWeight:600}}>Instagram</div>
              <input value={form.instagram||''} onChange={e=>setForm({...form,instagram:e.target.value})} style={{...INP} as React.CSSProperties} placeholder="@handle"/>
            </div>
            <div style={{marginBottom:12}}>
              <div style={{fontSize:10,color:'var(--text3)',marginBottom:4,fontWeight:600}}>Pain point</div>
              <textarea value={form.pain_point||''} onChange={e=>setForm({...form,pain_point:e.target.value})} style={{...INP,minHeight:60} as React.CSSProperties} placeholder="Their words"/>
            </div>
            <div style={{marginBottom:12}}>
              <div style={{fontSize:10,color:'var(--text3)',marginBottom:4,fontWeight:600}}>Notes</div>
              <textarea value={form.notes||''} onChange={e=>setForm({...form,notes:e.target.value})} style={{...INP,minHeight:60} as React.CSSProperties} placeholder="Internal notes"/>
            </div>
            <div style={{marginBottom:12}}>
              <div style={{fontSize:10,color:'var(--text3)',marginBottom:4,fontWeight:600}}>Next action</div>
              <input value={form.next_action||''} onChange={e=>setForm({...form,next_action:e.target.value})} style={{...INP} as React.CSSProperties} placeholder="Call, MPA, etc"/>
            </div>
            <div style={{marginBottom:20}}>
              <div style={{fontSize:10,color:'var(--text3)',marginBottom:4,fontWeight:600}}>Next action date</div>
              <input type="date" value={form.next_action_date||''} onChange={e=>setForm({...form,next_action_date:e.target.value})} style={{...INP} as React.CSSProperties}/>
            </div>
            <div style={{display:'flex',gap:8}}>
              {ed&&(
                <button onClick={async()=>{if(ed)await deleteLead(ed.id);setOpen(false)}} style={{flex:1,padding:'10px',borderRadius:'var(--r)',border:'1px solid var(--br)',background:'transparent',color:RED,cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:12,fontWeight:600}}>Delete</button>
              )}
              <button onClick={()=>setOpen(false)} style={{flex:1,padding:'10px',borderRadius:'var(--r)',border:'1px solid var(--br)',background:'transparent',color:'var(--text3)',cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:12}}>Cancel</button>
              <button onClick={saveLead} style={{flex:1,padding:'10px',borderRadius:'var(--r)',border:'none',background:GOLD,color:'#000',cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:12,fontWeight:700}}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Archive modal */}
      {archiveModal&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.92)',zIndex:100,display:'flex',alignItems:'center',justifyContent:'center',backdropFilter:'blur(8px)'}}>
          <div style={{background:'var(--s1)',padding:20,borderRadius:'var(--r3)',maxWidth:400}}>
            <div style={{fontSize:14,fontWeight:700,marginBottom:12}}>Archive {archiveModal.name}?</div>
            <div style={{marginBottom:16}}>
              {['Not interested','No time','Wrong fit','Joined another opportunity','Lost contact','Other'].map(r=>(
                <button key={r} onClick={async()=>{await archiveLead(archiveModal,r);setArchiveModal(null)}} style={{display:'block',width:'100%',padding:'8px 12px',marginBottom:6,textAlign:'left' as const,borderRadius:'var(--r)',border:'1px solid var(--br)',background:'transparent',color:'var(--text3)',cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:12}}>
                  {r}
                </button>
              ))}
            </div>
            <button onClick={()=>setArchiveModal(null)} style={{width:'100%',padding:'8px',borderRadius:'var(--r)',border:'1px solid var(--br)',background:'transparent',color:'var(--text3)',cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:12}}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
