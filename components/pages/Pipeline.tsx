'use client'
import React, { useEffect, useState, useMemo } from 'react'
import { useStore } from '@/lib/stores'
import { uid, now } from '@/lib/utils'
import type { Lead, ContactLog } from '@/lib/stores'

// ── CONSTANTS ─────────────────────────────────────────────
const STAGES = ['New','Connected','MPA','Catch-Up','DTM'] as const
type Stage = typeof STAGES[number]

const STAGE_CFG: Record<Stage,{color:string;bg:string;next:Stage|null}> = {
  'New':       {color:'var(--blue)',   bg:'rgba(91,155,213,0.12)',  next:'Connected'},
  'Connected': {color:'var(--gold)',   bg:'rgba(200,162,74,0.12)', next:'MPA'},
  'MPA':       {color:'var(--green)',  bg:'rgba(76,175,125,0.12)', next:'Catch-Up'},
  'Catch-Up':  {color:'var(--purple)', bg:'rgba(155,91,213,0.12)', next:'DTM'},
  'DTM':       {color:'var(--orange)', bg:'rgba(232,145,58,0.12)', next:null},
}

const SOURCES    = ['Instagram','Referral','Cold Approach','Facebook','Event','LinkedIn','Other']
const OUTCOMES   = ['Positive','Neutral','Negative','No Show','Not Yet']
const NEXT_ACTS  = ['Call','WhatsApp','MPA','Catch-Up','DTM','Send Info','Other']
const RELATIONS  = ['Close friend','Acquaintance','Stranger','Online only']
const AGE_RANGES = ['Under 25','25-35','35-45','45+']
const LIFE_STAGES= ['Student','Working','Business owner','Parent','Retired']
const DRIVERS    = ['Time freedom','Extra income','Full-time income','Business ownership','Products only']
const HUNGER_ANCHORS = ['Content with life','Mild dissatisfaction','Wants change','Unhappy, exploring','Desperate to change']
const LOOKING_ANCHORS= ['Completely closed','Politely listening','Curious, open','Actively searching','Ready to start now']

// ── HELPERS ────────────────────────────────────────────────
function hxl(h:number,l:number){return Math.round(h*l)}
function hxlColor(s:number){return s>=70?'var(--green)':s>=40?'var(--gold)':'var(--red)'}

// Dynamic health score: HxL (50%) + Recency (30%) + Stage depth (20%)
function healthScore(l:Lead, lastContactDate:string):number{
  const hxlS=Math.min(100,hxl(l.hunger,l.looking))
  const daysSinceContact=lastContactDate?Math.floor((Date.now()-new Date(lastContactDate).getTime())/86400000):daysSince(l.updated_at)
  const recency=Math.max(0,100-daysSinceContact*10)
  const stageDepth=(['New','Connected','MPA','Catch-Up','DTM'].indexOf(l.stage as Stage)+1)*20
  return Math.round(hxlS*0.5+recency*0.3+stageDepth*0.2)
}
function healthColor(s:number){return s>=70?'var(--green)':s>=50?'var(--gold)':'var(--red)'}
function daysSince(d:string){return d?Math.floor((Date.now()-new Date(d).getTime())/86400000):999}
function isStale(l:Lead){return daysSince(l.updated_at)>=7}
function isOverdue(l:Lead){return !!(l.next_action_date&&l.next_action_date<new Date().toISOString().slice(0,10))}
function fmtDate(d:string){return new Date(d+'T00:00:00').toLocaleDateString('en-AU',{day:'numeric',month:'short'})}
function waLink(l:Lead){const n=(l.phone||l.contact||'').replace(/\D/g,'');return n?`https://wa.me/${n.startsWith('0')?'61'+n.slice(1):n}`:null}
function blankLead():Partial<Lead>{return{name:'',phone:'',instagram:'',contact:'',source:'Instagram',stage:'New',hunger:5,looking:5,relationship:'',age_range:'',life_stage:'',primary_driver:'',pain_point:'',archived:false,archived_reason:'',notes:'',next_action:'Call',next_action_date:'',score:0}}

// ── STYLES ─────────────────────────────────────────────────
const GOLD='var(--gold)';const GREEN='var(--green)';const RED='var(--red)'
const BLUE='var(--blue)';const PURPLE='var(--purple)';const TEAL='var(--teal)'
const CARD:React.CSSProperties={background:'var(--s1)',border:'1px solid var(--br)',borderRadius:'var(--r2)',padding:'16px'}
const SL:React.CSSProperties={fontSize:9,color:'var(--text3)',letterSpacing:'2px',textTransform:'uppercase' as const,fontWeight:700,marginBottom:6}
const INP:React.CSSProperties={background:'var(--s0)',border:'1px solid var(--br2)',borderRadius:'var(--r)',padding:'9px 12px',color:'var(--text)',fontSize:13,fontFamily:"'Sora',sans-serif",outline:'none',width:'100%',boxSizing:'border-box' as const}
const SEL:React.CSSProperties={...INP as object,cursor:'pointer'} as React.CSSProperties
const OVERLAY:React.CSSProperties={position:'fixed',inset:0,background:'rgba(0,0,0,0.92)',zIndex:400,display:'flex',alignItems:'flex-start',justifyContent:'center',padding:'20px',backdropFilter:'blur(8px)',overflowY:'auto'}

type View = 'focus'|'leads'|'funnel'|'archived'

// ── LEAD CARD — defined OUTSIDE Pipeline so React doesn't recreate it ──
interface LeadCardProps {
  l: Lead
  candidates: {name:string}[]
  contactLogs: ContactLog[]
  setContactModal: (l:Lead)=>void
  setContactLog: (v:{outcome:string;notes:string;nextAction:string;nextDate:string})=>void
  setBookPFModal: (l:Lead)=>void
  setBriefModal: (v:{lead:Lead;text:string;loading:boolean})=>void
  setDrawerLead: (l:Lead)=>void
  openEdit: (l:Lead)=>void
  advanceStage: (l:Lead)=>void
}
function LeadCard({l,candidates,contactLogs,setContactModal,setContactLog,setBookPFModal,setBriefModal,setDrawerLead,openEdit,advanceStage}:LeadCardProps){
  const cfg=STAGE_CFG[l.stage as Stage]??STAGE_CFG['New']
  const stale=isStale(l);const overdue=isOverdue(l)
  const days=daysSince(l.updated_at)
  const isDTM=l.stage==='DTM'
  const isCandidate=candidates.some(c=>c.name===l.name)
  const wa=waLink(l)
  const logs=contactLogs.filter(c=>c.entity_id===l.id).sort((a,b)=>b.created_at.localeCompare(a.created_at))
  const lastLog=logs[0]
  // Days in current stage (from last stage-change log or created_at)
  const stageChangeLogs=logs.filter(c=>['connected','mpa','catch_up','dtm','pf_booked','lead_created'].includes(c.event_type))
  const stageChangeDate=stageChangeLogs[0]?.created_at??l.created_at
  const daysInStage=Math.floor((Date.now()-new Date(stageChangeDate).getTime())/86400000)
  const stageAlertColor=daysInStage>=21?RED:daysInStage>=14?GOLD:null
  // Dynamic health score
  const health=healthScore(l, lastLog?.created_at??l.updated_at)
  const outcomeColor:{[k:string]:string}={Positive:GREEN,Neutral:GOLD,Negative:RED,'No Show':RED,'Not Yet':'var(--text4)'}
  const dotColor=outcomeColor[lastLog?.outcome??'']??'var(--text4)'
  return(
    <div style={{...CARD,marginBottom:10,borderLeft:`3px solid ${cfg.color}`,position:'relative',transition:'all 0.15s'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:14,fontWeight:700,marginBottom:3,display:'flex',alignItems:'center',gap:8}}>
            <span>{l.name}</span>
            {lastLog&&<span style={{width:6,height:6,borderRadius:'50%',background:dotColor,display:'inline-block',flexShrink:0}}/>}
          </div>
          <div style={{display:'flex',gap:6,flexWrap:'wrap' as const}}>
            <span style={{fontSize:10,padding:'2px 8px',borderRadius:8,background:cfg.bg,color:cfg.color,fontWeight:600}}>{l.stage}</span>
            <span style={{fontSize:10,padding:'2px 8px',borderRadius:8,background:'var(--s2)',color:'var(--text4)'}}>{l.source}</span>
            {l.relationship&&<span style={{fontSize:10,padding:'2px 8px',borderRadius:8,background:'var(--s2)',color:'var(--text4)'}}>{l.relationship}</span>}
            {overdue&&<span style={{fontSize:10,padding:'2px 8px',borderRadius:8,background:'rgba(224,85,85,0.15)',color:RED,fontWeight:600}}>⛔ {daysSince(l.next_action_date||'')}d overdue</span>}
            {stale&&!overdue&&<span style={{fontSize:10,padding:'2px 8px',borderRadius:8,background:'rgba(200,162,74,0.1)',color:GOLD}}>{days}d no update</span>}
            {!stale&&!overdue&&<span style={{fontSize:10,color:'var(--text4)'}}>{days===0?'Today':days+'d ago'}</span>}
            {stageAlertColor&&<span style={{fontSize:10,padding:'2px 8px',borderRadius:8,background:stageAlertColor+'20',color:stageAlertColor,fontWeight:600}}>{daysInStage}d in {l.stage}</span>}
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
      {lastLog?.notes&&<div style={{fontSize:10,color:'var(--text4)',marginBottom:8,fontStyle:'italic'}}>Last: "{lastLog.notes.slice(0,80)}"</div>}
      <div style={{display:'flex',gap:6,flexWrap:'wrap' as const,alignItems:'center'}}>
        <button onClick={()=>{setContactModal(l);setContactLog({outcome:'Positive',notes:'',nextAction:l.next_action||'Call',nextDate:''})}}
          style={{padding:'7px 12px',borderRadius:'var(--r)',border:`1px solid ${GREEN}40`,background:`${GREEN}0C`,color:GREEN,cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:11,fontWeight:600}}>
          ✓ Log
        </button>
        {wa&&<a href={wa} target="_blank" rel="noopener noreferrer" style={{padding:'7px 12px',borderRadius:'var(--r)',border:'1px solid rgba(37,211,102,0.3)',background:'rgba(37,211,102,0.08)',color:'#25D366',textDecoration:'none',fontSize:11,fontWeight:600}}>WA</a>}
        {STAGE_CFG[l.stage as Stage]?.next&&(
          <button onClick={()=>advanceStage(l)} style={{padding:'7px 12px',borderRadius:'var(--r)',border:'1px solid var(--br)',background:'var(--s2)',color:'var(--text3)',cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:11}}>
            → {STAGE_CFG[l.stage as Stage]?.next}
          </button>
        )}
        {isDTM&&!isCandidate&&(
          <button onClick={()=>setBookPFModal(l)} style={{padding:'7px 12px',borderRadius:'var(--r)',border:`1px solid ${GOLD}40`,background:`${GOLD}0C`,color:GOLD,cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:11,fontWeight:700}}>
            📋 Book PF
          </button>
        )}
        <button onClick={()=>setBriefModal({lead:l,text:'',loading:false})} style={{padding:'7px 12px',borderRadius:'var(--r)',border:'1px solid var(--br)',background:'transparent',color:'var(--text4)',cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:10}}>Brief</button>
        <button onClick={()=>setDrawerLead(l)} style={{padding:'7px 12px',borderRadius:'var(--r)',border:'1px solid var(--br)',background:'transparent',color:'var(--text4)',cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:10}}>View →</button>
        <button onClick={()=>openEdit(l)} style={{padding:'7px 12px',borderRadius:'var(--r)',border:'1px solid var(--br)',background:'transparent',color:'var(--text4)',cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:10}}>Edit</button>
      </div>

    </div>
  )
}

// ── MAIN COMPONENT ─────────────────────────────────────────
export default function Pipeline(){
  const {leads,userId,upsertLead,deleteLead,loadLeads,
         upsertCandidate,loadCandidates,candidates,
         addContactLog,loadContactLogs,contactLogs} = useStore()

  const [view,setView]         = useState<View>('focus')
  const [filter,setFilter]     = useState<Stage|'all'|'archived'>('all')
  const [sortBy,setSortBy]     = useState<'overdue'|'score'|'stale'|'date'>('overdue')
  const [search,setSearch]     = useState('')
  const [open,setOpen]         = useState(false)
  const [ed,setEd]             = useState<Lead|null>(null)
  const [form,setForm]         = useState<Partial<Lead>>(blankLead())
  const [err,setErr]           = useState('')
  const [contactModal,setContactModal] = useState<Lead|null>(null)
  const [contactLog,setContactLog]     = useState({outcome:'Positive',notes:'',nextAction:'Call',nextDate:''})
  const [bookPFModal,setBookPFModal]   = useState<Lead|null>(null)
  const [drawerLead,setDrawerLead]     = useState<Lead|null>(null)
  const [briefModal,setBriefModal]     = useState<{lead:Lead;text:string;loading:boolean}|null>(null)
  const [archiveModal,setArchiveModal] = useState<Lead|null>(null)

  useEffect(()=>{ loadLeads(); loadCandidates(); loadContactLogs() },[]) // eslint-disable-line

  const active   = useMemo(()=>leads.filter(l=>!l.archived),[leads])
  const archived = useMemo(()=>leads.filter(l=>l.archived),[leads])

  const stageCounts = useMemo(()=>{
    const c:Record<string,number>={};STAGES.forEach(s=>{c[s]=active.filter(l=>l.stage===s).length});return c
  },[active])

  const focusQueue = useMemo(()=>[...active].sort((a,b)=>{
    const ao=isOverdue(a)?1:0;const bo=isOverdue(b)?1:0
    if(ao!==bo)return bo-ao
    const ad=isOverdue(a)?daysSince(a.next_action_date||a.updated_at):0
    const bd=isOverdue(b)?daysSince(b.next_action_date||b.updated_at):0
    if(ad!==bd)return bd-ad
    const si=STAGES.indexOf(a.stage as Stage);const sj=STAGES.indexOf(b.stage as Stage)
    if(si!==sj)return sj-si
    const aLast=contactLogs.filter(c=>c.entity_id===a.id)[0]?.created_at??a.updated_at
      const bLast=contactLogs.filter(c=>c.entity_id===b.id)[0]?.created_at??b.updated_at
      return healthScore(b,bLast)-healthScore(a,aLast)
  }),[active])

  const displayed = useMemo(()=>{
    let list=filter==='archived'?archived:active.filter(l=>filter==='all'||l.stage===filter)
    if(search)list=list.filter(l=>l.name.toLowerCase().includes(search.toLowerCase())||l.phone?.includes(search)||l.instagram?.includes(search))
    return [...list].sort((a,b)=>{
      if(sortBy==='overdue')return(isOverdue(b)?1:0)-(isOverdue(a)?1:0)||daysSince(a.next_action_date||a.updated_at)-daysSince(b.next_action_date||b.updated_at)
      if(sortBy==='score')return hxl(b.hunger,b.looking)-hxl(a.hunger,a.looking)
      if(sortBy==='stale')return daysSince(b.updated_at)-daysSince(a.updated_at)
      return b.created_at.localeCompare(a.created_at)
    })
  },[active,archived,filter,sortBy,search])

  const funnel = useMemo(()=>{
    const total=active.length||1
    return STAGES.map((s,i)=>({stage:s,count:stageCounts[s]||0,pct:Math.round((stageCounts[s]||0)/total*100),convRate:i>0?Math.round((stageCounts[s]||0)/(stageCounts[STAGES[i-1]]||1)*100):100}))
  },[active,stageCounts])

  const sourceBreakdown = useMemo(()=>{
    const map:Record<string,{total:number;dtm:number;score:number}>={};active.forEach(l=>{const s=l.source||'Other';if(!map[s])map[s]={total:0,dtm:0,score:0};map[s].total++;if(l.stage==='DTM'||l.stage==='Catch-Up')map[s].dtm++;map[s].score+=hxl(l.hunger,l.looking)});return Object.entries(map).map(([src,v])=>({src,total:v.total,dtm:v.dtm,avgScore:Math.round(v.score/v.total)})).sort((a,b)=>b.dtm-a.dtm)
  },[active])

  function leadLogs(id:string){return contactLogs.filter(c=>c.entity_id===id).sort((a,b)=>b.created_at.localeCompare(a.created_at))}
  function openAdd(){setEd(null);setForm(blankLead());setErr('');setOpen(true)}
  function openEdit(l:Lead){setEd(l);setForm({...l});setErr('');setOpen(true)}

  async function saveLead(){
    if(!form.name?.trim()||!userId)return setErr('Name required')
    const score=hxl(form.hunger??5,form.looking??5)
    const l:Lead={id:ed?.id??uid(),user_id:userId,name:form.name.trim(),phone:form.phone||'',instagram:form.instagram||'',contact:form.phone||form.instagram||form.contact||'',source:form.source||'Instagram',stage:form.stage||'New',hunger:form.hunger??5,looking:form.looking??5,score,relationship:form.relationship||'',age_range:form.age_range||'',life_stage:form.life_stage||'',primary_driver:form.primary_driver||'',pain_point:form.pain_point||'',archived:false,archived_reason:'',notes:form.notes||'',next_action:form.next_action||'Call',next_action_date:form.next_action_date||'',created_at:ed?.created_at??now(),updated_at:now()}
    await upsertLead(l)
    if(!ed)await addContactLog({id:uid(),user_id:userId,entity_type:'lead',entity_id:l.id,entity_name:l.name,event_type:'lead_created',outcome:'',notes:`Added from ${l.source}`,fathom_link:'',next_action:l.next_action,next_date:l.next_action_date,created_at:new Date().toISOString()})
    setOpen(false)
  }

  async function archiveLead(l:Lead,reason=''){
    await upsertLead({...l,archived:true,archived_reason:reason,updated_at:now()})
    await addContactLog({id:uid(),user_id:userId!,entity_type:'lead',entity_id:l.id,entity_name:l.name,event_type:'disqualified',outcome:'Negative',notes:reason||'Archived',fathom_link:'',next_action:'',next_date:'',created_at:new Date().toISOString()})
    if(drawerLead?.id===l.id)setDrawerLead(null)
  }

  async function restoreLead(l:Lead){await upsertLead({...l,archived:false,archived_reason:'',updated_at:now()})}

  async function advanceStage(l:Lead){
    const cfg=STAGE_CFG[l.stage as Stage];if(!cfg?.next)return
    await upsertLead({...l,stage:cfg.next,updated_at:now()})
    await addContactLog({id:uid(),user_id:userId!,entity_type:'lead',entity_id:l.id,entity_name:l.name,event_type:cfg.next.toLowerCase().replace('-','_'),outcome:'Positive',notes:`Advanced to ${cfg.next}`,fathom_link:'',next_action:'',next_date:'',created_at:new Date().toISOString()})
  }

  async function logContact(){
    if(!contactModal||!userId)return
    const l=contactModal
    await upsertLead({...l,next_action:contactLog.nextAction,next_action_date:contactLog.nextDate,updated_at:now()})
    await addContactLog({id:uid(),user_id:userId,entity_type:'lead',entity_id:l.id,entity_name:l.name,event_type:'contacted',outcome:contactLog.outcome,notes:contactLog.notes,fathom_link:'',next_action:contactLog.nextAction,next_date:contactLog.nextDate,created_at:new Date().toISOString()})
    setContactModal(null);setContactLog({outcome:'Positive',notes:'',nextAction:'Call',nextDate:''})
  }

  async function bookPF(){
    const l=bookPFModal;if(!l||!userId)return
    await upsertCandidate({id:uid(),user_id:userId,name:l.name,email:'',phone:l.phone||'',stage:'Pre-Filter',source:l.source,interview_notes:'{}',status:'active',hxl_score:l.score,hunger:l.hunger,looking:l.looking,relationship:l.relationship||'',age_range:l.age_range||'',life_stage:l.life_stage||'',primary_driver:l.primary_driver||'',pain_point:l.pain_point||'',created_at:now(),updated_at:now()})
    await addContactLog({id:uid(),user_id:userId,entity_type:'lead',entity_id:l.id,entity_name:l.name,event_type:'pf_booked',outcome:'Positive',notes:'Moved to Candidates — PF booked',fathom_link:'',next_action:'Run PF',next_date:'',created_at:new Date().toISOString()})
    await deleteLead(l.id);setBookPFModal(null)
  }

  async function getPreCallBrief(l:Lead){
    setBriefModal({lead:l,text:'',loading:true})
    const logs=leadLogs(l.id).slice(0,3)
    try{
      const res=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:280,system:`You are a pre-call coach for Hussain, an Amway IBO in Brisbane. Write a 4-sentence brief: their current state, approach based on driver/pain point, opening line, one specific question. Use real data. Direct, no fluff.`,messages:[{role:'user',content:`Lead: ${JSON.stringify({name:l.name,stage:l.stage,hxl:hxl(l.hunger,l.looking),hunger:l.hunger,looking:l.looking,relationship:l.relationship,primary_driver:l.primary_driver,pain_point:l.pain_point,source:l.source,daysSinceContact:daysSince(l.updated_at),nextAction:l.next_action,notes:l.notes,recentLogs:logs.map(c=>({outcome:c.outcome,notes:c.notes.slice(0,100),date:c.created_at.slice(0,10)}))})}\nBrief.`}]})})
      const data=await res.json()
      setBriefModal(p=>p?{...p,text:data.content?.[0]?.text??'Error',loading:false}:null)
    }catch{setBriefModal(p=>p?{...p,text:'Failed.',loading:false}:null)}
  }

  const cardProps = {candidates,contactLogs,setContactModal,setContactLog,setBookPFModal,setBriefModal,setDrawerLead,openEdit,advanceStage}

  return(
    <div style={{animation:'fade-in 0.3s ease',paddingBottom:80}}>

      {/* ── TABS ──────────────────────────────────────────── */}
      <div style={{marginBottom:14}}>
        <div style={{display:'flex',gap:3,background:'var(--s1)',borderRadius:'var(--r2)',padding:4,border:'1px solid var(--br)',overflowX:'auto' as const}}>
          {(['focus','leads','funnel','archived'] as View[]).map(v=>(
            <button key={v} onClick={()=>setView(v)}
              style={{flex:1,padding:'8px 10px',borderRadius:'var(--r)',border:'none',background:view===v?'var(--s3)':'transparent',color:view===v?GOLD:'var(--text3)',fontSize:11,fontWeight:view===v?700:400,cursor:'pointer',fontFamily:"'Sora',sans-serif",textTransform:'capitalize' as const,transition:'all 0.15s',whiteSpace:'nowrap' as const}}>
              {v==='focus'?`🎯 Focus (${focusQueue.length})`:v==='leads'?`📋 All (${active.length})`:v==='funnel'?'📊 Funnel':`🗄 Archive (${archived.length})`}
            </button>
          ))}
        </div>
      </div>

      {/* ── FOCUS VIEW ────────────────────────────────────── */}
      {view==='focus'&&(
        <div>
          {sourceBreakdown.length>0&&(
            <div style={{display:'flex',gap:8,marginBottom:12,overflowX:'auto' as const,paddingBottom:4}}>
              {sourceBreakdown.slice(0,4).map(s=>(
                <div key={s.src} style={{background:'var(--s1)',border:'1px solid var(--br)',borderRadius:'var(--r)',padding:'8px 12px',flexShrink:0}}>
                  <div style={{fontSize:10,fontWeight:700,color:GOLD,marginBottom:2}}>{s.src}</div>
                  <div style={{fontSize:9,color:'var(--text4)'}}>{s.total} leads · {s.dtm} warm</div>
                </div>
              ))}
            </div>
          )}
          <div style={{fontSize:11,color:'var(--text4)',marginBottom:12}}>
            {focusQueue.filter(l=>isOverdue(l)).length} overdue · {focusQueue.filter(l=>isStale(l)&&!isOverdue(l)).length} stale · ranked by urgency
          </div>
          {focusQueue.length===0
            ?<div style={{...CARD,textAlign:'center' as const,padding:'48px',color:'var(--text4)'}}>No active leads yet. Log a contact in Habits to add your first lead.</div>
            :focusQueue.map(l=><LeadCard key={l.id} l={l} {...cardProps}/>)
          }
        </div>
      )}

      {/* ── LEADS VIEW ────────────────────────────────────── */}
      {view==='leads'&&(
        <div>
          <div style={{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap' as const,alignItems:'center'}}>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name, phone, Instagram…" style={{flex:1,minWidth:160,...INP}}/>
            <select value={filter} onChange={e=>setFilter(e.target.value as any)} style={{...SEL,width:'auto'}}>
              <option value="all">All Active</option>
              {STAGES.map(s=><option key={s} value={s}>{s}</option>)}
              <option value="archived">Archived</option>
            </select>
            <select value={sortBy} onChange={e=>setSortBy(e.target.value as any)} style={{...SEL,width:'auto'}}>
              <option value="overdue">Sort: Overdue</option>
              <option value="score">Sort: HxL Score</option>
              <option value="stale">Sort: Stale</option>
              <option value="date">Sort: Latest</option>
            </select>
          </div>
          {displayed.length===0
            ?<div style={{...CARD,textAlign:'center' as const,padding:'48px',color:'var(--text4)'}}>No leads in this view</div>
            :displayed.map(l=><LeadCard key={l.id} l={l} {...cardProps}/>)
          }
        </div>
      )}

      {/* ── FUNNEL VIEW ───────────────────────────────────── */}
      {view==='funnel'&&(
        <div>
          <div style={{...CARD,marginBottom:12}}>
            <div style={SL}>Stage Funnel</div>
            {funnel.map((f,i)=>{
              const cfg=STAGE_CFG[f.stage as Stage]
              return(
                <div key={f.stage} style={{marginBottom:10}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
                    <div style={{display:'flex',alignItems:'center',gap:8}}>
                      <span style={{fontSize:12,fontWeight:600,color:cfg.color}}>{f.stage}</span>
                      <span className="mono" style={{fontSize:11,color:'var(--text4)'}}>{f.count}</span>
                      {i>0&&f.count>0&&<span style={{fontSize:10,color:'var(--text4)'}}>({f.convRate}% from prev)</span>}
                    </div>
                    <span style={{fontSize:10,color:'var(--text4)'}}>{f.pct}% of pipeline</span>
                  </div>
                  <div style={{height:6,background:'var(--s3)',borderRadius:3,overflow:'hidden'}}>
                    <div style={{height:'100%',width:`${f.pct}%`,background:cfg.color,borderRadius:3,transition:'width 0.8s'}}/>
                  </div>
                </div>
              )
            })}
          </div>
          <div style={{...CARD,marginBottom:12}}>
            <div style={SL}>Source Performance</div>
            {sourceBreakdown.length===0
              ?<div style={{fontSize:12,color:'var(--text4)'}}>No data yet</div>
              :sourceBreakdown.map(s=>(
                <div key={s.src} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 0',borderBottom:'1px solid var(--br)'}}>
                  <div style={{fontSize:12,fontWeight:600,flex:1}}>{s.src}</div>
                  <div style={{fontSize:10,color:'var(--text4)'}}>{s.total} leads</div>
                  <div style={{fontSize:10,color:GOLD,fontWeight:600}}>{s.dtm} warm</div>
                  <div style={{fontSize:10,color:TEAL,fontWeight:600}}>avg HxL {s.avgScore}</div>
                </div>
              ))
            }
          </div>

        </div>
      )}

      {/* ── LEAD DRAWER ───────────────────────────────────── */}
      {drawerLead&&(
        <div style={OVERLAY} onClick={e=>{if(e.target===e.currentTarget)setDrawerLead(null)}}>
          <div style={{background:'var(--s1)',border:'1px solid var(--br)',borderRadius:'var(--r3)',width:'100%',maxWidth:560,overflow:'hidden'}}>
            <div style={{padding:'18px 24px',borderBottom:'1px solid var(--br)',display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
              <div>
                <div style={{fontSize:18,fontWeight:700,marginBottom:4}}>{drawerLead.name}</div>
                <div style={{display:'flex',gap:6,flexWrap:'wrap' as const}}>
                  <span style={{fontSize:10,padding:'2px 8px',borderRadius:8,background:(STAGE_CFG[drawerLead.stage as Stage]??STAGE_CFG['New']).bg,color:(STAGE_CFG[drawerLead.stage as Stage]??STAGE_CFG['New']).color,fontWeight:600}}>{drawerLead.stage}</span>
                  <span style={{fontSize:10,color:'var(--text4)'}}>{drawerLead.source}</span>
                  {drawerLead.phone&&<span style={{fontSize:10,color:'var(--text4)'}}>{drawerLead.phone}</span>}
                  {drawerLead.instagram&&<span style={{fontSize:10,color:PURPLE}}>@{drawerLead.instagram}</span>}
                </div>
              </div>
              <button onClick={()=>setDrawerLead(null)} style={{background:'none',border:'none',color:'var(--text4)',cursor:'pointer',fontSize:22}}>×</button>
            </div>
            <div style={{padding:'18px 24px',maxHeight:'70vh',overflowY:'auto' as const}}>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:16}}>
                {[{l:'HxL Score',v:`${hxl(drawerLead.hunger,drawerLead.looking)} (H${drawerLead.hunger}×L${drawerLead.looking})`,c:hxlColor(hxl(drawerLead.hunger,drawerLead.looking))},{l:'Relationship',v:drawerLead.relationship||'—',c:'var(--text2)'},{l:'Age Range',v:drawerLead.age_range||'—',c:'var(--text2)'},{l:'Life Stage',v:drawerLead.life_stage||'—',c:'var(--text2)'},{l:'Primary Driver',v:drawerLead.primary_driver||'—',c:GOLD},{l:'Source',v:drawerLead.source,c:'var(--text2)'}].map(x=>(
                  <div key={x.l}>
                    <div style={{fontSize:9,color:'var(--text4)',marginBottom:2}}>{x.l}</div>
                    <div style={{fontSize:12,fontWeight:600,color:x.c}}>{x.v}</div>
                  </div>
                ))}
              </div>
              {drawerLead.pain_point&&(
                <div style={{marginBottom:16,padding:'10px 12px',background:'var(--s2)',borderRadius:'var(--r)',borderLeft:`3px solid ${GOLD}`}}>
                  <div style={{fontSize:9,color:'var(--text4)',marginBottom:4}}>PAIN POINT</div>
                  <div style={{fontSize:12,color:'var(--text2)',fontStyle:'italic'}}>"{drawerLead.pain_point}"</div>
                </div>
              )}
              <div style={SL}>Contact History</div>
              {leadLogs(drawerLead.id).length===0
                ?<div style={{fontSize:12,color:'var(--text4)',marginBottom:16}}>No contact logged yet</div>
                :leadLogs(drawerLead.id).map(log=>(
                  <div key={log.id} style={{padding:'8px 0',borderBottom:'1px solid var(--br)',marginBottom:4}}>
                    <div style={{display:'flex',justifyContent:'space-between',marginBottom:2}}>
                      <span style={{fontSize:10,fontWeight:600,color:{Positive:GREEN,Negative:RED,Neutral:GOLD,'No Show':RED,'Not Yet':'var(--text4)'}[log.outcome]??'var(--text4)'}}>{log.outcome||log.event_type}</span>
                      <span style={{fontSize:9,color:'var(--text4)'}}>{log.created_at.slice(0,10)}</span>
                    </div>
                    {log.notes&&<div style={{fontSize:11,color:'var(--text3)',lineHeight:1.5}}>{log.notes}</div>}
                    {log.next_action&&<div style={{fontSize:10,color:'var(--text4)',marginTop:2}}>Next: {log.next_action}{log.next_date?` · ${fmtDate(log.next_date)}`:''}</div>}
                  </div>
                ))
              }
              <div style={{display:'flex',gap:8,marginTop:16,flexWrap:'wrap' as const}}>
                <button onClick={()=>{setContactModal(drawerLead);setContactLog({outcome:'Positive',notes:'',nextAction:drawerLead.next_action||'Call',nextDate:''});setDrawerLead(null)}}
                  style={{padding:'8px 14px',borderRadius:'var(--r)',border:`1px solid ${GREEN}40`,background:`${GREEN}10`,color:GREEN,cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:12,fontWeight:600}}>
                  ✓ Log Contact
                </button>
                <button onClick={()=>{openEdit(drawerLead);setDrawerLead(null)}} style={{padding:'8px 14px',borderRadius:'var(--r)',border:'1px solid var(--br)',background:'var(--s2)',color:'var(--text2)',cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:12}}>Edit Profile</button>
                {!drawerLead.archived&&<button onClick={()=>{setArchiveModal(drawerLead);setDrawerLead(null)}} style={{padding:'8px 14px',borderRadius:'var(--r)',border:'1px solid rgba(224,85,85,0.3)',background:'transparent',color:RED,cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:12}}>Archive</button>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── EDIT MODAL (edit existing leads only) ─────────── */}
      {open&&(
        <div style={OVERLAY} onClick={e=>{if(e.target===e.currentTarget)setOpen(false)}}>
          <div style={{background:'var(--s1)',border:'1px solid var(--br)',borderRadius:'var(--r3)',width:'100%',maxWidth:520,overflow:'hidden',margin:'auto'}}>
            <div style={{padding:'18px 24px',borderBottom:'1px solid var(--br)',fontSize:16,fontWeight:700}}>{ed?'Edit Lead':'Lead Profile'}</div>
            <div style={{padding:'20px 24px',maxHeight:'75vh',overflowY:'auto' as const}}>
              <div style={{fontSize:9,color:GOLD,fontWeight:700,letterSpacing:'2px',textTransform:'uppercase' as const,marginBottom:10,marginTop:4}}>Identity</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
                <div style={{gridColumn:'1/-1'}}>
                  <div style={SL}>Name *</div>
                  <input value={form.name||''} onChange={e=>setForm(p=>({...p,name:e.target.value}))} placeholder="Full name" style={INP}/>
                </div>
                <div>
                  <div style={SL}>Phone</div>
                  <input type="tel" value={form.phone||''} onChange={e=>setForm(p=>({...p,phone:e.target.value}))} placeholder="+61 4XX XXX XXX" style={INP}/>
                </div>
                <div>
                  <div style={SL}>Instagram</div>
                  <input value={form.instagram||''} onChange={e=>setForm(p=>({...p,instagram:e.target.value}))} placeholder="@handle" style={INP}/>
                </div>
                <div>
                  <div style={SL}>Source</div>
                  <select value={form.source||'Instagram'} onChange={e=>setForm(p=>({...p,source:e.target.value}))} style={SEL}>
                    {SOURCES.map(s=><option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <div style={SL}>Stage</div>
                  <select value={form.stage||'New'} onChange={e=>setForm(p=>({...p,stage:e.target.value}))} style={SEL}>
                    {STAGES.map(s=><option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div style={{fontSize:9,color:GOLD,fontWeight:700,letterSpacing:'2px',textTransform:'uppercase' as const,marginBottom:10,borderTop:'1px solid var(--br)',paddingTop:14}}>Scoring</div>
              {([{k:'hunger' as const,label:'Hunger (1-10)',anchors:HUNGER_ANCHORS},{k:'looking' as const,label:'Looking (1-10)',anchors:LOOKING_ANCHORS}]).map(f=>(
                <div key={f.k} style={{marginBottom:14}}>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                    <div style={SL}>{f.label}</div>
                    <span className="mono" style={{fontSize:12,fontWeight:700,color:hxlColor((form[f.k]??5)*10)}}>{form[f.k]??5}/10</span>
                  </div>
                  <input type="range" min={1} max={10} value={form[f.k]??5} onChange={e=>setForm(p=>({...p,[f.k]:parseInt(e.target.value)}))} style={{width:'100%',accentColor:hxlColor((form[f.k]??5)*10),marginBottom:4}}/>
                  <div style={{fontSize:9,color:'var(--text4)',textAlign:'center' as const}}>{f.anchors[Math.round(((form[f.k]??5)-1)/9*4)]}</div>
                </div>
              ))}
              <div style={{padding:'10px 12px',background:'var(--s2)',borderRadius:'var(--r)',marginBottom:14,textAlign:'center' as const}}>
                <span style={{fontSize:10,color:'var(--text4)'}}>HxL Score: </span>
                <span className="mono" style={{fontSize:18,fontWeight:800,color:hxlColor(hxl(form.hunger??5,form.looking??5))}}>{hxl(form.hunger??5,form.looking??5)}</span>
              </div>
              <div style={{fontSize:9,color:GOLD,fontWeight:700,letterSpacing:'2px',textTransform:'uppercase' as const,marginBottom:10,borderTop:'1px solid var(--br)',paddingTop:14}}>Context</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
                {([{l:'Relationship',k:'relationship' as const,opts:RELATIONS},{l:'Age Range',k:'age_range' as const,opts:AGE_RANGES},{l:'Life Stage',k:'life_stage' as const,opts:LIFE_STAGES},{l:'Primary Driver',k:'primary_driver' as const,opts:DRIVERS}]).map(f=>(
                  <div key={f.k}>
                    <div style={SL}>{f.l}</div>
                    <select value={(form as any)[f.k]||''} onChange={e=>setForm(p=>({...p,[f.k]:e.target.value}))} style={SEL}>
                      <option value="">Select…</option>
                      {f.opts.map(o=><option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              <div style={{marginBottom:10}}>
                <div style={SL}>Pain Point (their words)</div>
                <input value={form.pain_point||''} onChange={e=>setForm(p=>({...p,pain_point:e.target.value}))} placeholder="What are they trying to solve?" style={INP}/>
              </div>
              <div style={{fontSize:9,color:GOLD,fontWeight:700,letterSpacing:'2px',textTransform:'uppercase' as const,marginBottom:10,borderTop:'1px solid var(--br)',paddingTop:14}}>Tracking</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
                <div>
                  <div style={SL}>Next Action</div>
                  <select value={form.next_action||'Call'} onChange={e=>setForm(p=>({...p,next_action:e.target.value}))} style={SEL}>
                    {NEXT_ACTS.map(a=><option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <div>
                  <div style={SL}>Next Action Date</div>
                  <input type="date" value={form.next_action_date||''} onChange={e=>setForm(p=>({...p,next_action_date:e.target.value}))} style={INP}/>
                </div>
              </div>
              <div style={{marginBottom:16}}>
                <div style={SL}>Notes</div>
                <textarea value={form.notes||''} onChange={e=>setForm(p=>({...p,notes:e.target.value}))} rows={3} placeholder="Anything relevant…" style={{...INP,resize:'vertical' as const}}/>
              </div>
              {err&&<div style={{color:RED,fontSize:12,marginBottom:10}}>{err}</div>}
              <div style={{display:'flex',gap:8}}>
                <button onClick={saveLead} style={{flex:1,padding:'11px',borderRadius:'var(--r)',border:'none',background:`linear-gradient(135deg,${GOLD},var(--gold3))`,color:'#000',fontWeight:700,cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:13}}>
                  {ed?'Save Changes':'Save'}
                </button>
                <button onClick={()=>setOpen(false)} style={{padding:'11px 16px',borderRadius:'var(--r)',border:'1px solid var(--br)',background:'transparent',color:'var(--text3)',cursor:'pointer',fontFamily:"'Sora',sans-serif"}}>Cancel</button>
                {ed&&<button onClick={()=>{setArchiveModal(ed);setOpen(false)}} style={{padding:'11px 14px',borderRadius:'var(--r)',border:'1px solid rgba(224,85,85,0.3)',background:'transparent',color:RED,cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:12}}>Archive</button>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── LOG CONTACT MODAL ─────────────────────────────── */}
      {contactModal&&(
        <div style={OVERLAY} onClick={e=>{if(e.target===e.currentTarget)setContactModal(null)}}>
          <div style={{background:'var(--s1)',border:'1px solid var(--br)',borderRadius:'var(--r3)',width:'100%',maxWidth:420,padding:28,margin:'auto'}}>
            <div style={{fontSize:16,fontWeight:700,marginBottom:4}}>Log Contact — {contactModal.name}</div>
            <div style={{fontSize:10,color:'var(--text4)',marginBottom:18}}>{contactModal.stage} · HxL {hxl(contactModal.hunger,contactModal.looking)} · {contactModal.primary_driver||contactModal.source}</div>
            <div style={{marginBottom:12}}>
              <div style={SL}>Outcome</div>
              <div style={{display:'flex',gap:6,flexWrap:'wrap' as const}}>
                {OUTCOMES.map(o=>(
                  <button key={o} onClick={()=>setContactLog(p=>({...p,outcome:o}))}
                    style={{padding:'6px 12px',borderRadius:'var(--r)',border:`1px solid ${contactLog.outcome===o?GOLD:'var(--br)'}`,background:contactLog.outcome===o?'rgba(200,162,74,0.15)':'var(--s2)',color:contactLog.outcome===o?GOLD:'var(--text4)',cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:11,fontWeight:contactLog.outcome===o?700:400}}>
                    {o}
                  </button>
                ))}
              </div>
            </div>
            <div style={{marginBottom:12}}>
              <div style={SL}>Notes</div>
              <textarea value={contactLog.notes} onChange={e=>setContactLog(p=>({...p,notes:e.target.value}))} rows={3} placeholder="What happened? Key moments, commitments…" style={{...INP,resize:'vertical' as const}}/>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:18}}>
              <div>
                <div style={SL}>Next Action</div>
                <select value={contactLog.nextAction} onChange={e=>setContactLog(p=>({...p,nextAction:e.target.value}))} style={SEL}>
                  {NEXT_ACTS.map(a=><option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <div>
                <div style={SL}>Next Date</div>
                <input type="date" value={contactLog.nextDate} onChange={e=>setContactLog(p=>({...p,nextDate:e.target.value}))} style={INP}/>
              </div>
            </div>
            <div style={{display:'flex',gap:8}}>
              <button onClick={logContact} style={{flex:1,padding:'10px',borderRadius:'var(--r)',border:'none',background:`linear-gradient(135deg,${GREEN},var(--green2))`,color:'#fff',fontWeight:700,cursor:'pointer',fontFamily:"'Sora',sans-serif"}}>Save Log</button>
              <button onClick={()=>setContactModal(null)} style={{padding:'10px 16px',borderRadius:'var(--r)',border:'1px solid var(--br)',background:'transparent',color:'var(--text3)',cursor:'pointer',fontFamily:"'Sora',sans-serif"}}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── BOOK PF MODAL ─────────────────────────────────── */}
      {bookPFModal&&(
        <div style={OVERLAY} onClick={e=>{if(e.target===e.currentTarget)setBookPFModal(null)}}>
          <div style={{background:'var(--s1)',border:'1px solid var(--br)',borderRadius:'var(--r3)',width:'100%',maxWidth:380,padding:28,margin:'auto'}}>
            <div style={{fontSize:16,fontWeight:700,marginBottom:4}}>Book PF → {bookPFModal.name}</div>
            <div style={{fontSize:11,color:'var(--text3)',marginBottom:20,lineHeight:1.6}}>
              This will create a Candidate record for {bookPFModal.name} and remove them from Pipeline. HxL score {hxl(bookPFModal.hunger,bookPFModal.looking)} carries over.
            </div>
            {bookPFModal.primary_driver&&<div style={{padding:'10px 12px',background:'var(--s2)',borderRadius:'var(--r)',marginBottom:20,fontSize:11,color:GOLD}}>Driver: {bookPFModal.primary_driver}{bookPFModal.pain_point?` · "${bookPFModal.pain_point}"`:''}</div>}
            <div style={{display:'flex',gap:8}}>
              <button onClick={bookPF} style={{flex:1,padding:'11px',borderRadius:'var(--r)',border:'none',background:`linear-gradient(135deg,${GOLD},var(--gold3))`,color:'#000',fontWeight:700,cursor:'pointer',fontFamily:"'Sora',sans-serif"}}>🚀 Confirm — Book PF</button>
              <button onClick={()=>setBookPFModal(null)} style={{padding:'11px 16px',borderRadius:'var(--r)',border:'1px solid var(--br)',background:'transparent',color:'var(--text3)',cursor:'pointer',fontFamily:"'Sora',sans-serif"}}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── PRE-CALL BRIEF MODAL ──────────────────────────── */}
      {briefModal&&(
        <div style={OVERLAY} onClick={e=>{if(e.target===e.currentTarget)setBriefModal(null)}}>
          <div style={{background:'var(--s1)',border:'1px solid var(--br)',borderRadius:'var(--r3)',width:'100%',maxWidth:460,padding:28,margin:'auto'}}>
            <div style={{fontSize:16,fontWeight:700,color:GOLD,marginBottom:4}}>Pre-Call Brief</div>
            <div style={{fontSize:12,color:'var(--text4)',marginBottom:16}}>{briefModal.lead.name} · {briefModal.lead.stage} · HxL {hxl(briefModal.lead.hunger,briefModal.lead.looking)}</div>
            {briefModal.loading
              ?<div style={{fontSize:13,color:'var(--text3)',fontStyle:'italic',padding:'20px 0'}}>Generating…</div>
              :<div style={{fontSize:13,color:'var(--text2)',lineHeight:1.8,whiteSpace:'pre-wrap' as const}}>{briefModal.text}</div>
            }
            <div style={{display:'flex',gap:8,marginTop:20}}>
              {!briefModal.loading&&<button onClick={()=>getPreCallBrief(briefModal.lead)} style={{padding:'8px 14px',borderRadius:'var(--r)',border:`1px solid ${GOLD}40`,background:'rgba(200,162,74,0.08)',color:GOLD,cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:11}}>↻ Refresh</button>}
              <button onClick={()=>setBriefModal(null)} style={{padding:'8px 14px',borderRadius:'var(--r)',border:'1px solid var(--br)',background:'transparent',color:'var(--text3)',cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:12}}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ── ARCHIVED VIEW ─────────────────────────────────── */}
      {view==='archived'&&(
        <div>
          {archived.length===0
            ?<div style={{...CARD,textAlign:'center' as const,padding:'48px',color:'var(--text4)'}}>No archived leads</div>
            :(
              <div>
                <div style={{fontSize:11,color:'var(--text4)',marginBottom:12}}>{archived.length} archived leads</div>
                {archived.map(l=>{
                  const cfg=STAGE_CFG[l.stage as Stage]??STAGE_CFG['New']
                  return(
                    <div key={l.id} style={{...CARD,marginBottom:8,opacity:0.85}}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:13,fontWeight:700,marginBottom:3}}>{l.name}</div>
                          <div style={{display:'flex',gap:6,flexWrap:'wrap' as const}}>
                            <span style={{fontSize:10,padding:'2px 8px',borderRadius:8,background:cfg.bg,color:cfg.color,fontWeight:600}}>{l.stage}</span>
                            <span style={{fontSize:10,padding:'2px 8px',borderRadius:8,background:'rgba(224,85,85,0.1)',color:RED}}>{l.archived_reason||'Archived'}</span>
                            <span style={{fontSize:10,color:'var(--text4)'}}>{l.source}</span>
                          </div>
                        </div>
                        <div className="mono" style={{fontSize:18,fontWeight:800,color:'var(--text4)',flexShrink:0,marginLeft:8}}>{hxl(l.hunger,l.looking)}</div>
                      </div>
                      {l.notes&&<div style={{fontSize:10,color:'var(--text4)',marginBottom:8,fontStyle:'italic'}}>"{l.notes.slice(0,80)}"</div>}
                      <div style={{display:'flex',gap:6}}>
                        <button onClick={()=>restoreLead(l)} style={{padding:'7px 12px',borderRadius:'var(--r)',border:`1px solid ${GREEN}40`,background:`${GREEN}0C`,color:GREEN,cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:11,fontWeight:600}}>↩ Restore</button>
                        <button onClick={()=>deleteLead(l.id)} style={{padding:'7px 12px',borderRadius:'var(--r)',border:`1px solid ${RED}30`,background:'transparent',color:RED,cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:11}}>Delete</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          }
        </div>
      )}
      {/* ── ARCHIVE MODAL ─────────────────────────────────── */}
      {archiveModal&&(
        <div style={OVERLAY} onClick={e=>{if(e.target===e.currentTarget)setArchiveModal(null)}}>
          <div style={{background:'var(--s1)',border:'1px solid var(--br)',borderRadius:'var(--r3)',width:'100%',maxWidth:380,padding:28,margin:'auto'}}>
            <div style={{fontSize:16,fontWeight:700,marginBottom:4,color:RED}}>Archive — {archiveModal.name}</div>
            <div style={{fontSize:11,color:'var(--text4)',marginBottom:20}}>Select a reason:</div>
            <div style={{display:'flex',flexDirection:'column' as const,gap:8,marginBottom:20}}>
              {[
                {r:'Not interested',l:'Not interested'},
                {r:'Wrong timing',l:'Wrong timing — follow up later'},
                {r:'No show x3',l:'No show ×3'},
                {r:'Lost contact',l:'Lost contact'},
                {r:'Converted to candidate',l:'Converted to candidate'},
                {r:'Other',l:'Other'},
              ].map(x=>(
                <button key={x.r} onClick={()=>{archiveLead(archiveModal,x.r);setArchiveModal(null)}}
                  style={{padding:'10px 14px',borderRadius:'var(--r)',border:'1px solid var(--br)',background:'var(--s2)',color:'var(--text2)',cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:12,textAlign:'left' as const,transition:'background 0.15s'}}>
                  {x.l}
                </button>
              ))}
            </div>
            <button onClick={()=>setArchiveModal(null)} style={{width:'100%',padding:'10px',borderRadius:'var(--r)',border:'1px solid var(--br)',background:'transparent',color:'var(--text4)',cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:12}}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
