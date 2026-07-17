'use client'
import React, { useEffect, useState, useMemo } from 'react'
import { useStore } from '@/lib/stores'
import { uid, now } from '@/lib/utils'
import type { Resource, Audio } from '@/lib/stores'

const GOLD='var(--gold)';const GREEN='var(--green)';const RED='var(--red)'
const BLUE='var(--blue)';const PURPLE='var(--purple)';const TEAL='var(--teal)'
const CARD:React.CSSProperties={background:'var(--s1)',border:'1px solid var(--br)',borderRadius:'var(--r2)',padding:'14px',marginBottom:10}
const SL:React.CSSProperties={fontSize:9,color:'var(--text3)',letterSpacing:'2px',textTransform:'uppercase',fontWeight:700,marginBottom:6}
const INP:React.CSSProperties={width:'100%',background:'var(--s2)',border:'1px solid var(--br2)',borderRadius:'var(--r)',padding:'9px 12px',color:'var(--text)',fontSize:13,fontFamily:"'Sora',sans-serif",outline:'none',boxSizing:'border-box' as const}
const FL:React.CSSProperties={fontSize:10,color:GOLD,fontWeight:700,letterSpacing:'1.5px',textTransform:'uppercase' as const,marginBottom:5}
const OVERLAY:React.CSSProperties={position:'fixed',inset:0,background:'rgba(0,0,0,0.88)',zIndex:500,display:'flex',alignItems:'center',justifyContent:'center',padding:20,backdropFilter:'blur(8px)'}
const MODAL:React.CSSProperties={background:'var(--s1)',border:'1px solid var(--br)',borderRadius:'var(--r3)',width:'100%',maxWidth:480,padding:24,maxHeight:'90vh',overflowY:'auto' as const,margin:'auto'}

const CATS=['Leadership','Mindset','Business','Skills','Health','Other']
const TYPES=['Book','Podcast','Course','Video','Article','Other']
const TYPE_COLOR:Record<string,string>={Book:GOLD,Podcast:PURPLE,Course:BLUE,Video:TEAL,Article:'#5B9BD5',Other:'var(--text4)'}
const STATUS_COLOR:Record<string,string>={reading:TEAL,completed:GREEN,'want-to-read':'var(--text4)'}

// Encoded field helpers — mirrors admin OS
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

type Tab='reading'|'audios'
const EMPTY_R={title:'',type:'Book',category:'Mindset',author:'',url:'',takeaway:'',status:'reading',rating:5,prog:0,act:'',actDone:false}
const EMPTY_A={title:'',speaker:'',duration:'',url:'',notes:'',act:'',actDone:false}

export default function PersonalDev(){
  const {userId,resources,audios,loadResources,loadAudios,upsertResource,deleteResource,upsertAudio,deleteAudio}=useStore()
  const [tab,setTab]=useState<Tab>('reading')
  const [rFilter,setRFilter]=useState('all')
  const [rModal,setRModal]=useState(false)
  const [rEdit,setREdit]=useState<Resource|null>(null)
  const [rForm,setRForm]=useState(EMPTY_R)
  const [aModal,setAModal]=useState(false)
  const [aEdit,setAEdit]=useState<Audio|null>(null)
  const [aForm,setAForm]=useState(EMPTY_A)

  useEffect(()=>{ loadResources(); loadAudios() },[]) // eslint-disable-line

  function openAddR(){setREdit(null);setRForm(EMPTY_R);setRModal(true)}
  function openEditR(r:Resource){
    const d=decodeRes(r)
    setREdit(r);setRForm({title:r.title,type:r.type,category:r.category,author:r.author,url:r.url,status:r.status,rating:r.rating,takeaway:d.takeaway,prog:d.prog,act:d.act,actDone:d.actDone})
    setRModal(true)
  }
  async function saveR(){
    if(!rForm.title.trim()||!userId)return
    const enc=encodeRes(rForm.takeaway,rForm.prog,rForm.act,rForm.actDone)
    const base=rEdit??{id:uid(),user_id:userId,created_at:now()}
    await upsertResource({...base,title:rForm.title.trim(),type:rForm.type,category:rForm.category,author:rForm.author.trim(),url:rForm.url.trim(),status:rForm.status,rating:rForm.rating,key_takeaway:enc,date_completed:rForm.status==='completed'?(rEdit as any)?.date_completed||now().slice(0,10):'',updated_at:now()} as Resource)
    setRModal(false)
  }

  function openAddA(){setAEdit(null);setAForm(EMPTY_A);setAModal(true)}
  function openEditA(a:Audio){
    const raw=a.notes||''
    const act=(raw.match(/\[\[ACT:([^\]]*)\]\]/)||[])[1]||''
    const actDone=/\[\[ACTDONE:1\]\]/.test(raw)
    const notes=raw.replace(/\[\[ACT:[^\]]*\]\]/g,'').replace(/\[\[ACTDONE:1\]\]/g,'').trim()
    setAEdit(a);setAForm({title:a.title,speaker:(a as any).speaker||'',duration:(a as any).duration||'',url:a.url||'',notes,act,actDone})
    setAModal(true)
  }
  async function saveA(){
    if(!aForm.title.trim()||!userId)return
    let enc=aForm.notes.trim()
    if(aForm.act.trim())enc+=`[[ACT:${aForm.act.trim()}]]`
    if(aForm.actDone)enc+='[[ACTDONE:1]]'
    const base=aEdit??{id:uid(),user_id:userId,created_at:now()}
    await upsertAudio({...base,title:aForm.title.trim(),url:aForm.url.trim(),notes:enc,speaker:aForm.speaker,duration:aForm.duration,updated_at:now()} as any)
    setAModal(false)
  }

  const reading=useMemo(()=>resources.filter(r=>r.status==='reading'),[resources])
  const filteredR=useMemo(()=>{
    if(rFilter==='all')return resources
    return resources.filter(r=>r.status===rFilter)
  },[resources,rFilter])

  const TABS=[{id:'reading' as Tab,label:'📖 Reading'},{id:'audios' as Tab,label:'🎧 Audios'}]

  return(
    <div style={{animation:'fade-in 0.3s ease',paddingBottom:48}}>
      <div style={{marginBottom:16}}>
        <div style={{fontSize:9,color:'var(--text4)',letterSpacing:'2px',textTransform:'uppercase' as const,fontWeight:700,marginBottom:4}}>Growth</div>
        <div style={{fontSize:20,fontWeight:800,color:'var(--text)'}}>Personal Development</div>
      </div>

      {/* Currently reading strip */}
      {reading.length>0&&(
        <div style={{marginBottom:14,padding:'12px 14px',background:'rgba(200,162,74,0.06)',border:'1px solid rgba(200,162,74,0.2)',borderRadius:'var(--r2)'}}>
          <div style={{fontSize:9,color:GOLD,fontWeight:700,letterSpacing:'2px',textTransform:'uppercase' as const,marginBottom:8}}>Currently Reading</div>
          {reading.map(r=>{
            const {prog}=decodeRes(r)
            return(
              <div key={r.id} style={{display:'flex',alignItems:'center',gap:10,marginBottom:reading.indexOf(r)<reading.length-1?8:0}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:12,fontWeight:700,color:'var(--text)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' as const}}>{r.title}</div>
                  {r.author&&<div style={{fontSize:10,color:'var(--text4)'}}>{r.author}</div>}
                </div>
                {prog>0&&(
                  <div style={{display:'flex',flexDirection:'column' as const,alignItems:'flex-end',gap:2,flexShrink:0}}>
                    <span style={{fontSize:10,fontWeight:700,color:GOLD}}>{prog}%</span>
                    <div style={{width:48,height:3,background:'var(--s3)',borderRadius:2,overflow:'hidden'}}>
                      <div style={{height:'100%',width:prog+'%',background:GOLD,borderRadius:2}}/>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Sub-tabs */}
      <div style={{display:'flex',gap:3,marginBottom:16,background:'var(--s1)',borderRadius:'var(--r2)',padding:4,border:'1px solid var(--br)'}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{flex:1,padding:'8px 6px',borderRadius:'var(--r)',border:'none',background:tab===t.id?'var(--s3)':'transparent',color:tab===t.id?GOLD:'var(--text3)',fontSize:10,fontWeight:tab===t.id?700:400,cursor:'pointer',fontFamily:"'Sora',sans-serif",transition:'all 0.15s'}}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── READING TAB ── */}
      {tab==='reading'&&(
        <div>
          {/* Status filter + add */}
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
            <div style={{display:'flex',gap:4}}>
              {['all','reading','completed','want-to-read'].map(s=>(
                <button key={s} onClick={()=>setRFilter(s)} style={{padding:'4px 10px',borderRadius:'var(--r)',border:'1px solid var(--br)',background:rFilter===s?GOLD:'var(--s1)',color:rFilter===s?'#000':'var(--text4)',fontSize:9,fontWeight:rFilter===s?700:400,cursor:'pointer',fontFamily:"'Sora',sans-serif",whiteSpace:'nowrap' as const,textTransform:'capitalize' as const}}>
                  {s==='all'?'All':s==='want-to-read'?'Want to read':s}
                </button>
              ))}
            </div>
            <button onClick={openAddR} style={{padding:'6px 14px',borderRadius:'var(--r)',border:'none',background:GOLD,color:'#000',fontSize:11,fontWeight:700,cursor:'pointer',fontFamily:"'Sora',sans-serif",flexShrink:0}}>+ Add</button>
          </div>

          {filteredR.length===0&&(
            <div style={{...CARD,textAlign:'center' as const,padding:'32px 20px'}}>
              <div style={{fontSize:28,marginBottom:8}}>📚</div>
              <div style={{fontSize:13,fontWeight:700,color:'var(--text2)',marginBottom:4}}>Nothing here yet</div>
              <div style={{fontSize:11,color:'var(--text4)'}}>Add a book, podcast, or course you're working through.</div>
            </div>
          )}

          {filteredR.map(r=>{
            const {prog,act,actDone}=decodeRes(r)
            const color=TYPE_COLOR[r.type]||'var(--text4)'
            const sColor=STATUS_COLOR[r.status]||'var(--text4)'
            return(
              <div key={r.id} style={{...CARD,borderLeft:`3px solid ${color}`}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8,marginBottom:8}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:700,color:'var(--text)',marginBottom:1,wordBreak:'break-word' as const}}>{r.title}</div>
                    {r.author&&<div style={{fontSize:10,color:'var(--text4)'}}>by {r.author}</div>}
                  </div>
                  <div style={{display:'flex',flexDirection:'column' as const,alignItems:'flex-end',gap:4,flexShrink:0}}>
                    <span style={{fontSize:9,fontWeight:700,color,padding:'2px 7px',borderRadius:'var(--r)',background:color+'18'}}>{r.type}</span>
                    <span style={{fontSize:9,color:sColor,textTransform:'capitalize' as const}}>{r.status==='want-to-read'?'Want to read':r.status}</span>
                  </div>
                </div>
                {r.status==='reading'&&prog>0&&(
                  <div style={{marginBottom:8}}>
                    <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                      <span style={{fontSize:9,color:'var(--text4)'}}>Progress</span>
                      <span style={{fontSize:9,fontWeight:700,color:GOLD}}>{prog}%</span>
                    </div>
                    <div style={{height:4,background:'var(--s3)',borderRadius:2,overflow:'hidden'}}>
                      <div style={{height:'100%',width:prog+'%',background:GOLD,borderRadius:2,transition:'width 0.5s'}}/>
                    </div>
                  </div>
                )}
                {act&&(
                  <div style={{padding:'7px 10px',background:actDone?'rgba(76,175,125,0.06)':'rgba(200,162,74,0.06)',border:`1px solid ${actDone?'rgba(76,175,125,0.2)':'rgba(200,162,74,0.2)'}`,borderRadius:'var(--r)',marginBottom:8,fontSize:10,color:actDone?GREEN:GOLD}}>
                    {actDone?'✓':''} {act}
                  </div>
                )}
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <div style={{display:'flex',gap:6}}>
                    <button onClick={()=>openEditR(r)} style={{padding:'4px 12px',borderRadius:'var(--r)',border:'1px solid var(--br)',background:'var(--s2)',color:'var(--text4)',fontSize:10,cursor:'pointer',fontFamily:"'Sora',sans-serif"}}>Edit</button>
                    <button onClick={()=>deleteResource(r.id)} style={{padding:'4px 10px',borderRadius:'var(--r)',border:'1px solid rgba(224,85,85,0.2)',background:'rgba(224,85,85,0.05)',color:RED,fontSize:10,cursor:'pointer',fontFamily:"'Sora',sans-serif"}}>Delete</button>
                  </div>
                  {r.url&&<a href={r.url} target="_blank" rel="noopener noreferrer" style={{fontSize:10,color:BLUE,textDecoration:'none',fontWeight:700}}>Open →</a>}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── AUDIOS TAB ── */}
      {tab==='audios'&&(
        <div>
          <div style={{display:'flex',justifyContent:'flex-end',marginBottom:12}}>
            <button onClick={openAddA} style={{padding:'6px 14px',borderRadius:'var(--r)',border:'none',background:GOLD,color:'#000',fontSize:11,fontWeight:700,cursor:'pointer',fontFamily:"'Sora',sans-serif"}}>+ Add</button>
          </div>

          {audios.length===0&&(
            <div style={{...CARD,textAlign:'center' as const,padding:'32px 20px'}}>
              <div style={{fontSize:28,marginBottom:8}}>🎧</div>
              <div style={{fontSize:13,fontWeight:700,color:'var(--text2)',marginBottom:4}}>No audios yet</div>
              <div style={{fontSize:11,color:'var(--text4)'}}>Log training calls, keynotes, or podcasts you listen to.</div>
            </div>
          )}

          {audios.map(a=>{
            const raw=a.notes||''
            const act=(raw.match(/\[\[ACT:([^\]]*)\]\]/)||[])[1]||''
            const actDone=/\[\[ACTDONE:1\]\]/.test(raw)
            const notes=raw.replace(/\[\[ACT:[^\]]*\]\]/g,'').replace(/\[\[ACTDONE:1\]\]/g,'').trim()
            return(
              <div key={a.id} style={{...CARD,borderLeft:`3px solid ${PURPLE}`}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8,marginBottom:6}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:700,color:'var(--text)',marginBottom:1,wordBreak:'break-word' as const}}>{a.title}</div>
                    {(a as any).speaker&&<div style={{fontSize:10,color:'var(--text4)'}}>{(a as any).speaker}</div>}
                  </div>
                  {(a as any).duration&&<span style={{fontSize:9,color:PURPLE,padding:'2px 7px',borderRadius:'var(--r)',background:'rgba(155,91,213,0.1)',flexShrink:0}}>{(a as any).duration}</span>}
                </div>
                {notes&&<div style={{fontSize:11,color:'var(--text3)',lineHeight:1.6,marginBottom:8}}>{notes}</div>}
                {act&&(
                  <div style={{padding:'7px 10px',background:actDone?'rgba(76,175,125,0.06)':'rgba(200,162,74,0.06)',border:`1px solid ${actDone?'rgba(76,175,125,0.2)':'rgba(200,162,74,0.2)'}`,borderRadius:'var(--r)',marginBottom:8,fontSize:10,color:actDone?GREEN:GOLD}}>
                    {actDone?'✓':''} {act}
                  </div>
                )}
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <div style={{display:'flex',gap:6}}>
                    <button onClick={()=>openEditA(a)} style={{padding:'4px 12px',borderRadius:'var(--r)',border:'1px solid var(--br)',background:'var(--s2)',color:'var(--text4)',fontSize:10,cursor:'pointer',fontFamily:"'Sora',sans-serif"}}>Edit</button>
                    <button onClick={()=>deleteAudio(a.id)} style={{padding:'4px 10px',borderRadius:'var(--r)',border:'1px solid rgba(224,85,85,0.2)',background:'rgba(224,85,85,0.05)',color:RED,fontSize:10,cursor:'pointer',fontFamily:"'Sora',sans-serif"}}>Delete</button>
                  </div>
                  {a.url&&<a href={a.url} target="_blank" rel="noopener noreferrer" style={{fontSize:10,color:BLUE,textDecoration:'none',fontWeight:700}}>Open →</a>}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── RESOURCE MODAL ── */}
      {rModal&&(
        <div style={OVERLAY} onClick={e=>{if(e.target===e.currentTarget)setRModal(false)}}>
          <div style={MODAL}>
            <div style={{fontSize:15,fontWeight:700,color:'var(--text)',marginBottom:16}}>{rEdit?'Edit':'Add'} Resource</div>
            <div style={{display:'flex',flexDirection:'column' as const,gap:12}}>
              <div><div style={FL}>Title</div><input style={INP} value={rForm.title} onChange={e=>setRForm(p=>({...p,title:e.target.value}))} placeholder="Book / podcast / course title"/></div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                <div><div style={FL}>Type</div>
                  <select style={INP} value={rForm.type} onChange={e=>setRForm(p=>({...p,type:e.target.value}))}>
                    {TYPES.map(t=><option key={t}>{t}</option>)}
                  </select>
                </div>
                <div><div style={FL}>Category</div>
                  <select style={INP} value={rForm.category} onChange={e=>setRForm(p=>({...p,category:e.target.value}))}>
                    {CATS.map(c=><option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div><div style={FL}>Author / Speaker</div><input style={INP} value={rForm.author} onChange={e=>setRForm(p=>({...p,author:e.target.value}))} placeholder="Optional"/></div>
              <div><div style={FL}>URL (optional)</div><input style={INP} value={rForm.url} onChange={e=>setRForm(p=>({...p,url:e.target.value}))} placeholder="https://…" type="url"/></div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                <div><div style={FL}>Status</div>
                  <select style={INP} value={rForm.status} onChange={e=>setRForm(p=>({...p,status:e.target.value}))}>
                    <option value="reading">Reading</option>
                    <option value="completed">Completed</option>
                    <option value="want-to-read">Want to read</option>
                  </select>
                </div>
                {rForm.status==='reading'&&(
                  <div><div style={FL}>Progress %</div>
                    <input type="number" min={0} max={100} style={INP} value={rForm.prog} onChange={e=>setRForm(p=>({...p,prog:Math.min(100,Math.max(0,parseInt(e.target.value)||0))}))}/>
                  </div>
                )}
              </div>
              <div><div style={FL}>Key Takeaway</div><textarea style={{...INP,minHeight:60,resize:'vertical' as const}} value={rForm.takeaway} onChange={e=>setRForm(p=>({...p,takeaway:e.target.value}))} placeholder="What's the main insight?"/></div>
              <div><div style={FL}>Action Item</div><input style={INP} value={rForm.act} onChange={e=>setRForm(p=>({...p,act:e.target.value}))} placeholder="What will you do differently?"/>
                {rForm.act.trim()&&(
                  <label style={{display:'flex',alignItems:'center',gap:8,marginTop:6,cursor:'pointer'}}>
                    <input type="checkbox" checked={rForm.actDone} onChange={e=>setRForm(p=>({...p,actDone:e.target.checked}))}/>
                    <span style={{fontSize:11,color:'var(--text3)'}}>Mark action done</span>
                  </label>
                )}
              </div>
            </div>
            <div style={{display:'flex',gap:8,marginTop:20}}>
              <button onClick={saveR} style={{flex:1,padding:'11px',borderRadius:'var(--r)',border:'none',background:GOLD,color:'#000',fontWeight:700,cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:13}}>Save</button>
              <button onClick={()=>setRModal(false)} style={{padding:'11px 16px',borderRadius:'var(--r)',border:'1px solid var(--br)',background:'transparent',color:'var(--text3)',cursor:'pointer',fontFamily:"'Sora',sans-serif"}}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── AUDIO MODAL ── */}
      {aModal&&(
        <div style={OVERLAY} onClick={e=>{if(e.target===e.currentTarget)setAModal(false)}}>
          <div style={MODAL}>
            <div style={{fontSize:15,fontWeight:700,color:'var(--text)',marginBottom:16}}>{aEdit?'Edit':'Add'} Audio</div>
            <div style={{display:'flex',flexDirection:'column' as const,gap:12}}>
              <div><div style={FL}>Title</div><input style={INP} value={aForm.title} onChange={e=>setAForm(p=>({...p,title:e.target.value}))} placeholder="Keynote / training call / podcast episode"/></div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                <div><div style={FL}>Speaker</div><input style={INP} value={aForm.speaker} onChange={e=>setAForm(p=>({...p,speaker:e.target.value}))} placeholder="Optional"/></div>
                <div><div style={FL}>Duration</div><input style={INP} value={aForm.duration} onChange={e=>setAForm(p=>({...p,duration:e.target.value}))} placeholder="e.g. 45 min"/></div>
              </div>
              <div><div style={FL}>URL (optional)</div><input style={INP} value={aForm.url} onChange={e=>setAForm(p=>({...p,url:e.target.value}))} placeholder="https://…" type="url"/></div>
              <div><div style={FL}>Notes</div><textarea style={{...INP,minHeight:70,resize:'vertical' as const}} value={aForm.notes} onChange={e=>setAForm(p=>({...p,notes:e.target.value}))} placeholder="Key points from the session"/></div>
              <div><div style={FL}>Action Item</div><input style={INP} value={aForm.act} onChange={e=>setAForm(p=>({...p,act:e.target.value}))} placeholder="What will you implement?"/>
                {aForm.act.trim()&&(
                  <label style={{display:'flex',alignItems:'center',gap:8,marginTop:6,cursor:'pointer'}}>
                    <input type="checkbox" checked={aForm.actDone} onChange={e=>setAForm(p=>({...p,actDone:e.target.checked}))}/>
                    <span style={{fontSize:11,color:'var(--text3)'}}>Mark action done</span>
                  </label>
                )}
              </div>
            </div>
            <div style={{display:'flex',gap:8,marginTop:20}}>
              <button onClick={saveA} style={{flex:1,padding:'11px',borderRadius:'var(--r)',border:'none',background:PURPLE,color:'#fff',fontWeight:700,cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:13}}>Save</button>
              <button onClick={()=>setAModal(false)} style={{padding:'11px 16px',borderRadius:'var(--r)',border:'1px solid var(--br)',background:'transparent',color:'var(--text3)',cursor:'pointer',fontFamily:"'Sora',sans-serif"}}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
