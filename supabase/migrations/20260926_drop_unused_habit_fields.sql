-- Removes four HabitEntry columns that were never wired into any UI:
-- energy/deep_work_hours had 1 row each with trivial values (3, 0), and
-- mg1_names had 89 rows but every value was an empty string (''), never
-- real content. hours had 0 non-null rows. No data lost.
-- Applied live to project bgpmnbqozvjzjprmewpw via Supabase MCP; checked
-- in here for repo/DB parity.

alter table public.habits
  drop column if exists energy,
  drop column if exists deep_work_hours,
  drop column if exists mg1_names,
  drop column if exists hours;
