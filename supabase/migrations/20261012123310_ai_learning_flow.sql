-- AI learning flow
--
-- The browser may read rows that belong to the signed-in student. All writes
-- are performed by trusted Next.js/FastAPI server code using a Supabase secret
-- key. Correct quiz answers live in the unexposed private schema.

create table public.document_contents (
  document_id bigint primary key
    references public.documents (id) on delete cascade,
  extracted_text text not null,
  sentences jsonb not null default '[]'::jsonb,
  language_code text not null default 'en',
  extractor_name text,
  extractor_version text,
  source_sha256 text,
  character_count integer generated always as (char_length(extracted_text)) stored,
  extracted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint document_contents_sentences_array_check
    check (jsonb_typeof(sentences) = 'array'),
  constraint document_contents_language_code_check
    check (language_code ~ '^[a-z]{2,3}(-[A-Z]{2})?$'),
  constraint document_contents_source_sha256_check
    check (source_sha256 is null or source_sha256 ~ '^[0-9a-f]{64}$')
);

create trigger document_contents_set_updated_at
before update on public.document_contents
for each row execute function private.set_updated_at();

create table public.document_analyses (
  id bigint generated always as identity primary key,
  document_id bigint not null
    references public.documents (id) on delete cascade,
  status text not null default 'pending',
  sentence_count integer,
  summary text,
  baseline_keywords jsonb not null default '[]'::jsonb,
  semantic_keywords jsonb not null default '[]'::jsonb,
  important_sentences jsonb not null default '[]'::jsonb,
  topics jsonb not null default '[]'::jsonb,
  concepts jsonb not null default '[]'::jsonb,
  model_info jsonb not null default '{}'::jsonb,
  request_options jsonb not null default '{}'::jsonb,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint document_analyses_id_document_key unique (id, document_id),
  constraint document_analyses_status_check
    check (status in ('pending', 'processing', 'ready', 'failed')),
  constraint document_analyses_sentence_count_check
    check (sentence_count is null or sentence_count >= 1),
  constraint document_analyses_baseline_keywords_array_check
    check (jsonb_typeof(baseline_keywords) = 'array'),
  constraint document_analyses_semantic_keywords_array_check
    check (jsonb_typeof(semantic_keywords) = 'array'),
  constraint document_analyses_important_sentences_array_check
    check (jsonb_typeof(important_sentences) = 'array'),
  constraint document_analyses_topics_array_check
    check (jsonb_typeof(topics) = 'array'),
  constraint document_analyses_concepts_array_check
    check (jsonb_typeof(concepts) = 'array'),
  constraint document_analyses_model_info_object_check
    check (jsonb_typeof(model_info) = 'object'),
  constraint document_analyses_request_options_object_check
    check (jsonb_typeof(request_options) = 'object'),
  constraint document_analyses_completion_check check (
    (status = 'ready' and completed_at is not null and error_message is null)
    or (status = 'failed' and completed_at is not null and error_message is not null)
    or (status in ('pending', 'processing') and completed_at is null)
  )
);

create index document_analyses_document_created_idx
on public.document_analyses (document_id, created_at desc);

create index document_analyses_pending_idx
on public.document_analyses (created_at)
where status in ('pending', 'processing');

create trigger document_analyses_set_updated_at
before update on public.document_analyses
for each row execute function private.set_updated_at();

create table public.quizzes (
  id bigint generated always as identity primary key,
  document_id bigint not null,
  analysis_id bigint not null,
  title text not null,
  status text not null default 'generating',
  difficulty text not null default 'mixed',
  requested_question_count smallint not null default 10,
  question_count smallint not null default 0,
  generation_model text,
  prompt_version text,
  error_message text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quizzes_analysis_document_fkey
    foreign key (analysis_id, document_id)
    references public.document_analyses (id, document_id)
    on delete cascade,
  constraint quizzes_title_length_check
    check (char_length(title) between 1 and 200),
  constraint quizzes_status_check
    check (status in ('generating', 'ready', 'failed')),
  constraint quizzes_difficulty_check
    check (difficulty in ('easy', 'medium', 'hard', 'mixed')),
  constraint quizzes_requested_question_count_check
    check (requested_question_count between 1 and 50),
  constraint quizzes_question_count_check
    check (question_count between 0 and 50),
  constraint quizzes_completion_check check (
    (status = 'ready' and completed_at is not null and error_message is null)
    or (status = 'failed' and completed_at is not null and error_message is not null)
    or (status = 'generating' and completed_at is null)
  )
);

create index quizzes_document_created_idx
on public.quizzes (document_id, created_at desc);

create index quizzes_analysis_id_idx on public.quizzes (analysis_id);

create index quizzes_generating_idx
on public.quizzes (created_at)
where status = 'generating';

create trigger quizzes_set_updated_at
before update on public.quizzes
for each row execute function private.set_updated_at();

create table public.quiz_questions (
  id bigint generated always as identity primary key,
  quiz_id bigint not null references public.quizzes (id) on delete cascade,
  position smallint not null,
  question_type text not null,
  prompt text not null,
  options jsonb not null default '[]'::jsonb,
  points numeric(6, 2) not null default 1,
  source_sentence_indexes integer[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quiz_questions_id_quiz_key unique (id, quiz_id),
  constraint quiz_questions_quiz_position_key unique (quiz_id, position),
  constraint quiz_questions_position_check check (position >= 1),
  constraint quiz_questions_type_check
    check (question_type in ('multiple_choice', 'true_false', 'short_answer')),
  constraint quiz_questions_prompt_length_check
    check (char_length(prompt) between 1 and 2000),
  constraint quiz_questions_options_array_check
    check (jsonb_typeof(options) = 'array'),
  constraint quiz_questions_points_check check (points > 0)
);

create trigger quiz_questions_set_updated_at
before update on public.quiz_questions
for each row execute function private.set_updated_at();

create table private.quiz_answer_keys (
  question_id bigint primary key
    references public.quiz_questions (id) on delete cascade,
  correct_answer jsonb not null,
  explanation text,
  rubric jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quiz_answer_keys_rubric_object_check
    check (jsonb_typeof(rubric) = 'object')
);

create trigger quiz_answer_keys_set_updated_at
before update on private.quiz_answer_keys
for each row execute function private.set_updated_at();

create table public.quiz_attempts (
  id bigint generated always as identity primary key,
  quiz_id bigint not null references public.quizzes (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'in_progress',
  score numeric(8, 2),
  max_score numeric(8, 2),
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  graded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quiz_attempts_id_quiz_key unique (id, quiz_id),
  constraint quiz_attempts_status_check
    check (status in ('in_progress', 'submitted', 'graded')),
  constraint quiz_attempts_score_check check (
    (score is null or score >= 0)
    and (max_score is null or max_score >= 0)
    and (score is null or max_score is null or score <= max_score)
  ),
  constraint quiz_attempts_lifecycle_check check (
    (status = 'in_progress' and submitted_at is null and graded_at is null)
    or (status = 'submitted' and submitted_at is not null and graded_at is null)
    or (status = 'graded' and submitted_at is not null and graded_at is not null)
  )
);

create index quiz_attempts_user_created_idx
on public.quiz_attempts (user_id, created_at desc);

create index quiz_attempts_quiz_id_idx on public.quiz_attempts (quiz_id);

create trigger quiz_attempts_set_updated_at
before update on public.quiz_attempts
for each row execute function private.set_updated_at();

create table public.quiz_answers (
  id bigint generated always as identity primary key,
  attempt_id bigint not null,
  quiz_id bigint not null,
  question_id bigint not null,
  response jsonb not null,
  is_correct boolean,
  awarded_points numeric(6, 2),
  feedback text,
  answered_at timestamptz not null default now(),
  graded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quiz_answers_attempt_quiz_fkey
    foreign key (attempt_id, quiz_id)
    references public.quiz_attempts (id, quiz_id)
    on delete cascade,
  constraint quiz_answers_question_quiz_fkey
    foreign key (question_id, quiz_id)
    references public.quiz_questions (id, quiz_id)
    on delete cascade,
  constraint quiz_answers_attempt_question_key
    unique (attempt_id, question_id),
  constraint quiz_answers_awarded_points_check
    check (awarded_points is null or awarded_points >= 0)
);

create index quiz_answers_question_id_idx
on public.quiz_answers (question_id);

create trigger quiz_answers_set_updated_at
before update on public.quiz_answers
for each row execute function private.set_updated_at();

alter table public.document_contents enable row level security;
alter table public.document_analyses enable row level security;
alter table public.quizzes enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.quiz_attempts enable row level security;
alter table public.quiz_answers enable row level security;
alter table private.quiz_answer_keys enable row level security;

create policy document_contents_owner_select
on public.document_contents
for select
to authenticated
using (
  exists (
    select 1
    from public.documents d
    where d.id = document_contents.document_id
      and d.owner_id = (select auth.uid())
  )
);

create policy document_analyses_owner_select
on public.document_analyses
for select
to authenticated
using (
  exists (
    select 1
    from public.documents d
    where d.id = document_analyses.document_id
      and d.owner_id = (select auth.uid())
  )
);

create policy quizzes_owner_select
on public.quizzes
for select
to authenticated
using (
  exists (
    select 1
    from public.documents d
    where d.id = quizzes.document_id
      and d.owner_id = (select auth.uid())
  )
);

create policy quiz_questions_owner_select
on public.quiz_questions
for select
to authenticated
using (
  exists (
    select 1
    from public.quizzes q
    join public.documents d on d.id = q.document_id
    where q.id = quiz_questions.quiz_id
      and d.owner_id = (select auth.uid())
  )
);

create policy quiz_attempts_owner_select
on public.quiz_attempts
for select
to authenticated
using (user_id = (select auth.uid()));

create policy quiz_answers_owner_select
on public.quiz_answers
for select
to authenticated
using (
  exists (
    select 1
    from public.quiz_attempts a
    where a.id = quiz_answers.attempt_id
      and a.user_id = (select auth.uid())
  )
);

-- Remove Supabase's broad defaults, then grant the browser read-only access.
-- Trusted server code owns every write so students cannot forge model output,
-- scores or grading fields through the Data API.
revoke all on public.document_contents from anon, authenticated;
revoke all on public.document_analyses from anon, authenticated;
revoke all on public.quizzes from anon, authenticated;
revoke all on public.quiz_questions from anon, authenticated;
revoke all on public.quiz_attempts from anon, authenticated;
revoke all on public.quiz_answers from anon, authenticated;

grant select on public.document_contents to authenticated;
grant select on public.document_analyses to authenticated;
grant select on public.quizzes to authenticated;
grant select on public.quiz_questions to authenticated;
grant select on public.quiz_attempts to authenticated;
grant select on public.quiz_answers to authenticated;

grant select, insert, update, delete
on public.document_contents,
   public.document_analyses,
   public.quizzes,
   public.quiz_questions,
   public.quiz_attempts,
   public.quiz_answers
to service_role;

grant usage, select
on sequence public.document_analyses_id_seq,
            public.quizzes_id_seq,
            public.quiz_questions_id_seq,
            public.quiz_attempts_id_seq,
            public.quiz_answers_id_seq
to service_role;

revoke all on private.quiz_answer_keys from public, anon, authenticated;
grant usage on schema private to service_role;
grant select, insert, update, delete
on private.quiz_answer_keys to service_role;
