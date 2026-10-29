-- Document text extraction and preprocessing
--
-- The FastAPI service downloads an uploaded learning material with the
-- server-only secret key, extracts and cleans its text, stores the result in
-- document_contents and moves documents.status through
-- uploaded -> processing -> ready | failed. Browser access stays read-only.

-- Some development databases received these columns through the dashboard
-- before this migration was committed.  Keep the migration safe for both a
-- fresh database and that already-prepared schema; no existing data is
-- replaced or removed.
alter table public.document_contents
  add column if not exists page_count integer,
  add column if not exists word_count integer not null default 0,
  add column if not exists warnings jsonb not null default '[]'::jsonb,
  add column if not exists sentence_count integer
    generated always as (jsonb_array_length(sentences)) stored;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.document_contents'::regclass
      and conname = 'document_contents_page_count_check'
  ) then
    alter table public.document_contents
      add constraint document_contents_page_count_check
      check (page_count is null or page_count >= 1);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.document_contents'::regclass
      and conname = 'document_contents_word_count_check'
  ) then
    alter table public.document_contents
      add constraint document_contents_word_count_check
      check (word_count >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.document_contents'::regclass
      and conname = 'document_contents_warnings_array_check'
  ) then
    alter table public.document_contents
      add constraint document_contents_warnings_array_check
      check (jsonb_typeof(warnings) = 'array');
  end if;
end
$$;

comment on column public.document_contents.extracted_text is
  'Cleaned, normalised text with one paragraph per block.';
comment on column public.document_contents.sentences is
  'Ordered, filtered sentences ready for content analysis and quiz generation.';
comment on column public.document_contents.warnings is
  'Student-readable notes about partial extraction, such as image-only pages.';

-- The AI service claims a document and records the processing outcome.
-- Grant only what that flow needs instead of relying on Supabase defaults.
grant select, update on public.documents to service_role;
