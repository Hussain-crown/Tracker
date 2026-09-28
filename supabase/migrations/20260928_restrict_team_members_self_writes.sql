-- Closes 3 account-takeover-class gaps in team_members RLS found during the
-- security audit: a self-authenticated user could previously INSERT their
-- own row (impersonate as any IBO/level/status), and UPDATE columns beyond
-- the handful meant to be self-editable (level, status, referred_by, and
-- every baseline_* scoring input). Only dormant/dormant_since/
-- seen_milestones/first_login/updated_at may be changed by the row's own
-- owner; everything else must go through a service-role (admin) write.
--
-- These statements were originally applied live via the Supabase MCP in
-- three steps during the audit (self-writes restricted -> function narrowed
-- from SECURITY DEFINER to SECURITY INVOKER after the advisor flagged the
-- DEFINER version as an auto-exposed RPC -> remaining gaps closed). This
-- file consolidates all three into the single end state actually running
-- in production, so the migrations folder matches the live database.

drop policy if exists team_members_own_insert on public.team_members;
drop policy if exists team_members_own_delete on public.team_members;

create or replace function public.team_members_restrict_self_update()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.role() = 'authenticated' then
    if new.user_id is distinct from old.user_id
    or new.ibo_number is distinct from old.ibo_number
    or new.leg is distinct from old.leg
    or new.name is distinct from old.name
    or new.email is distinct from old.email
    or new.role is distinct from old.role
    or new.referred_by is distinct from old.referred_by
    or new.level is distinct from old.level
    or new.status is distinct from old.status
    or new.created_at is distinct from old.created_at
    or new.baseline_set is distinct from old.baseline_set
    or new.baseline_interruptions is distinct from old.baseline_interruptions
    or new.baseline_conversations is distinct from old.baseline_conversations
    or new.baseline_mpa is distinct from old.baseline_mpa
    or new.baseline_contacts is distinct from old.baseline_contacts
    or new.baseline_catchups is distinct from old.baseline_catchups
    or new.baseline_dtm is distinct from old.baseline_dtm
    or new.baseline_prefilter is distinct from old.baseline_prefilter
    or new.baseline_mg1 is distinct from old.baseline_mg1
    or new.baseline_launches is distinct from old.baseline_launches
    then
      raise exception 'team_members: only dormant, dormant_since, seen_milestones, first_login and updated_at may be self-updated';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists team_members_restrict_self_update_trg on public.team_members;
create trigger team_members_restrict_self_update_trg
before update on public.team_members
for each row execute function public.team_members_restrict_self_update();
