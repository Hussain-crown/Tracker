'use client'
import React, { useEffect, useMemo, useState } from 'react'
import { useStore } from '@/lib/stores'
import type { Partner } from '@/lib/stores/types'
import { ErrorBoundary } from '@/components/ErrorBoundary'

const GOLD='#C8A24A';const GREEN='#4CAF7D';const RED='#E05555'
const STAGE_ORDER=['Prospect','IBO','Q','Silver','Gold','Platinum','Diamond']

function daysSince(d:string){return d?Math.floor((Date.now()-new Date(d).getTime())/86400000):999}
function fmtDate(d:string){if(!d)return'—';return new Date(d).toLocaleDateString('en-AU',{day:'numeric',month:'short',timeZone:'Australia/Brisbane'})}

export default function Organisation(){
  const {partners,loadPartners}=useStore()
  const [search,setSearch]=useState('')
  const [detail,setDetail]=useState<Partner|null>(null)
  const [loading,setLoading]=useState(true)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(()=>{loadPartners().finally(()=>setLoading(false))},[])

  const active=useMemo(()=>partners.filter(p=>!p.archived),[partners])
  const filtered=useMemo(()=>{
    const q=search.toLowerCase()
    return active.filter(p=>!q||p.name.toLowerCase().includes(q)||p.ibo_number?.includes(q))
  },[active,search])

  const totalGPV=useMemo(()=>active.reduce((s,p)=>s+(p.gpv||0),0),[active])
  const totalGroup=useMemo(()=>active.reduce((s,p)=>s+(p.group_size||0),0),[active])
  const activating=useMemo(()=>active.filter(p=>!p.activation_done&&p.stage!=='Prospect'),[active])

  return(
    <ErrorBoundary label="Organisation">
    <div style={{paddingBottom:80}}>
      {/* Stats strip */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginBottom:16}}>
        {[
          {l:'Partners',v:active.length,c:GOLD},
          {l:'Group Size',v:totalGroup,c:'var(--text2)'},
          {l:'Team GPV',v:`$${totalGPV.toLocaleString()}`,c:GREEN},
        ].map(k=>(
          <div key={k.l} style={{background:'#13131a',border:'1px solid #1f1f28',borderRadius:10,padding:'10px',textAlign:'center' as const}}>
            <div style={{fontSize:18,fontWeight:800,color:k.c,lineHeight:1}}>{k.v}</div>
            <div style={{fontSize:9,color:'#555',marginTop:3,textTransform:'uppercase' as const,letterSpacing:'1px'}}>{k.l}</div>
          </div>
        ))}
      </div>

      {/* Needs activation badge */}
      {activating.length>0&&(
        <div style={{marginBottom:12,padding:'9px 12px',background:'rgba(200,162,74,0.06)',border:'1px solid rgba(200,162,74,0.2)',borderRadius:10,fontSize:11,color:GOLD}}>
          ⚡ {activating.length} partner{activating.length>1?'s':''} need activation
        </div>
      )}

      {/* Search */}
      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search partners…"
        style={{width:'100%',boxSizing:'border-box' as const,background:'#13131a',border:'1px solid #1f1f28',borderRadius:8,padding:'9px 12px',color:'#ddd',fontSize:13,fontFamily:'inherit',outline:'none',marginBottom:12}}/>

      {/* Partner list */}
      {loading&&(
        <div style={{textAlign:'center' as const,color:'#555',fontSize:13,paddingTop:40}}>Loading…</div>
      )}
      {!loading&&filtered.length===0&&(
        <div style={{textAlign:'center' as const,color:'#555',fontSize:13,paddingTop:40}}>No partners yet</div>
      )}
      {filtered.map(p=>{
        const overdue=p.next_call&&daysSince(p.next_call)>0
        return(
          <div key={p.id} onClick={()=>setDetail(p)}
            style={{background:'#13131a',border:'1px solid #1f1f28',borderRadius:10,padding:'14px',marginBottom:8,cursor:'pointer'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:6}}>
              <div style={{fontWeight:700,fontSize:14,color:'#fff'}}>{p.name}</div>
              <div style={{fontSize:10,padding:'2px 8px',borderRadius:6,background:'rgba(200,162,74,0.12)',color:GOLD,fontWeight:600}}>{p.stage||'IBO'}</div>
            </div>
            <div style={{display:'flex',gap:12,fontSize:11,color:'#666'}}>
              {p.ibo_number&&<span>IBO {p.ibo_number}</span>}
              {p.gpv>0&&<span style={{color:'#aaa'}}>GPV ${p.gpv.toLocaleString()}</span>}
              {p.group_size>0&&<span>{p.group_size} in group</span>}
            </div>
            {(p.next_call||p.last_contact)&&(
              <div style={{marginTop:8,fontSize:10,color:overdue?RED:'#555'}}>
                {overdue?'⚠ Overdue call · ':'Next call: '}{p.next_call?fmtDate(p.next_call):'—'}
                {p.last_contact&&<span style={{marginLeft:10,color:'#444'}}>Last: {fmtDate(p.last_contact)}</span>}
              </div>
            )}
          </div>
        )
      })}

      {/* Detail drawer */}
      {detail&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.92)',zIndex:400,display:'flex',alignItems:'flex-end',justifyContent:'center'}} onClick={()=>setDetail(null)}>
          <div style={{background:'#13131a',borderRadius:'16px 16px 0 0',padding:'20px',width:'100%',maxWidth:900,maxHeight:'80vh',overflowY:'auto' as const}} onClick={e=>e.stopPropagation()}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
              <div>
                <div style={{fontWeight:800,fontSize:16,color:'#fff'}}>{detail.name}</div>
                <div style={{fontSize:11,color:'#555',marginTop:2}}>{detail.stage||'IBO'}{detail.ibo_number?` · IBO ${detail.ibo_number}`:''}</div>
              </div>
              <button onClick={()=>setDetail(null)} style={{background:'none',border:'none',color:'#555',cursor:'pointer',fontSize:20}}>×</button>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:14}}>
              {[
                ['GPV',`$${(detail.gpv||0).toLocaleString()}`],
                ['PPV',`$${(detail.ppv||0).toLocaleString()}`],
                ['Group Size',String(detail.group_size||0)],
                ['Sponsoring',String(detail.sponsoring||0)],
                ['Last Contact',fmtDate(detail.last_contact)],
                ['Next Call',fmtDate(detail.next_call)],
              ].map(([label,val])=>(
                <div key={label} style={{background:'#0d0d12',borderRadius:8,padding:'10px'}}>
                  <div style={{fontSize:9,color:'#555',textTransform:'uppercase' as const,letterSpacing:'1px',marginBottom:3}}>{label}</div>
                  <div style={{fontSize:14,fontWeight:700,color:'#ddd'}}>{val}</div>
                </div>
              ))}
            </div>
            {detail.phone&&(
              <a href={`https://wa.me/${detail.phone.replace(/\D/g,'')}`} target="_blank" rel="noreferrer"
                style={{display:'block',padding:'11px',borderRadius:8,background:'rgba(37,211,102,0.1)',border:'1px solid rgba(37,211,102,0.2)',color:'#25d366',fontWeight:600,fontSize:13,textAlign:'center' as const,textDecoration:'none',marginBottom:8}}>
                💬 WhatsApp {detail.name}
              </a>
            )}
            {detail.notes&&(
              <div style={{background:'#0d0d12',borderRadius:8,padding:'12px',fontSize:12,color:'#888',lineHeight:1.6}}>{detail.notes}</div>
            )}
          </div>
        </div>
      )}
    </div>
    </ErrorBoundary>
  )
}
