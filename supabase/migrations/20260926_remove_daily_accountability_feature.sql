-- Removes the "Daily Accountability" reading/audio-training checklist
-- feature and its backing data, per explicit request. Both resources and
-- team_resources were empty (0 rows) and had zero live consumers left in
-- the codebase after the checklist widget's removal -- resources was only
-- ever read for the "currently being tracked" book lookup, and
-- team_resources' API route (app/api/shared-resources) had no caller
-- anywhere in the app.
--
-- Applied live to project bgpmnbqozvjzjprmewpw via Supabase MCP; checked
-- in here for repo/DB parity.

drop table if exists public.resources;
drop table if exists public.team_resources;

-- The daily checklist_YYYY-MM-DD rows in meta are this feature's only
-- other stored data (2 rows existed).
delete from public.meta where key like 'checklist_%';
