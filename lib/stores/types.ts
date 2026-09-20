// ── HUSSAIN OS — SHARED TYPES ─────────────────────────────
// Source of truth for all interfaces across all domain stores.
// These match exactly what the pages use and what Supabase stores.

export interface Lead {
  id: string; user_id: string; name: string
  phone: string; instagram: string; contact: string; email?: string
  source: string; stage: string; score: number
  hunger: number; looking: number
  relationship: string    // 'Close friend' | 'Acquaintance' | 'Stranger' | 'Online only' | 'Family'
  age_range: string       // 'Under 25' | '25-35' | '35-45' | '45+'
  life_stage: string      // comma-joined, up to 3 of: 'Student' | 'Working' | 'Business owner' | 'Parent' | 'Retired'
  primary_driver: string  // comma-joined, 1-3 of: 'Family' | 'Community' | 'Purpose' | 'Personal Development' | 'Time' | 'Money' | 'Lifestyle'
  pain_point: string      // their words
  archived: boolean
  archived_reason: string
  notes: string; next_action: string; next_action_date: string
  created_at: string; updated_at: string
}

export interface Candidate {
  id: string; user_id: string; name: string; email: string; phone: string
  stage: string; source: string; interview_notes: string; status: string
  sponsor_ibo?: string; booker_ibo?: string
  hxl_score?: number; hunger?: number; looking?: number
  relationship?: string; age_range?: string; life_stage?: string
  primary_driver?: string; pain_point?: string
  created_at: string; updated_at: string
}

export interface ContactLog {
  id: string; user_id: string
  entity_type: 'lead' | 'candidate' | 'partner'
  entity_id: string; entity_name: string
  event_type: string; outcome: string
  notes: string; fathom_link: string
  next_action: string; next_date: string
  created_at: string
  objection?: string
}

export interface HabitEntry {
  id: string; user_id: string; date: string
  interruptions: number; convo: number; mpa: number; contact: number
  catch_up: number; dtm: number; pre_filter: number; mg1: number; launch: number
  energy?: number; deep_work_hours?: number; mg1_names?: string
  hours?: number
  created_at: string; updated_at: string
}

export interface Win {
  id: string; user_id: string; title: string; category: string
  description: string; date: string; created_at: string
}

export interface WeeklyReview {
  id: string; user_id: string; week_start: string
  what_happened: string; next_week_number: string; one_fix: string
  created_at: string; updated_at?: string
}

export interface MoodEntry {
  id: string; user_id: string; text: string; ai_response: string
  sentiment: 'positive' | 'neutral' | 'low' | 'struggling' | 'fired-up'
  energy: number; tags: string; created_at: string
}

export interface Resource {
  id: string; user_id: string; title: string; type: string; category: string
  author: string; url: string; status: string; rating: number
  key_takeaway: string; date_completed: string; created_at: string; updated_at: string
}


