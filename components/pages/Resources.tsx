'use client'
import React, { useEffect, useState, useMemo } from 'react'

const GOLD='var(--gold)';const GREEN='var(--green)';const BLUE='var(--blue)'
const PURPLE='var(--purple)';const TEAL='var(--teal)';const ORANGE='var(--orange)'
const CARD:React.CSSProperties={background:'var(--s1)',border:'1px solid var(--br)',borderRadius:'var(--r2)',padding:'14px',marginBottom:10}
const SL:React.CSSProperties={fontSize:9,color:'var(--text3)',letterSpacing:'2px',textTransform:'uppercase',fontWeight:700,marginBottom:6}

const TYPE_COLOR:Record<string,string>={
  Book:GOLD, Podcast:PURPLE, Course:BLUE, Video:TEAL, Article:'#5B9BD5', Other:'var(--text4)'
}
const CATS=['All','Leadership','Mindset','Business','Skills','Health','Other']

interface TeamResource {
  id:string; title:string; type:string; category:string; author:string
  url:string; description:string; created_at:string
}

export default function Resources(){
  const [resources,setResources]=useState<TeamResource[]>([])
  const [loading,setLoading]=useState(true)
  const [cat,setCat]=useState('All')

  useEffect(()=>{
    fetch('/api/team/resources')
      .then(r=>r.json())
      .then(d=>{ setResources(d.resources||[]) })
      .catch(()=>{})
      .finally(()=>setLoading(false))
  },[])

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
      <div style={{marginBottom:16}}>
        <div style={{fontSize:9,color:'var(--text4)',letterSpacing:'2px',textTransform:'uppercase' as const,fontWeight:700,marginBottom:4}}>Library</div>
        <div style={{fontSize:20,fontWeight:800,color:'var(--text)'}}>Resources</div>
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

      {loading&&(
        <div style={{textAlign:'center' as const,padding:'40px 0',color:'var(--text4)',fontSize:12}}>Loading…</div>
      )}

      {!loading&&filtered.length===0&&(
        <div style={{...CARD,textAlign:'center' as const,padding:'32px 20px'}}>
          <div style={{fontSize:28,marginBottom:10}}>📚</div>
          <div style={{fontSize:13,fontWeight:700,color:'var(--text2)',marginBottom:4}}>
            {resources.length===0 ? 'No resources yet' : 'None in this category'}
          </div>
          <div style={{fontSize:11,color:'var(--text4)'}}>
            {resources.length===0 ? 'Your upline will add curated resources here.' : 'Try a different filter.'}
          </div>
        </div>
      )}

      <div style={{display:'flex',flexDirection:'column' as const,gap:8}}>
        {filtered.map(r=>{
          const color=TYPE_COLOR[r.type]||'var(--text4)'
          return(
            <div key={r.id} style={{...CARD,marginBottom:0,borderLeft:`3px solid ${color}`}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8,marginBottom:6}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:700,color:'var(--text)',marginBottom:2,wordBreak:'break-word' as const}}>{r.title}</div>
                  {r.author&&<div style={{fontSize:10,color:'var(--text4)',marginBottom:4}}>{r.author}</div>}
                </div>
                <span style={{fontSize:9,fontWeight:700,color,padding:'3px 8px',borderRadius:'var(--r)',background:color+'18',border:`1px solid ${color}30`,flexShrink:0}}>{r.type}</span>
              </div>
              {r.description&&(
                <div style={{fontSize:11,color:'var(--text3)',lineHeight:1.6,marginBottom:8}}>{r.description}</div>
              )}
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                <span style={{fontSize:9,color:'var(--text4)',padding:'3px 8px',borderRadius:'var(--r)',background:'var(--s2)',border:'1px solid var(--br)'}}>{r.category}</span>
                {r.url&&(
                  <a href={r.url} target="_blank" rel="noopener noreferrer"
                    style={{display:'inline-flex',alignItems:'center',gap:4,padding:'5px 12px',borderRadius:'var(--r)',border:`1px solid ${color}40`,background:color+'10',color,fontSize:10,fontWeight:700,textDecoration:'none',fontFamily:"'Sora',sans-serif"}}>
                    Open →
                  </a>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
