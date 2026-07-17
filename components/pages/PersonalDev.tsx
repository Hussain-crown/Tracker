'use client'
import React, { useEffect, useState, useMemo } from 'react'
import { useStore } from '@/lib/stores'
import { uid, now, today } from '@/lib/utils'
import type { Resource, Audio, Partner } from '@/lib/stores'

// ── CONSTANTS ─────────────────────────────────────────────
const CATS = ['Leadership','Mindset','Business','Skills','Health','Other']
const TYPES = ['Book','Podcast','Course','Video','Article','Other']
const GOAL_CATS = ['Business','Financial','Personal','Health','Family','Lifestyle']
const INSIGHT_TAGS = ['Leadership','Mindset','Sales','Recruiting','Duplication','Money','Discipline','Other']

// ── RANK BRACKETS (mirror Organisation) ───────────────────
const MY_PPV = 161.34
function getBracket(pv:number):{pct:number;next:number;label:string}{
  if(pv>=7500)return{pct:21,next:0,label:'21%'}
  if(pv>=5000)return{pct:18,next:7500,label:'18%'}
  if(pv>=3250)return{pct:15,next:5000,label:'15%'}
  if(pv>=2000)return{pct:12,next:3250,label:'12%'}
  if(pv>=1000)return{pct:9, next:2000,label:'9%'}
  if(pv>=400) return{pct:6, next:1000,label:'6%'}
  if(pv>=100) return{pct:3, next:400, label:'3%'}
  return{pct:0,next:100,label:'0%'}
}

// ── COLOURS / STYLES ──────────────────────────────────────
const GOLD='var(--gold)';const GREEN='var(--green)';const RED='var(--red)'
const BLUE='var(--blue)';const PURPLE='var(--purple)';const TEAL='var(--teal)'
const SL:React.CSSProperties={fontSize:9,color:'var(--text3)',letterSpacing:'2px',textTransform:'uppercase' as const,fontWeight:700,marginBottom:6}
const INP:React.CSSProperties={width:'100%',background:'var(--s2)',border:'1px solid var(--br2)',borderRadius:'var(--r)',padding:'9px 12px',color:'var(--text)',fontSize:13,fontFamily:"'Sora',sans-serif",outline:'none',boxSizing:'border-box' as const}
const OVERLAY:React.CSSProperties={position:'fixed',inset:0,background:'rgba(0,0,0,0.88)',zIndex:500,display:'flex',alignItems:'center',justifyContent:'center',padding:20,backdropFilter:'blur(8px)',overflowY:'auto' as const}
const MODAL:React.CSSProperties={background:'var(--s1)',border:'1px solid var(--br)',borderRadius:'var(--r3)',width:'100%',maxWidth:480,padding:24,maxHeight:'90vh',overflowY:'auto' as const,margin:'auto'}
const FL:React.CSSProperties={fontSize:10,color:GOLD,fontWeight:700,letterSpacing:'1.5px',textTransform:'uppercase' as const,marginBottom:5}

// ── ENCODED FIELD HELPERS (zero schema risk) ──────────────
// Resource.key_takeaway holds: "<takeaway text>[[PROG:NN]][[ACT:action text]][[ACTDONE:1]]"
// Audio.notes holds:           "<notes text>[[ACT:action text]][[ACTDONE:1]]"
function decodeRes(r:Resource){
  const raw=r.key_takeaway||''
  const prog=parseInt((raw.match(/\[\[PROG:(\d+)\]\]/)||[])[1]||'0')
  const act=(raw.match(/\[\[ACT:([^\]]*)\]\]/)||[])[1]||''
  const actDone=/\[\[ACTDONE:1\]\]/.test(raw)
  const takeaway=raw.replace(/\[\[PROG:\d+\]\]/g,'').replace(/\[\[ACT:[^\]]*\]\]/g,'').replace(/\[\[ACTDONE:1\]\]/g,'').trim()
  return {takeaway,prog,act,actDone}
}
function encodeRes(takeaway:string,prog:number,act:string,actDone:boolean){
  let s=takeaway.trim()
  if(prog>0)s+=`[[PROG:${prog}]]`
  if(act.trim())s+=`[[ACT:${act.trim()}]]`
  if(actDone)s+='[[ACTDONE:1]]'
  return s
}
function decodeAudio(a:Audio){
  const raw=a.notes||''
  const act=(raw.match(/\[\[ACT:([^\]]*)\]\]/)||[])[1]||''
  const actDone=/\[\[ACTDONE:1\]\]/.test(raw)
  const notes=raw.replace(/\[\[ACT:[^\]]*\]\]/g,'').replace(/\[\[ACTDONE:1\]\]/g,'').trim()
  return {notes,act,actDone}
}
function encodeAudio(notes:string,act:string,actDone:boolean){
  let s=notes.trim()
  if(act.trim())s+=`[[ACT:${act.trim()}]]`
  if(actDone)s+='[[ACTDONE:1]]'
  return s
}

interface Goal {id:string;text:string;timeframe:string;target_date:string;category:string;done:boolean;created_at:string}
interface Insight {id:string;text:string;tags:string[];source:string;apply_action:string;apply_done:boolean;created_at:string}

type Tab='vision'|'reading'|'audios'|'insights'

export default function PersonalDev(){
  const { resources, audios, userId, upsertResource, deleteResource,
          upsertAudio, deleteAudio, loadResources, loadAudios, habits,
          partners, loadPartners, getMeta, setMeta } = useStore()

  const [tab,setTab]       = useState<Tab>('vision')
  // Reading
  const [rModal,setRModal] = useState(false)
  const [rEdit,setREdit]   = useState<Resource|null>(null)
  const [rForm,setRForm]   = useState({title:'',type:'Book',category:'Mindset',author:'',url:'',takeaway:'',status:'reading',rating:5,prog:0,act:'',actDone:false})
  const [rFilter,setRFilter] = useState('all')
  const [rSort,setRSort]   = useState<'recent'|'progress'|'rating'>('recent')
  // Audio
  const [aModal,setAModal] = useState(false)
  const [aEdit,setAEdit]   = useState<Audio|null>(null)
  const [aForm,setAForm]   = useState({title:'',speaker:'',duration:'',url:'',notes:'',act:'',actDone:false})
  // Goals
  const [goals,setGoals]   = useState<Goal[]>([])
  const [gModal,setGModal] = useState(false)
  const [gForm,setGForm]   = useState({text:'',timeframe:'1 year',target_date:'',category:'Business'})
  // Insights
  const [insights,setInsights] = useState<Insight[]>([])
  const [iModal,setIModal] = useState(false)
  const [iForm,setIForm]   = useState({text:'',tags:[] as string[],source:'',apply_action:''})
  const [iSearch,setISearch] = useState('')
  const [iTagFilter,setITagFilter] = useState('all')

  useEffect(()=>{ loadResources(); loadAudios(); loadPartners() },[]) // eslint-disable-line
  useEffect(()=>{
    getMeta('pd_goals').then(v=>{ if(v)try{setGoals(JSON.parse(v))}catch{} })
    getMeta('pd_insights').then(v=>{ if(v)try{setInsights(JSON.parse(v))}catch{} })
  },[]) // eslint-disable-line

  async function saveGoals(next:Goal[]){ setGoals(next); await setMeta('pd_goals',JSON.stringify(next)) }
  async function saveInsights(next:Insight[]){ setInsights(next); await setMeta('pd_insights',JSON.stringify(next)) }

  // ── LIVE BUSINESS NUMBERS (A) ───────────────────────────
  const biz = useMemo(()=>{
    const active=partners.filter((p:Partner)=>!p.archived)
    const directs=active.filter((p:Partner)=>!p.parent_id||p.parent_id==='')
    const totalGpv=directs.reduce((s:number,p:Partner)=>s+p.gpv,0)+MY_PPV
    const bracket=getBracket(totalGpv)
    const teamSize=active.length
    const activeIBOs=active.filter((p:Partner)=>p.gpv>0).length
    const fullyActivated=active.filter((p:Partner)=>{try{return JSON.parse(p.activation_done||'[]').length>=6}catch{return false}}).length
    return {totalGpv,bracket,teamSize,activeIBOs,fullyActivated}
  },[partners])

  // ── GROWTH STREAK (2) ───────────────────────────────────
  const growth = useMemo(()=>{
    const last30:string[]=[]
    for(let i=0;i<30;i++){const d=new Date();d.setDate(d.getDate()-i);last30.push(d.toISOString().slice(0,10))}
    // A "growth day" = checklist reading or audio done that day (stored in habits meta as checklist_<date>)
    // Fallback: any habit logged counts as engaged. Streak of consecutive growth days.
    const dayHasGrowth=(d:string)=>{
      const h=(habits as any)[d]
      return !!(h && (h.convo>0||h.mg1>0||h.mpa>0||h.contact>0))
    }
    let streak=0
    for(let i=0;i<30;i++){
      const d=new Date();d.setDate(d.getDate()-i)
      if(dayHasGrowth(d.toISOString().slice(0,10)))streak++; else break
    }
    const last7=last30.slice(0,7)
    const weekDone=last7.filter(dayHasGrowth).length
    return {streak,weekDone,last30,dayHasGrowth}
  },[habits])

  // ── RECOMMENDED FOCUS (6, improved) ─────────────────────
  const rec = useMemo(()=>{
    const last30:string[]=[]
    for(let i=0;i<30;i++){const d=new Date();d.setDate(d.getDate()-i);last30.push(d.toISOString().slice(0,10))}
    const sum=(k:string)=>last30.reduce((s,d)=>s+(((habits as any)[d]||{})[k]||0),0)
    const convos=sum('convo'),mg1s=sum('mg1'),mpas=sum('mpa'),contacts=sum('contact')
    const mg1Rate=convos>0?Math.round(mg1s/convos*100):0
    const recs:{label:string;cat:string;why:string;sev:number}[]=[]
    if(mg1Rate<3&&convos>0) recs.push({label:'Invitation & Edification',cat:'Leadership',why:`MG1 rate ${mg1Rate}% — your invite-to-show conversion is leaking`,sev:3})
    if(convos<20) recs.push({label:'Approach Mindset',cat:'Mindset',why:`Only ${convos} convos in 30d — fear of approach is throttling volume`,sev:3})
    if(contacts>0&&convos/Math.max(1,contacts)<0.3) recs.push({label:'Opening Skills',cat:'Skills',why:'Contacts not converting to conversations — work your opener',sev:2})
    if(growth.streak<5) recs.push({label:'Daily Discipline',cat:'Skills',why:`${growth.streak}d streak — consistency is the #1 duplication lever`,sev:2})
    if(mpas<8) recs.push({label:'Product Confidence',cat:'Business',why:`${mpas} MPAs in 30d — more product demos build belief`,sev:1})
    // Apply-it nudges
    const pendingActs:string[]=[]
    resources.forEach(r=>{const d=decodeRes(r);if(d.act&&!d.actDone)pendingActs.push(`"${d.act}" from ${r.title}`)})
    audios.forEach(a=>{const d=decodeAudio(a);if(d.act&&!d.actDone)pendingActs.push(`"${d.act}" from ${a.title}`)})
    insights.forEach(i=>{if(i.apply_action&&!i.apply_done)pendingActs.push(`"${i.apply_action}"`)})
    if(recs.length===0)recs.push({label:'Stay Sharp',cat:'Business',why:'Activity is healthy — keep feeding the mind',sev:0})
    return {mg1Rate,convos,mpas,contacts,recs:recs.sort((a,b)=>b.sev-a.sev).slice(0,4),pendingActs:pendingActs.slice(0,5)}
  },[habits,resources,audios,insights,growth.streak])

  // ── RESOURCE SAVE ───────────────────────────────────────
  function openResAdd(cat?:string){ setREdit(null); setRForm({title:'',type:'Book',category:cat||'Mindset',author:'',url:'',takeaway:'',status:'reading',rating:5,prog:0,act:'',actDone:false}); setRModal(true) }
  function openResEdit(r:Resource){ const d=decodeRes(r); setREdit(r); setRForm({title:r.title,type:r.type,category:r.category,author:r.author,url:r.url,takeaway:d.takeaway,status:r.status,rating:r.rating,prog:d.prog,act:d.act,actDone:d.actDone}); setRModal(true) }
  async function saveResource(){
    if(!rForm.title.trim()||!userId)return
    const encoded=encodeRes(rForm.takeaway,rForm.status==='done'?100:rForm.prog,rForm.act,rForm.actDone)
    const r:Resource={
      id:rEdit?.id??uid(),user_id:userId,title:rForm.title.trim(),type:rForm.type,category:rForm.category,
      author:rForm.author,url:rForm.url,status:rForm.status,rating:rForm.rating,
      key_takeaway:encoded,date_completed:rForm.status==='done'?today():'',
      created_at:rEdit?.created_at??now(),updated_at:now(),
    }
    await upsertResource(r); setRModal(false)
  }

  // ── AUDIO SAVE ──────────────────────────────────────────
  function openAudioAdd(){ setAEdit(null); setAForm({title:'',speaker:'',duration:'',url:'',notes:'',act:'',actDone:false}); setAModal(true) }
  function openAudioEdit(a:Audio){ const d=decodeAudio(a); setAEdit(a); setAForm({title:a.title,speaker:a.speaker,duration:a.duration,url:a.url,notes:d.notes,act:d.act,actDone:d.actDone}); setAModal(true) }
  async function saveAudio(){
    if(!aForm.title.trim()||!userId)return
    const encoded=encodeAudio(aForm.notes,aForm.act,aForm.actDone)
    const a:Audio={
      id:aEdit?.id??uid(),user_id:userId,title:aForm.title.trim(),speaker:aForm.speaker,
      duration:aForm.duration,url:aForm.url,played:aEdit?.played??false,notes:encoded,
      created_at:aEdit?.created_at??now(),updated_at:now(),
    }
    await upsertAudio(a); setAModal(false)
  }

  // ── GOAL SAVE ───────────────────────────────────────────
  function saveGoal(){
    if(!gForm.text.trim())return
    const g:Goal={id:uid(),text:gForm.text.trim(),timeframe:gForm.timeframe,target_date:gForm.target_date,category:gForm.category,done:false,created_at:now()}
    saveGoals([...goals,g]); setGModal(false); setGForm({text:'',timeframe:'1 year',target_date:'',category:'Business'})
  }

  // ── INSIGHT SAVE ────────────────────────────────────────
  function saveInsight(){
    if(!iForm.text.trim())return
    const i:Insight={id:uid(),text:iForm.text.trim(),tags:iForm.tags,source:iForm.source,apply_action:iForm.apply_action,apply_done:false,created_at:now()}
    saveInsights([i,...insights]); setIModal(false); setIForm({text:'',tags:[],source:'',apply_action:''})
  }

  // ── DERIVED LISTS ───────────────────────────────────────
  const reading = resources.filter(r=>r.status==='reading')
  const sortedResources = useMemo(()=>{
    let list=rFilter==='all'?resources:rFilter==='reading'?resources.filter(r=>r.status==='reading'):rFilter==='done'?resources.filter(r=>r.status==='done'):rFilter==='queued'?resources.filter(r=>r.status==='queued'):resources.filter(r=>r.category===rFilter)
    return [...list].sort((a,b)=>{
      if(rSort==='progress')return decodeRes(b).prog-decodeRes(a).prog
      if(rSort==='rating')return b.rating-a.rating
      return b.created_at.localeCompare(a.created_at)
    })
  },[resources,rFilter,rSort])

  const filteredInsights = useMemo(()=>{
    let list=insights
    if(iTagFilter!=='all')list=list.filter(i=>i.tags.includes(iTagFilter))
    if(iSearch)list=list.filter(i=>i.text.toLowerCase().includes(iSearch.toLowerCase())||i.source.toLowerCase().includes(iSearch.toLowerCase()))
    return list
  },[insights,iSearch,iTagFilter])

  const statusColor=(s:string)=>s==='done'?GREEN:s==='reading'?GOLD:'var(--text3)'

  const TABS=[
    {id:'vision' as const,  label:'🎯 Vision'},
    {id:'reading' as const, label:'📚 Reading'},
    {id:'audios' as const,  label:'🎧 Underground Audios'},
    {id:'insights' as const,label:'💡 Insights'},
  ]

  return(
    <div style={{animation:'fade-in 0.3s ease',paddingBottom:60}}>

      {/* Add button */}
      <div style={{display:'flex',justifyContent:'flex-end',marginBottom:14}}>
        <button onClick={()=>{tab==='reading'?openResAdd():tab==='audios'?openAudioAdd():tab==='insights'?setIModal(true):setGModal(true)}}
          style={{padding:'8px 16px',borderRadius:'var(--r)',border:'none',background:'linear-gradient(135deg,var(--gold3),var(--gold))',color:'#000',fontWeight:700,cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:12}}>
          + Add {tab==='reading'?'Resource':tab==='audios'?'Audio':tab==='insights'?'Insight':'Goal'}
        </button>
      </div>

      {/* Tabs */}
      <div style={{display:'flex',gap:3,marginBottom:16,background:'var(--s1)',borderRadius:'var(--r2)',padding:4,border:'1px solid var(--br)',overflowX:'auto' as const}}>
        {TABS.map(t=>{
          const isA=tab===t.id
          return(
            <button key={t.id} onClick={()=>setTab(t.id)} style={{flex:1,padding:'8px 8px',borderRadius:'var(--r)',border:'none',background:isA?'var(--s3)':'transparent',color:isA?GOLD:'var(--text3)',fontSize:11,fontWeight:isA?700:400,cursor:'pointer',fontFamily:"'Sora',sans-serif",whiteSpace:'nowrap' as const,transition:'all 0.15s'}}>
              {t.label}
            </button>
          )
        })}
      </div>

      {/* ═══ VISION TAB ═══════════════════════════════════ */}
      {tab==='vision'&&(
        <div>
          {/* Growth streak strip */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,marginBottom:14}}>
            <div style={{background:'var(--s1)',border:'1px solid var(--br)',borderRadius:'var(--r2)',padding:'14px',textAlign:'center' as const}}>
              <div className="mono" style={{fontSize:24,fontWeight:800,color:growth.streak>=5?GREEN:GOLD,lineHeight:1}}>{growth.streak}</div>
              <div style={{fontSize:9,color:'var(--text4)',marginTop:4}}>day streak</div>
            </div>
            <div style={{background:'var(--s1)',border:'1px solid var(--br)',borderRadius:'var(--r2)',padding:'14px',textAlign:'center' as const}}>
              <div className="mono" style={{fontSize:24,fontWeight:800,color:GOLD,lineHeight:1}}>{growth.weekDone}/7</div>
              <div style={{fontSize:9,color:'var(--text4)',marginTop:4}}>this week</div>
            </div>
            <div style={{background:'var(--s1)',border:'1px solid var(--br)',borderRadius:'var(--r2)',padding:'14px',textAlign:'center' as const}}>
              <div className="mono" style={{fontSize:24,fontWeight:800,color:TEAL,lineHeight:1}}>{resources.filter(r=>r.status==='done').length}</div>
              <div style={{fontSize:9,color:'var(--text4)',marginTop:4}}>completed</div>
            </div>
          </div>

          {/* 30-day grid */}
          <div style={{background:'var(--s1)',border:'1px solid var(--br)',borderRadius:'var(--r2)',padding:'14px',marginBottom:14}}>
            <div style={SL}>30-Day Consistency</div>
            <div style={{display:'flex',gap:3,flexWrap:'wrap' as const}}>
              {growth.last30.slice().reverse().map(d=>{
                const on=growth.dayHasGrowth(d)
                const isToday=d===new Date().toISOString().slice(0,10)
                return <div key={d} title={d} style={{width:18,height:18,borderRadius:4,background:on?GREEN:'var(--s3)',border:isToday?`2px solid ${GOLD}`:'1px solid var(--br)',flexShrink:0}}/>
              })}
            </div>
          </div>

          {/* Live business numbers (A) */}
          <div style={{background:'var(--s1)',border:`1px solid ${GOLD}30`,borderRadius:'var(--r2)',padding:'14px',marginBottom:14}}>
            <div style={SL}>Where You Are Right Now</div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(90px,1fr))',gap:10}}>
              <div style={{textAlign:'center' as const}}>
                <div className="mono" style={{fontSize:18,fontWeight:800,color:GOLD,lineHeight:1}}>{biz.bracket.label}</div>
                <div style={{fontSize:9,color:'var(--text4)',marginTop:3}}>bracket</div>
              </div>
              <div style={{textAlign:'center' as const}}>
                <div className="mono" style={{fontSize:18,fontWeight:800,color:GREEN,lineHeight:1}}>{biz.totalGpv.toFixed(0)}</div>
                <div style={{fontSize:9,color:'var(--text4)',marginTop:3}}>group PV</div>
              </div>
              <div style={{textAlign:'center' as const}}>
                <div className="mono" style={{fontSize:18,fontWeight:800,color:BLUE,lineHeight:1}}>{biz.teamSize}</div>
                <div style={{fontSize:9,color:'var(--text4)',marginTop:3}}>team</div>
              </div>
              <div style={{textAlign:'center' as const}}>
                <div className="mono" style={{fontSize:18,fontWeight:800,color:TEAL,lineHeight:1}}>{biz.fullyActivated}</div>
                <div style={{fontSize:9,color:'var(--text4)',marginTop:3}}>activated</div>
              </div>
            </div>
            {biz.bracket.next>0&&(
              <div style={{fontSize:10,color:'var(--text4)',marginTop:10,textAlign:'center' as const}}>
                {(biz.bracket.next-biz.totalGpv).toFixed(0)} PV to next bracket
              </div>
            )}
          </div>

          {/* Goals / Vision */}
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
            <div style={SL}>Goals & Vision</div>
            <button onClick={()=>setGModal(true)} style={{fontSize:10,padding:'4px 10px',borderRadius:'var(--r)',border:`1px solid ${GOLD}30`,background:`${GOLD}0C`,color:GOLD,cursor:'pointer',fontFamily:"'Sora',sans-serif"}}>+ Goal</button>
          </div>
          {goals.length===0
            ?<div style={{textAlign:'center' as const,padding:'40px',color:'var(--text4)',fontSize:13,border:'1px dashed var(--br)',borderRadius:'var(--r2)'}}>Define your why. Add your first goal.</div>
            :goals.map(g=>(
              <div key={g.id} style={{background:'var(--s1)',border:'1px solid var(--br)',borderRadius:'var(--r2)',padding:'14px',marginBottom:8,display:'flex',gap:12,alignItems:'flex-start',opacity:g.done?0.6:1}}>
                <button onClick={()=>saveGoals(goals.map(x=>x.id===g.id?{...x,done:!x.done}:x))}
                  style={{width:22,height:22,borderRadius:'50%',flexShrink:0,marginTop:2,background:g.done?GREEN:'transparent',border:`2px solid ${g.done?GREEN:'var(--br2)'}`,cursor:'pointer',color:'#000',fontSize:11,fontWeight:700}}>{g.done?'✓':''}</button>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:600,marginBottom:4,textDecoration:g.done?'line-through':'none'}}>{g.text}</div>
                  <div style={{display:'flex',gap:6,flexWrap:'wrap' as const}}>
                    <span style={{fontSize:10,padding:'1px 8px',borderRadius:8,background:`${GOLD}10`,color:GOLD}}>{g.timeframe}</span>
                    <span style={{fontSize:10,padding:'1px 8px',borderRadius:8,background:'var(--s2)',color:'var(--text4)'}}>{g.category}</span>
                    {g.target_date&&<span style={{fontSize:10,color:'var(--text4)'}}>by {new Date(g.target_date).toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'})}</span>}
                  </div>
                </div>
                <button onClick={()=>saveGoals(goals.filter(x=>x.id!==g.id))} style={{background:'none',border:'none',color:'var(--text4)',cursor:'pointer',fontSize:16,flexShrink:0}}>×</button>
              </div>
            ))
          }
        </div>
      )}

      {/* ═══ READING TAB ══════════════════════════════════ */}
      {tab==='reading'&&(
        <div>
          {/* Recommended focus */}
          <div style={{marginBottom:14,padding:'12px 14px',background:`${GOLD}08`,border:`1px solid ${GOLD}20`,borderRadius:'var(--r2)'}}>
            <div style={SL}>Recommended Focus — From Your Activity</div>
            {rec.recs.map((r,i)=>(
              <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8,padding:'5px 0',borderBottom:i<rec.recs.length-1?'1px solid var(--br)':'none'}}>
                <div style={{flex:1,minWidth:0}}>
                  <span style={{fontSize:11,fontWeight:600,color:GOLD}}>{r.label}</span>
                  <div style={{fontSize:10,color:'var(--text4)'}}>{r.why}</div>
                </div>
                <button onClick={()=>openResAdd(r.cat)} style={{fontSize:9,padding:'3px 8px',borderRadius:'var(--r)',border:`1px solid ${GOLD}30`,background:`${GOLD}0C`,color:GOLD,cursor:'pointer',fontFamily:"'Sora',sans-serif",flexShrink:0}}>+ {r.cat}</button>
              </div>
            ))}
            <div style={{display:'flex',gap:14,marginTop:8,fontSize:10,color:'var(--text4)'}}>
              <span>30d: <strong style={{color:GOLD}}>{rec.convos}</strong> convos</span>
              <span>MG1: <strong style={{color:rec.mg1Rate>=3?GREEN:RED}}>{rec.mg1Rate}%</strong></span>
              <span>MPAs: <strong style={{color:GOLD}}>{rec.mpas}</strong></span>
            </div>
          </div>

          {/* Apply-it pending nudges */}
          {rec.pendingActs.length>0&&(
            <div style={{marginBottom:14,padding:'10px 14px',background:`${TEAL}08`,border:`1px solid ${TEAL}20`,borderRadius:'var(--r2)'}}>
              <div style={{...SL,color:TEAL}}>Did You Apply It?</div>
              {rec.pendingActs.map((a,i)=><div key={i} style={{fontSize:11,color:'var(--text3)',padding:'2px 0'}}>→ {a}</div>)}
            </div>
          )}

          {/* Currently reading pinned */}
          {reading.length>0&&(
            <div style={{marginBottom:14}}>
              <div style={SL}>Currently Reading</div>
              {reading.map(r=>{
                const d=decodeRes(r)
                return(
                  <div key={r.id} onClick={()=>openResEdit(r)} style={{background:'var(--s1)',border:`1px solid ${GOLD}30`,borderRadius:'var(--r2)',padding:'12px 14px',marginBottom:8,cursor:'pointer'}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:6}}>
                      <span style={{fontSize:13,fontWeight:600}}>{r.title}</span>
                      <span className="mono" style={{fontSize:12,fontWeight:700,color:GOLD}}>{d.prog}%</span>
                    </div>
                    <div style={{height:4,background:'var(--s3)',borderRadius:2,overflow:'hidden'}}>
                      <div style={{height:'100%',width:d.prog+'%',background:GOLD,borderRadius:2,transition:'width 0.4s'}}/>
                    </div>
                    {d.act&&!d.actDone&&<div style={{fontSize:10,color:TEAL,marginTop:6}}>→ Apply: {d.act}</div>}
                  </div>
                )
              })}
            </div>
          )}

          {/* Stats */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(110px,1fr))',gap:10,marginBottom:14}}>
            {[
              {l:'Total',v:resources.length,c:GOLD},
              {l:'Reading',v:resources.filter(r=>r.status==='reading').length,c:BLUE},
              {l:'Done',v:resources.filter(r=>r.status==='done').length,c:GREEN},
              {l:'Queued',v:resources.filter(r=>r.status==='queued').length,c:'var(--text3)'},
            ].map(x=>(
              <div key={x.l} style={{background:'var(--s1)',border:'1px solid var(--br)',borderRadius:'var(--r2)',padding:'12px',textAlign:'center' as const}}>
                <div className="mono" style={{fontSize:22,fontWeight:800,color:x.c,lineHeight:1}}>{x.v}</div>
                <div style={{fontSize:10,color:'var(--text4)',marginTop:4}}>{x.l}</div>
              </div>
            ))}
          </div>

          {/* Filter + sort */}
          <div style={{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap' as const}}>
            <select value={rFilter} onChange={e=>setRFilter(e.target.value)} style={{...INP,width:'auto',cursor:'pointer'}}>
              <option value="all">All</option>
              <option value="reading">Reading</option>
              <option value="done">Done</option>
              <option value="queued">Queued</option>
              {CATS.map(c=><option key={c} value={c}>{c}</option>)}
            </select>
            <select value={rSort} onChange={e=>setRSort(e.target.value as any)} style={{...INP,width:'auto',cursor:'pointer'}}>
              <option value="recent">Latest</option>
              <option value="progress">Progress</option>
              <option value="rating">Rating</option>
            </select>
          </div>

          {sortedResources.length===0
            ?<div style={{textAlign:'center' as const,padding:'48px',color:'var(--text4)',fontSize:13,border:'1px dashed var(--br)',borderRadius:'var(--r2)'}}>No resources in this view.</div>
            :sortedResources.map(r=>{
              const d=decodeRes(r)
              return(
                <div key={r.id} style={{background:'var(--s1)',border:'1px solid var(--br)',borderRadius:'var(--r2)',padding:'14px 16px',marginBottom:10,display:'flex',gap:12,alignItems:'flex-start'}}>
                  <div style={{flex:1,minWidth:0,cursor:'pointer'}} onClick={()=>openResEdit(r)}>
                    <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:4,flexWrap:'wrap' as const}}>
                      <span style={{fontSize:13,fontWeight:600}}>{r.title}</span>
                      <span style={{fontSize:10,padding:'1px 8px',borderRadius:8,background:`${GOLD}10`,color:GOLD}}>{r.type}</span>
                      <span style={{fontSize:10,padding:'1px 8px',borderRadius:8,background:'var(--s2)',color:'var(--text4)'}}>{r.category}</span>
                      <span style={{fontSize:10,fontWeight:600,color:statusColor(r.status)}}>{r.status}</span>
                    </div>
                    {r.author&&<div style={{fontSize:11,color:'var(--text4)'}}>by {r.author}</div>}
                    {d.takeaway&&<div style={{fontSize:11,color:'var(--text2)',marginTop:4,lineHeight:1.5}}>{d.takeaway}</div>}
                    {d.act&&(
                      <div style={{fontSize:10,color:d.actDone?'var(--text4)':TEAL,marginTop:4,textDecoration:d.actDone?'line-through':'none'}}>→ Apply: {d.act}</div>
                    )}
                    {r.rating>0&&r.status==='done'&&<div style={{fontSize:12,marginTop:4,color:GOLD}}>{'★'.repeat(r.rating)}{'☆'.repeat(5-r.rating)}</div>}
                    {r.url&&<a href={r.url} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()} style={{fontSize:10,color:BLUE,marginTop:4,display:'inline-block'}}>Open link ↗</a>}
                  </div>
                  <div style={{display:'flex',flexDirection:'column' as const,gap:6,flexShrink:0}}>
                    {d.act&&!d.actDone&&(
                      <button onClick={()=>upsertResource({...r,key_takeaway:encodeRes(d.takeaway,d.prog,d.act,true),updated_at:now()})}
                        style={{padding:'4px 8px',borderRadius:'var(--r)',border:`1px solid ${TEAL}40`,background:`${TEAL}0C`,color:TEAL,cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:9,fontWeight:600}}>✓ Applied</button>
                    )}
                    <button onClick={()=>deleteResource(r.id)} style={{background:'none',border:'none',color:'var(--text4)',cursor:'pointer',fontSize:16,padding:0}}>×</button>
                  </div>
                </div>
              )
            })
          }
        </div>
      )}

      {/* ═══ UNDERGROUND AUDIOS TAB ═══════════════════════ */}
      {tab==='audios'&&(
        <div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(110px,1fr))',gap:10,marginBottom:14}}>
            {[
              {l:'Total',v:audios.length,c:GOLD},
              {l:'Played',v:audios.filter(a=>a.played).length,c:GREEN},
              {l:'Queue',v:audios.filter(a=>!a.played).length,c:'var(--text3)'},
            ].map(x=>(
              <div key={x.l} style={{background:'var(--s1)',border:'1px solid var(--br)',borderRadius:'var(--r2)',padding:'12px',textAlign:'center' as const}}>
                <div className="mono" style={{fontSize:22,fontWeight:800,color:x.c,lineHeight:1}}>{x.v}</div>
                <div style={{fontSize:10,color:'var(--text4)',marginTop:4}}>{x.l}</div>
              </div>
            ))}
          </div>

          {/* Listen next */}
          {audios.filter(a=>!a.played)[0]&&(()=>{
            const next=audios.filter(a=>!a.played)[0]
            return(
              <div style={{marginBottom:14,padding:'12px 14px',background:`${PURPLE}0C`,border:`1px solid ${PURPLE}25`,borderRadius:'var(--r2)'}}>
                <div style={{...SL,color:PURPLE}}>Listen Next</div>
                <div style={{fontSize:13,fontWeight:600,marginBottom:2}}>{next.title}</div>
                {next.speaker&&<div style={{fontSize:11,color:'var(--text4)'}}>{next.speaker}{next.duration?` · ${next.duration}`:''}</div>}
                <div style={{display:'flex',gap:8,marginTop:8}}>
                  {next.url&&<a href={next.url} target="_blank" rel="noopener noreferrer" style={{fontSize:11,padding:'5px 12px',borderRadius:'var(--r)',border:`1px solid ${PURPLE}40`,background:`${PURPLE}10`,color:PURPLE,textDecoration:'none',fontWeight:600}}>▶ Play</a>}
                  <button onClick={()=>upsertAudio({...next,played:true,updated_at:now()})} style={{fontSize:11,padding:'5px 12px',borderRadius:'var(--r)',border:`1px solid ${GREEN}30`,background:`${GREEN}0C`,color:GREEN,cursor:'pointer',fontFamily:"'Sora',sans-serif",fontWeight:600}}>✓ Played</button>
                </div>
              </div>
            )
          })()}

          {audios.length===0
            ?<div style={{textAlign:'center' as const,padding:'48px',color:'var(--text4)',fontSize:13,border:'1px dashed var(--br)',borderRadius:'var(--r2)'}}>No audios yet. Add a training call, function recording or coaching session.</div>
            :audios.map(a=>{
              const d=decodeAudio(a)
              return(
                <div key={a.id} style={{background:'var(--s1)',border:'1px solid var(--br)',borderRadius:'var(--r2)',padding:'14px 16px',marginBottom:10,display:'flex',gap:12,alignItems:'flex-start'}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:4,flexWrap:'wrap' as const}}>
                      <span style={{fontSize:13,fontWeight:600,cursor:'pointer'}} onClick={()=>openAudioEdit(a)}>{a.title}</span>
                      {a.played&&<span style={{fontSize:10,padding:'1px 8px',borderRadius:8,background:`${GREEN}10`,color:GREEN}}>✓ Played</span>}
                    </div>
                    {a.speaker&&<div style={{fontSize:11,color:'var(--text4)'}}>{a.speaker}{a.duration?` · ${a.duration}`:''}</div>}
                    {d.notes&&<div style={{fontSize:11,color:'var(--text2)',marginTop:4}}>{d.notes}</div>}
                    {d.act&&<div style={{fontSize:10,color:d.actDone?'var(--text4)':TEAL,marginTop:4,textDecoration:d.actDone?'line-through':'none'}}>→ Apply: {d.act}</div>}
                    {a.url&&<a href={a.url} target="_blank" rel="noopener noreferrer" style={{fontSize:10,color:PURPLE,marginTop:4,display:'inline-block'}}>▶ Open audio ↗</a>}
                  </div>
                  <div style={{display:'flex',flexDirection:'column' as const,gap:6,flexShrink:0}}>
                    {!a.played&&<button onClick={()=>upsertAudio({...a,played:true,updated_at:now()})} style={{padding:'5px 10px',borderRadius:'var(--r)',border:`1px solid ${GREEN}30`,background:`${GREEN}0C`,color:GREEN,cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:10}}>Played</button>}
                    {d.act&&!d.actDone&&<button onClick={()=>upsertAudio({...a,notes:encodeAudio(d.notes,d.act,true),updated_at:now()})} style={{padding:'4px 8px',borderRadius:'var(--r)',border:`1px solid ${TEAL}40`,background:`${TEAL}0C`,color:TEAL,cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:9,fontWeight:600}}>✓ Applied</button>}
                    <button onClick={()=>deleteAudio(a.id)} style={{background:'none',border:'none',color:'var(--text4)',cursor:'pointer',fontSize:16,padding:0}}>×</button>
                  </div>
                </div>
              )
            })
          }
        </div>
      )}

      {/* ═══ INSIGHTS TAB ═════════════════════════════════ */}
      {tab==='insights'&&(
        <div>
          <div style={{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap' as const}}>
            <input value={iSearch} onChange={e=>setISearch(e.target.value)} placeholder="Search insights…" style={{flex:1,minWidth:140,...INP}}/>
            <select value={iTagFilter} onChange={e=>setITagFilter(e.target.value)} style={{...INP,width:'auto',cursor:'pointer'}}>
              <option value="all">All tags</option>
              {INSIGHT_TAGS.map(t=><option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          {filteredInsights.length===0
            ?<div style={{textAlign:'center' as const,padding:'48px',color:'var(--text4)',fontSize:13,border:'1px dashed var(--br)',borderRadius:'var(--r2)'}}>No insights yet. Capture what you learn from books, calls and mentors.</div>
            :filteredInsights.map(ins=>(
              <div key={ins.id} style={{background:'var(--s1)',border:'1px solid var(--br)',borderRadius:'var(--r2)',padding:'14px 16px',marginBottom:10,display:'flex',gap:12,alignItems:'flex-start'}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,color:'var(--text2)',lineHeight:1.5,marginBottom:6}}>{ins.text}</div>
                  <div style={{display:'flex',gap:6,flexWrap:'wrap' as const,alignItems:'center'}}>
                    {ins.tags.map(t=><span key={t} style={{fontSize:9,padding:'1px 7px',borderRadius:8,background:`${PURPLE}10`,color:PURPLE}}>{t}</span>)}
                    {ins.source&&<span style={{fontSize:10,color:'var(--text4)'}}>· {ins.source}</span>}
                    <span style={{fontSize:9,color:'var(--text4)'}}>· {new Date(ins.created_at).toLocaleDateString('en-AU',{day:'numeric',month:'short'})}</span>
                  </div>
                  {ins.apply_action&&(
                    <div style={{fontSize:10,color:ins.apply_done?'var(--text4)':TEAL,marginTop:6,textDecoration:ins.apply_done?'line-through':'none'}}>→ Apply: {ins.apply_action}</div>
                  )}
                </div>
                <div style={{display:'flex',flexDirection:'column' as const,gap:6,flexShrink:0}}>
                  {ins.apply_action&&!ins.apply_done&&<button onClick={()=>saveInsights(insights.map(x=>x.id===ins.id?{...x,apply_done:true}:x))} style={{padding:'4px 8px',borderRadius:'var(--r)',border:`1px solid ${TEAL}40`,background:`${TEAL}0C`,color:TEAL,cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:9,fontWeight:600}}>✓ Applied</button>}
                  <button onClick={()=>saveInsights(insights.filter(x=>x.id!==ins.id))} style={{background:'none',border:'none',color:'var(--text4)',cursor:'pointer',fontSize:16,padding:0}}>×</button>
                </div>
              </div>
            ))
          }
        </div>
      )}

      {/* ═══ RESOURCE MODAL ═══════════════════════════════ */}
      {rModal&&(
        <div style={OVERLAY} onClick={e=>{if(e.target===e.currentTarget)setRModal(false)}}>
          <div style={MODAL}>
            <div style={{fontSize:16,fontWeight:700,marginBottom:16}}>{rEdit?'Edit':'Add'} Resource</div>
            <div style={{marginBottom:10}}>
              <div style={FL}>Title *</div>
              <input value={rForm.title} onChange={e=>setRForm(f=>({...f,title:e.target.value}))} placeholder="Book / podcast / course name" style={INP}/>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
              <div><div style={FL}>Type</div><select value={rForm.type} onChange={e=>setRForm(f=>({...f,type:e.target.value}))} style={INP}>{TYPES.map(t=><option key={t} value={t}>{t}</option>)}</select></div>
              <div><div style={FL}>Category</div><select value={rForm.category} onChange={e=>setRForm(f=>({...f,category:e.target.value}))} style={INP}>{CATS.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
              <div><div style={FL}>Author/Speaker</div><input value={rForm.author} onChange={e=>setRForm(f=>({...f,author:e.target.value}))} style={INP}/></div>
              <div><div style={FL}>Status</div><select value={rForm.status} onChange={e=>setRForm(f=>({...f,status:e.target.value}))} style={INP}>{['queued','reading','done'].map(s=><option key={s} value={s}>{s}</option>)}</select></div>
            </div>
            {rForm.status==='reading'&&(
              <div style={{marginBottom:10}}>
                <div style={FL}>Progress — {rForm.prog}%</div>
                <input type="range" min={0} max={100} step={5} value={rForm.prog} onChange={e=>setRForm(f=>({...f,prog:parseInt(e.target.value)}))} style={{width:'100%',accentColor:GOLD}}/>
              </div>
            )}
            <div style={{marginBottom:10}}>
              <div style={FL}>Link (optional)</div>
              <input value={rForm.url} onChange={e=>setRForm(f=>({...f,url:e.target.value}))} placeholder="https://…" style={INP}/>
            </div>
            <div style={{marginBottom:10}}>
              <div style={FL}>Key Takeaway</div>
              <textarea value={rForm.takeaway} onChange={e=>setRForm(f=>({...f,takeaway:e.target.value}))} rows={2} placeholder="What's the main insight?" style={{...INP,resize:'vertical' as const}}/>
            </div>
            <div style={{marginBottom:10}}>
              <div style={{...FL,color:TEAL}}>One Action I'll Take</div>
              <input value={rForm.act} onChange={e=>setRForm(f=>({...f,act:e.target.value}))} placeholder="Apply this to my business by…" style={INP}/>
            </div>
            {rForm.status==='done'&&(
              <div style={{marginBottom:10}}>
                <div style={FL}>Rating</div>
                <div style={{display:'flex',gap:4}}>
                  {[1,2,3,4,5].map(n=><button key={n} onClick={()=>setRForm(f=>({...f,rating:n}))} style={{background:'none',border:'none',cursor:'pointer',fontSize:22,color:n<=rForm.rating?GOLD:'var(--s3)',padding:0}}>★</button>)}
                </div>
              </div>
            )}
            <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:16}}>
              <button onClick={()=>setRModal(false)} style={{padding:'9px 18px',borderRadius:'var(--r)',border:'1px solid var(--br)',background:'transparent',color:'var(--text3)',cursor:'pointer',fontFamily:"'Sora',sans-serif"}}>Cancel</button>
              <button onClick={saveResource} style={{padding:'9px 20px',borderRadius:'var(--r)',border:'none',background:'linear-gradient(135deg,var(--gold),var(--gold3))',color:'#000',fontWeight:700,cursor:'pointer',fontFamily:"'Sora',sans-serif"}}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ AUDIO MODAL ══════════════════════════════════ */}
      {aModal&&(
        <div style={OVERLAY} onClick={e=>{if(e.target===e.currentTarget)setAModal(false)}}>
          <div style={{...MODAL,maxWidth:440}}>
            <div style={{fontSize:16,fontWeight:700,marginBottom:16}}>{aEdit?'Edit':'Add'} Underground Audio</div>
            <div style={{marginBottom:10}}>
              <div style={FL}>Title *</div>
              <input value={aForm.title} onChange={e=>setAForm(f=>({...f,title:e.target.value}))} placeholder="Training call, function, session…" style={INP}/>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
              <div><div style={FL}>Speaker</div><input value={aForm.speaker} onChange={e=>setAForm(f=>({...f,speaker:e.target.value}))} style={INP}/></div>
              <div><div style={FL}>Duration</div><input value={aForm.duration} onChange={e=>setAForm(f=>({...f,duration:e.target.value}))} placeholder="e.g. 45 min" style={INP}/></div>
            </div>
            <div style={{marginBottom:10}}>
              <div style={FL}>Audio Link</div>
              <input value={aForm.url} onChange={e=>setAForm(f=>({...f,url:e.target.value}))} placeholder="https://…" style={INP}/>
            </div>
            <div style={{marginBottom:10}}>
              <div style={FL}>Notes</div>
              <textarea value={aForm.notes} onChange={e=>setAForm(f=>({...f,notes:e.target.value}))} rows={2} style={{...INP,resize:'vertical' as const}}/>
            </div>
            <div style={{marginBottom:10}}>
              <div style={{...FL,color:TEAL}}>One Action I'll Take</div>
              <input value={aForm.act} onChange={e=>setAForm(f=>({...f,act:e.target.value}))} placeholder="Apply this by…" style={INP}/>
            </div>
            <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:16}}>
              <button onClick={()=>setAModal(false)} style={{padding:'9px 18px',borderRadius:'var(--r)',border:'1px solid var(--br)',background:'transparent',color:'var(--text3)',cursor:'pointer',fontFamily:"'Sora',sans-serif"}}>Cancel</button>
              <button onClick={saveAudio} style={{padding:'9px 20px',borderRadius:'var(--r)',border:'none',background:'linear-gradient(135deg,var(--gold),var(--gold3))',color:'#000',fontWeight:700,cursor:'pointer',fontFamily:"'Sora',sans-serif"}}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ GOAL MODAL ═══════════════════════════════════ */}
      {gModal&&(
        <div style={OVERLAY} onClick={e=>{if(e.target===e.currentTarget)setGModal(false)}}>
          <div style={{...MODAL,maxWidth:420}}>
            <div style={{fontSize:16,fontWeight:700,marginBottom:16}}>Add Goal</div>
            <div style={{marginBottom:10}}>
              <div style={FL}>Goal *</div>
              <textarea value={gForm.text} onChange={e=>setGForm(f=>({...f,text:e.target.value}))} rows={2} placeholder="What do you want to achieve?" style={{...INP,resize:'vertical' as const}}/>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
              <div><div style={FL}>Timeframe</div><input value={gForm.timeframe} onChange={e=>setGForm(f=>({...f,timeframe:e.target.value}))} placeholder="e.g. 90 days, 3 years" style={INP}/></div>
              <div><div style={FL}>Category</div><select value={gForm.category} onChange={e=>setGForm(f=>({...f,category:e.target.value}))} style={INP}>{GOAL_CATS.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
            </div>
            <div style={{marginBottom:10}}>
              <div style={FL}>Target Date (optional)</div>
              <input type="date" value={gForm.target_date} onChange={e=>setGForm(f=>({...f,target_date:e.target.value}))} style={INP}/>
            </div>
            <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:16}}>
              <button onClick={()=>setGModal(false)} style={{padding:'9px 18px',borderRadius:'var(--r)',border:'1px solid var(--br)',background:'transparent',color:'var(--text3)',cursor:'pointer',fontFamily:"'Sora',sans-serif"}}>Cancel</button>
              <button onClick={saveGoal} style={{padding:'9px 20px',borderRadius:'var(--r)',border:'none',background:'linear-gradient(135deg,var(--gold),var(--gold3))',color:'#000',fontWeight:700,cursor:'pointer',fontFamily:"'Sora',sans-serif"}}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ INSIGHT MODAL ════════════════════════════════ */}
      {iModal&&(
        <div style={OVERLAY} onClick={e=>{if(e.target===e.currentTarget)setIModal(false)}}>
          <div style={{...MODAL,maxWidth:440}}>
            <div style={{fontSize:16,fontWeight:700,marginBottom:16}}>Capture Insight</div>
            <div style={{marginBottom:10}}>
              <div style={FL}>Insight *</div>
              <textarea value={iForm.text} onChange={e=>setIForm(f=>({...f,text:e.target.value}))} rows={3} placeholder="What did you learn?" style={{...INP,resize:'vertical' as const}}/>
            </div>
            <div style={{marginBottom:10}}>
              <div style={FL}>Tags</div>
              <div style={{display:'flex',gap:5,flexWrap:'wrap' as const}}>
                {INSIGHT_TAGS.map(t=>{
                  const on=iForm.tags.includes(t)
                  return <button key={t} onClick={()=>setIForm(f=>({...f,tags:on?f.tags.filter(x=>x!==t):[...f.tags,t]}))} style={{fontSize:10,padding:'4px 10px',borderRadius:20,border:`1px solid ${on?PURPLE:'var(--br)'}`,background:on?`${PURPLE}15`:'var(--s2)',color:on?PURPLE:'var(--text4)',cursor:'pointer',fontFamily:"'Sora',sans-serif",fontWeight:on?700:400}}>{t}</button>
                })}
              </div>
            </div>
            <div style={{marginBottom:10}}>
              <div style={FL}>Source (optional)</div>
              <input value={iForm.source} onChange={e=>setIForm(f=>({...f,source:e.target.value}))} placeholder="Book, mentor, call…" style={INP}/>
            </div>
            <div style={{marginBottom:10}}>
              <div style={{...FL,color:TEAL}}>One Action I'll Take (optional)</div>
              <input value={iForm.apply_action} onChange={e=>setIForm(f=>({...f,apply_action:e.target.value}))} placeholder="How will I use this?" style={INP}/>
            </div>
            <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:16}}>
              <button onClick={()=>setIModal(false)} style={{padding:'9px 18px',borderRadius:'var(--r)',border:'1px solid var(--br)',background:'transparent',color:'var(--text3)',cursor:'pointer',fontFamily:"'Sora',sans-serif"}}>Cancel</button>
              <button onClick={saveInsight} style={{padding:'9px 20px',borderRadius:'var(--r)',border:'none',background:'linear-gradient(135deg,var(--gold),var(--gold3))',color:'#000',fontWeight:700,cursor:'pointer',fontFamily:"'Sora',sans-serif"}}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
