'use client'
import React, { useState, useMemo } from 'react'
import { useStore } from '@/lib/stores'
import type { Lead } from '@/lib/stores/types'
import { uid, now, today } from '@/lib/utils'

const GOLD='#C8A24A'; const GREEN='#4CAF7D'; const RED='#E05555'; const TEAL='#4ECDC4'

const STAGES=['New','Connected','MPA','Catch-Up','DTM','Joined'] as const
type Stage=typeof STAGES[number]
const STAGE_COLOR:Record<Stage,string>={'New':'#5B9BD5','Connected':GOLD,'MPA':GREEN,'Catch-Up':'#9B6DD4','DTM':TEAL,'Joined':'#E8913A'}
const STAGE_NEXT:Record<Stage,Stage|null>={'New':'Connected','Connected':'MPA','MPA':'Catch-Up','Catch-Up':'DTM','DTM':'Joined','Joined':null}

const RELATIONSHIPS=['','Close friend','Acquaintance','Stranger','Online only']
const AGE_RANGES=['','Under 25','25-35','35-45','45+']
const LIFE_STAGES=['','Student','Employed (9-5)','Self-employed','Stay-at-home parent','Retired']
const PRIMARY_DRIVERS=['','Time freedom','Extra income','Full-time income','Business ownership','Products only']
const SOURCES=['','Cold approach','Warm list','Referral','Instagram','Facebook','LinkedIn','Other']
const ARCHIVE_REASONS=['Not interested','No time','Wrong fit','Joined another','Lost contact','Other']

const HUNGER_LABELS=['','Happy','Unsatisfied','Open','Unhappy','','','Must change','','','Desperate']
const LOOKING_LABELS=['','Closed','','Listening','','Curious','','Exploring','','','Ready now']

function emptyLead(userId:string):Lead{
  return{id:uid(),user_id:userId,name:'',phone:'',instagram:'',contact:'',source:'',stage:'New',score:25,hunger:5,looking:5,relationship:'',age_range:'',life_stage:'',primary_driver:'',pain_point:'',archived:false,archived_reason:'',notes:'',next_action:'',next_action_date:'',created_at:now(),updated_at:now()}
}

function calcScore(l:Lead):number{
  const hxl=l.hunger*l.looking
  const stageDepth=(STAGES.indexOf(l.stage as Stage)+1)/STAGES.length
  return Math.round(hxl*0.7+stageDepth*30)
}

const scoreColor=(s:number)=>s>=70?GREEN:s>=40?GOLD:s>=20?'#E8913A':RED
const scoreLabel=(s:number)=>s>=70?'Hot':s>=40?'Warm':s>=20?'Cool':'Cold'

export default function Pipeline(){
  const{userId,trackerLeads,upsertTrackerLead,deleteTrackerLead}=useStore()
  const[tab,setTab]=useState<Stage|'All'>('All')
  const[showArchived,setShowArchived]=useState(false)
  const[search,setSearch]=useState('')
  const[lead,setLead]=useState<Lead|null>(null)
  const[saving,setSaving]=useState(false)
  const[delConfirm,setDelConfirm]=useState(false)
  const[showArchiveModal,setShowArchiveModal]=useState(false)
  const[archiveReason,setArchiveReason]=useState('')

  const filtered=useMemo(()=>{
    let list=trackerLeads.filter(l=>l.archived===showArchived)
    if(tab!=='All')list=list.filter(l=>l.stage===tab)
    if(search){const q=search.toLowerCase();list=list.filter(l=>l.name.toLowerCase().includes(q)||l.phone.includes(q)||l.instagram.toLowerCase().includes(q))}
    return list.sort((a,b)=>calcScore(b)-calcScore(a))
  },[trackerLeads,tab,showArchived,search])

  const stageCounts=useMemo(()=>{
    const active=trackerLeads.filter(l=>!l.archived)
    const counts:Record<string,number>={All:active.length}
    STAGES.forEach(s=>{counts[s]=active.filter(l=>l.stage===s).length})
    return counts
  },[trackerLeads])

  const stats=useMemo(()=>{
    const active=trackerLeads.filter(l=>!l.archived)
    const todayStr=today()
    const weekAgo=new Date();weekAgo.setDate(weekAgo.getDate()-7)
    const weekAgoStr=weekAgo.toLocaleDateString('en-CA',{timeZone:'Australia/Brisbane'})
    const thisWeek=active.filter(l=>l.created_at.slice(0,10)>=weekAgoStr).length
    const joined=active.filter(l=>l.stage==='Joined').length
    const overdue=active.filter(l=>l.next_action_date&&l.next_action_date<todayStr).length
    const warm=active.filter(l=>['MPA','Catch-Up','DTM'].includes(l.stage)).length
    const score=warm>0?Math.round(active.reduce((s,l)=>s+calcScore(l),0)/active.length):0
    return{total:active.length,thisWeek,joined,overdue,warm,avgScore:score}
  },[trackerLeads])

  function openNew(){if(!userId)return;setLead(emptyLead(userId));setDelConfirm(false);setShowArchiveModal(false);setArchiveReason('')}
  function openLead(l:Lead){setLead({...l});setDelConfirm(false);setShowArchiveModal(false);setArchiveReason(l.archived_reason||'')}
  function setField<K extends keyof Lead>(k:K,v:Lead[K]){setLead(prev=>prev?{...prev,[k]:v}:null)}
  function updateSliders(hunger:number,looking:number){setLead(prev=>!prev?null:{...prev,hunger,looking,score:calcScore({...prev,hunger,looking})})}

  async function handleSave(){if(!lead||!userId)return;setSaving(true);await upsertTrackerLead({...lead,score:calcScore(lead),updated_at:now()});setLead(null);setSaving(false)}
  async function handleDelete(){if(!lead)return;await deleteTrackerLead(lead.id);setLead(null);setDelConfirm(false)}
  async function handleArchive(){if(!lead||!archiveReason)return;await upsertTrackerLead({...lead,archived:true,archived_reason:archiveReason,score:calcScore(lead),updated_at:now()});setShowArchiveModal(false);setLead(null)}
  async function handleUnarchive(){if(!lead)return;await upsertTrackerLead({...lead,archived:false,archived_reason:'',updated_at:now()});setLead(null)}

  const todayStr=today()

  return(
    <div style={{paddingBottom:90}}>

      {/* Tabs */}
      <div style={{display:'flex',gap:4,overflowX:'auto',paddingBottom:4,marginBottom:16,WebkitOverflowScrolling:'touch',background:'linear-gradient(to right, var(--bg,#0d0d12) 0%, rgba(0,0,0,0) 90%)'} as React.CSSProperties}>
        <Tab active={tab==='All'&&!showArchived} label={`All (${stageCounts.All})`} color={GOLD} onClick={()=>{setTab('All');setShowArchived(false)}}/>
        {STAGES.map(s=><Tab key={s} active={tab===s&&!showArchived} label={`${s} (${stageCounts[s]??0})`} color={STAGE_COLOR[s]} onClick={()=>{setTab(s);setShowArchived(false)}}/>)}
        <Tab active={showArchived} label={`Archived`} color={RED} onClick={()=>{setShowArchived(true);setTab('All')}}/>
      </div>

      {/* KPI Cards */}
      {!showArchived&&(
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(140px, 1fr))',gap:10,marginBottom:16}}>
          {[
            {v:stats.total,l:'Active',c:'#fff',i:'📊'},
            {v:stats.thisWeek,l:'New',c:GREEN,i:'✨'},
            {v:stats.warm,l:'Warm',c:GOLD,i:'🔥'},
            {v:stats.joined,l:'Joined',c:GREEN,i:'🎉'},
            {v:stats.overdue,l:'Overdue',c:stats.overdue>0?RED:'#444',i:'⚠️'},
            {v:stats.avgScore,l:'Avg Score',c:stats.avgScore>=50?GOLD:'#666',i:'📈'},
          ].map(({v,l,c,i})=>(
            <div key={l} style={{background:'linear-gradient(135deg, rgba(200,162,74,0.08), rgba(255,255,255,0.02))',border:'1px solid rgba(200,162,74,0.2)',borderRadius:12,padding:'12px',textAlign:'center' as const,transition:'all 0.3s'}}>
              <div style={{fontSize:28,marginBottom:4}}>{i}</div>
              <div style={{fontSize:20,fontWeight:800,color:c}}>{v}</div>
              <div style={{fontSize:10,color:'#555',marginTop:2}}>{l}</div>
            </div>
          ))}
        </div>
      )}

      {/* Funnel */}
      {!showArchived&&tab==='All'&&stats.total>0&&(
        <div style={{background:'linear-gradient(135deg, rgba(76,175,125,0.08), rgba(200,162,74,0.04))',border:'1px solid rgba(200,162,74,0.15)',borderRadius:14,padding:'14px',marginBottom:16}}>
          <div style={{fontSize:10,color:GOLD,fontWeight:700,letterSpacing:'2px',textTransform:'uppercase' as const,marginBottom:12}}>Funnel</div>
          {STAGES.map(s=>{
            const n=stageCounts[s]??0
            if(!n)return null
            const base=stageCounts['New']||n
            const pct=Math.round(n/base*100)
            return(
              <div key={s} style={{display:'flex',alignItems:'center',gap:10,marginBottom:8,transition:'all 0.2s'}}>
                <span style={{width:80,fontSize:11,color:'#666',fontWeight:500}}>{s}</span>
                <div style={{flex:1,height:7,background:'rgba(200,162,74,0.1)',borderRadius:4,overflow:'hidden',boxShadow:'inset 0 2px 4px rgba(0,0,0,0.3)'}}>
                  <div style={{height:'100%',width:`${pct}%`,background:STAGE_COLOR[s],borderRadius:4,transition:'width 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)'}}/>
                </div>
                <span style={{width:28,textAlign:'right' as const,fontSize:12,fontWeight:700,color:'#ddd'}}>{n}</span>
              </div>
            )
          })}
        </div>
      )}

      {/* Search */}
      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Search by name, phone or Instagram…"
        style={{width:'100%',background:'linear-gradient(to right, rgba(200,162,74,0.05), rgba(200,162,74,0.02))',border:'1px solid rgba(200,162,74,0.15)',borderRadius:10,padding:'10px 14px',color:'#fff',fontSize:13,boxSizing:'border-box' as const,fontFamily:'inherit',marginBottom:14,outline:'none',transition:'all 0.2s'}}/>

      {/* Cards */}
      {filtered.length===0?(
        <div style={{textAlign:'center' as const,padding:'80px 20px',color:'#444',fontSize:13}}>
          <div style={{fontSize:40,marginBottom:8}}>{search?'🔍':showArchived?'📦':'🎯'}</div>
          {search?'No leads match.':showArchived?'No archived leads.':tab==='All'?'Start by tapping +':'Add leads to get going.'}
        </div>
      ):(
        <div style={{display:'flex',flexDirection:'column' as const,gap:10}}>
          {filtered.map((l,i)=>{
            const score=calcScore(l)
            const isOverdue=!!l.next_action_date&&l.next_action_date<todayStr
            const sc=STAGE_COLOR[l.stage as Stage]||GOLD
            return(
              <div key={l.id} onClick={()=>openLead(l)} style={{background:`linear-gradient(135deg, rgba(200,162,74,0.06), rgba(255,255,255,0.01))`,border:'1px solid rgba(200,162,74,0.12)',borderLeft:`4px solid ${sc}`,borderRadius:12,padding:'14px',cursor:'pointer',transition:'all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)',transform:'translateY(0)',animation:`slideIn 0.3s ease-out ${i*20}ms`,animationFillMode:'both'}} onMouseEnter={e=>{const el=e.currentTarget;el.style.transform='translateY(-4px)';el.style.boxShadow='0 12px 24px rgba(200,162,74,0.15)'}} onMouseLeave={e=>{const el=e.currentTarget;el.style.transform='translateY(0)';el.style.boxShadow='none'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:14,fontWeight:700,color:'#fff',marginBottom:4,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' as const}}>
                      {l.name||'(unnamed)'}
                    </div>
                    <div style={{display:'flex',gap:6,flexWrap:'wrap' as const,alignItems:'center'}}>
                      <span style={{fontSize:10,padding:'3px 8px',borderRadius:12,background:`${sc}20`,color:sc,fontWeight:600}}>
                        {l.stage}
                      </span>
                      {l.relationship&&<span style={{fontSize:10,color:'#666',padding:'2px 6px',background:'rgba(255,255,255,0.04)',borderRadius:6}}>{l.relationship}</span>}
                      {l.source&&<span style={{fontSize:9,color:'#555'}}>•</span>}
                      {l.source&&<span style={{fontSize:10,color:'#555'}}>{l.source}</span>}
                    </div>
                  </div>
                  <div style={{textAlign:'right' as const,marginLeft:12,flexShrink:0}}>
                    <div style={{fontSize:20,fontWeight:800,color:scoreColor(score),lineHeight:1}}>{score}</div>
                    <div style={{fontSize:9,color:'#555',marginTop:2}}>{scoreLabel(score)}</div>
                  </div>
                </div>
                <div style={{display:'flex',gap:12,marginTop:8,fontSize:11,color:'#555',alignItems:'center'}}>
                  <span>🔥 <span style={{color:'#aaa',fontWeight:600}}>{l.hunger}</span></span>
                  <span>👀 <span style={{color:'#aaa',fontWeight:600}}>{l.looking}</span></span>
                  {l.next_action_date&&<span style={{marginLeft:'auto',fontWeight:isOverdue?700:400,color:isOverdue?RED:GOLD}}>
                    {isOverdue?'⚠ ':''}{l.next_action_date}
                  </span>}
                </div>
                {l.next_action&&<div style={{fontSize:10,color:'#666',marginTop:4}}>→ {l.next_action}</div>}
              </div>
            )
          })}
        </div>
      )}

      <style>{`@keyframes slideIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>

      {/* FAB */}
      {!showArchived&&<button onClick={openNew} style={{position:'fixed',bottom:24,right:20,width:56,height:56,borderRadius:28,border:'none',background:`linear-gradient(135deg, ${GOLD}, #d4a556)`,color:'#000',fontSize:28,fontWeight:900,cursor:'pointer',boxShadow:'0 8px 24px rgba(200,162,74,0.4)',zIndex:100,display:'flex',alignItems:'center',justifyContent:'center',transition:'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',transform:'scale(1)'}}>+</button>}

      {/* Modal */}
      {lead&&<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.92)',zIndex:500,overflowY:'auto',backdropFilter:'blur(8px)'}}>
        <div style={{minHeight:'100vh',background:'linear-gradient(to bottom, #0d0d12, #13131a)',maxWidth:560,margin:'0 auto',paddingBottom:100}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'18px 18px',borderBottom:'1px solid rgba(200,162,74,0.1)',position:'sticky',top:0,background:'rgba(13,13,18,0.9)',backdropFilter:'blur(10px)',zIndex:10}}>
            <div style={{fontSize:16,fontWeight:800,color:'#fff',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' as const,flex:1}}>
              {lead.name||'New Lead'}
            </div>
            <div style={{display:'flex',gap:6,flexShrink:0}}>
              {lead.archived?(
                <button onClick={handleUnarchive} style={{padding:'6px 12px',fontSize:11,borderRadius:8,border:`1px solid ${GREEN}`,background:'transparent',color:GREEN,cursor:'pointer',fontFamily:'inherit'}}>Unarchive</button>
              ):(
                <button onClick={()=>setShowArchiveModal(true)} style={{padding:'6px 12px',fontSize:11,borderRadius:8,border:'1px solid #2a2a35',background:'transparent',color:'#666',cursor:'pointer',fontFamily:'inherit'}}>Archive</button>
              )}
              <button onClick={()=>setLead(null)} style={{padding:'4px 10px',borderRadius:6,border:'1px solid #2a2a35',background:'transparent',color:'#888',cursor:'pointer',fontSize:18,fontFamily:'inherit'}}>×</button>
            </div>
          </div>

          <div style={{padding:'18px'}}>
            <Sect label="Stage">
              <div style={{display:'flex',gap:5,overflowX:'auto',padding:'10px 12px',WebkitOverflowScrolling:'touch'} as React.CSSProperties}>
                {STAGES.map(s=><button key={s} onClick={()=>setField('stage',s)} style={{flexShrink:0,padding:'7px 13px',borderRadius:20,border:'none',cursor:'pointer',fontFamily:'inherit',fontSize:11,fontWeight:lead.stage===s?700:400,background:lead.stage===s?STAGE_COLOR[s]:'#1a1a24',color:lead.stage===s?'#000':'#666',transition:'all 0.2s'}}>{s}</button>)}
              </div>
              {STAGE_NEXT[lead.stage as Stage]&&<div style={{padding:'0 12px 10px'}}>
                <button onClick={()=>setField('stage',STAGE_NEXT[lead.stage as Stage]!)} style={{width:'100%',padding:'9px',borderRadius:8,border:`1px solid ${STAGE_COLOR[STAGE_NEXT[lead.stage as Stage]!]}`,background:'transparent',color:STAGE_COLOR[STAGE_NEXT[lead.stage as Stage]!],cursor:'pointer',fontFamily:'inherit',fontSize:12,fontWeight:600,transition:'all 0.2s'}}>→ Move to {STAGE_NEXT[lead.stage as Stage]}</button>
              </div>}
            </Sect>

            <div style={{background:'linear-gradient(135deg, rgba(200,162,74,0.06), rgba(200,162,74,0.02))',borderRadius:12,padding:'14px',marginBottom:14,border:'1px solid rgba(200,162,74,0.1)'}}>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:14}}>
                <span style={{fontSize:9,color:GOLD,fontWeight:700,letterSpacing:'2px',textTransform:'uppercase' as const}}>Score</span>
                <span><span style={{fontSize:24,fontWeight:800,color:scoreColor(calcScore(lead))}}>{ calcScore(lead)}</span><span style={{fontSize:11,color:'#555'}}>/100</span></span>
              </div>
              <Slider label="Hunger" val={lead.hunger} hint={HUNGER_LABELS[lead.hunger]||''} onChg={v=>updateSliders(v,lead.looking)}/>
              <Slider label="Looking" val={lead.looking} hint={LOOKING_LABELS[lead.looking]||''} onChg={v=>updateSliders(lead.hunger,v)}/>
            </div>

            <Sect label="Contact"><TF l="Name" v={lead.name} o={v=>setField('name',v)} p="Full name" r/><TF l="Phone" v={lead.phone} o={v=>setField('phone',v)} p="+61…" t="tel"/><TF l="Instagram" v={lead.instagram} o={v=>setField('instagram',v)} p="@"/><TF l="How we met" v={lead.contact} o={v=>setField('contact',v)} p="Where?"/><SF l="Source" v={lead.source} o={v=>setField('source',v)} opts={SOURCES}/></Sect>
            <Sect label="Profile"><SF l="Relationship" v={lead.relationship} o={v=>setField('relationship',v)} opts={RELATIONSHIPS}/><SF l="Age" v={lead.age_range} o={v=>setField('age_range',v)} opts={AGE_RANGES}/><SF l="Life stage" v={lead.life_stage} o={v=>setField('life_stage',v)} opts={LIFE_STAGES}/><SF l="Driver" v={lead.primary_driver} o={v=>setField('primary_driver',v)} opts={PRIMARY_DRIVERS}/><TA l="Pain point" v={lead.pain_point} o={v=>setField('pain_point',v)} p="Their words"/></Sect>
            <Sect label="Notes"><TA l="Notes" v={lead.notes} o={v=>setField('notes',v)} p="Remember…" rows={4}/><TF l="Next action" v={lead.next_action} o={v=>setField('next_action',v)} p="Call, MPA, etc…"/><TF l="Date" v={lead.next_action_date} o={v=>setField('next_action_date',v)} t="date"/></Sect>
          </div>

          <div style={{position:'fixed',bottom:0,left:0,right:0,background:'linear-gradient(to top, #0d0d12, rgba(13,13,18,0.8))',borderTop:'1px solid rgba(200,162,74,0.1)',padding:'12px 18px',maxWidth:560,margin:'0 auto',display:'flex',gap:8,zIndex:20,boxSizing:'border-box' as const}}>
            {delConfirm?(<>
              <span style={{flex:1,fontSize:12,color:RED,display:'flex',alignItems:'center'}}>Delete?</span>
              <button onClick={handleDelete} style={{padding:'10px 16px',borderRadius:10,border:'none',fontWeight:700,fontSize:12,fontFamily:'inherit',cursor:'pointer',background:RED,color:'#fff'}}>Delete</button>
              <button onClick={()=>setDelConfirm(false)} style={{padding:'10px 14px',borderRadius:10,border:'1px solid #2a2a35',background:'transparent',color:'#666',cursor:'pointer',fontFamily:'inherit',fontSize:12}}>Cancel</button>
            </>):(
              <>
                <button onClick={()=>setDelConfirm(true)} style={{padding:'10px 12px',borderRadius:10,border:'1px solid #2a2a35',background:'transparent',color:'#555',cursor:'pointer',fontFamily:'inherit',fontSize:11}}>Delete</button>
                <button onClick={handleSave} disabled={saving||!lead.name.trim()} style={{flex:1,padding:'10px',borderRadius:10,border:'none',fontWeight:700,fontSize:13,fontFamily:'inherit',cursor:saving||!lead.name.trim()?'not-allowed':'pointer',background:!lead.name.trim()?'#2a2a35':GOLD,color:!lead.name.trim()?'#555':'#000'}}>{saving?'Saving…':'Save'}</button>
              </>
            )}
          </div>
        </div>
      </div>}

      {/* Archive modal */}
      {showArchiveModal&&lead&&<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.92)',zIndex:600,display:'flex',alignItems:'flex-end',justifyContent:'center',backdropFilter:'blur(8px)'}}>
        <div style={{background:'linear-gradient(to top, #13131a, #16161e)',borderRadius:'20px 20px 0 0',padding:24,width:'100%',maxWidth:560,boxSizing:'border-box' as const,border:'1px solid rgba(200,162,74,0.1)',borderBottom:'none'}}>
          <div style={{fontSize:15,fontWeight:700,color:'#fff',marginBottom:4}}>Archive {lead.name||'lead'}?</div>
          <div style={{fontSize:12,color:'#666',marginBottom:14}}>What happened?</div>
          {ARCHIVE_REASONS.map(r=><button key={r} onClick={()=>setArchiveReason(r)} style={{display:'block',width:'100%',textAlign:'left' as const,padding:'11px 12px',marginBottom:6,borderRadius:10,fontFamily:'inherit',fontSize:12,cursor:'pointer',border:`1px solid ${archiveReason===r?GOLD:'#2a2a35'}`,background:archiveReason===r?'rgba(200,162,74,0.08)':'transparent',color:archiveReason===r?GOLD:'#aaa',transition:'all 0.2s'}}>{r}</button>)}
          <div style={{display:'flex',gap:8,marginTop:14}}>
            <button onClick={()=>{setShowArchiveModal(false);setArchiveReason('')}} style={{flex:1,padding:12,borderRadius:10,border:'1px solid #2a2a35',background:'transparent',color:'#666',cursor:'pointer',fontFamily:'inherit',fontSize:12}}>Cancel</button>
            <button onClick={handleArchive} disabled={!archiveReason} style={{flex:1,padding:12,borderRadius:10,border:'none',fontWeight:700,fontSize:12,fontFamily:'inherit',cursor:archiveReason?'pointer':'not-allowed',background:archiveReason?RED:'#2a2a35',color:archiveReason?'#fff':'#555'}}>{archiveReason?'Archive':'Select reason'}</button>
          </div>
        </div>
      </div>}
    </div>
  )
}

// ── Components ────────────────────────────────────────────
function Tab({active,color,label,onClick}:{active:boolean;color:string;label:string;onClick:()=>void}){
  return<button onClick={onClick} style={{flexShrink:0,padding:'6px 12px',borderRadius:18,border:'none',cursor:'pointer',fontFamily:'inherit',fontSize:10,fontWeight:active?700:400,whiteSpace:'nowrap' as const,background:active?color:'#1a1a24',color:active?'#000':'#555',transition:'all 0.2s'}}>{label}</button>
}

function Sect({label,children}:{label:string;children:React.ReactNode}){
  return<div style={{marginBottom:14}}><div style={{fontSize:9,color:GOLD,fontWeight:700,letterSpacing:'2px',textTransform:'uppercase' as const,marginBottom:6}}>{label}</div><div style={{background:'#13131a',borderRadius:12,overflow:'hidden',border:'1px solid rgba(200,162,74,0.1)'}}>{children}</div></div>
}

function TF({l,v,o,p,t='text',r}:{l:string;v:string;o:(v:string)=>void;p?:string;t?:string;r?:boolean}){
  return<div style={{display:'flex',alignItems:'center',padding:'9px 12px',borderBottom:'1px solid #1a1a24'}}>
    <div style={{width:90,fontSize:11,color:r&&!v?'#E8913A':'#666',flexShrink:0}}>{l}{r?' *':''}</div>
    <input type={t} value={v} onChange={e=>o(e.target.value)} placeholder={p} style={{flex:1,background:'transparent',border:'none',outline:'none',color:'#fff',fontSize:12,fontFamily:'inherit',textAlign:'right' as const,minWidth:0}}/>
  </div>
}

function SF({l,v,o,opts}:{l:string;v:string;o:(v:string)=>void;opts:string[]}){
  return<div style={{display:'flex',alignItems:'center',padding:'9px 12px',borderBottom:'1px solid #1a1a24'}}>
    <div style={{width:90,fontSize:11,color:'#666',flexShrink:0}}>{l}</div>
    <select value={v} onChange={e=>o(e.target.value)} style={{flex:1,background:'transparent',border:'none',outline:'none',color:v?'#fff':'#555',fontSize:12,fontFamily:'inherit',textAlign:'right' as const,cursor:'pointer',appearance:'none' as const,minWidth:0}}>
      {opts.map(o=><option key={o} value={o} style={{background:'#1a1a24',color:'#fff'}}>{o||`Select ${l.toLowerCase()}…`}</option>)}
    </select>
  </div>
}

function TA({l,v,o,p,rows=3}:{l:string;v:string;o:(v:string)=>void;p?:string;rows?:number}){
  return<div style={{padding:'10px 12px',borderBottom:'1px solid #1a1a24'}}>
    <div style={{fontSize:10,color:'#555',marginBottom:4}}>{l}</div>
    <textarea value={v} onChange={e=>o(e.target.value)} placeholder={p} rows={rows} style={{width:'100%',background:'transparent',border:'none',outline:'none',color:'#fff',fontSize:12,fontFamily:'inherit',resize:'vertical' as const,boxSizing:'border-box' as const,lineHeight:1.5}}/>
  </div>
}

function Slider({label,val,hint,onChg}:{label:string;val:number;hint?:string;onChg:(v:number)=>void}){
  return<div style={{marginBottom:12}}>
    <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
      <span style={{fontSize:11,color:'#aaa'}}>{label}</span>
      <span style={{fontSize:13,fontWeight:700,color:'#fff'}}>{val}/10</span>
    </div>
    {hint&&<div style={{fontSize:9,color:'#555',marginBottom:4,fontStyle:'italic'}}>{hint}</div>}
    <input type="range" min={1} max={10} value={val} onChange={e=>onChg(Number(e.target.value))} style={{width:'100%',accentColor:GOLD,cursor:'pointer',height:5}}/>
  </div>
}
