-- Run this in Supabase SQL Editor after enabling the pgvector extension.
create extension if not exists vector;
-- Example embedding table for future semantic search:
-- create table if not exists "Embedding" (
--   id uuid primary key default gen_random_uuid(),
--   source_type text not null,
--   source_id uuid,
--   content text,
--   embedding vector(1536)
-- );
