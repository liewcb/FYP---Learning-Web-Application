-- Content Analysis: Gemini study guide.
--
-- The AI service writes readable study notes (overview, sections with cited
-- key points, glossary) next to the NLP results of each analysis. Null means
-- no guide was written (no Gemini key, Gemini failed, or an older analysis);
-- the page then shows the NLP results only.
--
-- The existing table-level select grant and owner RLS policy already cover
-- the new column, so students can read the guide of their own documents only.

alter table public.document_analyses
  add column study_guide jsonb;

alter table public.document_analyses
  add constraint document_analyses_study_guide_object_check
  check (study_guide is null or jsonb_typeof(study_guide) = 'object');

comment on column public.document_analyses.study_guide is
  'Gemini study notes grounded in the analysed sentences; null when unavailable.';
