'use client'
import React, { useEffect, useState, useMemo } from 'react'
import { useStore } from '@/lib/stores'
import { uid, now, today } from '@/lib/utils'
import type { Resource } from '@/lib/stores'

const CATS = ['Leadership','Mindset','Business','Skills','Health','Other']
const TYPES = ['Book','Podcast','Course','Video','Article','Other']
const GOAL_CATS = ['Business','Financial','Personal','Health','Family','Lifestyle']

const GOLD='var(--gold)';const GREEN='var(--green)';const BLUE='var(--blue)';const TEAL='var(--teal)'
const SL:React.CSSProperties={fontSize:9,color:'var(--text3)',letterSpacing:'2px',textTransform:'uppercase' as const,fontWeight:700,marginBottom:6}
const INP:React.CSSProperties={width:'100%',background:'var(--s2)',border:'1px solid var(--br2)',borderRadius:'var(--r)',padding:'9px 12px',color:'var(--text)',fontSize:13,fontFamily:"'Sora',sans-serif",outline:'none',boxSizing:'border-box' as const}
const OVERLAY:React.CSSProperties={position:'fixed',inset:0,background:'rgba(0,0,0,0.88)',zIndex:500,display:'flex',alignItems:'center',justifyContent:'center',padding:20,backdropFilter:'blur(8px)',overflowY:'auto' as const}
const MODAL:React.CSSProperties={background:'var(--s1)',border:'1px solid var(--br)',borderRadius:'var(--r3)',width:'100%',maxWidth:500,padding:24,maxHeight:'90vh',overflowY:'auto' as const,margin:'auto'}
const FL:React.CSSProperties={fontSize:10,color:GOLD,fontWeight:700,letterSpacing:'1.5px',textTransform:'uppercase' as const,marginBottom:5}
const FLt:React.CSSProperties={fontSize:10,color:TEAL,fontWeight:700,letterSpacing:'1.5px',textTransform:'uppercase' as const,marginBottom:5}

function decodeRes(r:Resource){
  const raw=r.key_takeaway||''
  const prog=parseInt((raw.match(/\[\[PROG:(\d+)\]\]/)||[])[1]||'0',10)
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

interface ActionStep { id:string; text:string }
interface Goal {
  id:string; text:string; description:string; why:string
  timeframe:string; target_date:string; category:string
  done:boolean; progress:number; action_steps:ActionStep[]; created_at:string
}
interface Note { id:string; title:string; text:string; created_at:string }

type Tab='vision'|'reading'|'notes'

export default function PersonalDev(){
  const { resources, userId, upsertResource, deleteResource,
          loadResources, habits, getMeta, setMeta } = useStore()

  const [tab,setTab]         = useState<Tab>('vision')
  const [rModal,setRModal]   = useState(false)
  const [rEdit,setREdit]     = useState<Resource|null>(null)
  const [rForm,setRForm]     = useState({title:'',type:'Book',category:'Mindset',author:'',url:'',takeaway:'',status:'reading',rating:5,prog:0,act:'',actDone:false})
  const [rFilter,setRFilter] = useState('all')
  const [rSort,setRSort]     = useState<'recent'|'progress'|'rating'>('recent')

  const [goals,setGoals]     = useState<Goal[]>([])
  const [gModal,setGModal]   = useState(false)
  const [gEdit,setGEdit]     = useState<Goal|null>(null)
  const [gForm,setGForm]     = useState({text:'',description:'',why:'',timeframe:'1 year',target_date:'',category:'Business',progress:0})
  const [gSteps,setGSteps]   = useState<ActionStep[]>([])
  const [gStepInput,setGStepInput] = useState('')

  const [notes,setNotes]     = useState<Note[]>([])
  const [nModal,setNModal]   = useState(false)
  const [nForm,setNForm]     = useState({title:'',text:''})
  const [nSearch,setNSearch] = useState('')

  // action checkins: { [date]: { [stepId]: boolean } }
  const [actionCheckins,setActionCheckins] = useState<Record<string,Record<string,boolean>>>({})

  useEffect(()=>{ loadResources() },[]) // eslint-disable-line
  useEffect(()=>{
    getMeta('pd_goals').then(v=>{ if(v)try{setGoals(JSON.parse(v))}catch{} })
    getMeta('pd_notes').then(v=>{ if(v)try{setNotes(JSON.parse(v))}catch{} })
    getMeta('pd_action_checkins').then(v=>{ if(v)try{setActionCheckins(JSON.parse(v))}catch{} })
  },[]) // eslint-disable-line

  async function saveGoals(next:Goal[]){ setGoals(next); try{await setMeta('pd_goals',JSON.stringify(next))}catch(e){console.error('saveGoals failed:',e)} }
  async function saveNotes(next:Note[]){ setNotes(next); try{await setMeta('pd_notes',JSON.stringify(next))}catch(e){console.error('saveNotes failed:',e)} }

  // ── GROWTH (based on goal action checkins) ──────────────
  const growth = useMemo(()=>{
    const last30:string[]=[]
    for(let i=0;i<30;i++){const d=new Date();d.setDate(d.getDate()-i);last30.push(d.toLocaleDateString('en-CA',{timeZone:'Australia/Brisbane'}))}
    const dayHasGrowth=(d:string)=>{
      const checkins=actionCheckins[d]
      if(checkins && Object.values(checkins).some(v=>v)) return true
      // fallback: habit activity if no goal steps defined yet
      if(goals.flatMap(g=>g.action_steps||[]).length===0){
        const h=(habits as any)[d]
        return !!(h && (h.convo>0||h.mg1>0||h.mpa>0||h.contact>0))
      }
      return false
    }
    let streak=0
    for(let i=0;i<30;i++){
      const d=new Date();d.setDate(d.getDate()-i)
      if(dayHasGrowth(d.toLocaleDateString('en-CA',{timeZone:'Australia/Brisbane'})))streak++; else break
    }
    const last7=last30.slice(0,7)
    const weekDone=last7.filter(dayHasGrowth).length
    return {streak,weekDone,last30,dayHasGrowth}
  },[actionCheckins,habits,goals])

  // ── RESOURCE SAVE ───────────────────────────────────────
  function openResAdd(){ setREdit(null); setRForm({title:'',type:'Book',category:'Mindset',author:'',url:'',takeaway:'',status:'reading',rating:5,prog:0,act:'',actDone:false}); setRModal(true) }
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

  // ── GOAL SAVE ───────────────────────────────────────────
  function openGoalAdd(){
    setGEdit(null)
    setGForm({text:'',description:'',why:'',timeframe:'1 year',target_date:'',category:'Business',progress:0})
    setGSteps([])
    setGStepInput('')
    setGModal(true)
  }
  function openGoalEdit(g:Goal){
    setGEdit(g)
    setGForm({text:g.text,description:g.description||'',why:g.why||'',timeframe:g.timeframe,target_date:g.target_date,category:g.category,progress:g.progress||0})
    setGSteps(g.action_steps||[])
    setGStepInput('')
    setGModal(true)
  }
  function addStep(){
    if(!gStepInput.trim())return
    setGSteps(s=>[...s,{id:uid(),text:gStepInput.trim()}])
    setGStepInput('')
  }
  function saveGoal(){
    if(!gForm.text.trim())return
    if(gEdit){
      saveGoals(goals.map(x=>x.id===gEdit.id?{...x,...gForm,action_steps:gSteps,done:gForm.progress>=100}:x))
    } else {
      const g:Goal={id:uid(),text:gForm.text.trim(),description:gForm.description,why:gForm.why,timeframe:gForm.timeframe,target_date:gForm.target_date,category:gForm.category,done:false,progress:0,action_steps:gSteps,created_at:now()}
      saveGoals([...goals,g])
    }
    setGModal(false); setGEdit(null)
    setGForm({text:'',description:'',why:'',timeframe:'1 year',target_date:'',category:'Business',progress:0})
    setGSteps([]); setGStepInput('')
  }
  function updateProgress(g:Goal,progress:number){
    saveGoals(goals.map(x=>x.id===g.id?{...x,progress,done:progress>=100}:x))
  }

  // ── NOTE SAVE ───────────────────────────────────────────
  function saveNote(){
    if(!nForm.text.trim())return
    const n:Note={id:uid(),title:nForm.title.trim(),text:nForm.text.trim(),created_at:now()}
    saveNotes([n,...notes]); setNModal(false); setNForm({title:'',text:''})
  }

  // ── DERIVED ─────────────────────────────────────────────
  const reading = resources.filter(r=>r.status==='reading')
  const sortedResources = useMemo(()=>{
    let list=rFilter==='all'?resources:rFilter==='reading'?resources.filter(r=>r.status==='reading'):rFilter==='done'?resources.filter(r=>r.status==='done'):rFilter==='queued'?resources.filter(r=>r.status==='queued'):resources.filter(r=>r.category===rFilter)
    return [...list].sort((a,b)=>{
      if(rSort==='progress')return decodeRes(b).prog-decodeRes(a).prog
      if(rSort==='rating')return b.rating-a.rating
      return b.created_at.localeCompare(a.created_at)
    })
  },[resources,rFilter,rSort])

  const filteredNotes = useMemo(()=>{
    if(!nSearch)return notes
    const q=nSearch.toLowerCase()
    return notes.filter(n=>n.title.toLowerCase().includes(q)||n.text.toLowerCase().includes(q))
  },[notes,nSearch])

  const statusColor=(s:string)=>s==='done'?GREEN:s==='reading'?GOLD:'var(--text3)'

  const TABS=[
    {id:'vision'  as const, label:'🎯 Vision'},
    {id:'reading' as const, label:'📚 Reading'},
    {id:'notes'   as const, label:'📝 Notes'},
  ]

  return(
    <div style={{animation:'fade-in 0.3s ease',paddingBottom:60}}>

      <div style={{display:'flex',justifyContent:'flex-end',marginBottom:14}}>
        <button onClick={()=>{tab==='reading'?openResAdd():tab==='notes'?setNModal(true):openGoalAdd()}}
          style={{padding:'8px 16px',borderRadius:'var(--r)',border:'none',background:'linear-gradient(135deg,var(--gold3),var(--gold))',color:'#000',fontWeight:700,cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:12}}>
          + Add {tab==='reading'?'Resource':tab==='notes'?'Note':'Goal'}
        </button>
      </div>

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
          {/* Streak strip */}
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
              <div style={{fontSize:9,color:'var(--text4)',marginTop:4}}>books done</div>
            </div>
          </div>

          {/* 30-day grid (based on goal action checkins) */}
          <div style={{background:'var(--s1)',border:'1px solid var(--br)',borderRadius:'var(--r2)',padding:'14px',marginBottom:14}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
              <div style={SL}>30-Day Consistency — Goal Actions</div>
            </div>
            <div style={{display:'flex',gap:3,flexWrap:'wrap' as const}}>
              {growth.last30.slice().reverse().map(d=>{
                const on=growth.dayHasGrowth(d)
                const isToday=d===new Date().toLocaleDateString('en-CA',{timeZone:'Australia/Brisbane'})
                return <div key={d} title={d} style={{width:18,height:18,borderRadius:4,background:on?GREEN:'var(--s3)',border:isToday?`2px solid ${GOLD}`:'1px solid var(--br)',flexShrink:0}}/>
              })}
            </div>
            <div style={{fontSize:9,color:'var(--text4)',marginTop:8}}>Green = at least one goal action completed. Check them off in Habits → Log.</div>
          </div>

          {/* Goal summary tiles */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,marginBottom:14}}>
            <div style={{background:'var(--s1)',border:'1px solid var(--br)',borderRadius:'var(--r2)',padding:'14px',textAlign:'center' as const}}>
              <div className="mono" style={{fontSize:24,fontWeight:800,color:GOLD,lineHeight:1}}>{goals.length}</div>
              <div style={{fontSize:9,color:'var(--text4)',marginTop:4}}>goals set</div>
            </div>
            <div style={{background:'var(--s1)',border:'1px solid var(--br)',borderRadius:'var(--r2)',padding:'14px',textAlign:'center' as const}}>
              <div className="mono" style={{fontSize:24,fontWeight:800,color:GREEN,lineHeight:1}}>{goals.filter(g=>g.done).length}</div>
              <div style={{fontSize:9,color:'var(--text4)',marginTop:4}}>achieved</div>
            </div>
            <div style={{background:'var(--s1)',border:'1px solid var(--br)',borderRadius:'var(--r2)',padding:'14px',textAlign:'center' as const}}>
              <div className="mono" style={{fontSize:24,fontWeight:800,color:BLUE,lineHeight:1}}>{goals.filter(g=>!g.done&&(g.progress||0)>0).length}</div>
              <div style={{fontSize:9,color:'var(--text4)',marginTop:4}}>in progress</div>
            </div>
          </div>

          {/* Goals list */}
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
            <div style={SL}>Goals & Vision</div>
            <button onClick={openGoalAdd} style={{fontSize:10,padding:'4px 10px',borderRadius:'var(--r)',border:`1px solid ${GOLD}30`,background:`${GOLD}0C`,color:GOLD,cursor:'pointer',fontFamily:"'Sora',sans-serif"}}>+ Goal</button>
          </div>

          {goals.length===0
            ?<div style={{textAlign:'center' as const,padding:'40px',color:'var(--text4)',fontSize:13,border:'1px dashed var(--br)',borderRadius:'var(--r2)'}}>Define your why. Add your first goal — include action steps and it will appear in your daily Habits log.</div>
            :goals.map(g=>{
              const prog=g.progress||0
              const progColor=prog>=100?GREEN:prog>=50?GOLD:BLUE
              const steps=g.action_steps||[]
              return(
                <div key={g.id} style={{background:'var(--s1)',border:'1px solid var(--br)',borderRadius:'var(--r2)',padding:'14px',marginBottom:10,opacity:g.done?0.7:1}}>
                  <div style={{display:'flex',gap:10,alignItems:'flex-start',marginBottom:8}}>
                    <button onClick={()=>saveGoals(goals.map(x=>x.id===g.id?{...x,done:!x.done,progress:x.done?x.progress:100}:x))}
                      style={{width:22,height:22,borderRadius:'50%',flexShrink:0,marginTop:2,background:g.done?GREEN:'transparent',border:`2px solid ${g.done?GREEN:'var(--br2)'}`,cursor:'pointer',color:'#000',fontSize:11,fontWeight:700}}>
                      {g.done?'✓':''}
                    </button>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:700,marginBottom:3,textDecoration:g.done?'line-through':'none',cursor:'pointer',color:'var(--text)'}} onClick={()=>openGoalEdit(g)}>
                        {g.text}
                      </div>
                      {g.description&&<div style={{fontSize:11,color:'var(--text3)',marginBottom:3,lineHeight:1.5}}>{g.description}</div>}
                      {g.why&&<div style={{fontSize:10,color:GOLD,fontStyle:'italic' as const,marginBottom:5}}>Why: {g.why}</div>}
                      <div style={{display:'flex',gap:6,flexWrap:'wrap' as const,alignItems:'center'}}>
                        <span style={{fontSize:10,padding:'1px 8px',borderRadius:8,background:`${GOLD}10`,color:GOLD}}>{g.timeframe}</span>
                        <span style={{fontSize:10,padding:'1px 8px',borderRadius:8,background:'var(--s2)',color:'var(--text4)'}}>{g.category}</span>
                        {g.target_date&&<span style={{fontSize:10,color:'var(--text4)'}}>by {new Date(g.target_date).toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'})}</span>}
                        <span style={{fontSize:10,fontWeight:700,color:progColor}}>{prog}%</span>
                      </div>
                    </div>
                    <button onClick={()=>saveGoals(goals.filter(x=>x.id!==g.id))} style={{background:'none',border:'none',color:'var(--text4)',cursor:'pointer',fontSize:16,flexShrink:0}}>×</button>
                  </div>

                  {/* Progress bar + quick set */}
                  <div style={{paddingLeft:32}}>
                    <div style={{height:6,background:'var(--s3)',borderRadius:3,overflow:'hidden',marginBottom:7}}>
                      <div style={{height:'100%',width:prog+'%',background:progColor,borderRadius:3,transition:'width 0.3s'}}/>
                    </div>
                    {!g.done&&(
                      <div style={{display:'flex',gap:4,marginBottom:steps.length>0?10:0}}>
                        {[25,50,75,100].map(p=>(
                          <button key={p} onClick={()=>updateProgress(g,p)}
                            style={{fontSize:9,padding:'2px 8px',borderRadius:6,border:`1px solid ${prog>=p?progColor:'var(--br)'}`,background:prog>=p?`${progColor}15`:'transparent',color:prog>=p?progColor:'var(--text4)',cursor:'pointer',fontFamily:"'Sora',sans-serif",fontWeight:prog>=p?700:400}}>
                            {p}%
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Action steps (read-only list) */}
                    {steps.length>0&&(
                      <div>
                        <div style={{fontSize:9,color:TEAL,fontWeight:700,letterSpacing:'1.5px',textTransform:'uppercase' as const,marginBottom:5}}>Daily Actions — checked off in Habits</div>
                        {steps.map(s=>(
                          <div key={s.id} style={{display:'flex',alignItems:'center',gap:8,padding:'4px 0',borderBottom:'1px solid var(--br)'}}>
                            <div style={{width:6,height:6,borderRadius:'50%',background:TEAL,flexShrink:0}}/>
                            <span style={{fontSize:11,color:'var(--text2)'}}>{s.text}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )
            })
          }
        </div>
      )}

      {/* ═══ READING TAB ══════════════════════════════════ */}
      {tab==='reading'&&(
        <div>
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

      {/* ═══ NOTES TAB ════════════════════════════════════ */}
      {tab==='notes'&&(
        <div>
          <input value={nSearch} onChange={e=>setNSearch(e.target.value)} placeholder="Search notes…" style={{...INP,marginBottom:12}}/>
          {filteredNotes.length===0
            ?<div style={{textAlign:'center' as const,padding:'48px',color:'var(--text4)',fontSize:13,border:'1px dashed var(--br)',borderRadius:'var(--r2)'}}>No notes yet. Capture ideas, lessons, and things to remember.</div>
            :filteredNotes.map(n=>(
              <div key={n.id} style={{background:'var(--s1)',border:'1px solid var(--br)',borderRadius:'var(--r2)',padding:'14px 16px',marginBottom:10,display:'flex',gap:12,alignItems:'flex-start'}}>
                <div style={{flex:1,minWidth:0}}>
                  {n.title&&<div style={{fontSize:13,fontWeight:700,marginBottom:5,color:'var(--text)'}}>{n.title}</div>}
                  <div style={{fontSize:13,color:'var(--text2)',lineHeight:1.6,whiteSpace:'pre-wrap' as const}}>{n.text}</div>
                  <div style={{fontSize:9,color:'var(--text4)',marginTop:6}}>{new Date(n.created_at).toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'})}</div>
                </div>
                <button onClick={()=>saveNotes(notes.filter(x=>x.id!==n.id))} style={{background:'none',border:'none',color:'var(--text4)',cursor:'pointer',fontSize:16,padding:0,flexShrink:0}}>×</button>
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
                <input type="range" min={0} max={100} step={5} value={rForm.prog} onChange={e=>setRForm(f=>({...f,prog:parseInt(e.target.value,10)}))} style={{width:'100%',accentColor:GOLD}}/>
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
              <div style={FLt}>One Action I'll Take</div>
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

      {/* ═══ GOAL MODAL ═══════════════════════════════════ */}
      {gModal&&(
        <div style={OVERLAY} onClick={e=>{if(e.target===e.currentTarget){setGModal(false);setGEdit(null)}}}>
          <div style={MODAL}>
            <div style={{fontSize:16,fontWeight:700,marginBottom:16}}>{gEdit?'Edit':'Add'} Goal</div>

            <div style={{marginBottom:10}}>
              <div style={FL}>Goal *</div>
              <input value={gForm.text} onChange={e=>setGForm(f=>({...f,text:e.target.value}))} placeholder="What exactly do you want to achieve?" style={INP}/>
            </div>
            <div style={{marginBottom:10}}>
              <div style={FL}>What does success look like?</div>
              <textarea value={gForm.description} onChange={e=>setGForm(f=>({...f,description:e.target.value}))} rows={2} placeholder="Be specific — numbers, dates, outcomes. What will you see/feel/have?" style={{...INP,resize:'vertical' as const}}/>
            </div>
            <div style={{marginBottom:10}}>
              <div style={{...FL,color:GOLD}}>Why does this matter to you?</div>
              <textarea value={gForm.why} onChange={e=>setGForm(f=>({...f,why:e.target.value}))} rows={2} placeholder="The deep reason — not the surface answer" style={{...INP,resize:'vertical' as const}}/>
            </div>

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
              <div><div style={FL}>Timeframe</div><input value={gForm.timeframe} onChange={e=>setGForm(f=>({...f,timeframe:e.target.value}))} placeholder="90 days / 1 year / 5 years" style={INP}/></div>
              <div><div style={FL}>Category</div><select value={gForm.category} onChange={e=>setGForm(f=>({...f,category:e.target.value}))} style={INP}>{GOAL_CATS.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
            </div>
            <div style={{marginBottom:14}}>
              <div style={FL}>Target Date (optional)</div>
              <input type="date" value={gForm.target_date} onChange={e=>setGForm(f=>({...f,target_date:e.target.value}))} style={INP}/>
            </div>

            {/* Action steps */}
            <div style={{marginBottom:14,padding:'14px',background:'var(--s0)',borderRadius:'var(--r2)',border:`1px solid ${TEAL}25`}}>
              <div style={FLt}>Daily Action Steps</div>
              <div style={{fontSize:10,color:'var(--text4)',marginBottom:10}}>These appear as daily checkboxes in your Habits log. Be specific — what exactly will you do each day?</div>
              {gSteps.map((s,i)=>(
                <div key={s.id} style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
                  <div style={{width:6,height:6,borderRadius:'50%',background:TEAL,flexShrink:0}}/>
                  <span style={{flex:1,fontSize:12,color:'var(--text2)'}}>{s.text}</span>
                  <button onClick={()=>setGSteps(steps=>steps.filter((_,j)=>j!==i))} style={{background:'none',border:'none',color:'var(--text4)',cursor:'pointer',fontSize:14,padding:0,flexShrink:0}}>×</button>
                </div>
              ))}
              <div style={{display:'flex',gap:8,marginTop:8}}>
                <input
                  value={gStepInput}
                  onChange={e=>setGStepInput(e.target.value)}
                  onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();addStep()}}}
                  placeholder="e.g. Contact 3 new people today"
                  style={{...INP,flex:1,fontSize:12}}
                />
                <button onClick={addStep} style={{padding:'8px 14px',borderRadius:'var(--r)',border:`1px solid ${TEAL}40`,background:`${TEAL}0C`,color:TEAL,cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:11,fontWeight:700,flexShrink:0}}>+ Add</button>
              </div>
            </div>

            {gEdit&&(
              <div style={{marginBottom:10}}>
                <div style={FL}>Progress — {gForm.progress}%</div>
                <input type="range" min={0} max={100} step={5} value={gForm.progress} onChange={e=>setGForm(f=>({...f,progress:parseInt(e.target.value,10)}))} style={{width:'100%',accentColor:GOLD}}/>
              </div>
            )}

            <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:16}}>
              <button onClick={()=>{setGModal(false);setGEdit(null)}} style={{padding:'9px 18px',borderRadius:'var(--r)',border:'1px solid var(--br)',background:'transparent',color:'var(--text3)',cursor:'pointer',fontFamily:"'Sora',sans-serif"}}>Cancel</button>
              <button onClick={saveGoal} style={{padding:'9px 20px',borderRadius:'var(--r)',border:'none',background:'linear-gradient(135deg,var(--gold),var(--gold3))',color:'#000',fontWeight:700,cursor:'pointer',fontFamily:"'Sora',sans-serif"}}>Save Goal</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ NOTE MODAL ═══════════════════════════════════ */}
      {nModal&&(
        <div style={OVERLAY} onClick={e=>{if(e.target===e.currentTarget)setNModal(false)}}>
          <div style={{...MODAL,maxWidth:440}}>
            <div style={{fontSize:16,fontWeight:700,marginBottom:16}}>New Note</div>
            <div style={{marginBottom:10}}>
              <div style={FL}>Title (optional)</div>
              <input value={nForm.title} onChange={e=>setNForm(f=>({...f,title:e.target.value}))} placeholder="Note title…" style={INP}/>
            </div>
            <div style={{marginBottom:10}}>
              <div style={FL}>Note *</div>
              <textarea value={nForm.text} onChange={e=>setNForm(f=>({...f,text:e.target.value}))} rows={5} placeholder="Write anything — ideas, lessons, things to remember…" style={{...INP,resize:'vertical' as const}}/>
            </div>
            <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:16}}>
              <button onClick={()=>setNModal(false)} style={{padding:'9px 18px',borderRadius:'var(--r)',border:'1px solid var(--br)',background:'transparent',color:'var(--text3)',cursor:'pointer',fontFamily:"'Sora',sans-serif"}}>Cancel</button>
              <button onClick={saveNote} style={{padding:'9px 20px',borderRadius:'var(--r)',border:'none',background:'linear-gradient(135deg,var(--gold),var(--gold3))',color:'#000',fontWeight:700,cursor:'pointer',fontFamily:"'Sora',sans-serif"}}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
