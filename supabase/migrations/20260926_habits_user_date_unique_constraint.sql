-- CRITICAL FIX: habits.saveHabit() has always called
-- .upsert(e, { onConflict: 'user_id,date' }) but no unique constraint on
-- (user_id, date) ever existed on this table -- only a plain, non-unique
-- btree index (habits_user_id_date_idx, added earlier tonight). Postgres
-- requires ON CONFLICT's target to match an actual unique/exclusion
-- constraint at parse time, so EVERY upsert call has been failing
-- unconditionally with 42P10 ("there is no unique or exclusion constraint
-- matching the ON CONFLICT specification"), both the live debounced
-- autosave in Habits.tsx and the offline-queue flush -- reproduced directly
-- against the live DB before this fix, confirmed fixed after.
--
-- Verified no existing duplicate (user_id, date) rows before adding this
-- (the app's own data has always been consistent per day despite writes
-- failing, since a failed write rolls back the optimistic UI update rather
-- than leaving bad data behind).
--
-- Applied live to project bgpmnbqozvjzjprmewpw via Supabase MCP; checked
-- in here for repo/DB parity.

alter table public.habits
  add constraint habits_user_id_date_key unique (user_id, date);

-- The plain index is now redundant -- the unique constraint creates its own index.
drop index if exists public.habits_user_id_date_idx;
