'use client'
import React from 'react'
interface Props { children: React.ReactNode; fallback?: React.ReactNode; label?: string }
interface State { hasError: boolean; error?: Error }
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false }
  static getDerivedStateFromError(error: Error): State { return { hasError: true, error } }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[ErrorBoundary${this.props.label ? ':' + this.props.label : ''}]`, error, info)
  }
  render() {
    if (this.state.hasError) return this.props.fallback ?? (
      <div style={{padding:'40px',textAlign:'center',color:'var(--text3)',fontSize:14}}>
        <div style={{fontSize:32,marginBottom:12}}>⚠️</div>
        <div style={{fontWeight:700,marginBottom:8}}>Something went wrong</div>
        <button onClick={()=>this.setState({hasError:false})} style={{marginTop:8,padding:'8px 20px',borderRadius:8,border:'1px solid var(--br)',background:'var(--s1)',color:'var(--text)',cursor:'pointer',fontFamily:'inherit'}}>Try again</button>
      </div>
    )
    return this.props.children
  }
}
