'use client'
import React, { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase/client'
import type { Candidate, ContactLog } from '@/lib/stores/types'

const GOLD='var(--gold)';const GREEN='var(--green)';const RED='var(--red)';const ORANGE='var(--orange)'
const CARD:React.CSSProperties={background:'var(--s1)',border:'1px solid var(--br)',borderRadius:'var(--r2)',padding:'16px',marginBottom:10}
const SL:React.CSSProperties={fontSize:9,color:'var(--text3)',letterSpacing:'2px',textTransform:'uppercase',fontWeight:700,marginBottom:6}

const STAGES=['Pre-Filter','MG1','MG2','FU1','FU2','FU3','Offer Questions','Offer Call'] as const
type Stage=typeof STAGES[number]
const STAGE_CFG:Record<Stage,{color:string;bg:string}> = {
  'Pre-Filter':     {color:'var(--blue)',   bg:'rgba(91,155,213,0.12)'},
  'MG1':            {color:'var(--purple)', bg:'rgba(155,91,213,0.12)'},
  'MG2':            {color:'var(--teal)',   bg:'rgba(91,213,155,0.12)'},
  'FU1':            {color:'var(--gold)',   bg:'rgba(200,162,74,0.12)'},
  'FU2':            {color:'var(--gold)',   bg:'rgba(200,162,74,0.10)'},
  'FU3':            {color:ORANGE,          bg:'rgba(232,145,58,0.12)'},
  'Offer Questions':{color:ORANGE,          bg:'rgba(232,145,58,0.10)'},
  'Offer Call':     {color:'var(--green)',  bg:'rgba(76,175,125,0.12)'},
}

const GOAL_LABELS:Record<string,string>={
  mg1:'MG1s',convo:'Convos',mpa:'MPAs',catch_up:'Catch-Ups',dtm:'DTMs',pre_filter:'Pre-Filters',launch:'Launches',contact:'Contacts'
}

function daysSince(d:string){return d?Math.floor((Date.now()-new Date(d).getTime())/86400000):999}
function normaliseStage(s:string):Stage{
  const map:Record<string,Stage>={'Pre-Filter':'Pre-Filter','MG1':'MG1','MG2':'MG2','FU1':'FU1','FU2':'FU2','FU3':'FU3','Follow-Up':'FU1','Offer Questions':'Offer Questions','Offer Call':'Offer Call'}
  return map[s]??'Pre-Filter'
}
function getSponsorIbo(c:Candidate):string{try{return JSON.parse(c.interview_notes||'{}')._sponsor_ibo??''}catch{return''}}
function healthScore(c:Candidate,lastLog:ContactLog|undefined):number{
  const hxl=Math.min(100,c.hxl_score??((c.hunger??5)*(c.looking??5)))
  const ds=lastLog?daysSince(lastLog.created_at):daysSince(c.updated_at)
  const recency=Math.max(0,100-ds*14)
  const depth=(STAGES.indexOf(normaliseStage(c.stage))+1)*12.5
  return Math.round(hxl*0.5+recency*0.3+depth*0.2)
}
function healthColor(s:number){return s>=70?GREEN:s>=45?GOLD:RED}
function fmtDate(iso:string){
  try{return new Date(iso).toLocaleDateString('en-AU',{month:'short',day:'numeric'})}catch{return ''}
}

interface CoreGoals{goalField:string;goalMonthly:number;deadline:string;overrides:Record<string,number>}

export default function TeamCandidates({level,adminGoals}:{level:number;adminGoals?:CoreGoals|null}){
  const [candidates,setCandidates]=useState<Candidate[]>([])
  const [logs,setLogs]=useState<ContactLog[]>([])
  const [memberMap,setMemberMap]=useState<Record<string,string>>({})
  const [loading,setLoading]=useState(true)
  const [search,setSearch]=useState('')
  const [selectedIbo,setSelectedIbo]=useState<string|null>(null)

  useEffect(()=>{
    if(level<4){setLoading(false);return}
    async function load(){
      setLoading(true)
      try{
        const {data:{session}}=await supabase.auth.getSession()
        const token=session?.access_token||''
        const resp=await fetch('/api/team/downline-candidates',{headers:{Authorization:`Bearer ${token}`}})
        if(!resp.ok)return
        const d=await resp.json()
        setCandidates(d.candidates||[])
        setLogs(d.logs||[])
        setMemberMap(d.memberMap||{})
      }finally{setLoading(false)}
    }
    load()
  },[level])

  const partnerIbos=useMemo(()=>Array.from(new Set(candidates.map(c=>getSponsorIbo(c)))).filter(Boolean),[candidates])

  const scores=useMemo(()=>{
    const m:Record<string,number>={}
    candidates.forEach(c=>{
      const last=logs.filter(l=>l.entity_id===c.id).sort((a,b)=>b.created_at.localeCompare(a.created_at))[0]
      m[c.id]=healthScore(c,last)
    })
    return m
  },[candidates,logs])

  const memberStats=useMemo(()=>{
    const s:Record<string,{active:number;launched:number;dqd:number;avgHealth:number}>={}
    partnerIbos.forEach(ibo=>{
      const mbr=candidates.filter(c=>getSponsorIbo(c)===ibo)
      const active=mbr.filter(c=>c.status==='active')
      const avgHealth=active.length?Math.round(active.reduce((acc,c)=>acc+(scores[c.id]??0),0)/active.length):0
      s[ibo]={active:active.length,launched:mbr.filter(c=>c.status==='launched').length,dqd:mbr.filter(c=>c.status==='disqualified').length,avgHealth}
    })
    return s
  },[partnerIbos,candidates,scores])

  const drawerCandidates=useMemo(()=>{
    if(!selectedIbo)return[]
    return candidates
      .filter(c=>getSponsorIbo(c)===selectedIbo&&c.status==='active')
      .sort((a,b)=>(scores[b.id]??0)-(scores[a.id]??0))
  },[selectedIbo,candidates,scores])

  const filteredIbos=useMemo(()=>{
    if(!search)return partnerIbos
    const q=search.toLowerCase()
    return partnerIbos.filter(ibo=>(memberMap[ibo]||ibo).toLowerCase().includes(q))
  },[partnerIbos,memberMap,search])

  if(level<4){
    return(
      <div style={{textAlign:'center',padding:'60px 20px'}}>
        <div style={{fontSize:32,marginBottom:12}}>🔒</div>
        <div style={{fontSize:15,fontWeight:700,color:'var(--text2)',marginBottom:8}}>Level 4 Required</div>
        <div style={{fontSize:12,color:'var(--text4)'}}>Team view is only available to Level 4 leaders.</div>
      </div>
    )
  }

  if(loading)return<div style={{padding:'48px',textAlign:'center',color:'var(--text4)',fontSize:12}}>Loading team…</div>

  const totalActive=candidates.filter(c=>c.status==='active').length
  const totalLaunched=candidates.filter(c=>c.status==='launched').length

  return(
    <div style={{animation:'fade-in 0.3s ease',paddingBottom:80}}>

      {/* Goals strip */}
      {adminGoals&&(
        <div style={{...CARD,marginBottom:14,background:'rgba(200,162,74,0.04)',borderColor:'rgba(200,162,74,0.18)'}}>
          <div style={SL}>TEAM GOAL</div>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:12}}>
            <div>
              <div style={{fontSize:16,fontWeight:800,color:'var(--gold)',lineHeight:1.2}}>
                {adminGoals.goalMonthly} <span style={{fontSize:13,fontWeight:600}}>{GOAL_LABELS[adminGoals.goalField]??adminGoals.goalField}/month</span>
              </div>
              <div style={{fontSize:10,color:'var(--text4)',marginTop:3}}>Due {fmtDate(adminGoals.deadline)}</div>
            </div>
            {Object.keys(adminGoals.overrides||{}).length>0&&(
              <div style={{display:'flex',flexWrap:'wrap',gap:4,justifyContent:'flex-end'}}>
                {Object.entries(adminGoals.overrides).filter(([,v])=>v>0).slice(0,4).map(([k,v])=>(
                  <span key={k} style={{fontSize:9,padding:'2px 7px',borderRadius:8,background:'rgba(200,162,74,0.1)',color:'var(--gold)',fontWeight:600}}>
                    {v} {GOAL_LABELS[k]??k}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{marginBottom:14}}>
        <div style={{fontSize:9,color:'var(--text4)',letterSpacing:'2px',textTransform:'uppercase' as const,fontWeight:700,marginBottom:4}}>Level 4</div>
        <div style={{fontSize:18,fontWeight:800,color:'var(--text)'}}>Team</div>
        <div style={{fontSize:11,color:'var(--text4)',marginTop:4}}>{partnerIbos.length} partner{partnerIbos.length!==1?'s':''} · {totalActive} active · {totalLaunched} launched</div>
      </div>

      {/* Search */}
      <input
        placeholder="Search partners…"
        value={search}
        onChange={e=>setSearch(e.target.value)}
        style={{width:'100%',boxSizing:'border-box',background:'var(--s1)',border:'1px solid var(--br2)',borderRadius:'var(--r)',padding:'8px 12px',color:'var(--text)',fontSize:13,fontFamily:"'Sora',sans-serif",outline:'none',marginBottom:12}}
      />

      {/* Member cards */}
      {candidates.length===0?(
        <div style={{...CARD,textAlign:'center',padding:'48px',color:'var(--text4)'}}>
          <div style={{fontSize:13}}>No downline candidates yet.</div>
          <div style={{fontSize:11,marginTop:8}}>Candidates appear here when partners add prospects to the pipeline.</div>
        </div>
      ):filteredIbos.length===0&&search?(
        <div style={{textAlign:'center',padding:'40px 20px',color:'var(--text4)',fontSize:12}}>No partners match "{search}"</div>
      ):filteredIbos.map(ibo=>{
        const name=memberMap[ibo]||ibo
        const st=memberStats[ibo]??{active:0,launched:0,dqd:0,avgHealth:0}
        const initials=name.split(' ').map((w:string)=>w[0]).join('').toUpperCase().slice(0,2)
        const hc=healthColor(st.avgHealth)
        return(
          <div key={ibo} onClick={()=>setSelectedIbo(ibo)} style={{...CARD,cursor:'pointer',display:'flex',alignItems:'center',gap:14,transition:'border-color 0.15s'}}>
            {/* Avatar */}
            <div style={{width:44,height:44,borderRadius:'50%',background:'rgba(200,162,74,0.1)',border:'1px solid rgba(200,162,74,0.2)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
              <span style={{fontSize:14,fontWeight:800,color:GOLD}}>{initials}</span>
            </div>
            {/* Info */}
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:13,fontWeight:700,color:'var(--text)',marginBottom:3}}>{name}</div>
              <div style={{fontSize:10,color:'var(--text4)',marginBottom:5}}>{ibo}</div>
              <div style={{display:'flex',gap:10}}>
                <span style={{fontSize:10,color:GREEN}}>{st.active} active</span>
                <span style={{fontSize:10,color:GOLD}}>{st.launched} launched</span>
                {st.dqd>0&&<span style={{fontSize:10,color:'var(--text4)'}}>{st.dqd} DQ'd</span>}
              </div>
            </div>
            {/* Health + chevron */}
            <div style={{textAlign:'right',flexShrink:0,display:'flex',alignItems:'center',gap:10}}>
              {st.active>0&&(
                <div>
                  <div className="mono" style={{fontSize:20,fontWeight:800,color:hc,lineHeight:1}}>{st.avgHealth}</div>
                  <div style={{fontSize:8,color:'var(--text4)'}}>avg</div>
                </div>
              )}
              <span style={{fontSize:16,color:'var(--text4)'}}>›</span>
            </div>
          </div>
        )
      })}

      {/* Profile Drawer */}
      {selectedIbo&&(()=>{
        const name=memberMap[selectedIbo]||selectedIbo
        const st=memberStats[selectedIbo]??{active:0,launched:0,dqd:0,avgHealth:0}
        return(
          <div style={{position:'fixed',inset:0,zIndex:400,display:'flex',flexDirection:'column',justifyContent:'flex-end'}}>
            {/* Backdrop */}
            <div style={{position:'absolute',inset:0,background:'rgba(0,0,0,0.6)',backdropFilter:'blur(4px)'}} onClick={()=>setSelectedIbo(null)}/>
            {/* Panel */}
            <div style={{position:'relative',background:'var(--bg)',borderRadius:'20px 20px 0 0',maxHeight:'82vh',overflowY:'auto',padding:'0 0 env(safe-area-inset-bottom)'}}>
              {/* Handle */}
              <div style={{display:'flex',justifyContent:'center',padding:'12px 0 0'}}>
                <div style={{width:36,height:4,borderRadius:2,background:'var(--br2)'}}/>
              </div>
              <div style={{padding:'14px 18px 24px'}}>
                {/* Header */}
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:16}}>
                  <div>
                    <div style={{fontSize:17,fontWeight:800,color:'var(--text)',marginBottom:2}}>{name}</div>
                    <div style={{fontSize:11,color:'var(--text4)'}}>{selectedIbo}</div>
                  </div>
                  <button onClick={()=>setSelectedIbo(null)} style={{background:'none',border:'none',color:'var(--text4)',fontSize:22,cursor:'pointer',padding:'0 4px',lineHeight:1}}>×</button>
                </div>

                {/* Stats row */}
                <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginBottom:18}}>
                  {[
                    {l:'Active',v:st.active,c:GREEN},
                    {l:'Launched',v:st.launched,c:GOLD},
                    {l:"DQ'd",v:st.dqd,c:RED},
                  ].map(s=>(
                    <div key={s.l} style={{background:'var(--s1)',border:'1px solid var(--br)',borderRadius:'var(--r2)',padding:'10px',textAlign:'center'}}>
                      <div className="mono" style={{fontSize:22,fontWeight:800,color:s.c,lineHeight:1}}>{s.v}</div>
                      <div style={{fontSize:9,color:'var(--text4)',marginTop:3}}>{s.l}</div>
                    </div>
                  ))}
                </div>

                {/* Candidates */}
                {drawerCandidates.length===0?(
                  <div style={{textAlign:'center',padding:'32px 0',color:'var(--text4)',fontSize:12}}>No active candidates</div>
                ):(
                  <>
                    <div style={SL}>ACTIVE CANDIDATES</div>
                    {drawerCandidates.map(c=>{
                      const stage=normaliseStage(c.stage)
                      const cfg=STAGE_CFG[stage]
                      const lastLog=logs.filter(l=>l.entity_id===c.id).sort((a,b)=>b.created_at.localeCompare(a.created_at))[0]
                      const score=scores[c.id]??0
                      const daysInStage=daysSince(lastLog?.created_at??c.created_at)
                      const alertColor=daysInStage>=14?RED:daysInStage>=7?GOLD:null
                      return(
                        <div key={c.id} style={{background:'var(--s1)',border:'1px solid var(--br)',borderLeft:`3px solid ${cfg.color}`,borderRadius:'var(--r2)',padding:'12px',marginBottom:8}}>
                          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:6}}>
                            <div style={{flex:1,minWidth:0}}>
                              <div style={{fontSize:13,fontWeight:700,marginBottom:4}}>{c.name}</div>
                              <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
                                <span style={{fontSize:10,padding:'2px 8px',borderRadius:8,background:cfg.bg,color:cfg.color,fontWeight:600}}>{stage}</span>
                                {alertColor&&<span style={{fontSize:10,padding:'2px 8px',borderRadius:8,background:alertColor+'15',color:alertColor,fontWeight:600}}>{daysInStage}d in stage</span>}
                              </div>
                            </div>
                            <div style={{textAlign:'right',flexShrink:0,marginLeft:8}}>
                              <div className="mono" style={{fontSize:20,fontWeight:800,color:healthColor(score),lineHeight:1}}>{score}</div>
                              <div style={{fontSize:8,color:'var(--text4)'}}>health</div>
                            </div>
                          </div>
                          {c.pain_point&&<div style={{fontSize:10,color:'var(--text4)',fontStyle:'italic',marginBottom:3}}>"{c.pain_point.slice(0,70)}{c.pain_point.length>70?'…':''}"</div>}
                          {lastLog&&<div style={{fontSize:10,color:'var(--text4)'}}>Last: <span style={{fontWeight:600,color:'var(--text3)'}}>{lastLog.outcome}</span>{lastLog.notes?` · "${lastLog.notes.slice(0,50)}"`:''}</div>}
                        </div>
                      )
                    })}
                  </>
                )}
              </div>
            </div>
          </div>
        )
      })()}

    </div>
  )
}
