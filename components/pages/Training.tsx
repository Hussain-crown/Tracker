'use client'
import React, { useEffect, useState, useMemo } from 'react'
import { ErrorBoundary } from '@/components/ErrorBoundary'

const GOLD='var(--gold)'

const CARD:React.CSSProperties={background:'var(--s1)',border:'1px solid var(--br)',borderRadius:'var(--r2)',padding:'14px',marginBottom:8}

interface Resource { id:string; title:string; url:string; description:string; category:string; icon:string }

export default function Training(){
  const [items, setItems]   = useState<Resource[]>([])
  const [loading, setLoading] = useState(true)
  const [cat, setCat]       = useState('All')

  useEffect(()=>{
    fetch('/api/shared-resources')
      .then(r=>r.ok?r.json():{resources:[]})
      .then(d=>setItems(d.resources||[]))
      .catch(()=>setItems([]))
      .finally(()=>setLoading(false))
  },[])

  const allCats = useMemo(()=>['All',...Array.from(new Set(items.map(r=>r.category||'General')))],[items])
  const filtered = useMemo(()=>cat==='All'?items:items.filter(r=>(r.category||'General')===cat),[items,cat])

  return(
    <ErrorBoundary label="Training">
    <div style={{animation:'fade-in 0.3s ease',paddingBottom:48}}>
      <div style={{marginBottom:20}}>
        <div style={{fontSize:9,color:'var(--text4)',letterSpacing:'2px',textTransform:'uppercase' as const,fontWeight:700,marginBottom:4}}>Level 1</div>
        <div style={{fontSize:20,fontWeight:800,color:'var(--text)'}}>Training</div>
      </div>

      {loading?(
        <div style={{...CARD,textAlign:'center',padding:32}}>
          <div style={{fontSize:13,color:'var(--text4)'}}>Loading…</div>
        </div>
      ):items.length===0?(
        <div style={{...CARD,textAlign:'center'}}>
          <div style={{fontSize:36,marginBottom:16}}>📚</div>
          <div style={{fontSize:15,fontWeight:700,color:GOLD,marginBottom:8}}>Training Content Coming Soon</div>
          <div style={{fontSize:12,color:'var(--text4)',lineHeight:1.7,maxWidth:280,margin:'0 auto'}}>
            Your training resources will appear here once your upline adds them.
          </div>
        </div>
      ):(
        <>
          {/* Category tabs */}
          {allCats.length>1&&(
            <div style={{display:'flex',gap:6,flexWrap:'wrap' as const,marginBottom:14}}>
              {allCats.map(c=>(
                <button key={c} onClick={()=>setCat(c)}
                  style={{padding:'4px 12px',borderRadius:20,border:'1px solid '+(cat===c?'rgba(200,162,74,0.5)':'var(--br)'),background:cat===c?'rgba(200,162,74,0.12)':'transparent',color:cat===c?GOLD:'var(--text4)',cursor:'pointer',fontSize:11,fontFamily:'inherit',fontWeight:cat===c?700:400}}>
                  {c}
                </button>
              ))}
            </div>
          )}

          {/* Items */}
          <div style={{display:'flex',flexDirection:'column' as const,gap:8}}>
            {filtered.map(r=>(
              <div key={r.id} style={{...CARD,display:'flex',alignItems:'flex-start',gap:12,padding:'14px 16px'}}>
                <div style={{fontSize:22,lineHeight:1,flexShrink:0,marginTop:2}}>{r.icon||'📚'}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:2,flexWrap:'wrap' as const}}>
                    <div style={{fontSize:14,fontWeight:700,color:'var(--text)'}}>{r.title}</div>
                    {r.category&&r.category!=='General'&&(
                      <div style={{fontSize:10,color:GOLD,fontWeight:700,letterSpacing:'1px',textTransform:'uppercase' as const}}>{r.category}</div>
                    )}
                  </div>
                  {r.description&&<div style={{fontSize:12,color:'var(--text4)',lineHeight:1.5,marginBottom:6}}>{r.description}</div>}
                  {r.url&&(
                    <a href={r.url} target="_blank" rel="noopener noreferrer"
                      style={{fontSize:12,color:GOLD,fontWeight:600,textDecoration:'none'}}>
                      Open ↗
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <div style={{padding:'14px 16px',background:'rgba(200,162,74,0.06)',border:'1px solid rgba(200,162,74,0.2)',borderRadius:'var(--r2)',marginTop:16}}>
        <div style={{fontSize:10,fontWeight:700,color:GOLD,marginBottom:4}}>Your next milestone</div>
        <div style={{fontSize:11,color:'var(--text3)',lineHeight:1.6}}>
          Reach <strong style={{color:'var(--text)'}}>100 active prospects</strong> in your pipeline to unlock Level 2 — habits tracking, candidates, and the full suite.
        </div>
      </div>
    </div>
    </ErrorBoundary>
  )
}
