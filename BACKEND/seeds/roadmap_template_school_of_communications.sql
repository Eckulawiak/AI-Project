-- =====================================================================
-- Roadmap template: School of Communications
-- Source: "Career Mapping Framework - SOC" (Career Development Framework)
--
-- Run after migrations/required_optional_milestones.sql. Safe to re-run: rows
-- are matched on (class year, component) and updated in place, so editing
-- the framework below and running this again keeps students' links.
--
-- How the framework maps onto the roadmap:
--   College phase  -> class_year (Pre-College and First-Year -> FIRST,
--                     Second-Year -> SOPH, Third-Year -> JUNIOR,
--                     Fourth-Year/Grad Students -> SENIOR)
--   Component      -> one milestone; _components below gives its roadmap
--                     category, the name students see, the career skills
--                     (NACE competencies) it builds, and whether it is
--                     required or optional
--   Details        -> resources ("Ways to do this"), one entry per item
--
-- To add another school, copy this file, change the school name and
-- template name, and replace the _framework rows. Add any new component
-- to _components; the check below stops the run if one is missing.
-- =====================================================================


-- ---------------------------------------------------------------------
-- [1] The template: school default, both goal types
-- ---------------------------------------------------------------------
insert into roadmap_templates (school_id, major_id, goal_type, name)
select s.id, null, 'ANY', 'School of Communications - Career Development Framework'
from schools s
where s.name = 'School of Communications'
  and not exists (
    select 1 from roadmap_templates t
    where t.school_id = s.id and t.major_id is null and t.goal_type = 'ANY'
  );


-- ---------------------------------------------------------------------
-- [2] Components: category, student-facing name, description, competencies,
-- required. The doc does not name categories, competencies or which
-- components are optional; these are a first pass for Career Development
-- to review. Optional components never count against progress.
-- ---------------------------------------------------------------------
drop table if exists _components;
create temp table _components (
  component     text primary key,
  category      text not null,
  name          text not null,
  description   text not null,
  competencies  text[] not null,
  required      boolean not null
);

insert into _components values
  ('Pre-Enrollment', 'EXPERIENCE', 'Attend SOC orientation or a summer camp',
   'Get to know the School of Communications before your first semester.',
   array['Career and Self-Development'], false),
  ('Reflection and Exploration', 'SKILL', 'Reflect on and explore career paths',
   'Learn what you enjoy and which careers fit, using career tools, events and appointments.',
   array['Career and Self-Development', 'Critical Thinking'], true),
  ('Career Course', 'COURSE', 'Take the career course (COM 201)',
   'COM 201 covers career planning, AI tools for the job search, and professional headshots.',
   array['Career and Self-Development', 'Professionalism', 'Technology'], true),
  ('Resume', 'SKILL', 'Build and update your resume',
   'Draft your resume and keep it current with help from Career Development.',
   array['Communication', 'Career and Self-Development'], true),
  ('Networking', 'EXPERIENCE', 'Grow your professional network',
   'Meet professionals and alumni in your field and keep in touch.',
   array['Communication', 'Professionalism'], true),
  ('Engagement and Involvement', 'EXPERIENCE', 'Get involved on campus',
   'Join student media and other organizations, and take on leadership as you go.',
   array['Teamwork', 'Leadership'], false),
  ('Experiential Learning', 'EXPERIENCE', 'Gain hands-on experience',
   'Put your skills to work in a campus job, agency or student role.',
   array['Professionalism', 'Teamwork', 'Technology'], false),
  ('Internships/Experiential Learning', 'EXPERIENCE', 'Complete an internship or hands-on experience',
   'Take on an internship or another hands-on role in your field.',
   array['Professionalism', 'Teamwork', 'Technology'], true),
  ('Graduate School', 'SKILL', 'Explore graduate school options',
   'Talk with Career Development about whether and when graduate school fits your goals.',
   array['Career and Self-Development'], false),
  ('Engage Outside World', 'EXPERIENCE', 'Engage with your industry beyond campus',
   'Learn from the industry through programs, trips, festivals and collaborations off campus.',
   array['Communication', 'Equity and Inclusion'], false),
  ('Mentorship', 'EXPERIENCE', 'Connect with a mentor',
   'Find an alum or professional who can guide your career.',
   array['Career and Self-Development', 'Professionalism'], false),
  ('Job Search', 'SKILL', 'Run your job search',
   'Search and apply for full-time or freelance work after graduation.',
   array['Career and Self-Development', 'Professionalism'], true);


-- ---------------------------------------------------------------------
-- [3] The framework, one row per (college phase, component)
-- ---------------------------------------------------------------------
drop table if exists _framework;
create temp table _framework (
  position    int  not null,
  class_year  text not null,
  component   text not null,
  resources   text[] not null
);

insert into _framework values
  (1, 'FIRST', 'Pre-Enrollment',
   array['SOC Orientation', 'Summer camps']),
  (2, 'FIRST', 'Reflection and Exploration',
   array['COM 101 (incl. 1-2 class visits from career)', '1:1 appointments', 'Career Labs', 'Career SharePoint page', 'Handshake', 'Mountain Film Festival', 'Focus 2', 'SOC Core Courses']),
  (3, 'FIRST', 'Career Course',
   array['COM 201 (for 3+1)', 'AI software', 'headshots']),
  (4, 'FIRST', 'Resume',
   array['COM 201 (for 3+1)', 'Career SharePoint page']),
  (5, 'FIRST', 'Networking',
   array['COM 201 (for 3+1)', 'LinkedIn', 'Class visits', 'Career SharePoint page', '1:1 career appointments', 'Career Labs', 'Off-campus conferences/trips']),
  (6, 'FIRST', 'Engagement and Involvement',
   array['Involvement fair', 'Student media organizations', '24 Hour Film Festival']),
  (7, 'FIRST', 'Experiential Learning',
   array['FWS jobs']),
  (8, 'SOPH', 'Career Course',
   array['COM 201', 'AI software', 'headshots']),
  (9, 'SOPH', 'Resume',
   array['COM 201', '1:1 career appointments', 'Career Labs', 'Career SharePoint page']),
  (10, 'SOPH', 'Reflection and Exploration',
   array['COM 201', 'Handshake', 'Mountain Film Festival', '24 Hour Film Festival', 'Focus 2']),
  (11, 'SOPH', 'Networking',
   array['COM 201', 'LinkedIn', 'Class visits', 'Career SharePoint page', '1:1 appointments', 'Career Labs', 'Off-campus conferences/trips/site visits']),
  (12, 'SOPH', 'Experiential Learning',
   array['FWS jobs', 'ADPR 405 (The Agency)', 'IFC Course', 'student ambassadors', 'student advisory board']),
  (13, 'SOPH', 'Graduate School',
   array['1:1 career appointments']),
  (14, 'JUNIOR', 'Resume',
   array['COM 201', '1:1 career appointments', 'Career Labs']),
  (15, 'JUNIOR', 'Reflection and Exploration',
   array['COM 201', '1:1 appointments', 'Career Labs', 'Handshake', 'Mountain Film Festival', '24 Hour Film Festival', 'Focus 2']),
  (16, 'JUNIOR', 'Career Course',
   array['COM 201', 'AI software', 'headshots']),
  (17, 'JUNIOR', 'Engage Outside World',
   array['IFC Courses', 'QU in LA/DC', 'QU in NYC (anticipated)', 'Off-campus conferences/trips/site visits', 'PFT Resources site', 'Cannes Film Festival', 'Sundance Film Festival', 'faculty-led travel', '"Connecticut Student Journalism Collaborative"']),
  (18, 'JUNIOR', 'Mentorship',
   array['Alumni events', 'ESPN Mentorship program']),
  (19, 'JUNIOR', 'Networking',
   array['COM 201', 'LinkedIn', 'Class visits', 'Career SharePoint page', '1:1 appointments', 'Career Labs', 'SOC Virtual Career Fair', 'Off-campus conferences/trips', 'MSS alumni panel', 'Cannes Film Festival', 'Sundance Film Festival']),
  (20, 'JUNIOR', 'Internships/Experiential Learning',
   array['FWS jobs', 'ADPR 405 (The Agency)', 'IFC Course', 'QU in LA/DC', 'QU in NY/ATL (anticipated)', 'internships abroad', 'CPM Resources site', 'student ambassadors', 'student advisory board', 'HHC internships', '"Retirement Daily" internships', 'Dow Jones News Fund connection']),
  (21, 'JUNIOR', 'Graduate School',
   array['1:1 career appointments']),
  (22, 'SENIOR', 'Resume',
   array['1:1 career appointments', 'Career Labs', 'Career SharePoint page', 'AI software']),
  (23, 'SENIOR', 'Engagement and Involvement',
   array['Student media organization leadership positions', '24 Hour Film Festival', 'student ambassadors', 'student advisory board']),
  (24, 'SENIOR', 'Reflection and Exploration',
   array['IFC Courses', 'Handshake', 'Mountain Film Festival', '24 Hour Film Festival', 'Focus 2']),
  (25, 'SENIOR', 'Engage Outside World',
   array['IFC Courses', 'QU in LA/DC', 'QU in NYC (anticipated)', 'internships abroad', 'Off-campus conferences/trips/site visits', 'CPM Resources site', 'Cannes Film Festival', 'Sundance Film Festival', 'faculty-led travel', 'HHC internships', '"Connecticut Student Journalism Collaborative"']),
  (26, 'SENIOR', 'Job Search',
   array['1:1 career appointments', 'Career Labs', 'Career SharePoint page', 'Post-grad E-mail list', 'PFT Resources site', '"How to Freelance" panel']),
  (27, 'SENIOR', 'Graduate School',
   array['1:1 career appointments']),
  (28, 'SENIOR', 'Mentorship',
   array['Alumni events', 'ESPN Mentorship program']),
  (29, 'SENIOR', 'Networking',
   array['LinkedIn', 'Class visits', 'Alumni events', 'Off-campus conferences/trips', 'MSS alumni panel', 'Cannes Film Festival', 'Sundance Film Festival']);


-- ---------------------------------------------------------------------
-- [4] Checks
-- ---------------------------------------------------------------------
do $$
declare
  missing text;
begin
  if not exists (select 1 from schools where name = 'School of Communications') then
    raise exception 'School "School of Communications" not found. Run the course scraper first.';
  end if;

  select string_agg(distinct f.component, ', ') into missing
  from _framework f left join _components c using (component)
  where c.component is null;
  if missing is not null then
    raise exception 'Add these components to _components: %', missing;
  end if;
end $$;


-- ---------------------------------------------------------------------
-- [5] Upsert the template milestones
-- The career course links to COM 201 so it is not listed twice when the
-- course is also a major requirement; a student gets it once, in their
-- first remaining year that lists it.
-- ---------------------------------------------------------------------
with tpl as (
  select t.id
  from roadmap_templates t
  join schools s on s.id = t.school_id
  where s.name = 'School of Communications'
    and t.major_id is null and t.goal_type = 'ANY'
),
com201 as (
  select course_id from courses
  where course_code in ('COM-201', 'COM 201')
  order by is_active desc, course_id
  limit 1
),
source as (
  select f.*, c.category, c.name, c.description, c.required,
         case when f.component = 'Career Course'
              then (select course_id from com201) end as course_id
  from _framework f join _components c using (component)
),
updated as (
  update template_milestones tm
  set category    = s.category,
      name        = s.name,
      description = s.description,
      resources   = s.resources,
      position    = s.position,
      course_id   = s.course_id,
      required    = s.required
  from source s, tpl
  where tm.template_id = tpl.id
    and tm.class_year  = s.class_year
    and tm.component   = s.component
  returning tm.id
)
insert into template_milestones
  (template_id, category, class_year, name, description, component, resources, position, course_id, required)
select tpl.id, s.category, s.class_year, s.name, s.description, s.component, s.resources, s.position, s.course_id, s.required
from source s cross join tpl
where not exists (
  select 1 from template_milestones tm
  where tm.template_id = tpl.id
    and tm.class_year  = s.class_year
    and tm.component   = s.component
);

-- Rows removed from the framework are removed from the template. Students
-- keep any they already completed.
delete from template_milestones tm
using roadmap_templates t, schools s
where tm.template_id = t.id
  and t.school_id = s.id and s.name = 'School of Communications'
  and t.major_id is null and t.goal_type = 'ANY'
  and not exists (
    select 1 from _framework f
    where f.class_year = tm.class_year and f.component = tm.component
  );


-- ---------------------------------------------------------------------
-- [6] Competencies for each milestone (replaced on every run)
-- ---------------------------------------------------------------------
delete from template_milestone_competencies tmc
using template_milestones tm, roadmap_templates t, schools s
where tmc.template_milestone_id = tm.id
  and tm.template_id = t.id
  and t.school_id = s.id and s.name = 'School of Communications'
  and t.major_id is null and t.goal_type = 'ANY';

insert into template_milestone_competencies (template_milestone_id, competency_id)
select distinct tm.id, sk.skill_id
from template_milestones tm
join roadmap_templates t on t.id = tm.template_id
join schools s on s.id = t.school_id
join _components c on c.component = tm.component
cross join lateral unnest(c.competencies) as comp(name)
join skills sk on sk.type = true and sk.skill_name = comp.name
where s.name = 'School of Communications'
  and t.major_id is null and t.goal_type = 'ANY'
on conflict do nothing;

drop table _framework;
drop table _components;
