-- =====================================================================
-- Career Services - richer roadmap template milestones
-- Run after roadmap_progress_assessment.sql. Safe to re-run.
--
-- The schools' career development frameworks list, for each year, a
-- component (Resume, Networking, Mentorship, ...) and the ways a student
-- can work on it (COM 201, Career Labs, Handshake, ...). These columns hold
-- that so a framework fits one milestone per (year, component).
-- =====================================================================

-- ---------------------------------------------------------------------
-- [1] ALTER: template_milestones
-- component: the framework's heading, e.g. 'Networking'
-- resources: the framework's details, one entry per course, office,
--            program or event, shown under "Ways to do this"
-- position:  display order within the template
-- ---------------------------------------------------------------------
alter table template_milestones
  add column if not exists component  varchar(60),
  add column if not exists resources  text[]   not null default '{}',
  add column if not exists position   smallint;

-- one milestone per year and component in a template, so a framework seed
-- can be re-run to update its rows in place
create unique index if not exists template_milestones_year_component
  on template_milestones (template_id, class_year, component)
  where component is not null;


-- ---------------------------------------------------------------------
-- [2] ALTER: student_milestones
-- Copied from the template like name and description, so a student's
-- roadmap stays stable when the framework is edited.
-- ---------------------------------------------------------------------
alter table student_milestones
  add column if not exists component  varchar(60),
  add column if not exists resources  text[] not null default '{}';
