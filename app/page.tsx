'use client'
import React, { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useStore } from '@/lib/stores'
import Habits from '@/components/pages/Habits'
import Pipeline from '@/components/pages/Pipeline'
import Candidates from '@/components/pages/Candidates'
import { now } from '@/lib/utils'

const GOLD='#C8A24A'; const GREEN='#4CAF7D'; const RED='#E05555'

const MILESTONES=[
  {days:3,emoji:'🔥',msg:"3-day streak! The habit is forming."},
  {days:7,emoji:'⚡',msg:"7 days straight. One full week — that's real."},
  {days:14,emoji:'💪',msg:"2 weeks consistent. You're building something."},
  {days:21,emoji:'🎯',msg:"21 days. This is now a habit, not a decision."},
  {days:30,emoji:'🏆',msg:"30-day streak. Elite level consistency."},
  {days:60,emoji:'👑',msg:"60 days. You're in the top 1% of IBOs."},
  {days:90,emoji:'💎',msg:"90 days. This is who you are now."},
]

function daysAgo(n:number){
  const d=new Date()
  d.setDate(d.getDate()-n)
  return d.toLocaleDateString('en-CA',{timeZone:'Australia/Brisbane'})
}

function brisbaneToday(){
  return new Date().toLocaleDateString('en-CA',{timeZone:'Australia/Brisbane'})
}

export default function TrackPage(){
  const {userId,userEmail,setUser,loadAll,habits}=useStore()
  const [ready,setReady]           = useState(false)
  const [member,setMember]         = useState<any>(null)
  const [needsProfile,setNeedsProfile] = useState(false)
  const [ibo,setIbo]               = useState('')
  const [name,setName]             = useState('')
  const [err,setErr]               = useState('')
  const [busy,setBusy]             = useState(false)
  const [isOffline,setIsOffline]   = useState(false)
  const [showInstall,setShowInstall] = useState(false)
  const [deferredPrompt,setDeferredPrompt] = useState<any>(null)
  const [milestone,setMilestone]   = useState<{emoji:string;msg:string}|null>(null)
  const [seenMilestones,setSeenMilestones] = useState<number[]>([])
  const [showOnboard,setShowOnboard] = useState(false)
  const [adminGoals,setAdminGoals] = useState<any>(null)
  const [tab,setTab] = useState<'pipeline'|'candidates'|'habits'>('pipeline')

  useEffect(()=>{
    supabase.auth.getSession().then(({data:{session}})=>{
      if(session?.user) setUser(session.user.id, session.user.email??'')
      setReady(true)
    }).catch(()=>setReady(true))
    const {data:{subscription}}=supabase.auth.onAuthStateChange(async(event, session)=>{
      if(session?.user){
        setUser(session.user.id, session.user.email??'')
      } else if(event==='SIGNED_OUT'){
        setUser('','')
      }
      setReady(true)
    })
    return()=>{subscription.unsubscribe()}
  },[]) // eslint-disable-line

  useEffect(()=>{
    function handleOffline(){setIsOffline(true)}
    function handleOnline(){setIsOffline(false)}
    function handleInstall(e:Event){e.preventDefault();setDeferredPrompt(e);setShowInstall(true)}
    setIsOffline(!navigator.onLine)
    window.addEventListener('offline',handleOffline)
    window.addEventListener('online',handleOnline)
    window.addEventListener('beforeinstallprompt',handleInstall)
    return()=>{
      window.removeEventListener('offline',handleOffline)
      window.removeEventListener('online',handleOnline)
      window.removeEventListener('beforeinstallprompt',handleInstall)
    }
  },[])

  useEffect(()=>{
    if(!userId)return
    // Refetch when the PWA comes back to the foreground (60-second throttle)
    let lastRefetch=Date.now()
    const onVisible=()=>{
      if(document.hidden)return
      const now=Date.now()
      if(now-lastRefetch>60_000){lastRefetch=now;loadAll()}
    }
    document.addEventListener('visibilitychange',onVisible)
    return ()=>document.removeEventListener('visibilitychange',onVisible)
  },[userId,loadAll])

  useEffect(()=>{
    if(!userId)return
    loadAll()
    supabase.from('team_members').select('*').eq('user_id',userId).single()
      .then(({data}:any)=>{
        if(data){
          setMember(data)
          // status='pending' means awaiting admin approval — don't show the app yet
          setNeedsProfile(false)
          try{setSeenMilestones(JSON.parse(data.seen_milestones||'[]'))}catch{}
          if(data.first_login&&data.status!=='pending')setShowOnboard(true)
          fetch('/api/team/member-goals').then(r=>r.json()).then(d=>{
            if(d.goals)setAdminGoals(d.goals)
          }).catch(()=>{})
        }else{
          setNeedsProfile(true)
        }
      })
  },[userId]) // eslint-disable-line

  // ── Streak ──
  const streak=useMemo(()=>{
    let s=0
    for(let i=0;i<90;i++){
      const h=(habits as any)[daysAgo(i)]
      if(h&&(h.convo>0||h.mg1>0||h.mpa>0||h.contact>0||h.catch_up>0||h.dtm>0||h.pre_filter>0||h.launch>0))s++
      else break
    }
    return s
  },[habits])

  // ── Milestone check ──
  useEffect(()=>{
    if(!member||!userId)return
    const hit=MILESTONES.filter(m=>streak>=m.days&&!seenMilestones.includes(m.days))
    if(!hit.length)return
    const top=hit[hit.length-1]
    setMilestone(top)
    const next=[...seenMilestones,...hit.map(m=>m.days)]
    setSeenMilestones(next)
    supabase.from('team_members').update({seen_milestones:JSON.stringify(next),updated_at:now()}).eq('user_id',userId)
  },[streak,member]) // eslint-disable-line

  // ── Save profile (first time after Google sign-in) ──
  async function saveProfile(){
    if(!ibo.trim()||!userId){setErr('IBO number required');return}
    setBusy(true);setErr('')
    try{
      const res=await fetch(`/api/book/verify-ibo?ibo=${encodeURIComponent(ibo.trim())}`)
      const d=await res.json()
      if(!d.valid){
        setErr("That IBO isn't in our system — contact Hussain.")
        setBusy(false);return
      }
      const partnerName=name.trim()||d.partner?.name||(userEmail?.split('@')[0]||'Member')
      const {data:existing}=await supabase.from('team_members').select('user_id').eq('ibo_number',ibo.trim()).maybeSingle()
      if(existing&&existing.user_id!==userId){setErr('This IBO is already linked to another account.');setBusy(false);return}
      await supabase.from('team_members').upsert({
        user_id:userId,name:partnerName,ibo_number:ibo.trim(),leg:ibo.trim(),
        email:userEmail||'',role:'member',referred_by:'',first_login:true,
        status:'pending',baseline_set:true,seen_milestones:'[]',created_at:now(),updated_at:now(),
      })
      const {data}=await supabase.from('team_members').select('*').eq('user_id',userId).single()
      setMember(data);setNeedsProfile(false);setShowOnboard(true)
    }catch{setErr('Could not verify IBO. Please try again.')}
    setBusy(false)
  }

  async function signInWithGoogle(){
    setBusy(true);setErr('')
    await supabase.auth.signInWithOAuth({
      provider:'google',
      options:{
        redirectTo:window.location.origin+'/',
        queryParams:{prompt:'select_account'},
      }
    })
  }

  async function signOut(){await supabase.auth.signOut();window.location.reload()}
  async function dismissOnboard(){
    setShowOnboard(false)
    if(userId)await supabase.from('team_members').update({first_login:false,updated_at:now()}).eq('user_id',userId)
  }

  if(!ready)return(
    <Shell>
      <div style={{color:'#555',textAlign:'center',padding:40,fontSize:14}}>
        <div style={{fontSize:28,marginBottom:12}}>⏳</div>
        Loading Business Tracker…
      </div>
    </Shell>
  )

  if(!userId)return(
    <Shell>
      <div style={{textAlign:'center',marginBottom:28}}>
        <div style={{fontSize:26,fontWeight:800,color:'#fff',letterSpacing:'-0.5px'}}>Business Tracker</div>
        <div style={{fontSize:12,color:'#666',marginTop:6}}>Track daily. Win the week.</div>
      </div>
      {err&&<ErrBox msg={err}/>}
      <button onClick={signInWithGoogle} disabled={busy} style={{width:'100%',padding:'14px',borderRadius:12,border:'1px solid #2a2a35',background:'#16161c',color:'#fff',cursor:busy?'wait':'pointer',fontSize:15,fontWeight:700,fontFamily:'inherit',display:'flex',alignItems:'center',justifyContent:'center',gap:10,opacity:busy?0.7:1}}>
        <svg width="18" height="18" viewBox="0 0 24 24">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
        {busy?'Redirecting to Google…':'Continue with Google'}
      </button>
      <div style={{fontSize:11,color:'#444',textAlign:'center',marginTop:16}}>You'll need your IBO number after signing in.</div>
    </Shell>
  )

  // Pending approval screen — shown when status='pending' (after SQL migration)
  if(member&&member.status==='pending')return(
    <Shell>
      <div style={{fontSize:36,marginBottom:16,textAlign:'center' as const}}>⏳</div>
      <div style={{fontSize:20,fontWeight:800,color:'#fff',marginBottom:8,textAlign:'center' as const}}>Awaiting Approval</div>
      <div style={{fontSize:13,color:'#888',textAlign:'center' as const,lineHeight:1.6,marginBottom:24}}>
        Your account is pending approval from your upline.<br/>
        You'll get access as soon as it's approved.
      </div>
      <div style={{background:'rgba(200,162,74,0.08)',border:'1px solid rgba(200,162,74,0.2)',borderRadius:10,padding:'12px 16px',marginBottom:20,fontSize:12,color:'#C8A24A',textAlign:'center' as const}}>
        IBO {member.ibo_number} · {member.name}
      </div>
      <button style={{...btn,background:'transparent',border:'1px solid #333',color:'#888'}} onClick={signOut}>Sign out</button>
    </Shell>
  )

  if(needsProfile)return(
    <Shell>
      <div style={{fontSize:20,fontWeight:800,color:'#fff',marginBottom:4}}>One more step</div>
      <div style={{fontSize:12,color:'#888',marginBottom:22}}>Enter your IBO number to link your account.</div>
      <Field label="Your name (optional)">
        <input style={inp} value={name} onChange={e=>setName(e.target.value)} placeholder={userEmail?.split('@')[0]||'Your name'}/>
      </Field>
      <Field label="Your IBO number *">
        <input style={inp} value={ibo} onChange={e=>setIbo(e.target.value)} placeholder="e.g. 7027093203"/>
      </Field>
      {err&&<ErrBox msg={err}/>}
      <button style={btn} onClick={saveProfile} disabled={busy}>{busy?'Saving…':'Start tracking'}</button>
    </Shell>
  )

  return(
    <div style={{minHeight:'100vh',background:'var(--bg,#0d0d12)'}}>
      {/* Offline banner */}
      {isOffline&&(
        <div style={{background:'rgba(232,145,58,0.15)',borderBottom:'1px solid rgba(232,145,58,0.3)',padding:'8px 16px',textAlign:'center' as const,fontSize:12,color:'#E8913A',fontWeight:600}}>
          📵 You're offline — your logs are saved locally and will sync when reconnected
        </div>
      )}
      {/* Install to home screen */}
      {showInstall&&!isOffline&&(
        <div style={{background:'rgba(200,162,74,0.1)',borderBottom:'1px solid rgba(200,162,74,0.2)',padding:'10px 16px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div style={{fontSize:12,color:'#C8A24A',fontWeight:600}}>📲 Add Business Tracker to your home screen</div>
          <div style={{display:'flex',gap:8}}>
            <button onClick={async()=>{if(deferredPrompt){await deferredPrompt.prompt();setShowInstall(false);setDeferredPrompt(null)}}}
              style={{padding:'5px 12px',borderRadius:8,border:'none',background:'#C8A24A',color:'#000',fontWeight:700,cursor:'pointer',fontSize:11,fontFamily:'inherit'}}>Install</button>
            <button onClick={()=>setShowInstall(false)}
              style={{padding:'5px 8px',borderRadius:8,border:'none',background:'transparent',color:'#555',cursor:'pointer',fontSize:11,fontFamily:'inherit'}}>✕</button>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'12px 18px',borderBottom:'1px solid #1f1f28',maxWidth:900,margin:'0 auto'}}>
        <div>
          <div style={{fontSize:14,fontWeight:800,color:'#fff'}}>Business Tracker</div>
          <div style={{fontSize:10,color:'#555'}}>{member?.name||'Member'} · IBO {member?.ibo_number}</div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          {streak>0&&<div style={{fontSize:11,fontWeight:700,color:GOLD}}>🔥 {streak}d</div>}
          <button onClick={signOut} style={{padding:'6px 12px',borderRadius:8,border:'1px solid #2a2a35',background:'transparent',color:'#888',cursor:'pointer',fontSize:11}}>Sign out</button>
        </div>
      </div>

      {/* Milestone */}
      {milestone&&(
        <div style={{maxWidth:900,margin:'8px auto',padding:'0 18px'}}>
          <div style={{background:'linear-gradient(135deg,rgba(200,162,74,0.12),rgba(200,162,74,0.04))',border:'1px solid rgba(200,162,74,0.4)',borderRadius:14,padding:'16px 20px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div>
              <div style={{fontSize:20,marginBottom:4}}>{milestone.emoji}</div>
              <div style={{fontSize:14,fontWeight:700,color:'#fff',marginBottom:2}}>Milestone hit!</div>
              <div style={{fontSize:12,color:'#aaa'}}>{milestone.msg}</div>
            </div>
            <button onClick={()=>setMilestone(null)} style={{background:'none',border:'none',color:'#555',cursor:'pointer',fontSize:22,flexShrink:0}}>×</button>
          </div>
        </div>
      )}

      {/* Onboarding welcome */}
      {showOnboard&&(
        <div style={{maxWidth:900,margin:'8px auto',padding:'0 18px'}}>
          <div style={{background:'#13131a',border:'1px solid #2a2a35',borderRadius:14,padding:'20px 22px'}}>
            <div style={{fontSize:16,fontWeight:800,color:'#fff',marginBottom:12}}>Welcome to Business Tracker 👋</div>
            <div style={{fontSize:12,color:'#888',lineHeight:1.8,marginBottom:16}}>
              {[
                {k:'Today',d:'See your streak, weekly goals, and overdue follow-ups at a glance'},
                {k:'Pipeline',d:'Track every prospect you\'re speaking to about the business'},
                {k:'Candidates',d:'See where your prospects are in the interview process'},
                {k:'Habits',d:'Log your daily activity — convos, MG1s, MPAs, launches'},
              ].map(f=>(
                <div key={f.k} style={{padding:'4px 0',borderBottom:'1px solid #1f1f28'}}><strong style={{color:'#ddd'}}>{f.k}</strong> — {f.d}</div>
              ))}
            </div>
            <button onClick={dismissOnboard} style={{...btn,padding:'10px 24px',width:'auto'}}>Got it — let's go</button>
          </div>
        </div>
      )}

      <div style={{maxWidth:900,margin:'0 auto',padding:'16px 18px',paddingBottom:80}}>

        {tab==='habits'&&(
          <div>
            {/* Streak protection warning */}
            {(()=>{
              const yest=daysAgo(1)
              const h=(habits as any)[yest]
              const todayH=(habits as any)[brisbaneToday()]
              const hasTodayActivity=todayH&&Object.values(todayH).some((v:any)=>v>0)
              const hadYestActivity=h&&Object.values(h).some((v:any)=>v>0)
              if(!(hadYestActivity&&!hasTodayActivity))return null
              return(
                <div style={{background:'rgba(232,145,58,0.08)',border:'1px solid rgba(232,145,58,0.3)',borderRadius:12,padding:'12px 16px',marginBottom:14,display:'flex',alignItems:'center',gap:10}}>
                  <span style={{fontSize:18}}>⚠️</span>
                  <div>
                    <div style={{fontSize:13,fontWeight:700,color:'#E8913A'}}>Log today to protect your streak</div>
                    <div style={{fontSize:11,color:'#888',marginTop:2}}>Yesterday had no activity recorded.</div>
                  </div>
                </div>
              )
            })()}
            <Habits hideMonth goalOverride={adminGoals} level={member?.level||1}/>
          </div>
        )}

        {tab==='pipeline'&&<Pipeline iboNumber={member?.ibo_number||''}/>}
      </div>

      {tab==='candidates'&&(
        <div style={{maxWidth:900,margin:'0 auto',padding:'16px 18px',paddingBottom:80}}>
          <Candidates/>
        </div>
      )}

      {/* ── BOTTOM TAB BAR ── */}
      <div style={{position:'fixed',bottom:0,left:0,right:0,zIndex:200,background:'#0d0d12',borderTop:'1px solid #1f1f28',display:'flex',paddingBottom:'env(safe-area-inset-bottom)'}}>
        {(['pipeline','candidates','habits'] as const).map(id=>(
          <button key={id} onClick={()=>setTab(id)}
            style={{flex:1,display:'flex',flexDirection:'column' as const,alignItems:'center',justifyContent:'center',padding:'8px 0 6px',border:'none',background:'transparent',cursor:'pointer',color:tab===id?GOLD:'#444',transition:'color 0.15s',gap:2}}>
            <span style={{fontSize:16}}>{id==='pipeline'?'◆':id==='candidates'?'◇':'◎'}</span>
            <span style={{fontSize:9,fontFamily:'inherit',fontWeight:tab===id?700:400,textTransform:'capitalize' as const}}>{id}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function Shell({children}:{children:React.ReactNode}){
  return(
    <div style={{minHeight:'100vh',background:'#0d0d12',display:'flex',alignItems:'center',justifyContent:'center',padding:20,fontFamily:"'Sora',system-ui,sans-serif"}}>
      <div style={{width:'100%',maxWidth:360}}>{children}</div>
    </div>
  )
}
function Field({label,children}:{label:string;children:React.ReactNode}){
  return(
    <div style={{marginBottom:12}}>
      <div style={{fontSize:10,color:'#666',marginBottom:5,fontWeight:600,letterSpacing:'1px',textTransform:'uppercase' as const}}>{label}</div>
      {children}
    </div>
  )
}
function ErrBox({msg}:{msg:string}){
  return <div style={{background:'rgba(224,85,85,0.1)',border:'1px solid rgba(224,85,85,0.3)',color:'#E05555',borderRadius:8,padding:'9px 12px',fontSize:12,marginBottom:12}}>{msg}</div>
}
const inp:React.CSSProperties={width:'100%',background:'#16161c',border:'1px solid #2a2a35',borderRadius:8,padding:'11px 14px',color:'#fff',fontSize:14,boxSizing:'border-box',fontFamily:'inherit'}
const btn:React.CSSProperties={width:'100%',padding:'13px',borderRadius:10,border:'none',background:'#C8A24A',color:'#000',fontWeight:800,fontSize:15,cursor:'pointer',fontFamily:'inherit',marginTop:4}
