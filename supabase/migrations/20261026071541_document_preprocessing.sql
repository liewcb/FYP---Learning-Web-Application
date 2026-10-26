-- Document text extraction and preprocessing
--
-- The FastAPI service downloads an uploaded learning material with the
-- server-only secret key, extracts and cleans its text, stores the result in
-- document_contents and moves documents.status through
-- uploaded -> processing -> ready | failed. Browser access stays read-only.

alter table public.document_contents
  add column page_count integer,
  add column word_count integer not null default 0,
  add column warnings jsonb not null default '[]'::jsonb,
  add column sentence_count integer
    generated always as (jsonb_array_length(sentences)) stored,
  add constraint document_contents_page_count_check
    check (page_count is null or page_count >= 1),
  add constraint document_contents_word_count_check
    check (word_count >= 0),
  add constraint document_contents_warnings_array_check
    check (jsonb_typeof(warnings) = 'array');

comment on column public.document_contents.extracted_text is
  'Cleaned, normalised text with one paragraph per block.';
comment on column public.document_contents.sentences is
  'Ordered, filtered sentences ready for content analysis and quiz generation.';
comment on column public.document_contents.warnings is
  'Student-readable notes about partial extraction, such as image-only pages.';

-- The AI service claims a document and records the processing outcome.
-- Grant only what that flow needs instead of relying on Supabase defaults.
grant select, update on public.documents to service_role;
