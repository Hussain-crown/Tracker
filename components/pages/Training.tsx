'use client'
import React, { useEffect, useState, useMemo } from 'react'
import { authFetch } from '@/lib/authFetch'
import { ErrorBoundary } from '@/components/ErrorBoundary'

const GOLD='var(--gold)';const GREEN='var(--green)'
const CARD:React.CSSProperties={background:'var(--s1)',border:'1px solid var(--br)',borderRadius:'var(--r2)',padding:'16px',marginBottom:10}

interface Part { id:string; module_id:string; title:string; description:string; video_urls:string[]; image_url:string; body:string; order_index:number }
interface Module { id:string; title:string; description:string; order_index:number; parts:Part[] }
interface FlatPart extends Part { moduleTitle:string; flatIndex:number }

const URL_RE = /https?:\/\/[^\s]+/g
// Renders plain text with any http(s) URLs turned into clickable links --
// part bodies often reference an external template/catalogue/rewards link.
function linkedText(text:string){
  const parts:React.ReactNode[]=[]
  let last=0; let m:RegExpExecArray|null
  URL_RE.lastIndex=0
  while((m=URL_RE.exec(text))){
    if(m.index>last)parts.push(text.slice(last,m.index))
    const url=m[0].replace(/[.,)]+$/,'')
    parts.push(<a key={m.index} href={url} target="_blank" rel="noopener noreferrer" style={{color:GOLD,wordBreak:'break-all' as const}}>{url}</a>)
    if(url.length<m[0].length)parts.push(m[0].slice(url.length))
    last=m.index+m[0].length
  }
  if(last<text.length)parts.push(text.slice(last))
  return parts
}

// Turns a Vimeo/YouTube share URL into an embeddable player src. Vimeo's
// unlisted/private-link videos carry a privacy hash as the URL's second path
// segment (…/vimeo.com/<id>/<hash>) that the plain embed URL needs as ?h=
// or the player 404s.
function embedSrc(url:string):string|null{
  if(!url)return null
  try{
    const u=new URL(url)
    if(u.hostname.includes('vimeo.com')){
      const parts=u.pathname.split('/').filter(Boolean)
      const id=parts[0]
      const hash=parts[1]
      if(!id)return null
      return `https://player.vimeo.com/video/${id}${hash?`?h=${hash}`:''}`
    }
    if(u.hostname.includes('youtube.com')||u.hostname.includes('youtu.be')){
      const id=u.hostname.includes('youtu.be')?u.pathname.slice(1):u.searchParams.get('v')
      if(!id)return null
      return `https://www.youtube.com/embed/${id}`
    }
    return null
  }catch{return null}
}

export default function Training(){
  const [modules,setModules]   = useState<Module[]>([])
  const [completed,setCompleted] = useState<Set<string>>(new Set())
  const [loading,setLoading]   = useState(true)
  const [openModule,setOpenModule] = useState<string|null>(null)
  const [openPart,setOpenPart] = useState<Part|null>(null)
  const [marking,setMarking]   = useState(false)
  const [lockedMsg,setLockedMsg] = useState('')

  async function load(keepOpenModule=true){
    setLoading(true)
    try{
      const res = await authFetch('/api/team/training')
      const d = await res.json().catch(()=>({}))
      const mods = ((d.modules||[]) as Module[]).map(m=>({...m,parts:[...(m.parts||[])].sort((a,b)=>a.order_index-b.order_index)})).sort((a,b)=>a.order_index-b.order_index)
      setModules(mods)
      setCompleted(new Set((d.completedPartIds||[]) as string[]))
      setOpenModule(prev=>keepOpenModule&&prev?prev:(mods[0]?.id??null))
    }catch{ setModules([]) }
    finally{ setLoading(false) }
  }
  useEffect(()=>{load(false)},[]) // eslint-disable-line

  // One continuous sequence across every module (module order, then part
  // order within it) — this is the order parts must be completed in.
  const flat:FlatPart[] = useMemo(()=>{
    let i=0
    const out:FlatPart[]=[]
    for(const m of modules) for(const p of m.parts) out.push({...p,moduleTitle:m.title,flatIndex:i++})
    return out
  },[modules])

  // The first not-yet-completed part in the sequence is the one currently
  // unlockable; everything before it is done, everything after is locked.
  const nextIndex = useMemo(()=>{
    const i = flat.findIndex(p=>!completed.has(p.id))
    return i===-1?flat.length:i
  },[flat,completed])

  const isLocked = (flatIndex:number)=> flatIndex>nextIndex
  const isNext   = (flatIndex:number)=> flatIndex===nextIndex

  const totalParts = flat.length
  const totalDone   = Math.min(nextIndex,totalParts)
  const pct = totalParts?Math.round((totalDone/totalParts)*100):0

  async function toggleComplete(part:Part, next:boolean){
    if(marking)return
    setMarking(true);setLockedMsg('')
    try{
      const res = await authFetch('/api/team/training/complete',{method:'POST',body:JSON.stringify({partId:part.id,completed:next})})
      const d = await res.json().catch(()=>({}))
      if(!res.ok){
        if(d?.error==='part_locked') setLockedMsg(d?.message||'Complete the earlier parts first.')
        return
      }
      await load()
      if(next) setOpenPart(null)
    }finally{ setMarking(false) }
  }

  function openPartIfUnlocked(p:FlatPart){
    if(isLocked(p.flatIndex)){
      setLockedMsg('Complete the earlier parts first to unlock this one.')
      return
    }
    setLockedMsg('')
    setOpenPart(p)
  }

  return(
    <ErrorBoundary label="Training">
    <div style={{animation:'fade-in 0.3s ease',paddingBottom:48}}>
      <div style={{marginBottom:18}}>
        <div style={{fontSize:9,color:'var(--text4)',letterSpacing:'2px',textTransform:'uppercase' as const,fontWeight:700,marginBottom:4}}>Level 1</div>
        <div style={{fontSize:20,fontWeight:800,color:'var(--text)',marginBottom:10}}>Training</div>
        {totalParts>0 && (
          <div>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:5}}>
              <span style={{fontSize:11,color:'var(--text3)',fontWeight:600}}>{totalDone===totalParts?'All parts complete 🎉':`${totalDone} of ${totalParts} parts complete`}</span>
              <span style={{fontSize:11,color:GOLD,fontWeight:700}}>{pct}%</span>
            </div>
            <div style={{height:6,background:'var(--s2)',borderRadius:3,overflow:'hidden'}}>
              <div style={{height:'100%',width:`${pct}%`,background:`linear-gradient(90deg,${GOLD},var(--gold3))`,transition:'width 0.4s ease',borderRadius:3}}/>
            </div>
          </div>
        )}
      </div>

      {loading?(
        <div style={{...CARD,textAlign:'center',padding:32}}>
          <div style={{fontSize:13,color:'var(--text4)'}}>Loading…</div>
        </div>
      ):modules.length===0?(
        <div style={{...CARD,textAlign:'center'}}>
          <div style={{fontSize:36,marginBottom:16}}>📚</div>
          <div style={{fontSize:15,fontWeight:700,color:GOLD,marginBottom:8}}>Training Content Coming Soon</div>
          <div style={{fontSize:12,color:'var(--text4)',lineHeight:1.7,maxWidth:280,margin:'0 auto'}}>
            Your training resources will appear here once your upline adds them.
          </div>
        </div>
      ):(
        modules.map(m=>{
          const mParts = flat.filter(p=>p.module_id===m.id)
          const done = mParts.filter(p=>completed.has(p.id)).length
          const moduleLocked = mParts.length>0 && isLocked(mParts[0].flatIndex)
          const moduleComplete = mParts.length>0 && done===mParts.length
          const isOpen = openModule===m.id && !moduleLocked
          return(
            <div key={m.id} style={{...CARD,opacity:moduleLocked?0.55:1}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10,cursor:moduleLocked?'default':'pointer'}}
                onClick={()=>{ if(moduleLocked){ setLockedMsg('Finish the current module to unlock this one.'); return } setOpenModule(isOpen?null:m.id) }}>
                <div style={{display:'flex',alignItems:'center',gap:10,minWidth:0}}>
                  <div style={{width:28,height:28,borderRadius:'50%',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:800,
                    background:moduleComplete?GREEN:moduleLocked?'var(--s2)':`${GOLD}18`,
                    color:moduleComplete?'#000':moduleLocked?'var(--text4)':GOLD,
                    border:moduleLocked?'1px solid var(--br)':'none'}}>
                    {moduleLocked?'🔒':moduleComplete?'✓':m.order_index+1}
                  </div>
                  <div style={{minWidth:0}}>
                    <div style={{fontSize:14,fontWeight:700,color:'var(--text)'}}>{m.title}</div>
                    {m.description && <div style={{fontSize:11,color:'var(--text4)',marginTop:2}}>{m.description}</div>}
                  </div>
                </div>
                <div style={{display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
                  <span style={{fontSize:10,color:moduleComplete?GREEN:'var(--text4)',fontWeight:700}}>{done}/{mParts.length}</span>
                  {!moduleLocked && <span style={{fontSize:11,color:'var(--text4)'}}>{isOpen?'▾':'▸'}</span>}
                </div>
              </div>
              {mParts.length>0 && (
                <div style={{height:3,background:'var(--s2)',borderRadius:2,marginTop:10,overflow:'hidden'}}>
                  <div style={{height:'100%',width:`${(done/mParts.length)*100}%`,background:moduleComplete?GREEN:GOLD,transition:'width 0.3s'}}/>
                </div>
              )}
              {isOpen && (
                <div style={{marginTop:14,paddingTop:14,borderTop:'1px solid var(--br)',display:'flex',flexDirection:'column' as const,gap:6}}>
                  {mParts.map((p,i)=>{
                    const isDone=completed.has(p.id)
                    const locked=isLocked(p.flatIndex)
                    const next=isNext(p.flatIndex)
                    return(
                      <div key={p.id} onClick={()=>openPartIfUnlocked(p)}
                        style={{display:'flex',alignItems:'center',gap:10,padding:'11px 12px',borderRadius:'var(--r)',
                          background:next?`${GOLD}0F`:'var(--s2)',
                          border:next?`1px solid ${GOLD}50`:'1px solid transparent',
                          cursor:locked?'default':'pointer',opacity:locked?0.5:1}}>
                        <div style={{width:22,height:22,borderRadius:'50%',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,
                          border:`1.5px solid ${isDone?GREEN:locked?'var(--br)':GOLD}`,
                          background:isDone?GREEN:'transparent',
                          color:isDone?'#000':locked?'var(--text4)':GOLD}}>
                          {isDone?'✓':locked?'🔒':i+1}
                        </div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:13,fontWeight:600,color:locked?'var(--text4)':'var(--text)'}}>{p.title}</div>
                          {p.description && <div style={{fontSize:11,color:'var(--text4)',marginTop:1}}>{p.description}</div>}
                        </div>
                        {next && <div style={{fontSize:10,color:GOLD,fontWeight:700,flexShrink:0,letterSpacing:'0.5px'}}>UP NEXT</div>}
                        {!next && p.video_urls?.length>0 && <div style={{fontSize:14,flexShrink:0}}>🎬</div>}
                        {!next && !p.video_urls?.length && p.image_url && <div style={{fontSize:14,flexShrink:0}}>🖼️</div>}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })
      )}

      {lockedMsg && (
        <div style={{position:'fixed',bottom:24,left:20,right:20,maxWidth:400,margin:'0 auto',background:'var(--s1)',border:`1px solid ${GOLD}50`,borderRadius:'var(--r2)',padding:'12px 16px',fontSize:12,color:'var(--text2)',textAlign:'center',boxShadow:'0 8px 24px rgba(0,0,0,0.4)',zIndex:500}}
          onClick={()=>setLockedMsg('')}>
          🔒 {lockedMsg}
        </div>
      )}

      {/* ── PART VIEWER ── */}
      {openPart && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.92)',zIndex:400,display:'flex',alignItems:'flex-start',justifyContent:'center',padding:'20px',backdropFilter:'blur(8px)',overflowY:'auto'}} onClick={e=>{if(e.target===e.currentTarget)setOpenPart(null)}}>
          <div style={{background:'var(--s1)',border:'1px solid var(--br)',borderRadius:'var(--r3)',width:'100%',maxWidth:560,margin:'auto',overflow:'hidden'}}>
            {openPart.video_urls?.filter(v=>embedSrc(v)).map((v,i)=>(
              <div key={i} style={{position:'relative',paddingTop:'56.25%',background:'#000',borderBottom:i<openPart.video_urls.length-1?'1px solid var(--br)':'none'}}>
                <iframe src={embedSrc(v)!} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen
                  style={{position:'absolute',top:0,left:0,width:'100%',height:'100%',border:'none'}}/>
              </div>
            ))}
            {openPart.image_url && (
              <img src={openPart.image_url} alt={openPart.title} style={{width:'100%',display:'block'}}/>
            )}
            <div style={{padding:24}}>
              <div style={{fontSize:17,fontWeight:700,color:'var(--text)',marginBottom:4}}>{openPart.title}</div>
              {openPart.description && <div style={{fontSize:12,color:'var(--text4)',marginBottom:14}}>{openPart.description}</div>}
              {openPart.body && <div style={{fontSize:13,color:'var(--text2)',lineHeight:1.7,whiteSpace:'pre-wrap' as const,marginBottom:20}}>{linkedText(openPart.body)}</div>}
              <div style={{display:'flex',gap:8}}>
                <button onClick={()=>toggleComplete(openPart,!completed.has(openPart.id))} disabled={marking}
                  style={{flex:1,padding:'11px',borderRadius:'var(--r)',border:'none',cursor:marking?'not-allowed':'pointer',fontFamily:"'Sora',sans-serif",fontWeight:700,fontSize:13,
                    background:completed.has(openPart.id)?'var(--s2)':`linear-gradient(135deg,${GOLD},var(--gold3))`,
                    color:completed.has(openPart.id)?'var(--text3)':'#000'}}>
                  {marking?'…':completed.has(openPart.id)?'✓ Completed — tap to undo':'Mark Complete'}
                </button>
                <button onClick={()=>setOpenPart(null)} style={{padding:'11px 16px',borderRadius:'var(--r)',border:'1px solid var(--br)',background:'transparent',color:'var(--text3)',cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:13}}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
    </ErrorBoundary>
  )
}
