'use client'
import React, { useEffect, useState, useMemo } from 'react'
import { useStore } from '@/lib/stores'

const GOLD='var(--gold)';const GREEN='var(--green)';const RED='var(--red)'
const BLUE='var(--blue)';const PURPLE='var(--purple)';const TEAL='var(--teal)'
const CARD:React.CSSProperties={background:'var(--s1)',border:'1px solid var(--br)',borderRadius:'var(--r2)',padding:'14px',marginBottom:10}
const SL:React.CSSProperties={fontSize:9,color:'var(--text3)',letterSpacing:'2px',textTransform:'uppercase',fontWeight:700,marginBottom:8}

const BDFIELDS=[
  {k:'convo',c:GOLD,l:'Convos'},{k:'mpa',c:BLUE,l:'MPA'},{k:'contact',c:'#5B9BD5',l:'Contacts'},
  {k:'catch_up',c:PURPLE,l:'CatchUp'},{k:'dtm',c:TEAL,l:'DTM'},{k:'pre_filter',c:'#E8913A',l:'PF'},{k:'mg1',c:GREEN,l:'MG1'},
] as const

function brisbaneToday(){return new Date().toLocaleDateString('en-CA',{timeZone:'Australia/Brisbane'})}

export default function Analytics(){
  const {habits,getMeta,loadHabits}=useStore()
  const todayStr=brisbaneToday()
  const [baselineTotals,setBaselineTotals]=useState<Record<string,number>>({})
  const [checklist,setChecklist]=useState<{reading:boolean;audio:boolean}>({reading:false,audio:false})

  useEffect(()=>{loadHabits()},[]) // eslint-disable-line
  useEffect(()=>{
    getMeta('historical_baseline').then(b=>{if(b)try{setBaselineTotals(JSON.parse(b))}catch{}})
    getMeta('checklist_'+todayStr).then(v=>{if(v)try{setChecklist(JSON.parse(v))}catch{}})
  },[]) // eslint-disable-line

  const allDates=useMemo(()=>Object.keys(habits).sort(),[habits])
  const liveTotals=useMemo(()=>{
    const t:Record<string,number>={convo:0,mg1:0,mpa:0,catch_up:0,dtm:0,pre_filter:0,launch:0,interruptions:0,contact:0}
    allDates.forEach(d=>{const h=habits[d] as any;if(h)Object.keys(t).forEach(k=>{t[k]+=(h[k]??0)})})
    return t
  },[habits,allDates])
  const allTimeTotals=useMemo(()=>{
    const t:Record<string,number>={...liveTotals}
    Object.entries(baselineTotals).forEach(([k,v])=>{t[k]=(t[k]??0)+v})
    return t
  },[liveTotals,baselineTotals])
  const currMo=new Date().toLocaleDateString('en-CA',{timeZone:'Australia/Brisbane'}).slice(0,7)
  const actData=useMemo(()=>{
    const months:string[]=[];const d=new Date();d.setDate(1)
    for(let i=0;i<12;i++){months.unshift(d.toLocaleDateString('en-CA',{timeZone:'Australia/Brisbane'}).slice(0,7));d.setMonth(d.getMonth()-1)}
    return months.map(mo=>{
      const days=Object.keys(habits).filter((dd:string)=>dd.startsWith(mo))
      const t:{[k:string]:number}={convo:0,mpa:0,mg1:0,catch_up:0,dtm:0,pre_filter:0,contact:0,interruptions:0}
      days.forEach(dd=>{const h=(habits as any)[dd] as any;if(h)Object.keys(t).forEach(k=>{t[k]+=(h[k]??0)})})
      return{mo,total:t.convo+t.mpa+t.mg1+t.catch_up+t.dtm+t.pre_filter+t.contact,...t}
    })
  },[habits])
  const actMaxTotal=useMemo(()=>Math.max(...actData.map(d=>d.total),1),[actData])

  return(
    <div style={{animation:'fade-in 0.3s ease',paddingBottom:48}}>
      <div style={{marginBottom:16}}>
        <div style={{fontSize:9,color:'var(--text4)',letterSpacing:'2px',textTransform:'uppercase' as const,fontWeight:700,marginBottom:4}}>Analytics</div>
        <div style={{fontSize:18,fontWeight:800,color:'var(--text)'}}>Activity Trends</div>
      </div>

      {/* Daily Accountability Grid */}
      <div style={CARD}>
        <div style={SL}>Daily Accountability — Last 30 Days</div>
        <div style={{display:'flex',gap:4,flexWrap:'wrap',marginBottom:8}}>
          {(()=>{
            const days:string[]=[]
            for(let i=29;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);days.push(d.toLocaleDateString('en-CA',{timeZone:'Australia/Brisbane'}))}
            return days.map(d=>{
              const hasHabit=!!(habits[d] as any)
              const isToday=d===todayStr
              const both=isToday&&checklist.reading&&checklist.audio
              const partial=isToday&&(checklist.reading||checklist.audio)
              const color=both?GREEN:partial?GOLD:hasHabit?'var(--s3)':'var(--s2)'
              return(
                <div key={d} title={d} style={{width:20,height:20,borderRadius:4,background:color,border:isToday?`2px solid ${GOLD}`:'1px solid var(--br)',flexShrink:0}}/>
              )
            })
          })()}
        </div>
        <div style={{display:'flex',gap:12,fontSize:9,color:'var(--text4)'}}>
          <span style={{display:'flex',alignItems:'center',gap:4}}><span style={{width:10,height:10,borderRadius:2,background:GREEN,display:'inline-block'}}/>Both done</span>
          <span style={{display:'flex',alignItems:'center',gap:4}}><span style={{width:10,height:10,borderRadius:2,background:GOLD,display:'inline-block'}}/>Partial</span>
          <span style={{display:'flex',alignItems:'center',gap:4}}><span style={{width:10,height:10,borderRadius:2,background:'var(--s3)',display:'inline-block'}}/>Habit logged</span>
        </div>
        <div style={{marginTop:8,fontSize:10,color:'var(--text4)'}}>+3 score per checklist item completed</div>
      </div>

      {/* Conversion Funnel */}
      <div style={CARD}>
        <div style={SL}>Conversion Funnel — All Time</div>
        <div style={{fontSize:10,color:'var(--text4)',marginBottom:14}}>Where are you losing people at each stage</div>
        {(()=>{
          const steps=[
            {l:'Interruptions',  v:allTimeTotals.interruptions??0, c:RED},
            {l:'Conversations',  v:allTimeTotals.convo??0,         c:GOLD},
            {l:'MPAs done',      v:allTimeTotals.mpa??0,           c:BLUE},
            {l:'Contacts made',  v:allTimeTotals.contact??0,       c:'#5B9BD5'},
            {l:'Catch Ups',      v:allTimeTotals.catch_up??0,      c:PURPLE},
            {l:'DTMs',           v:allTimeTotals.dtm??0,           c:TEAL},
            {l:'Pre-Filters',    v:allTimeTotals.pre_filter??0,    c:'#E8913A'},
            {l:'MG1s run',       v:allTimeTotals.mg1??0,           c:GREEN},
            {l:'Launches',       v:allTimeTotals.launch??0,        c:GOLD},
          ]
          const maxVal=Math.max(...steps.map(s=>s.v),1)
          const flowSteps=steps.slice(1)
          let bigDrop={l:'',drop:0}
          flowSteps.forEach((s,i)=>{if(i===0)return;const prev=flowSteps[i-1].v;const drop=prev>0?Math.round((1-s.v/prev)*100):0;if(drop>bigDrop.drop)bigDrop={l:s.l,drop}})
          return(
            <div>
              {steps.map((s,i)=>{
                const isInt=s.l==='Interruptions'
                const prev=i>1?steps[i-1].v:0
                const dropPct=prev>0&&i>1?Math.round((1-s.v/prev)*100):0
                const w=Math.round((s.v/maxVal)*100)
                return(
                  <div key={s.l} style={{paddingBottom:isInt?10:0,marginBottom:isInt?6:0,borderBottom:isInt?'1px solid var(--br)':'none'}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
                      <span style={{fontSize:11,fontWeight:700,color:s.c}}>{s.l}</span>
                      <div style={{display:'flex',gap:8,alignItems:'center'}}>
                        {dropPct>0&&<span style={{fontSize:9,fontWeight:700,color:dropPct>60?RED:dropPct>30?GOLD:'var(--text4)',padding:'1px 5px',borderRadius:4,background:dropPct>60?'rgba(224,85,85,0.1)':dropPct>30?'rgba(200,162,74,0.1)':'transparent'}}>▼ {dropPct}%</span>}
                        <span className="mono" style={{fontSize:13,fontWeight:800,color:s.c,minWidth:32,textAlign:'right'}}>{s.v}</span>
                      </div>
                    </div>
                    <div style={{height:10,background:'var(--s3)',borderRadius:5,overflow:'hidden'}}>
                      <div style={{height:'100%',width:w+'%',background:s.c,borderRadius:5,transition:'width 0.8s ease'}}/>
                    </div>
                  </div>
                )
              })}
              {bigDrop.drop>20&&(
                <div style={{marginTop:12,padding:'10px 12px',background:'rgba(200,162,74,0.06)',border:'1px solid rgba(200,162,74,0.25)',borderRadius:'var(--r)',borderLeft:'3px solid '+(bigDrop.drop>50?RED:GOLD)}}>
                  <div style={{fontSize:10,fontWeight:700,color:bigDrop.drop>50?RED:GOLD,marginBottom:2}}>⚠ Biggest bottleneck: {bigDrop.l}</div>
                  <div style={{fontSize:10,color:'var(--text4)'}}>{bigDrop.drop}% drop — this is where most people fall out</div>
                </div>
              )}
              <div style={{marginTop:10,fontSize:9,color:'var(--text4)',borderTop:'1px solid var(--br)',paddingTop:8}}>All-time · {allDates.length} days logged{Object.keys(baselineTotals).length>0?' + historical baseline':''}</div>
            </div>
          )
        })()}
      </div>

      {/* Activity Breakdown */}
      <div style={CARD}>
        <div style={SL}>Activity Breakdown — Monthly (Last 12 months)</div>
        <div style={{fontSize:10,color:'var(--text4)',marginBottom:12}}>How your activity splits each month</div>
        {(()=>{
          const data=actData
          const maxTotal=actMaxTotal
          const cm=currMo
          return(
            <div>
              <div style={{display:'flex',gap:3,alignItems:'flex-end',height:90,marginBottom:6}}>
                {data.map((m,i)=>{
                  const totalH=Math.max(3,(m.total/maxTotal)*86)
                  return(
                    <div key={i} title={m.mo+': '+m.total+' total'} style={{flex:1,height:totalH,display:'flex',flexDirection:'column',justifyContent:'flex-end',borderRadius:'2px 2px 0 0',overflow:'hidden',outline:m.mo===cm?'2px solid var(--gold)':'none',outlineOffset:1}}>
                      {BDFIELDS.map(f=>{
                        const val=(m as any)[f.k]??0
                        const bh=m.total>0?(val/m.total)*totalH:0
                        if(bh<=0.5)return null
                        return <div key={f.k} style={{width:'100%',height:bh,background:f.c,flexShrink:0}}/>
                      })}
                    </div>
                  )
                })}
              </div>
              <div style={{display:'flex',gap:3,marginBottom:10}}>
                {data.map((m,i)=>(
                  <div key={i} style={{flex:1,textAlign:'center'}}>
                    <div style={{fontSize:7,color:m.mo===cm?GOLD:'var(--text4)',fontWeight:m.mo===cm?700:400}}>{m.mo.slice(5)}</div>
                  </div>
                ))}
              </div>
              <div style={{display:'flex',gap:10,flexWrap:'wrap',marginBottom:14}}>
                {BDFIELDS.map(f=>(
                  <div key={f.k} style={{display:'flex',alignItems:'center',gap:4}}>
                    <div style={{width:8,height:8,borderRadius:2,background:f.c,flexShrink:0}}/>
                    <span style={{fontSize:9,color:'var(--text3)',fontWeight:600}}>{f.l}</span>
                  </div>
                ))}
              </div>
              <div style={{overflowX:'auto'}}>
                <div style={{display:'flex',borderBottom:'2px solid var(--br)',paddingBottom:4,marginBottom:2}}>
                  <div style={{width:52,flexShrink:0,fontSize:9,color:'var(--text4)',fontWeight:600}}>Month</div>
                  {BDFIELDS.map(f=>(
                    <div key={f.k} style={{flex:1,textAlign:'center',fontSize:9,color:f.c,fontWeight:700,minWidth:32}}>{f.l}</div>
                  ))}
                  <div style={{width:28,textAlign:'center',fontSize:9,color:'var(--text4)',fontWeight:600}}>Int</div>
                  <div style={{width:32,textAlign:'center',fontSize:9,color:'var(--text4)',fontWeight:600}}>Tot</div>
                </div>
                {[...data].reverse().map(m=>{
                  const isCurr=m.mo===cm
                  return(
                    <div key={m.mo} style={{display:'flex',borderBottom:'1px solid var(--br)',padding:'4px 0',background:isCurr?'rgba(200,162,74,0.04)':'transparent'}}>
                      <div style={{width:52,flexShrink:0,fontFamily:"'JetBrains Mono',monospace",fontSize:10,color:isCurr?GOLD:'var(--text3)',fontWeight:isCurr?700:400}}>{m.mo.slice(2)}</div>
                      {BDFIELDS.map(f=>{
                        const v=(m as any)[f.k]??0
                        return(
                          <div key={f.k} style={{flex:1,textAlign:'center',minWidth:32}}>
                            <span className="mono" style={{fontSize:10,color:v>0?f.c:'var(--text4)',fontWeight:v>0?700:400}}>{v||'·'}</span>
                          </div>
                        )
                      })}
                      <div style={{width:28,textAlign:'center'}}>
                        <span className="mono" style={{fontSize:10,color:(m as any).interruptions>0?RED:'var(--text4)'}}>{(m as any).interruptions||'·'}</span>
                      </div>
                      <div style={{width:32,textAlign:'center'}}>
                        <span className="mono" style={{fontSize:11,fontWeight:700,color:m.total>0?'var(--text2)':'var(--text4)'}}>{m.total||'·'}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })()}
      </div>

      {/* Monthly History — All Time */}
      <div style={CARD}>
        <div style={SL}>Monthly History — All Time</div>
        <div style={{overflowX:'auto'}}>
          <div style={{display:'flex',borderBottom:'2px solid var(--br)',paddingBottom:4,marginBottom:2}}>
            {['Month','Convos','MG1','MPA','DTM','Contacts'].map(h=>(
              <div key={h} style={{flex:1,minWidth:40,fontSize:9,color:'var(--text4)',fontWeight:600,padding:'2px 4px'}}>{h}</div>
            ))}
          </div>
          {(()=>{
            const months:string[]=[];const d=new Date();d.setDate(1)
            for(let i=0;i<24;i++){months.unshift(d.toLocaleDateString('en-CA',{timeZone:'Australia/Brisbane'}).slice(0,7));d.setMonth(d.getMonth()-1)}
            return months.map(mo=>{
              const days=Object.keys(habits).filter((d:string)=>d.startsWith(mo))
              if(days.length===0)return null
              const totals={convo:0,mg1:0,mpa:0,dtm:0,contact:0}
              days.forEach(d=>{const h=(habits as any)[d] as any;if(h){totals.convo+=h.convo??0;totals.mg1+=h.mg1??0;totals.mpa+=h.mpa??0;totals.dtm+=h.dtm??0;totals.contact+=(h as any).contact??0}})
              const isCurrent=mo===currMo
              return(
                <div key={mo} style={{display:'flex',borderBottom:'1px solid var(--br)',background:isCurrent?'rgba(200,162,74,0.04)':'transparent',padding:'5px 0'}}>
                  {[mo,totals.convo,totals.mg1,totals.mpa,totals.dtm,totals.contact].map((v,i)=>(
                    <div key={i} style={{flex:1,minWidth:40,padding:'0 4px'}}>
                      <span className="mono" style={{fontSize:10,fontWeight:isCurrent?700:400,color:isCurrent&&i===0?GOLD:i===0?'var(--text3)':typeof v==='number'&&v>0?([GOLD,GREEN,BLUE,TEAL,'#5B9BD5'][i-1]??GOLD):'var(--text4)'}}>{v||'·'}</span>
                    </div>
                  ))}
                </div>
              )
            })
          })()}
        </div>
      </div>
    </div>
  )
}
