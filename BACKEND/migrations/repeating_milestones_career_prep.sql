-- =====================================================================
-- Career Services - repeating milestones belong in Career Prep
-- Run after career_prep_category.sql. Safe to re-run.
--
-- The School of Communications framework repeats some components every
-- year (Networking, Mentorship, ...). They are ongoing career preparation,
-- not experience, so they move to Career Prep. The Internships &
-- Experience track keeps internships, hands-on work (Experiential
-- Learning) and Pre-Enrollment.
--
-- Also re-applies the earlier Career Prep moves (seeds/
-- soc_move_to_career_prep.sql and career_prep_category.sql step 2) in case
-- they were never run.
-- =====================================================================

-- [1] School of Communications template
update template_milestones tm
set category = 'CAREER_PREP'
from roadmap_templates t
join schools s on s.id = t.school_id
where tm.template_id = t.id
  and s.name = 'School of Communications'
  and tm.component in (
    'Reflection and Exploration', 'Resume', 'Graduate School', 'Job Search',
    'Networking', 'Engagement and Involvement', 'Engage Outside World', 'Mentorship'
  )
  and tm.category <> 'CAREER_PREP';

-- [2] University default template's planning milestones
update template_milestones tm
set category = 'CAREER_PREP'
from roadmap_templates t
where tm.template_id = t.id
  and t.school_id is null and t.major_id is null
  and tm.gap_competency_id is null
  and tm.name in ('Create a LinkedIn profile', 'Draft your first resume', 'Meet with Career Development')
  and tm.category <> 'CAREER_PREP';

-- [3] Students' roadmaps follow their template
update student_milestones sm
set category = tm.category
from template_milestones tm
where sm.template_milestone_id = tm.id
  and sm.category <> tm.category;

-- Rows whose template link is missing, matched by component
update student_milestones
set category = 'CAREER_PREP'
where source = 'TEMPLATE'
  and category in ('SKILL', 'EXPERIENCE')
  and component in (
    'Reflection and Exploration', 'Resume', 'Graduate School', 'Job Search',
    'Networking', 'Engagement and Involvement', 'Engage Outside World', 'Mentorship'
  );

-- [4] Check: these components should all be CAREER_PREP now
select component, category, count(*)
from student_milestones
where component in (
  'Reflection and Exploration', 'Resume', 'Graduate School', 'Job Search',
  'Networking', 'Engagement and Involvement', 'Engage Outside World', 'Mentorship'
)
group by component, category
order by component, category;
