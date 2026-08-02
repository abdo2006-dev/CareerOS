do $$
begin
  if (select headline from public.profiles where user_id = '50000000-0000-0000-0000-000000000001') <> 'Preserved headline' then raise exception 'headline was not preserved'; end if;
  if (select headline from public.profiles where user_id = '50000000-0000-0000-0000-000000000002') <> repeat('x', 200) then raise exception 'overlength legacy headline was not preserved'; end if;
  if (select degree_program from public.profiles where user_id = '50000000-0000-0000-0000-000000000001') <> '   ' then raise exception 'blank legacy degree-program text was normalized'; end if;
  if (select count(*) from public.profiles) <> 4 then raise exception 'profile row count changed'; end if;
  if (select count(*) from public.education_entries) <> 3 then raise exception 'education row count changed'; end if;
  if (select count(*) from public.education_entries where user_id = '50000000-0000-0000-0000-000000000001') <> 0 then raise exception 'migration invented education'; end if;
  if (select degree_year from public.education_entries where id = '60000000-0000-0000-0000-000000000001') <> 3 then raise exception 'lone degree year was not safely copied'; end if;
  if (select degree_year from public.education_entries where id = '60000000-0000-0000-0000-000000000002') is not null then raise exception 'null legacy degree year changed'; end if;
  if (select institution from public.education_entries where id = '60000000-0000-0000-0000-000000000003') <> 'Second Institution' then raise exception 'legacy institution changed'; end if;
  if (select field from public.education_entries where id = '60000000-0000-0000-0000-000000000002') <> 'First field' then raise exception 'legacy field changed'; end if;
  if exists (select 1 from public.education_entries where user_id = '50000000-0000-0000-0000-000000000003' and degree_year is not null) then raise exception 'multiple education rows received a legacy degree year'; end if;
  if exists (select 1 from public.education_entries where is_primary) then raise exception 'migration selected a primary'; end if;
  if exists (select 1 from public.education_entries where education_status <> 'unknown') then raise exception 'migration inferred a status'; end if;
  if exists (select 1 from public.profiles where created_via <> 'migration' or last_confirmed_at is not null) then raise exception 'migrated profiles lack expected provenance or confirmation state'; end if;
  if exists (select 1 from public.education_entries where created_via <> 'migration' or last_confirmed_at is not null) then raise exception 'migrated education lacks expected provenance or confirmation state'; end if;
  if exists (select 1 from public.profile_section_reviews) then raise exception 'migration created reviews'; end if;
  if exists (select 1 from public.profile_section_revisions where content_revision <> 0) then raise exception 'migration revisions are not neutral'; end if;
end;
$$;
