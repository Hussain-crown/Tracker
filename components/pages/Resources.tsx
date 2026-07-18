'use client'
import React, { useEffect, useState, useMemo } from 'react'
import { useStore } from '@/lib/stores'
import { uid, now } from '@/lib/utils'
import type { Resource } from '@/lib/stores'

const GOLD='var(--gold)';const GREEN='var(--green)';const RED='var(--red)'
const BLUE='var(--blue)';const PURPLE='var(--purple)';const TEAL='var(--teal)'

const TYPES=['Book','Podcast','Course','Video','Article','Tool','Other']
const CATS=['All','Leadership','Mindset','Business','Skills','Health','Other']
const TYPE_COLOR:Record<string,string>={Book:GOLD,Podcast:PURPLE,Course:BLUE,Video:TEAL,Article:'#5B9BD5',Tool:GREEN,Other:'var(--text4)'}
const STATUS_COLOR:Record<string,string>={reading:TEAL,completed:GREEN,'want-to-read':'var(--text4)'}

const CARD:React.CSSProperties={background:'var(--s1)',border:'1px solid var(--br)',borderRadius:'var(--r2)',padding:'14px',marginBottom:8}
const INP:React.CSSProperties={width:'100%',background:'var(--s2)',border:'1px solid var(--br2)',borderRadius:'var(--r)',padding:'9px 12px',color:'var(--text)',fontSize:13,fontFamily:"'Sora',sans-serif",outline:'none',boxSizing:'border-box' as const}
const FL:React.CSSProperties={fontSize:10,color:GOLD,fontWeight:700,letterSpacing:'1.5px',textTransform:'uppercase' as const,marginBottom:5}
const OVERLAY:React.CSSProperties={position:'fixed',inset:0,background:'rgba(0,0,0,0.88)',zIndex:500,display:'flex',alignItems:'center',justifyContent:'center',padding:20,backdropFilter:'blur(8px)'}
const MODAL:React.CSSProperties={background:'var(--s1)',border:'1px solid var(--br)',borderRadius:'var(--r3)',width:'100%',maxWidth:480,padding:24,maxHeight:'90vh',overflowY:'auto' as const,margin:'auto'}

const EMPTY={title:'',type:'Article',category:'Other',author:'',url:'',notes:'',status:'want-to-read'}

export default function Resources(){
  const {userId,resources,loadResources,upsertResource,deleteResource}=useStore()
  const [cat,setCat]=useState('All')
  const [modal,setModal]=useState(false)
  const [edit,setEdit]=useState<Resource|null>(null)
  const [form,setForm]=useState(EMPTY)

  useEffect(()=>{ loadResources() },[]) // eslint-disable-line

  function openAdd(){ setEdit(null); setForm(EMPTY); setModal(true) }
  function openEdit(r:Resource){
    setEdit(r)
    setForm({title:r.title,type:r.type,category:r.category,author:r.author,url:r.url,notes:r.key_takeaway||'',status:r.status})
    setModal(true)
  }
  async function save(){
    if(!form.title.trim()||!userId)return
    const base=edit??{id:uid(),user_id:userId,created_at:now()}
    await upsertResource({...base,title:form.title.trim(),type:form.type,category:form.category,author:form.author.trim(),url:form.url.trim(),key_takeaway:form.notes.trim(),status:form.status,rating:0,date_completed:'',updated_at:now()} as Resource)
    setModal(false)
  }

  const filtered=useMemo(()=>
    cat==='All' ? resources : resources.filter(r=>r.category===cat)
  ,[resources,cat])

  const byType=useMemo(()=>{
    const m:Record<string,number>={}
    resources.forEach(r=>{m[r.type]=(m[r.type]||0)+1})
    return m
  },[resources])

  return(
    <div style={{animation:'fade-in 0.3s ease',paddingBottom:48}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:16}}>
        <div>
          <div style={{fontSize:9,color:'var(--text4)',letterSpacing:'2px',textTransform:'uppercase' as const,fontWeight:700,marginBottom:4}}>My Library</div>
          <div style={{fontSize:20,fontWeight:800,color:'var(--text)'}}>Resources</div>
        </div>
        <button onClick={openAdd} style={{padding:'8px 16px',borderRadius:'var(--r)',border:'none',background:GOLD,color:'#000',fontWeight:700,cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:12,flexShrink:0}}>+ Add</button>
      </div>

      {/* Type badges summary */}
      {resources.length>0&&(
        <div style={{display:'flex',gap:6,flexWrap:'wrap' as const,marginBottom:14}}>
          {Object.entries(byType).map(([type,count])=>(
            <div key={type} style={{display:'flex',alignItems:'center',gap:5,padding:'4px 10px',borderRadius:'var(--r)',background:'var(--s1)',border:'1px solid var(--br)'}}>
              <div style={{width:7,height:7,borderRadius:'50%',background:TYPE_COLOR[type]||'var(--text4)',flexShrink:0}}/>
              <span style={{fontSize:10,color:'var(--text3)',fontWeight:600}}>{type}</span>
              <span style={{fontSize:10,color:'var(--text4)'}}>{count}</span>
            </div>
          ))}
        </div>
      )}

      {/* Category filter */}
      <div style={{display:'flex',gap:4,overflowX:'auto' as const,marginBottom:14,paddingBottom:2}}>
        {CATS.map(c=>(
          <button key={c} onClick={()=>setCat(c)} style={{padding:'5px 12px',borderRadius:'var(--r)',border:'1px solid var(--br)',background:cat===c?GOLD:'var(--s1)',color:cat===c?'#000':'var(--text4)',fontSize:10,fontWeight:cat===c?700:400,cursor:'pointer',fontFamily:"'Sora',sans-serif",whiteSpace:'nowrap' as const,flexShrink:0}}>
            {c}
          </button>
        ))}
      </div>

      {filtered.length===0&&(
        <div style={{...CARD,textAlign:'center' as const,padding:'40px 20px',marginBottom:0}}>
          <div style={{fontSize:28,marginBottom:10}}>📖</div>
          <div style={{fontSize:13,fontWeight:700,color:'var(--text2)',marginBottom:4}}>
            {resources.length===0 ? 'Nothing saved yet' : 'None in this category'}
          </div>
          <div style={{fontSize:11,color:'var(--text4)'}}>
            {resources.length===0 ? 'Save books, articles, tools and links you want to come back to.' : 'Try a different filter.'}
          </div>
          {resources.length===0&&(
            <button onClick={openAdd} style={{marginTop:14,padding:'8px 20px',borderRadius:'var(--r)',border:'none',background:GOLD,color:'#000',fontWeight:700,cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:12}}>+ Add your first resource</button>
          )}
        </div>
      )}

      <div style={{display:'flex',flexDirection:'column' as const,gap:0}}>
        {filtered.map(r=>{
          const color=TYPE_COLOR[r.type]||'var(--text4)'
          const sColor=STATUS_COLOR[r.status]||'var(--text4)'
          return(
            <div key={r.id} style={{...CARD,borderLeft:`3px solid ${color}`}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8,marginBottom:6}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:700,color:'var(--text)',marginBottom:1,wordBreak:'break-word' as const}}>{r.title}</div>
                  {r.author&&<div style={{fontSize:10,color:'var(--text4)'}}>by {r.author}</div>}
                </div>
                <div style={{display:'flex',flexDirection:'column' as const,alignItems:'flex-end',gap:3,flexShrink:0}}>
                  <span style={{fontSize:9,fontWeight:700,color,padding:'2px 7px',borderRadius:'var(--r)',background:color+'18'}}>{r.type}</span>
                  <span style={{fontSize:9,color:sColor,textTransform:'capitalize' as const}}>{r.status==='want-to-read'?'Want to read':r.status}</span>
                </div>
              </div>
              {r.key_takeaway&&<div style={{fontSize:11,color:'var(--text3)',lineHeight:1.6,marginBottom:8}}>{r.key_takeaway}</div>}
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8}}>
                <div style={{display:'flex',gap:5,alignItems:'center'}}>
                  <span style={{fontSize:9,color:'var(--text4)',padding:'3px 8px',borderRadius:'var(--r)',background:'var(--s2)',border:'1px solid var(--br)'}}>{r.category}</span>
                  <button onClick={()=>openEdit(r)} style={{fontSize:9,padding:'3px 8px',borderRadius:'var(--r)',border:'1px solid var(--br)',background:'var(--s2)',color:'var(--text4)',cursor:'pointer',fontFamily:"'Sora',sans-serif"}}>Edit</button>
                  <button onClick={()=>deleteResource(r.id)} style={{fontSize:9,padding:'3px 8px',borderRadius:'var(--r)',border:'1px solid rgba(224,85,85,0.2)',background:'rgba(224,85,85,0.05)',color:RED,cursor:'pointer',fontFamily:"'Sora',sans-serif"}}>Delete</button>
                </div>
                {r.url&&(
                  <a href={r.url} target="_blank" rel="noopener noreferrer"
                    style={{display:'inline-flex',alignItems:'center',gap:4,padding:'5px 12px',borderRadius:'var(--r)',border:`1px solid ${color}40`,background:color+'10',color,fontSize:10,fontWeight:700,textDecoration:'none',fontFamily:"'Sora',sans-serif",flexShrink:0}}>
                    Open →
                  </a>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {modal&&(
        <div style={OVERLAY} onClick={e=>{if(e.target===e.currentTarget)setModal(false)}}>
          <div style={MODAL}>
            <div style={{fontSize:15,fontWeight:700,color:'var(--text)',marginBottom:16}}>{edit?'Edit':'Add'} Resource</div>
            <div style={{display:'flex',flexDirection:'column' as const,gap:12}}>
              <div><div style={FL}>Title</div><input style={INP} value={form.title} onChange={e=>setForm(p=>({...p,title:e.target.value}))} placeholder="Book, article, tool, link…"/></div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                <div><div style={FL}>Type</div>
                  <select style={INP} value={form.type} onChange={e=>setForm(p=>({...p,type:e.target.value}))}>
                    {TYPES.map(t=><option key={t}>{t}</option>)}
                  </select>
                </div>
                <div><div style={FL}>Category</div>
                  <select style={INP} value={form.category} onChange={e=>setForm(p=>({...p,category:e.target.value}))}>
                    {CATS.filter(c=>c!=='All').map(c=><option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div><div style={FL}>Author / Creator</div><input style={INP} value={form.author} onChange={e=>setForm(p=>({...p,author:e.target.value}))} placeholder="Optional"/></div>
              <div><div style={FL}>URL</div><input style={INP} value={form.url} onChange={e=>setForm(p=>({...p,url:e.target.value}))} placeholder="https://…" type="url"/></div>
              <div><div style={FL}>Status</div>
                <select style={INP} value={form.status} onChange={e=>setForm(p=>({...p,status:e.target.value}))}>
                  <option value="want-to-read">Want to read</option>
                  <option value="reading">Reading / In progress</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
              <div><div style={FL}>Notes</div><textarea style={{...INP,minHeight:70,resize:'vertical' as const}} value={form.notes} onChange={e=>setForm(p=>({...p,notes:e.target.value}))} placeholder="Key points, why it's useful…"/></div>
            </div>
            <div style={{display:'flex',gap:8,marginTop:20}}>
              <button onClick={save} style={{flex:1,padding:'11px',borderRadius:'var(--r)',border:'none',background:GOLD,color:'#000',fontWeight:700,cursor:'pointer',fontFamily:"'Sora',sans-serif",fontSize:13}}>Save</button>
              <button onClick={()=>setModal(false)} style={{padding:'11px 16px',borderRadius:'var(--r)',border:'1px solid var(--br)',background:'transparent',color:'var(--text3)',cursor:'pointer',fontFamily:"'Sora',sans-serif"}}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
