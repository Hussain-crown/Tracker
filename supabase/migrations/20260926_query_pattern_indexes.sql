-- Indexes for the RLS-filtered query patterns used throughout the app
-- (every policy filters by user_id; habits/contact_logs are also frequently
-- range-queried by date/created_at and contact_logs by entity_id).
-- Applied live to project bgpmnbqozvjzjprmewpw via Supabase MCP; checked in
-- here for repo/DB parity.

create index if not exists habits_user_id_date_idx on public.habits(user_id, date);
create index if not exists leads_user_id_idx on public.leads(user_id);
create index if not exists contact_logs_user_id_created_at_idx on public.contact_logs(user_id, created_at desc);
create index if not exists contact_logs_entity_id_idx on public.contact_logs(entity_id);
