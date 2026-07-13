create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;
alter extension pg_trgm set schema extensions;
