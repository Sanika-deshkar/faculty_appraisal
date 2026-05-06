-- Faculty Appraisal fresh Supabase schema
-- WARNING: This script deletes everything in the public schema.
-- Run only when you are sure you want a clean database.

drop schema if exists public cascade;
create schema public;

grant usage on schema public to postgres, anon, authenticated, service_role;
grant all on schema public to postgres, service_role;

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Main user/profile data shown by the frontend profile page.
create table public.faculty_profiles (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  employee_id text,
  full_name text not null,
  qualification text,
  designation text,
  department text,
  school text,
  teaching_experience text,
  phone text,
  academic_year text,
  appraisal_role text not null default 'faculty',
  avatar text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint faculty_profiles_school_allowed check (
    appraisal_role = 'vc' or school in (
      'SoCSEA — School of Computer Science, Engineering & Applications',
      'SoBB — School of Bio-Engineering & Bio Science',
      'SoCE — School of Continual Education',
      'SoEMR — School of Engineering Management & Research',
      'SoC — School of Commerce & Management',
      'SoMCS — School of Media & Communication Studies',
      'CioD — School of Design',
      'SoAA — School of Applied Arts',
      'CISR — Center for Interdisciplinary Studies and Research'
    )
  ),
  constraint faculty_profiles_soemr_department_allowed check (
    school <> 'SoEMR — School of Engineering Management & Research'
    or department in (
      'Mechanical Engineering',
      'Civil Engineering',
      'Chemical Engineering',
      'Semiconductor Engineering'
    )
  )
);

create trigger faculty_profiles_set_updated_at
before update on public.faculty_profiles
for each row execute function public.set_updated_at();

-- Development-only login users.
-- These users bypass Supabase Auth signup rate limits through the dev_login RPC.
-- Do not use this table for production passwords.
create table public.dev_login_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password text not null,
  employee_id text,
  full_name text not null,
  qualification text,
  designation text,
  department text,
  school text,
  teaching_experience text,
  phone text,
  academic_year text not null default '2025-2026',
  appraisal_role text not null default 'faculty',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger dev_login_users_set_updated_at
before update on public.dev_login_users
for each row execute function public.set_updated_at();

create or replace function public.dev_login(p_email text, p_password text)
returns table (
  email text,
  employee_id text,
  full_name text,
  qualification text,
  designation text,
  department text,
  school text,
  teaching_experience text,
  phone text,
  academic_year text,
  appraisal_role text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  matched public.dev_login_users%rowtype;
begin
  select *
  into matched
  from public.dev_login_users
  where lower(dev_login_users.email) = lower(trim(p_email))
    and dev_login_users.password = p_password
  limit 1;

  if not found then
    return;
  end if;

  insert into public.faculty_profiles (
    email,
    employee_id,
    full_name,
    qualification,
    designation,
    department,
    school,
    teaching_experience,
    phone,
    academic_year,
    appraisal_role
  )
  values (
    lower(trim(matched.email)),
    matched.employee_id,
    matched.full_name,
    matched.qualification,
    matched.designation,
    matched.department,
    matched.school,
    matched.teaching_experience,
    matched.phone,
    matched.academic_year,
    matched.appraisal_role
  )
  on conflict (email) do update set
    employee_id = excluded.employee_id,
    full_name = excluded.full_name,
    qualification = excluded.qualification,
    designation = excluded.designation,
    department = excluded.department,
    school = excluded.school,
    teaching_experience = excluded.teaching_experience,
    phone = excluded.phone,
    academic_year = excluded.academic_year,
    appraisal_role = excluded.appraisal_role,
    updated_at = now();

  return query
  select
    fp.email,
    fp.employee_id,
    fp.full_name,
    fp.qualification,
    fp.designation,
    fp.department,
    fp.school,
    fp.teaching_experience,
    fp.phone,
    fp.academic_year,
    fp.appraisal_role
  from public.faculty_profiles fp
  where fp.email = lower(trim(matched.email));
end;
$$;

insert into public.dev_login_users (
  email,
  password,
  employee_id,
  full_name,
  qualification,
  designation,
  department,
  school,
  teaching_experience,
  phone,
  appraisal_role
)
values
  ('faculty@test.local', 'test123', 'DEV-FAC-001', 'Dr. Test Faculty', 'Ph.D', 'Assistant Professor', 'Mechanical Engineering', 'SoEMR — School of Engineering Management & Research', '8 Years', '9000000001', 'faculty'),
  ('hod@test.local', 'test123', 'DEV-HOD-001', 'Prof. Test HOD', 'Ph.D', 'Professor & Head', 'Mechanical Engineering', 'SoEMR — School of Engineering Management & Research', '15 Years', '9000000002', 'hod'),
  ('director@test.local', 'test123', 'DEV-DIR-001', 'Dr. Test Director', 'Ph.D', 'Director', null, 'SoEMR — School of Engineering Management & Research', '18 Years', '9000000003', 'director'),
  ('dean.eng@test.local', 'test123', 'DEV-DEN-001', 'Prof. Test Engineering Dean', 'Ph.D', 'Dean', null, 'SoCSEA — School of Computer Science, Engineering & Applications', '20 Years', '9000000004', 'dean'),
  ('dean.noneng@test.local', 'test123', 'DEV-DNN-001', 'Prof. Test Non-Engineering Dean', 'Ph.D', 'Dean', null, 'SoC — School of Commerce & Management', '20 Years', '9000000005', 'dean'),
  ('vc@test.local', 'test123', 'DEV-VC-001', 'Prof. Test VC', 'Ph.D', 'Vice Chancellor', null, null, '25 Years', '9000000006', 'vc'),
  ('cisr.faculty@test.local', 'test123', 'DEV-CF-001', 'Dr. Test CISR Faculty', 'Ph.D', 'Assistant Professor', null, 'CISR — Center for Interdisciplinary Studies and Research', '7 Years', '9000000007', 'faculty'),
  ('cisr.head@test.local', 'test123', 'DEV-CH-001', 'Dr. Test CISR Center Head', 'Ph.D', 'Center Head', null, 'CISR — Center for Interdisciplinary Studies and Research', '16 Years', '9000000008', 'center_head');

-- Current frontend submit button writes to this table.
create table public.declarations (
  id uuid primary key default gen_random_uuid(),
  faculty_email text not null,
  academic_year text not null,
  part_a_total numeric not null default 0,
  part_b_total numeric not null default 0,
  grand_total numeric not null default 0,
  status text not null default 'Pending Review',
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint declarations_faculty_year_key unique (faculty_email, academic_year)
);

create trigger declarations_set_updated_at
before update on public.declarations
for each row execute function public.set_updated_at();

-- Shared columns are repeated intentionally so each section can be queried directly.
-- Score columns map to frontend fields: score, hod, director, dean, vc.

create table public.teaching_process (
  id uuid primary key default gen_random_uuid(),
  faculty_email text not null,
  academic_year text not null,
  row_no integer,
  semester text,
  course_code text,
  planned_classes numeric not null default 0,
  conducted_classes numeric not null default 0,
  score numeric not null default 0,
  hod_score numeric,
  director_score numeric,
  dean_score numeric,
  vc_score numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.course_files (
  id uuid primary key default gen_random_uuid(),
  faculty_email text not null,
  academic_year text not null,
  row_no integer,
  course text,
  title text,
  details text,
  score numeric not null default 0,
  hod_score numeric,
  director_score numeric,
  dean_score numeric,
  vc_score numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.innovative_teaching (
  id uuid primary key default gen_random_uuid(),
  faculty_email text not null,
  academic_year text not null,
  details text,
  score numeric not null default 0,
  hod_score numeric,
  director_score numeric,
  dean_score numeric,
  vc_score numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint innovative_teaching_faculty_year_key unique (faculty_email, academic_year)
);

create table public.projects_guided (
  id uuid primary key default gen_random_uuid(),
  faculty_email text not null,
  academic_year text not null,
  row_no integer,
  label text,
  score numeric not null default 0,
  hod_score numeric,
  director_score numeric,
  dean_score numeric,
  vc_score numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.qualification_enhancement (
  id uuid primary key default gen_random_uuid(),
  faculty_email text not null,
  academic_year text not null,
  row_no integer,
  label text,
  score numeric not null default 0,
  hod_score numeric,
  director_score numeric,
  dean_score numeric,
  vc_score numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.student_feedback (
  id uuid primary key default gen_random_uuid(),
  faculty_email text not null,
  academic_year text not null,
  row_no integer,
  course_code text,
  feedback_1 numeric not null default 0,
  feedback_2 numeric not null default 0,
  score numeric not null default 0,
  hod_score numeric,
  director_score numeric,
  dean_score numeric,
  vc_score numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.department_activities (
  id uuid primary key default gen_random_uuid(),
  faculty_email text not null,
  academic_year text not null,
  row_no integer,
  activity text,
  nature text,
  score numeric not null default 0,
  hod_score numeric,
  director_score numeric,
  dean_score numeric,
  vc_score numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.university_activities (
  id uuid primary key default gen_random_uuid(),
  faculty_email text not null,
  academic_year text not null,
  row_no integer,
  activity text,
  nature text,
  score numeric not null default 0,
  hod_score numeric,
  director_score numeric,
  dean_score numeric,
  vc_score numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.social_contributions (
  id uuid primary key default gen_random_uuid(),
  faculty_email text not null,
  academic_year text not null,
  row_no integer,
  label text,
  details text,
  score numeric not null default 0,
  hod_score numeric,
  director_score numeric,
  dean_score numeric,
  vc_score numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.industry_connect (
  id uuid primary key default gen_random_uuid(),
  faculty_email text not null,
  academic_year text not null,
  row_no integer,
  name text,
  details text,
  score numeric not null default 0,
  hod_score numeric,
  director_score numeric,
  dean_score numeric,
  vc_score numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.acr_scores (
  id uuid primary key default gen_random_uuid(),
  faculty_email text not null,
  academic_year text not null,
  row_no integer,
  label text,
  score numeric not null default 0,
  hod_score numeric,
  director_score numeric,
  dean_score numeric,
  vc_score numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.journal_publications (
  id uuid primary key default gen_random_uuid(),
  faculty_email text not null,
  academic_year text not null,
  row_no integer,
  title text,
  journal text,
  issn text,
  indexing text,
  score numeric not null default 0,
  hod_score numeric,
  director_score numeric,
  dean_score numeric,
  vc_score numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.book_publications (
  id uuid primary key default gen_random_uuid(),
  faculty_email text not null,
  academic_year text not null,
  row_no integer,
  title text,
  book text,
  issn text,
  publisher text,
  coauthor text,
  first_author text,
  score numeric not null default 0,
  hod_score numeric,
  director_score numeric,
  dean_score numeric,
  vc_score numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ict_pedagogy (
  id uuid primary key default gen_random_uuid(),
  faculty_email text not null,
  academic_year text not null,
  row_no integer,
  title text,
  description text,
  type text,
  quadrant text,
  score numeric not null default 0,
  hod_score numeric,
  director_score numeric,
  dean_score numeric,
  vc_score numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.research_guidance (
  id uuid primary key default gen_random_uuid(),
  faculty_email text not null,
  academic_year text not null,
  row_no integer,
  degree text,
  student_name text,
  thesis text,
  score numeric not null default 0,
  hod_score numeric,
  director_score numeric,
  dean_score numeric,
  vc_score numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.research_projects (
  id uuid primary key default gen_random_uuid(),
  faculty_email text not null,
  academic_year text not null,
  row_no integer,
  title text,
  agency text,
  sanction_date date,
  amount numeric,
  role text,
  project_status text,
  score numeric not null default 0,
  hod_score numeric,
  director_score numeric,
  dean_score numeric,
  vc_score numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.patents (
  id uuid primary key default gen_random_uuid(),
  faculty_email text not null,
  academic_year text not null,
  row_no integer,
  title text,
  type text,
  patent_date date,
  patent_status text,
  file_no text,
  score numeric not null default 0,
  hod_score numeric,
  director_score numeric,
  dean_score numeric,
  vc_score numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.awards (
  id uuid primary key default gen_random_uuid(),
  faculty_email text not null,
  academic_year text not null,
  row_no integer,
  title text,
  award_date date,
  agency text,
  level text,
  score numeric not null default 0,
  hod_score numeric,
  director_score numeric,
  dean_score numeric,
  vc_score numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.conferences (
  id uuid primary key default gen_random_uuid(),
  faculty_email text not null,
  academic_year text not null,
  row_no integer,
  title text,
  type text,
  organization text,
  level text,
  score numeric not null default 0,
  hod_score numeric,
  director_score numeric,
  dean_score numeric,
  vc_score numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.research_proposals (
  id uuid primary key default gen_random_uuid(),
  faculty_email text not null,
  academic_year text not null,
  row_no integer,
  title text,
  duration text,
  agency text,
  amount numeric,
  score numeric not null default 0,
  hod_score numeric,
  director_score numeric,
  dean_score numeric,
  vc_score numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.self_development (
  id uuid primary key default gen_random_uuid(),
  faculty_email text not null,
  academic_year text not null,
  row_no integer,
  program text,
  duration text,
  organization text,
  score numeric not null default 0,
  hod_score numeric,
  director_score numeric,
  dean_score numeric,
  vc_score numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.industrial_training (
  id uuid primary key default gen_random_uuid(),
  faculty_email text not null,
  academic_year text not null,
  row_no integer,
  company text,
  duration text,
  nature text,
  score numeric not null default 0,
  hod_score numeric,
  director_score numeric,
  dean_score numeric,
  vc_score numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Stores file metadata for every DocCell/ViewCell in the frontend.
create table public.appraisal_documents (
  id uuid primary key default gen_random_uuid(),
  faculty_email text not null,
  academic_year text not null,
  section text not null,
  row_no integer,
  doc_key text,
  file_name text not null,
  file_type text,
  file_url text,
  storage_path text,
  uploaded_at timestamptz not null default now()
);

-- Authority review/remarks flow for HOD, Director, Dean, and VC.
create table public.appraisal_reviews (
  id uuid primary key default gen_random_uuid(),
  faculty_email text not null,
  academic_year text not null,
  reviewer_email text,
  reviewer_role text not null check (reviewer_role in ('hod', 'center_head', 'director', 'dean', 'vc')),
  part_a_score numeric not null default 0,
  part_b_score numeric not null default 0,
  total_score numeric not null default 0,
  remarks text,
  status text not null,
  reviewed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appraisal_reviews_unique_reviewer unique (faculty_email, academic_year, reviewer_role)
);

-- Optional full-form snapshot for easy restore/debugging, even when normalized tables change.
create table public.appraisal_snapshots (
  id uuid primary key default gen_random_uuid(),
  faculty_email text not null,
  academic_year text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appraisal_snapshots_faculty_year_key unique (faculty_email, academic_year)
);

-- Indexes for the frontend's normal access pattern.
create index declarations_faculty_year_idx on public.declarations (faculty_email, academic_year);
create index teaching_process_faculty_year_idx on public.teaching_process (faculty_email, academic_year);
create index course_files_faculty_year_idx on public.course_files (faculty_email, academic_year);
create index innovative_teaching_faculty_year_idx on public.innovative_teaching (faculty_email, academic_year);
create index projects_guided_faculty_year_idx on public.projects_guided (faculty_email, academic_year);
create index qualification_enhancement_faculty_year_idx on public.qualification_enhancement (faculty_email, academic_year);
create index student_feedback_faculty_year_idx on public.student_feedback (faculty_email, academic_year);
create index department_activities_faculty_year_idx on public.department_activities (faculty_email, academic_year);
create index university_activities_faculty_year_idx on public.university_activities (faculty_email, academic_year);
create index social_contributions_faculty_year_idx on public.social_contributions (faculty_email, academic_year);
create index industry_connect_faculty_year_idx on public.industry_connect (faculty_email, academic_year);
create index acr_scores_faculty_year_idx on public.acr_scores (faculty_email, academic_year);
create index journal_publications_faculty_year_idx on public.journal_publications (faculty_email, academic_year);
create index book_publications_faculty_year_idx on public.book_publications (faculty_email, academic_year);
create index ict_pedagogy_faculty_year_idx on public.ict_pedagogy (faculty_email, academic_year);
create index research_guidance_faculty_year_idx on public.research_guidance (faculty_email, academic_year);
create index research_projects_faculty_year_idx on public.research_projects (faculty_email, academic_year);
create index patents_faculty_year_idx on public.patents (faculty_email, academic_year);
create index awards_faculty_year_idx on public.awards (faculty_email, academic_year);
create index conferences_faculty_year_idx on public.conferences (faculty_email, academic_year);
create index research_proposals_faculty_year_idx on public.research_proposals (faculty_email, academic_year);
create index self_development_faculty_year_idx on public.self_development (faculty_email, academic_year);
create index industrial_training_faculty_year_idx on public.industrial_training (faculty_email, academic_year);
create index appraisal_documents_faculty_year_idx on public.appraisal_documents (faculty_email, academic_year);
create index appraisal_reviews_faculty_year_idx on public.appraisal_reviews (faculty_email, academic_year);

-- updated_at triggers for section tables.
create trigger teaching_process_set_updated_at before update on public.teaching_process for each row execute function public.set_updated_at();
create trigger course_files_set_updated_at before update on public.course_files for each row execute function public.set_updated_at();
create trigger innovative_teaching_set_updated_at before update on public.innovative_teaching for each row execute function public.set_updated_at();
create trigger projects_guided_set_updated_at before update on public.projects_guided for each row execute function public.set_updated_at();
create trigger qualification_enhancement_set_updated_at before update on public.qualification_enhancement for each row execute function public.set_updated_at();
create trigger student_feedback_set_updated_at before update on public.student_feedback for each row execute function public.set_updated_at();
create trigger department_activities_set_updated_at before update on public.department_activities for each row execute function public.set_updated_at();
create trigger university_activities_set_updated_at before update on public.university_activities for each row execute function public.set_updated_at();
create trigger social_contributions_set_updated_at before update on public.social_contributions for each row execute function public.set_updated_at();
create trigger industry_connect_set_updated_at before update on public.industry_connect for each row execute function public.set_updated_at();
create trigger acr_scores_set_updated_at before update on public.acr_scores for each row execute function public.set_updated_at();
create trigger journal_publications_set_updated_at before update on public.journal_publications for each row execute function public.set_updated_at();
create trigger book_publications_set_updated_at before update on public.book_publications for each row execute function public.set_updated_at();
create trigger ict_pedagogy_set_updated_at before update on public.ict_pedagogy for each row execute function public.set_updated_at();
create trigger research_guidance_set_updated_at before update on public.research_guidance for each row execute function public.set_updated_at();
create trigger research_projects_set_updated_at before update on public.research_projects for each row execute function public.set_updated_at();
create trigger patents_set_updated_at before update on public.patents for each row execute function public.set_updated_at();
create trigger awards_set_updated_at before update on public.awards for each row execute function public.set_updated_at();
create trigger conferences_set_updated_at before update on public.conferences for each row execute function public.set_updated_at();
create trigger research_proposals_set_updated_at before update on public.research_proposals for each row execute function public.set_updated_at();
create trigger self_development_set_updated_at before update on public.self_development for each row execute function public.set_updated_at();
create trigger industrial_training_set_updated_at before update on public.industrial_training for each row execute function public.set_updated_at();
create trigger appraisal_reviews_set_updated_at before update on public.appraisal_reviews for each row execute function public.set_updated_at();
create trigger appraisal_snapshots_set_updated_at before update on public.appraisal_snapshots for each row execute function public.set_updated_at();

-- Development grants. This keeps the current frontend anon/authenticated Supabase client functional.
-- For production, enable RLS and replace these broad permissions with policies.
do $$
declare
  table_record record;
begin
  for table_record in
    select schemaname, tablename
    from pg_tables
    where schemaname = 'public'
  loop
    execute format('alter table %I.%I disable row level security', table_record.schemaname, table_record.tablename);
    execute format('alter table %I.%I no force row level security', table_record.schemaname, table_record.tablename);
  end loop;
end $$;

grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated;
alter default privileges in schema public grant usage, select on sequences to anon, authenticated;

-- Keep dev test passwords out of direct frontend table reads. The frontend only
-- needs execute access to dev_login(), which returns profile data after a match.
revoke all on public.dev_login_users from anon, authenticated;
grant execute on function public.dev_login(text, text) to anon, authenticated;

