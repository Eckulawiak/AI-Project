-- =====================================================================
-- Career Services - internship listings cache
-- Run after ai_roadmap_suggestions.sql. Safe to re-run.
--
-- Current internship openings from free job APIs (Adzuna, USAJobs, The
-- Muse), cached per career goal for 12 hours so students with the same
-- goal share one lookup. No student identifiers are stored.
-- =====================================================================

create table if not exists internship_listing_cache (
  goal_key    varchar(100) primary key,  -- normalized career goal
  listings    jsonb not null default '[]'::jsonb,
  sources     text[] not null default '{}',
  fetched_at  timestamptz not null default now()
);
