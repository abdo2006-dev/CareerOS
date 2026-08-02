-- Synthetic Phase 0 data applied after resetting through the Phase 0 schema.
do $$
begin
insert into auth.users (id, aud, role, email) values
  ('50000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'legacy-none@example.test'),
  ('50000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'legacy-one@example.test'),
  ('50000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'legacy-many@example.test'),
  ('50000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'legacy-null@example.test');

insert into public.profiles (user_id, headline, degree_program, degree_year) values
  ('50000000-0000-0000-0000-000000000001', 'Preserved headline', '   ', 2),
  ('50000000-0000-0000-0000-000000000002', repeat('x', 200), 'Unmapped legacy program', 3),
  ('50000000-0000-0000-0000-000000000003', 'Multiple education rows', 'Multiple program', 4),
  ('50000000-0000-0000-0000-000000000004', null, null, null);

insert into public.education_entries (id, user_id, institution, degree, field) values
  ('60000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002', 'Existing Institution', 'Existing degree', 'Existing field'),
  ('60000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000003', 'First Institution', 'First degree', 'First field'),
  ('60000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000003', 'Second Institution', null, null);
end;
$$;
