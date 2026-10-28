-- =====================================================================
-- DEMO DATA: six Software Engineering students with roadmaps
--
-- Lets the faculty Student Progress and admin Reports pages show real
-- numbers (groups under 5 students are hidden). Everything it creates is
-- tagged with emails demo.student1..6@quinnipiac.edu.
--
-- Remove it all with demo_progress_students_cleanup.sql.
-- Safe to re-run: students that already exist are skipped.
-- Needs roadmap_progress_assessment.sql to have been run first.
--
-- The demo students can log in with password: DemoPassword1!
-- =====================================================================

do $$
declare
  se_major   bigint;
  tpl        bigint;
  sid        bigint;
  rid        bigint;
  i          int;
  -- per student: class year and how much of the roadmap they've done
  years      text[] := array['SOPH', 'SOPH', 'SOPH', 'SOPH', 'JUNIOR', 'JUNIOR'];
  target_pct int[]  := array[20, 35, 50, 60, 75, 90];
  year_order text[] := array['FIRST', 'SOPH', 'JUNIOR', 'SENIOR'];
begin
  select id into se_major from majors where name = 'Software Engineering' order by id limit 1;
  if se_major is null then
    raise exception 'No major named Software Engineering was found.';
  end if;

  -- Same template a real Software Engineering student gets: a major
  -- template, else the school default, else the university default.
  select t.id into tpl
  from roadmap_templates t
  where t.goal_type in ('INDUSTRY', 'ANY')
    and (t.major_id = se_major
         or (t.major_id is null and t.school_id = (select school_id from majors where id = se_major))
         or (t.major_id is null and t.school_id is null))
  order by (t.major_id is null), (t.school_id is null), (t.goal_type <> 'INDUSTRY'), t.id
  limit 1;
  if tpl is null then
    raise exception 'No roadmap template found. Run roadmap_progress_assessment.sql first.';
  end if;

  for i in 1..6 loop
    if exists (select 1 from student where student_qu_email = format('demo.student%s@quinnipiac.edu', i)) then
      continue;
    end if;

    insert into student (student_qu_email, password, firstname, lastname, major, major_id,
                         class_year, career_goal, goal_type)
    values (format('demo.student%s@quinnipiac.edu', i),
            '$2b$12$p9jQI0nInpJzloTSM18hpOs1JHWhy.64bDeNA/ns6g37nc.mvT6B.',
            'Demo', format('Student %s', i), 'Software Engineering', se_major,
            years[i], 'Software Engineer', 'INDUSTRY')
    returning student_id into sid;

    insert into student_roadmaps (student_id, template_id, generated_at)
    values (sid, tpl, now() - make_interval(days => 20 - i))
    returning id into rid;

    -- Template milestones for this year onward (as the app does), plus the
    -- major's courses. Completion is deterministic per student so re-runs
    -- after a cleanup give the same numbers.
    insert into student_milestones
      (roadmap_id, template_milestone_id, course_id, category, class_year, name,
       description, source, competency_ids, status, completed_at)
    select rid, m.tm_id, m.course_id, m.category, m.class_year, m.name,
           m.description, m.source, m.competency_ids,
           case when m.done then 'COMPLETE' else 'PENDING' end,
           case when m.done
                then now() - make_interval(days => abs(hashtext(m.name || i)) % 28)
           end
    from (
      select tm.id as tm_id, null::bigint as course_id, tm.category, tm.class_year,
             tm.name, coalesce(tm.description, '') as description, 'TEMPLATE' as source,
             coalesce(array(select c.competency_id from template_milestone_competencies c
                            where c.template_milestone_id = tm.id), '{}') as competency_ids,
             abs(hashtext(tm.name || ':' || i)) % 100 < target_pct[i] as done
      from template_milestones tm
      where tm.template_id = tpl
        and tm.gap_competency_id is null
        and array_position(year_order, tm.class_year) >= array_position(year_order, years[i])

      union all

      select null, c.course_id, 'COURSE',
             case substring(c.course_code from '[0-9]')
               when '1' then 'FIRST' when '2' then 'SOPH' when '3' then 'JUNIOR' else 'SENIOR' end,
             'Complete ' || c.course_code, coalesce(c.course_name, '') || '.', 'COURSE', '{}',
             abs(hashtext(c.course_code || ':' || i)) % 100 < target_pct[i]
      from (
        select distinct on (c.course_code) c.course_id, c.course_code, c.course_name
        from major_courses mc
        join courses c on c.course_id = mc.course_id
        where mc.major_id = se_major
        order by c.course_code, c.course_id
        limit 8
      ) c
    ) m;

    -- A few logins so the admin Reports usage numbers have something to show.
    insert into auditlogs (user_id, email, user_type, action, created_at)
    select sid, format('demo.student%s@quinnipiac.edu', i), 'STUDENT', 'LOGIN',
           now() - make_interval(days => d * (i + 2), hours => i)
    from generate_series(0, 1 + i % 3) as d;

    raise notice 'Created demo.student%@quinnipiac.edu (student %, roadmap %)', i, sid, rid;
  end loop;
end $$;

-- Check: one row per demo student with how far along they are.
select s.student_qu_email,
       s.class_year,
       count(m.*) as milestones,
       count(m.*) filter (where m.status = 'COMPLETE') as completed
from student s
join student_roadmaps r on r.student_id = s.student_id
join student_milestones m on m.roadmap_id = r.id
where s.student_qu_email like 'demo.student%@quinnipiac.edu'
group by s.student_qu_email, s.class_year
order by s.student_qu_email;
