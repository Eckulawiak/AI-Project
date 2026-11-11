-- =====================================================================
-- Career Services - skills and certifications from Department of Labor data
-- Run after internship_listing_cache.sql. Safe to re-run.
--
-- The roadmap's Skills and Certifications suggestions for a career goal
-- come from O*NET (occupations, technology skills) and CareerOneStop
-- (certifications with official links). Both are cached here for 30 days.
-- No student identifiers are stored.
-- =====================================================================

-- ---------------------------------------------------------------------
-- [1] New student_milestones source: CAREER_DATA
-- ---------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    where c.contype = 'c'
      and c.conrelid = 'student_milestones'::regclass
      and pg_get_constraintdef(c.oid) ilike '%source%'
  loop
    execute format('alter table student_milestones drop constraint %I', r.conname);
  end loop;
end $$;

alter table student_milestones add constraint student_milestones_source_check
  check (source in ('TEMPLATE', 'COURSE', 'GAP', 'EXPERIENCE', 'CUSTOM', 'AI',
                    'COURSE_SKILL', 'CAREER_DATA'));


-- ---------------------------------------------------------------------
-- [2] Career goal -> O*NET occupations (best match first)
-- occupations: [{ "code": "27-3023.00", "title": "News Analysts, ..." }]
-- ---------------------------------------------------------------------
create table if not exists career_goal_occupations (
  goal_key     varchar(100) primary key,  -- normalized career goal
  occupations  jsonb not null default '[]'::jsonb,
  fetched_at   timestamptz not null default now()
);


-- ---------------------------------------------------------------------
-- [3] O*NET occupation -> skills and certifications
-- skills:         [{ "name", "category", "hot" }]
-- certifications: [{ "name", "organization", "url", "description" }]
-- ---------------------------------------------------------------------
create table if not exists occupation_career_data (
  onet_code       varchar(12) primary key,
  title           varchar(200) not null,
  skills          jsonb not null default '[]'::jsonb,
  certifications  jsonb not null default '[]'::jsonb,
  fetched_at      timestamptz not null default now()
);
