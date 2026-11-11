-- =====================================================================
-- Career Services - AI suggestions and course skills on the roadmap
-- Run after career_prep_category.sql. Safe to re-run.
--
-- New student_milestones sources:
--   AI            Skill, Certification or Internship suggested by AI from
--                 the student's career goal (optional, labelled on the page)
--   COURSE_SKILL  a skill taught in a required course the student hasn't
--                 completed yet (Skills track)
-- =====================================================================

-- Drop whatever check limits source today (its name may differ from the
-- default), then add the new one.
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
  check (source in ('TEMPLATE', 'COURSE', 'GAP', 'EXPERIENCE', 'CUSTOM', 'AI', 'COURSE_SKILL'));
