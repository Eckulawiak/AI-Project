-- =====================================================================
-- Removes everything demo_progress_students.sql created: the six
-- demo.student1..6@quinnipiac.edu accounts, their roadmaps, milestones,
-- any assessments or history they made, and their login records.
-- Touches nothing else. Safe to run more than once.
-- =====================================================================

do $$
declare
  ids bigint[];
begin
  select coalesce(array_agg(student_id), '{}') into ids
  from student
  where student_qu_email like 'demo.student%@quinnipiac.edu';

  delete from student_milestones
  where roadmap_id in (select id from student_roadmaps where student_id = any(ids));
  delete from student_roadmaps      where student_id = any(ids);
  delete from student_assessments   where student_id = any(ids);
  delete from student_course_history where student_id = any(ids);
  delete from student_history       where student_id = any(ids);
  delete from auditlogs where email like 'demo.student%@quinnipiac.edu';
  delete from student where student_id = any(ids);

  raise notice 'Removed % demo students', coalesce(array_length(ids, 1), 0);
end $$;

-- Should return no rows.
select student_id, student_qu_email from student
where student_qu_email like 'demo.student%@quinnipiac.edu';
