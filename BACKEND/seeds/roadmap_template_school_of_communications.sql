-- =====================================================================
-- Roadmap template: School of Communications
-- Source: "Career Mapping Framework - SOC" (Career Development Framework)
--
-- Run after migrations/roadmap_template_details.sql and
-- migrations/career_prep_category.sql. Safe to re-run: rows
-- are matched on (class year, component) and updated in place, so editing
-- the framework below and running this again keeps students' links.
--
-- How the framework maps onto the roadmap:
--   College phase  -> class_year (Pre-College and First-Year -> FIRST,
--                     Second-Year -> SOPH, Third-Year -> JUNIOR,
--                     Fourth-Year/Grad Students -> SENIOR)
--   Component      -> one milestone; _components below gives its roadmap
--                     category, the name students see, and the NACE
--                     competencies it builds. A component that repeats
--                     across years gets a title per year in _year_names,
--                     so each year reads as the next step.
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
-- [2] Components: category, student-facing name, description, competencies
-- The doc does not name categories or competencies; these are a first
-- pass for Career Development to review.
-- ---------------------------------------------------------------------
drop table if exists _components;
create temp table _components (
  component     text primary key,
  category      text not null,
  name          text not null,
  description   text not null,
  competencies  text[] not null
);

insert into _components values
  ('Pre-Enrollment', 'EXPERIENCE', 'Attend SOC orientation or a summer camp',
   'Get to know the School of Communications before your first semester.',
   array['Career and Self-Development']),
  ('Reflection and Exploration', 'CAREER_PREP', 'Reflect on and explore career paths',
   'Learn what you enjoy and which careers fit, using career tools, events and appointments.',
   array['Career and Self-Development', 'Critical Thinking']),
  ('Career Course', 'COURSE', 'Take the career course (COM 201)',
   'COM 201 covers career planning, AI tools for the job search, and professional headshots.',
   array['Career and Self-Development', 'Professionalism', 'Technology']),
  ('Resume', 'CAREER_PREP', 'Build and update your resume',
   'Draft your resume and keep it current with help from Career Development.',
   array['Communication', 'Career and Self-Development']),
  ('Networking', 'EXPERIENCE', 'Grow your professional network',
   'Meet professionals and alumni in your field and keep in touch.',
   array['Communication', 'Professionalism']),
  ('Engagement and Involvement', 'EXPERIENCE', 'Get involved on campus',
   'Join student media and other organizations, and take on leadership as you go.',
   array['Teamwork', 'Leadership']),
  ('Experiential Learning', 'EXPERIENCE', 'Gain hands-on experience',
   'Put your skills to work in a campus job, agency or student role.',
   array['Professionalism', 'Teamwork', 'Technology']),
  ('Internships/Experiential Learning', 'EXPERIENCE', 'Complete an internship or hands-on experience',
   'Take on an internship or another hands-on role in your field.',
   array['Professionalism', 'Teamwork', 'Technology']),
  ('Graduate School', 'CAREER_PREP', 'Explore graduate school options',
   'Talk with Career Development about whether and when graduate school fits your goals.',
   array['Career and Self-Development']),
  ('Engage Outside World', 'EXPERIENCE', 'Engage with your industry beyond campus',
   'Learn from the industry through programs, trips, festivals and collaborations off campus.',
   array['Communication', 'Equity and Inclusion']),
  ('Mentorship', 'EXPERIENCE', 'Connect with a mentor',
   'Find an alum or professional who can guide your career.',
   array['Career and Self-Development', 'Professionalism']),
  ('Job Search', 'CAREER_PREP', 'Run your job search',
   'Search and apply for full-time or freelance work after graduation.',
   array['Career and Self-Development', 'Professionalism']);


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


-- Titles for components that repeat across years; others use the
-- _components name.
drop table if exists _year_names;
create temp table _year_names (
  class_year  text not null,
  component   text not null,
  name        text not null,
  primary key (class_year, component)
);

insert into _year_names values
  ('FIRST',  'Reflection and Exploration', 'Explore careers in communications'),
  ('SOPH',   'Reflection and Exploration', 'Narrow down your career interests'),
  ('JUNIOR', 'Reflection and Exploration', 'Test your career direction'),
  ('SENIOR', 'Reflection and Exploration', 'Confirm your plan after graduation'),
  ('FIRST',  'Resume', 'Draft your first resume'),
  ('SOPH',   'Resume', 'Add your new experience to your resume'),
  ('JUNIOR', 'Resume', 'Tailor your resume for internships'),
  ('SENIOR', 'Resume', 'Finalize your resume for the job search'),
  ('FIRST',  'Networking', 'Start your professional network'),
  ('SOPH',   'Networking', 'Grow your network through class visits and events'),
  ('JUNIOR', 'Networking', 'Network at career fairs and alumni panels'),
  ('SENIOR', 'Networking', 'Use your network in your job search'),
  ('SOPH',   'Graduate School', 'Learn about graduate school options'),
  ('JUNIOR', 'Graduate School', 'Decide whether graduate school fits your plan'),
  ('SENIOR', 'Graduate School', 'Apply to graduate programs if they are your plan'),
  ('FIRST',  'Engagement and Involvement', 'Join a student organization'),
  ('SENIOR', 'Engagement and Involvement', 'Take a leadership role on campus'),
  ('FIRST',  'Experiential Learning', 'Get a campus job or student role'),
  ('SOPH',   'Experiential Learning', 'Take on a bigger hands-on role'),
  ('JUNIOR', 'Engage Outside World', 'Engage with your industry beyond campus'),
  ('SENIOR', 'Engage Outside World', 'Deepen your industry connections off campus'),
  ('JUNIOR', 'Mentorship', 'Connect with a mentor'),
  ('SENIOR', 'Mentorship', 'Keep learning from your mentor');


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

  select string_agg(y.class_year || ' ' || y.component, ', ') into missing
  from _year_names y left join _framework f using (class_year, component)
  where f.component is null;
  if missing is not null then
    raise exception 'These _year_names rows match no framework row: %', missing;
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
  select f.*, c.category, coalesce(y.name, c.name) as name, c.description,
         case when f.component = 'Career Course'
              then (select course_id from com201) end as course_id
  from _framework f
  join _components c using (component)
  left join _year_names y using (class_year, component)
),
updated as (
  update template_milestones tm
  set category    = s.category,
      name        = s.name,
      description = s.description,
      resources   = s.resources,
      position    = s.position,
      course_id   = s.course_id
  from source s, tpl
  where tm.template_id = tpl.id
    and tm.class_year  = s.class_year
    and tm.component   = s.component
  returning tm.id
)
insert into template_milestones
  (template_id, category, class_year, name, description, component, resources, position, course_id)
select tpl.id, s.category, s.class_year, s.name, s.description, s.component, s.resources, s.position, s.course_id
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

-- ---------------------------------------------------------------------
-- [7] Students' milestones follow the template's category
-- Names stay as copied, so a student's roadmap does not change under them;
-- pending milestones pick up new names when the roadmap is regenerated.
-- ---------------------------------------------------------------------
update student_milestones sm
set category = tm.category
from template_milestones tm
where sm.template_milestone_id = tm.id
  and sm.category <> tm.category;

drop table _framework;
drop table _components;
drop table _year_names;
