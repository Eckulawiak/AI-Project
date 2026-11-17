-- =====================================================================
-- Career Services - saved resume drafts (REQ-RES-4)
-- Run after student_projects.sql. Safe to re-run; never deletes anything.
--
-- One draft per student: the resume page's blocks of bullet points as the
-- student last saved them, including their own edits.
-- blocks: [{ "key": "course:12", "kind": "course" | "project", "refId": 12,
--            "heading": "...", "bullets": [{ "text": "...", "edited": true }] }]
-- =====================================================================

create table if not exists resume_drafts (
  student_id  bigint primary key references student(student_id) on delete cascade,
  blocks      jsonb not null default '[]'::jsonb,
  updated_at  timestamptz not null default now()
);
