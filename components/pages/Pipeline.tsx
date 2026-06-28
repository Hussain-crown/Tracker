'use client'
import React, { useState, useMemo } from 'react'
import { useStore } from '@/lib/stores'
import type { Lead } from '@/lib/stores/types'
import { uid, now, today } from '@/lib/utils'

// ── Constants ────────────────────────────────────────────────
const GOLD='#C8A24A'; const GREEN='#4CAF7D'; const RED='#E05555'

const STAGES=['New','Connected','MPA','Catch-Up','DTM','Joined'] as const
type Stage=typeof STAGES[number]
const STAGE_COLOR:Record<Stage,string>={
  'New':'#5B9BD5','Connected':'#C8A24A','MPA':'#4CAF7D',
  'Catch-Up':'#9B6DD4','DTM':'#4ECDC4','Joined':'#E8913A',
}
const STAGE_NEXT:Record<Stage,Stage|null>={
  'New':'Connected','Connected':'MPA','MPA':'Catch-Up','Catch-Up':'DTM','DTM':'Joined','Joined':null,
}

const RELATIONSHIPS=['','Close friend','Acquaintance','Stranger','Online only']
const AGE_RANGES=['','Under 25','25-35','35-45','45+']
const LIFE_STAGES=['','Student','Employed (9-5)','Self-employed','Stay-at-home parent','Retired']
const PRIMARY_DRIVERS=['','Time freedom','Extra income','Full-time income','Business ownership','Products only']
const SOURCES=['','Cold approach','Warm list','Referral','Instagram','Facebook','LinkedIn','Other']
const ARCHIVE_REASONS=['Not interested','No time','Wrong fit','Joined another team','Lost contact','Other']

const HUNGER_LABELS=['','Happy where they are','Slightly unsatisfied','Open to change','Actively unhappy','','','Must change now','','','Burning to change']
const LOOKING_LABELS=['','Not open at all','','Hearing me out','','Genuinely curious','','Actively exploring','','','Ready to go now']

function emptyLead(userId:string):Lead{
  return{
    id:uid(),user_id:userId,
    name:'',phone:'',instagram:'',contact:'',source:'',stage:'New',
    score:25,hunger:5,looking:5,
    relationship:'',age_range:'',life_stage:'',primary_driver:'',pain_point:'',
    archived:false,archived_reason:'',
    notes:'',next_action:'',next_action_date:'',
    created_at:now(),updated_at:now(),
  }
}

// Score = HxL (70%) + stage depth (30%)
function calcScore(l:Lead):number{
  const hxl=l.hunger*l.looking  // 0-100
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
    return list
  },[trackerLeads,tab,showArchived,search])

  const stageCounts=useMemo(()=>{
    const active=trackerLeads.filter(l=>!l.archived)
    const counts:Record<string,number>={All:active.length}
    STAGES.forEach(s=>{counts[s]=active.filter(l=>l.stage===s).length})
    return counts
  },[trackerLeads])

  const archivedCount=useMemo(()=>trackerLeads.filter(l=>l.archived).length,[trackerLeads])

  const stats=useMemo(()=>{
    const active=trackerLeads.filter(l=>!l.archived)
    const todayStr=today()
    const weekAgo=new Date();weekAgo.setDate(weekAgo.getDate()-7)
    const weekAgoStr=weekAgo.toLocaleDateString('en-CA',{timeZone:'Australia/Brisbane'})
    const thisWeek=active.filter(l=>l.created_at.slice(0,10)>=weekAgoStr).length
    const joined=active.filter(l=>l.stage==='Joined').length
    const overdue=active.filter(l=>l.next_action_date&&l.next_action_date<todayStr).length
    const dtm=active.filter(l=>l.stage==='DTM').length
    return{total:active.length,thisWeek,joined,overdue,dtm}
  },[trackerLeads])

  function openNew(){
    if(!userId)return
    setLead(emptyLead(userId))
    setDelConfirm(false);setShowArchiveModal(false);setArchiveReason('')
  }

  function openLead(l:Lead){
    setLead({...l})
    setDelConfirm(false);setShowArchiveModal(false)
    setArchiveReason(l.archived_reason||'')
  }

  function setField<K extends keyof Lead>(k:K,v:Lead[K]){
    setLead(prev=>prev?{...prev,[k]:v}:null)
  }

  function updateSliders(hunger:number,looking:number){
    setLead(prev=>!prev?null:{...prev,hunger,looking,score:calcScore({...prev,hunger,looking})})
  }

  async function handleSave(){
    if(!lead||!userId)return
    setSaving(true)
    await upsertTrackerLead({...lead,score:calcScore(lead),updated_at:now()})
    setLead(null);setSaving(false)
  }

  function handleAdvanceStage(){
    if(!lead)return
    const next=STAGE_NEXT[lead.stage as Stage]
    if(next)setField('stage',next)
  }

  async function handleDelete(){
    if(!lead)return
    await deleteTrackerLead(lead.id)
    setLead(null);setDelConfirm(false)
  }

  async function handleArchive(){
    if(!lead||!archiveReason)return
    await upsertTrackerLead({...lead,archived:true,archived_reason:archiveReason,score:calcScore(lead),updated_at:now()})
    setShowArchiveModal(false);setLead(null)
  }

  async function handleUnarchive(){
    if(!lead)return
    await upsertTrackerLead({...lead,archived:false,archived_reason:'',updated_at:now()})
    setLead(null)
  }

  const todayStr=today()

  return(
    <div style={{paddingBottom:80}}>

      {/* Stage tabs */}
      <div style={{display:'flex',gap:5,overflowX:'auto',paddingBottom:4,marginBottom:14,WebkitOverflowScrolling:'touch'} as React.CSSProperties}>
        <TabBtn active={tab==='All'&&!showArchived} color={GOLD} onClick={()=>{setTab('All');setShowArchived(false)}}>
          All ({stageCounts.All})
        </TabBtn>
        {STAGES.map(s=>(
          <TabBtn key={s} active={tab===s&&!showArchived} color={STAGE_COLOR[s]}
            onClick={()=>{setTab(s);setShowArchived(false)}}>
            {s} ({stageCounts[s]??0})
          </TabBtn>
        ))}
        <TabBtn active={showArchived} color={RED} onClick={()=>{setShowArchived(true);setTab('All')}}>
          Archived ({archivedCount})
        </TabBtn>
      </div>

      {/* Stats */}
      {!showArchived&&(
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8,marginBottom:14}}>
          {[
            {label:'Total',val:stats.total,col:'#fff'},
            {label:'This week',val:stats.thisWeek,col:GREEN},
            {label:'DTM',val:stats.dtm,col:GOLD},
            {label:'Overdue',val:stats.overdue,col:stats.overdue>0?RED:'#444'},
          ].map(s=>(
            <div key={s.label} style={{background:'#13131a',borderRadius:10,padding:'10px 6px',textAlign:'center' as const}}>
              <div style={{fontSize:18,fontWeight:800,color:s.col}}>{s.val}</div>
              <div style={{fontSize:9,color:'#555',marginTop:2}}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Search */}
      <input value={search} onChange={e=>setSearch(e.target.value)}
        placeholder="Search by name, phone or Instagram…"
        style={{width:'100%',background:'#13131a',border:'1px solid #2a2a35',borderRadius:10,
          padding:'9px 14px',color:'#fff',fontSize:13,boxSizing:'border-box' as const,
          fontFamily:'inherit',marginBottom:14,outline:'none'}}/>

      {/* Funnel */}
      {!showArchived&&tab==='All'&&stats.total>0&&(
        <div style={{background:'#13131a',borderRadius:12,padding:'12px 14px',marginBottom:14}}>
          <div style={{fontSize:9,color:GOLD,fontWeight:700,letterSpacing:'2px',textTransform:'uppercase' as const,marginBottom:10}}>Funnel</div>
          {STAGES.map(s=>{
            const n=stageCounts[s]??0
            if(!n)return null
            const base=stageCounts['New']||n
            return(
              <div key={s} style={{display:'flex',alignItems:'center',gap:8,marginBottom:7}}>
                <div style={{width:72,fontSize:10,color:'#666',flexShrink:0}}>{s}</div>
                <div style={{flex:1,height:6,background:'#1f1f28',borderRadius:3,overflow:'hidden'}}>
                  <div style={{height:'100%',width:`${Math.max(4,Math.round(n/base*100))}%`,background:STAGE_COLOR[s],borderRadius:3}}/>
                </div>
                <div style={{width:22,textAlign:'right' as const,fontSize:11,fontWeight:700,color:'#ddd',flexShrink:0}}>{n}</div>
              </div>
            )
          })}
        </div>
      )}

      {/* Lead list */}
      {filtered.length===0?(
        <div style={{textAlign:'center' as const,padding:'48px 0',color:'#444',fontSize:13}}>
          {search?'No leads match your search.'
            :showArchived?'No archived leads.'
            :tab==='All'?'No leads yet — tap + to add your first one.'
            :`No leads in the ${tab} stage.`}
        </div>
      ):(
        <div style={{display:'flex',flexDirection:'column' as const,gap:8}}>
          {filtered.map(l=>{
            const score=calcScore(l)
            const isOverdue=!!l.next_action_date&&l.next_action_date<todayStr
            const stageColor=STAGE_COLOR[l.stage as Stage]||GOLD
            return(
              <div key={l.id} onClick={()=>openLead(l)}
                style={{background:'#13131a',border:'1px solid #1f1f28',
                  borderLeft:`3px solid ${stageColor}`,borderRadius:12,padding:'12px 14px',cursor:'pointer'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:14,fontWeight:700,color:'#fff',marginBottom:3,
                      overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' as const}}>
                      {l.name||'(unnamed)'}
                    </div>
                    <div style={{display:'flex',gap:5,alignItems:'center',flexWrap:'wrap' as const}}>
                      <span style={{fontSize:10,padding:'2px 7px',borderRadius:10,
                        background:`${stageColor}22`,color:stageColor,fontWeight:600}}>
                        {l.stage}
                      </span>
                      {l.relationship&&<span style={{fontSize:10,color:'#555'}}>{l.relationship}</span>}
                      {l.source&&<span style={{fontSize:10,color:'#444'}}>{l.source}</span>}
                    </div>
                  </div>
                  <div style={{flexShrink:0,textAlign:'right' as const,marginLeft:10}}>
                    <div style={{fontSize:17,fontWeight:800,color:scoreColor(score)}}>{score}</div>
                    <div style={{fontSize:9,color:'#555'}}>{scoreLabel(score)}</div>
                  </div>
                </div>
                <div style={{display:'flex',gap:14,marginTop:7,alignItems:'center',flexWrap:'wrap' as const}}>
                  <span style={{fontSize:11,color:'#555'}}>
                    🔥<span style={{color:'#aaa'}}>{l.hunger}</span>{'  '}
                    👀<span style={{color:'#aaa'}}>{l.looking}</span>
                  </span>
                  {l.next_action_date&&(
                    <span style={{fontSize:10,fontWeight:isOverdue?700:400,color:isOverdue?RED:GOLD}}>
                      {isOverdue?'⚠ Overdue · ':'📅 '}{l.next_action_date}
                    </span>
                  )}
                </div>
                {l.next_action&&(
                  <div style={{fontSize:11,color:'#555',marginTop:4,
                    overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' as const}}>
                    → {l.next_action}
                  </div>
                )}
                {l.archived&&l.archived_reason&&(
                  <div style={{fontSize:10,color:'#555',marginTop:4,fontStyle:'italic'}}>
                    Archived: {l.archived_reason}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* FAB */}
      {!showArchived&&(
        <button onClick={openNew}
          style={{position:'fixed',bottom:24,right:20,width:52,height:52,borderRadius:26,
            border:'none',background:GOLD,color:'#000',fontSize:26,fontWeight:900,
            cursor:'pointer',boxShadow:'0 4px 20px rgba(200,162,74,0.4)',zIndex:100,
            display:'flex',alignItems:'center',justifyContent:'center'}}>
          +
        </button>
      )}

      {/* Lead detail modal */}
      {lead&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.9)',zIndex:500,overflowY:'auto'}}>
          <div style={{minHeight:'100vh',background:'#0d0d12',maxWidth:560,margin:'0 auto',paddingBottom:90}}>

            {/* Header */}
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',
              padding:'16px 18px',borderBottom:'1px solid #1f1f28',
              position:'sticky',top:0,background:'#0d0d12',zIndex:10}}>
              <div style={{fontSize:15,fontWeight:800,color:'#fff',overflow:'hidden',
                textOverflow:'ellipsis',whiteSpace:'nowrap' as const,flex:1,marginRight:8}}>
                {lead.name||'New Lead'}
              </div>
              <div style={{display:'flex',gap:6,flexShrink:0}}>
                {lead.archived?(
                  <button onClick={handleUnarchive} style={oBtn('#4CAF7D')}>Unarchive</button>
                ):(
                  <button onClick={()=>setShowArchiveModal(true)} style={oBtn('#666')}>Archive</button>
                )}
                <button onClick={()=>setLead(null)}
                  style={{padding:'5px 10px',borderRadius:8,border:'1px solid #2a2a35',
                    background:'transparent',color:'#888',cursor:'pointer',fontSize:20,
                    fontFamily:'inherit',lineHeight:'1',display:'flex',alignItems:'center'}}>
                  ×
                </button>
              </div>
            </div>

            <div style={{padding:'18px 18px 0'}}>

              {/* Stage selector */}
              <Sect label="Stage">
                <div style={{display:'flex',gap:5,overflowX:'auto',padding:'10px 14px',
                  WebkitOverflowScrolling:'touch'} as React.CSSProperties}>
                  {STAGES.map(s=>(
                    <button key={s} onClick={()=>setField('stage',s)}
                      style={{flexShrink:0,padding:'6px 12px',borderRadius:20,border:'none',
                        cursor:'pointer',fontFamily:'inherit',fontSize:11,fontWeight:lead.stage===s?700:400,
                        background:lead.stage===s?STAGE_COLOR[s]||GOLD:'#1f1f28',
                        color:lead.stage===s?'#000':'#666'}}>
                      {s}
                    </button>
                  ))}
                </div>
                {STAGE_NEXT[lead.stage as Stage]&&(
                  <div style={{padding:'0 14px 12px'}}>
                    <button onClick={handleAdvanceStage}
                      style={{width:'100%',padding:'8px',borderRadius:8,
                        border:`1px solid ${STAGE_COLOR[STAGE_NEXT[lead.stage as Stage]!]}`,
                        background:'transparent',color:STAGE_COLOR[STAGE_NEXT[lead.stage as Stage]!],
                        cursor:'pointer',fontFamily:'inherit',fontSize:12,fontWeight:600}}>
                      Move to {STAGE_NEXT[lead.stage as Stage]} →
                    </button>
                  </div>
                )}
              </Sect>

              {/* Score */}
              <div style={{background:'#13131a',borderRadius:12,padding:'14px',marginBottom:14}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
                  <div style={{fontSize:9,color:GOLD,fontWeight:700,letterSpacing:'2px',textTransform:'uppercase' as const}}>Score</div>
                  <div>
                    <span style={{fontSize:24,fontWeight:800,color:scoreColor(calcScore(lead))}}>{calcScore(lead)}</span>
                    <span style={{fontSize:11,color:'#555'}}>/100</span>
                    <span style={{fontSize:11,color:scoreColor(calcScore(lead)),marginLeft:6,fontWeight:700}}>{scoreLabel(calcScore(lead))}</span>
                  </div>
                </div>
                <SliderRow label="Hunger" value={lead.hunger}
                  hint={HUNGER_LABELS[Math.min(10,Math.round(lead.hunger))]||''}
                  onChange={v=>updateSliders(v,lead.looking)}/>
                <SliderRow label="Looking" value={lead.looking}
                  hint={LOOKING_LABELS[Math.min(10,Math.round(lead.looking))]||''}
                  onChange={v=>updateSliders(lead.hunger,v)}/>
              </div>

              {/* Contact info */}
              <Sect label="Contact Info">
                <TF label="Name" value={lead.name} onChange={v=>setField('name',v)} placeholder="Full name" required/>
                <TF label="Phone" value={lead.phone} onChange={v=>setField('phone',v)} placeholder="+61…" type="tel"/>
                <TF label="Instagram" value={lead.instagram} onChange={v=>setField('instagram',v)} placeholder="@handle"/>
                <TF label="How we met" value={lead.contact} onChange={v=>setField('contact',v)} placeholder="Where did you connect?"/>
                <SF label="Source" value={lead.source} onChange={v=>setField('source',v)} options={SOURCES}/>
              </Sect>

              {/* Profile */}
              <Sect label="Profile">
                <SF label="Relationship" value={lead.relationship} onChange={v=>setField('relationship',v)} options={RELATIONSHIPS}/>
                <SF label="Age range" value={lead.age_range} onChange={v=>setField('age_range',v)} options={AGE_RANGES}/>
                <SF label="Life stage" value={lead.life_stage} onChange={v=>setField('life_stage',v)} options={LIFE_STAGES}/>
                <SF label="Primary driver" value={lead.primary_driver} onChange={v=>setField('primary_driver',v)} options={PRIMARY_DRIVERS}/>
                <TA label="Pain point (their words)" value={lead.pain_point} onChange={v=>setField('pain_point',v)}
                  placeholder="What problem are they trying to solve?"/>
              </Sect>

              {/* Notes & Next Action */}
              <Sect label="Notes & Next Action">
                <TA label="Notes" value={lead.notes} onChange={v=>setField('notes',v)}
                  placeholder="Key things to remember…" rows={4}/>
                <TF label="Next action" value={lead.next_action} onChange={v=>setField('next_action',v)}
                  placeholder="e.g. Call, Send info, Book MPA…"/>
                <TF label="Date" value={lead.next_action_date} onChange={v=>setField('next_action_date',v)} type="date"/>
              </Sect>

            </div>

            {/* Sticky footer */}
            <div style={{position:'fixed',bottom:0,left:0,right:0,background:'#0d0d12',
              borderTop:'1px solid #1f1f28',padding:'12px 18px',maxWidth:560,margin:'0 auto',
              display:'flex',gap:8,zIndex:20,boxSizing:'border-box' as const}}>
              {delConfirm?(
                <>
                  <span style={{flex:1,fontSize:12,color:RED,display:'flex',alignItems:'center'}}>Delete permanently?</span>
                  <button onClick={handleDelete} style={{...ftrBtn,background:RED,color:'#fff'}}>Delete</button>
                  <button onClick={()=>setDelConfirm(false)} style={{...ftrBtn,background:'#1a1a24',color:'#888'}}>Cancel</button>
                </>
              ):(
                <>
                  <button onClick={()=>setDelConfirm(true)}
                    style={{padding:'10px 14px',borderRadius:10,border:'1px solid #2a2a35',
                      background:'transparent',color:'#555',cursor:'pointer',fontFamily:'inherit',fontSize:12}}>
                    Delete
                  </button>
                  <button onClick={handleSave} disabled={saving||!lead.name.trim()}
                    style={{flex:1,padding:'10px',borderRadius:10,border:'none',fontWeight:700,
                      fontSize:14,fontFamily:'inherit',
                      cursor:saving||!lead.name.trim()?'not-allowed':'pointer',
                      background:!lead.name.trim()?'#2a2a35':GOLD,
                      color:!lead.name.trim()?'#555':'#000'}}>
                    {saving?'Saving…':'Save'}
                  </button>
                </>
              )}
            </div>

          </div>
        </div>
      )}

      {/* Archive reason modal */}
      {showArchiveModal&&lead&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.92)',zIndex:600,
          display:'flex',alignItems:'flex-end',justifyContent:'center'}}>
          <div style={{background:'#13131a',borderRadius:'20px 20px 0 0',padding:24,
            width:'100%',maxWidth:560,boxSizing:'border-box' as const}}>
            <div style={{fontSize:15,fontWeight:700,color:'#fff',marginBottom:4}}>
              Archive {lead.name||'this lead'}?
            </div>
            <div style={{fontSize:12,color:'#666',marginBottom:16}}>Select a reason</div>
            {ARCHIVE_REASONS.map(r=>(
              <button key={r} onClick={()=>setArchiveReason(r)}
                style={{display:'block',width:'100%',textAlign:'left' as const,padding:'10px 14px',
                  marginBottom:6,borderRadius:10,fontFamily:'inherit',fontSize:13,cursor:'pointer',
                  border:`1px solid ${archiveReason===r?GOLD:'#2a2a35'}`,
                  background:archiveReason===r?'rgba(200,162,74,0.08)':'transparent',
                  color:archiveReason===r?GOLD:'#aaa'}}>
                {r}
              </button>
            ))}
            <div style={{display:'flex',gap:8,marginTop:14}}>
              <button onClick={()=>{setShowArchiveModal(false);setArchiveReason('')}}
                style={{flex:1,padding:12,borderRadius:10,border:'1px solid #2a2a35',
                  background:'transparent',color:'#666',cursor:'pointer',fontFamily:'inherit',fontSize:13}}>
                Cancel
              </button>
              <button onClick={handleArchive} disabled={!archiveReason}
                style={{flex:1,padding:12,borderRadius:10,border:'none',fontWeight:700,
                  fontSize:13,fontFamily:'inherit',
                  cursor:archiveReason?'pointer':'not-allowed',
                  background:archiveReason?RED:'#2a2a35',color:archiveReason?'#fff':'#555'}}>
                Archive
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

// ── Shared helpers ────────────────────────────────────────
const ftrBtn:React.CSSProperties={padding:'10px 16px',borderRadius:10,border:'none',fontWeight:700,fontSize:13,cursor:'pointer',fontFamily:'inherit'}
function oBtn(col:string):React.CSSProperties{
  return{padding:'5px 10px',borderRadius:8,border:`1px solid ${col}`,background:'transparent',color:col,cursor:'pointer',fontSize:11,fontFamily:'inherit'}
}

function TabBtn({active,color,onClick,children}:{active:boolean;color:string;onClick:()=>void;children:React.ReactNode}){
  return(
    <button onClick={onClick}
      style={{flexShrink:0,padding:'5px 11px',borderRadius:20,border:'none',cursor:'pointer',
        fontFamily:'inherit',fontSize:10,fontWeight:active?700:400,whiteSpace:'nowrap' as const,
        background:active?color:'#1a1a24',color:active?'#000':'#666'}}>
      {children}
    </button>
  )
}

function Sect({label,children}:{label:string;children:React.ReactNode}){
  return(
    <div style={{marginBottom:14}}>
      <div style={{fontSize:9,color:GOLD,fontWeight:700,letterSpacing:'2px',textTransform:'uppercase' as const,marginBottom:6}}>{label}</div>
      <div style={{background:'#13131a',borderRadius:12,overflow:'hidden'}}>{children}</div>
    </div>
  )
}

function TF({label,value,onChange,placeholder,type='text',required}:{
  label:string;value:string;onChange:(v:string)=>void;placeholder?:string;type?:string;required?:boolean
}){
  return(
    <div style={{display:'flex',alignItems:'center',padding:'9px 14px',borderBottom:'1px solid #1a1a24'}}>
      <div style={{width:100,fontSize:11,color:required&&!value?'#E8913A':'#666',flexShrink:0}}>{label}{required?' *':''}</div>
      <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
        style={{flex:1,background:'transparent',border:'none',outline:'none',color:'#fff',
          fontSize:13,fontFamily:'inherit',textAlign:'right' as const,minWidth:0}}/>
    </div>
  )
}

function SF({label,value,onChange,options}:{label:string;value:string;onChange:(v:string)=>void;options:string[]}){
  return(
    <div style={{display:'flex',alignItems:'center',padding:'9px 14px',borderBottom:'1px solid #1a1a24'}}>
      <div style={{width:100,fontSize:11,color:'#666',flexShrink:0}}>{label}</div>
      <select value={value} onChange={e=>onChange(e.target.value)}
        style={{flex:1,background:'transparent',border:'none',outline:'none',
          color:value?'#fff':'#555',fontSize:13,fontFamily:'inherit',
          textAlign:'right' as const,cursor:'pointer',appearance:'none' as const,minWidth:0}}>
        {options.map(o=><option key={o} value={o} style={{background:'#1a1a24',color:'#fff'}}>{o||`Select ${label.toLowerCase()}…`}</option>)}
      </select>
    </div>
  )
}

function TA({label,value,onChange,placeholder,rows=3}:{
  label:string;value:string;onChange:(v:string)=>void;placeholder?:string;rows?:number
}){
  return(
    <div style={{padding:'10px 14px',borderBottom:'1px solid #1a1a24'}}>
      <div style={{fontSize:10,color:'#555',marginBottom:5}}>{label}</div>
      <textarea value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} rows={rows}
        style={{width:'100%',background:'transparent',border:'none',outline:'none',
          color:'#fff',fontSize:13,fontFamily:'inherit',resize:'vertical' as const,
          boxSizing:'border-box' as const,lineHeight:1.6}}/>
    </div>
  )
}

function SliderRow({label,value,hint,onChange}:{label:string;value:number;hint?:string;onChange:(v:number)=>void}){
  return(
    <div style={{marginBottom:14}}>
      <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
        <span style={{fontSize:12,color:'#aaa'}}>{label}</span>
        <span style={{fontSize:14,fontWeight:700,color:'#fff'}}>{value}/10</span>
      </div>
      {hint&&<div style={{fontSize:9,color:'#555',marginBottom:5}}>{hint}</div>}
      <input type="range" min={1} max={10} value={value} onChange={e=>onChange(Number(e.target.value))}
        style={{width:'100%',accentColor:GOLD,cursor:'pointer'}}/>
    </div>
  )
}
