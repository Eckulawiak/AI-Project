-- =====================================================================
-- QU Resume Builder - Career Prep milestone category
-- Run after roadmap_template_details.sql. Safe to re-run.
--
-- CAREER_PREP holds career-planning tasks (resume, LinkedIn, career
-- exploration, graduate school, job search). SKILL is left for milestones
-- that build a competency, such as the low-rating gap milestones.
-- =====================================================================

-- ---------------------------------------------------------------------
-- [1] Allow the new category
-- ---------------------------------------------------------------------
-- Drop whatever check limits category today (its name may differ from the
-- default), then add the new one.
do $$
declare
  r record;
begin
  for r in
    select c.conrelid::regclass as tbl, c.conname
    from pg_constraint c
    where c.contype = 'c'
      and c.conrelid in ('template_milestones'::regclass, 'student_milestones'::regclass)
      and pg_get_constraintdef(c.oid) ilike '%category%'
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end $$;

alter table template_milestones add constraint template_milestones_category_check
  check (category in ('COURSE', 'SKILL', 'CAREER_PREP', 'CERT', 'EXPERIENCE'));
alter table student_milestones add constraint student_milestones_category_check
  check (category in ('COURSE', 'SKILL', 'CAREER_PREP', 'CERT', 'EXPERIENCE'));


-- ---------------------------------------------------------------------
-- [2] Move the university default's planning milestones
-- (The School of Communications seed sets its own categories; re-run it
-- after this file.)
-- ---------------------------------------------------------------------
update template_milestones tm
set category = 'CAREER_PREP'
from roadmap_templates t
where tm.template_id = t.id
  and t.school_id is null and t.major_id is null
  and tm.gap_competency_id is null
  and tm.name in ('Create a LinkedIn profile', 'Draft your first resume', 'Meet with Career Development');


-- ---------------------------------------------------------------------
-- [3] Students' milestones follow their template's category
-- Names and descriptions stay as copied; only the track changes.
-- ---------------------------------------------------------------------
update student_milestones sm
set category = tm.category
from template_milestones tm
where sm.template_milestone_id = tm.id
  and sm.category <> tm.category;
