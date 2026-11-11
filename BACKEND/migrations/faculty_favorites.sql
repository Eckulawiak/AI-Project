-- =====================================================================
-- Career Services - faculty favorite advisees
-- Run after faculty_skill_reviews.sql. Safe to re-run.
--
-- A faculty member or advisor stars students on their Student Reviews
-- page so they can get back to them quickly. Starred students show as
-- "My advisees" at the top of that page and on the Faculty Dashboard.
-- Each faculty member only sees and changes their own favorites.
-- =====================================================================

create table if not exists faculty_favorites (
  faculty_id  bigint not null references faculty_admin(faculty_id) on delete cascade,
  student_id  bigint not null references student(student_id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (faculty_id, student_id)
);

-- make the API see the new table right away
notify pgrst, 'reload schema';
