-- Already applied through Supabase SQL Editor.
begin;
alter table public.profiles
  add column if not exists country_code text;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_country_code_format'
  ) then
    alter table public.profiles
      add constraint profiles_country_code_format
      check (country_code is null or country_code ~ '^[A-Z]{2}$');
  end if;
end $$;
grant select (country_code), update (country_code)
  on public.profiles to authenticated;
notify pgrst, 'reload schema';
commit;
