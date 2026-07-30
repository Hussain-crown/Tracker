'use client'
import React from 'react'
import { ErrorBoundary } from '@/components/ErrorBoundary'

const GOLD='var(--gold)'
const CARD:React.CSSProperties={background:'var(--s1)',border:'1px solid var(--br)',borderRadius:'var(--r2)',padding:'24px',marginBottom:10,textAlign:'center'}

export default function Training(){
  return(
    <ErrorBoundary label="Training">
    <div style={{animation:'fade-in 0.3s ease',paddingBottom:48}}>
      <div style={{marginBottom:20}}>
        <div style={{fontSize:9,color:'var(--text4)',letterSpacing:'2px',textTransform:'uppercase' as const,fontWeight:700,marginBottom:4}}>Level 1</div>
        <div style={{fontSize:20,fontWeight:800,color:'var(--text)'}}>Training</div>
      </div>

      <div style={CARD}>
        <div style={{fontSize:36,marginBottom:16}}>📚</div>
        <div style={{fontSize:15,fontWeight:700,color:GOLD,marginBottom:8}}>Training Content Coming Soon</div>
        <div style={{fontSize:12,color:'var(--text4)',lineHeight:1.7,maxWidth:280,margin:'0 auto'}}>
          Your training resources and onboarding materials will appear here.<br/><br/>
          In the meantime, build your prospect pipeline using the Prospects tab.
        </div>
      </div>

      <div style={{padding:'14px 16px',background:'rgba(200,162,74,0.06)',border:'1px solid rgba(200,162,74,0.2)',borderRadius:'var(--r2)',marginTop:8}}>
        <div style={{fontSize:10,fontWeight:700,color:GOLD,marginBottom:4}}>Your next milestone</div>
        <div style={{fontSize:11,color:'var(--text3)',lineHeight:1.6}}>
          Reach <strong style={{color:'var(--text)'}}>100 active prospects</strong> in your pipeline to unlock Level 2 — habits tracking, candidates, and the full suite.
        </div>
      </div>
    </div>
    </ErrorBoundary>
  )
}
