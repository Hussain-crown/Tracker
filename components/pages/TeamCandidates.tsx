'use client'
import React, { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase/client'
import type { Candidate, ContactLog } from '@/lib/stores/types'
import { ErrorBoundary } from '@/components/ErrorBoundary'

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

export default function TeamCandidates({level}:{level:number}){
  const [candidates,setCandidates]=useState<Candidate[]>([])
  const [logs,setLogs]=useState<ContactLog[]>([])
  const [memberMap,setMemberMap]=useState<Record<string,string>>({})
  const [loading,setLoading]=useState(true)
  const [search,setSearch]=useState('')
  const [filterIbo,setFilterIbo]=useState('all')

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

  const filtered=useMemo(()=>{
    let list=candidates
    if(filterIbo!=='all')list=list.filter(c=>getSponsorIbo(c)===filterIbo)
    if(search)list=list.filter(c=>c.name.toLowerCase().includes(search.toLowerCase()))
    return list
  },[candidates,filterIbo,search])

  if(level<4){
    return(
      <div style={{textAlign:'center',padding:'60px 20px'}}>
        <div style={{fontSize:32,marginBottom:12}}>🔒</div>
        <div style={{fontSize:15,fontWeight:700,color:'var(--text2)',marginBottom:8}}>Level 4 Required</div>
        <div style={{fontSize:12,color:'var(--text4)'}}>Team Candidates is only available to Level 4 leaders.</div>
      </div>
    )
  }

  if(loading)return<div style={{padding:'48px',textAlign:'center',color:'var(--text4)',fontSize:12}}>Loading team candidates…</div>

  return(
    <ErrorBoundary label="TeamCandidates">
    <div style={{animation:'fade-in 0.3s ease',paddingBottom:80}}>
      <div style={{marginBottom:16}}>
        <div style={{fontSize:9,color:'var(--text4)',letterSpacing:'2px',textTransform:'uppercase' as const,fontWeight:700,marginBottom:4}}>Level 4</div>
        <div style={{fontSize:18,fontWeight:800,color:'var(--text)'}}>Team Candidates</div>
        <div style={{fontSize:11,color:'var(--text4)',marginTop:4}}>{candidates.length} candidate{candidates.length!==1?'s':''} across {partnerIbos.length} partner{partnerIbos.length!==1?'s':''}</div>
      </div>

      {/* Search + partner filter */}
      <div style={{display:'flex',gap:8,marginBottom:12}}>
        <input
          placeholder="Search candidates…"
          value={search}
          onChange={e=>setSearch(e.target.value)}
          style={{flex:1,background:'var(--s1)',border:'1px solid var(--br2)',borderRadius:'var(--r)',padding:'8px 12px',color:'var(--text)',fontSize:13,fontFamily:"'Sora',sans-serif",outline:'none'}}
        />
        <select
          value={filterIbo}
          onChange={e=>setFilterIbo(e.target.value)}
          style={{background:'var(--s1)',border:'1px solid var(--br2)',borderRadius:'var(--r)',padding:'8px 10px',color:'var(--text)',fontFamily:"'Sora',sans-serif",fontSize:11,outline:'none',cursor:'pointer'}}
        >
          <option value="all">All partners</option>
          {partnerIbos.map(ibo=>(
            <option key={ibo} value={ibo}>{memberMap[ibo]||ibo}</option>
          ))}
        </select>
      </div>

      {/* Stats strip */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginBottom:14}}>
        {[
          {l:'Active',  v:candidates.filter(c=>c.status==='active').length,      c:GREEN},
          {l:'Launched',v:candidates.filter(c=>c.status==='launched').length,    c:GOLD},
          {l:'DQ\'d',   v:candidates.filter(c=>c.status==='disqualified').length, c:RED},
        ].map(s=>(
          <div key={s.l} style={{...CARD,marginBottom:0,textAlign:'center',padding:'10px'}}>
            <div className="mono" style={{fontSize:22,fontWeight:800,color:s.c,lineHeight:1}}>{s.v}</div>
            <div style={{fontSize:9,color:'var(--text4)',marginTop:3}}>{s.l}</div>
          </div>
        ))}
      </div>

      {/* Candidates grouped by partner */}
      {candidates.length===0?(
        <div style={{...CARD,textAlign:'center',padding:'48px',color:'var(--text4)'}}>
          <div style={{fontSize:13}}>No downline candidates yet.</div>
          <div style={{fontSize:11,marginTop:8}}>Candidates will appear here when your direct partners assign prospects to the interview pipeline.</div>
        </div>
      ):partnerIbos.filter(ibo=>filterIbo==='all'||ibo===filterIbo).map(ibo=>{
        const partnerCandidates=filtered.filter(c=>getSponsorIbo(c)===ibo&&c.status==='active')
        const partnerName=memberMap[ibo]||ibo
        if(partnerCandidates.length===0&&search)return null
        return(
          <div key={ibo} style={{marginBottom:20}}>
            <div style={{padding:'8px 12px',background:'var(--s2)',borderRadius:'var(--r)',marginBottom:8,display:'flex',justifyContent:'space-between',alignItems:'center',border:'1px solid var(--br)'}}>
              <span style={{fontSize:12,fontWeight:700,color:'var(--text2)'}}>{partnerName}</span>
              <div style={{display:'flex',gap:8,alignItems:'center'}}>
                <span style={{fontSize:10,color:'var(--text4)'}}>{candidates.filter(c=>getSponsorIbo(c)===ibo&&c.status==='active').length} active</span>
                <span style={{fontSize:10,color:GOLD}}>{candidates.filter(c=>getSponsorIbo(c)===ibo&&c.status==='launched').length} launched</span>
              </div>
            </div>
            {partnerCandidates.length===0?(
              <div style={{padding:'12px',color:'var(--text4)',fontSize:11,textAlign:'center'}}>No active candidates{search?' matching search':''}</div>
            ):partnerCandidates.sort((a,b)=>(scores[b.id]??0)-(scores[a.id]??0)).map(c=>{
              const stage=normaliseStage(c.stage)
              const cfg=STAGE_CFG[stage]
              const lastLog=logs.filter(l=>l.entity_id===c.id).sort((a,b)=>b.created_at.localeCompare(a.created_at))[0]
              const score=scores[c.id]??0
              const daysInStage=daysSince(lastLog?.created_at??c.created_at)
              const alertColor=daysInStage>=14?RED:daysInStage>=7?GOLD:null
              return(
                <div key={c.id} style={{...CARD,borderLeft:`3px solid ${cfg.color}`,marginBottom:8}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
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
                  {c.pain_point&&<div style={{fontSize:10,color:'var(--text4)',marginBottom:4,fontStyle:'italic'}}>"{c.pain_point.slice(0,70)}{c.pain_point.length>70?'…':''}"</div>}
                  {lastLog&&<div style={{fontSize:10,color:'var(--text4)'}}>Last: <span style={{fontWeight:600,color:'var(--text3)'}}>{lastLog.outcome}</span>{lastLog.notes?` · "${lastLog.notes.slice(0,50)}"`:''}</div>}
                </div>
              )
            })}
          </div>
        )
      })}

      {filtered.length===0&&search&&(
        <div style={{textAlign:'center',padding:'40px 20px',color:'var(--text4)',fontSize:12}}>No candidates match "{search}"</div>
      )}
    </div>
    </ErrorBoundary>
  )
}
