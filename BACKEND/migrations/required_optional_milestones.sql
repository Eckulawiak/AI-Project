-- =====================================================================
-- Career Services - required vs optional milestones
-- Run after roadmap_template_details.sql. Safe to re-run.
--
-- Required milestones are the core plan every student works through and
-- are the only ones counted in career readiness progress. Optional ones
-- (leadership roles, extra certifications, ...) are encouraged but never
-- hold a student back.
-- =====================================================================


-- ---------------------------------------------------------------------
-- [1] ALTER: template_milestones and student_milestones
-- Copied from the template like name and description, so a student's
-- roadmap stays stable when a template changes.
-- ---------------------------------------------------------------------
alter table template_milestones
  add column if not exists required boolean not null default true;

alter table student_milestones
  add column if not exists required boolean not null default true;


-- ---------------------------------------------------------------------
-- [2] University default templates: mark the extras optional.
-- Milestones added for a low self-rating (gap_competency_id) are
-- suggestions, so they are optional too.
-- ---------------------------------------------------------------------
update template_milestones tm
set required = false
from roadmap_templates t
where tm.template_id = t.id
  and t.school_id is null and t.major_id is null
  and (
    tm.gap_competency_id is not null
    or tm.name in (
      'Build a portfolio of your work',
      'Give a presentation on a project',
      'Lead a team project',
      'Finish an online course in your field',
      'Earn an industry certification',
      'Join a student club'
    )
  );


-- ---------------------------------------------------------------------
-- [3] Existing roadmaps: copy the flag from the template, and make
-- assessment suggestions (GAP) and experience the student added
-- (EXPERIENCE) optional.
-- ---------------------------------------------------------------------
update student_milestones sm
set required = tm.required
from template_milestones tm
where sm.template_milestone_id = tm.id
  and sm.required is distinct from tm.required;

update student_milestones
set required = false
where source in ('GAP', 'EXPERIENCE') and required;
