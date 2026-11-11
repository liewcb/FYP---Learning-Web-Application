-- Quiz attempts: trusted grading, score history and post-attempt review.
--
-- Answer keys live in private.quiz_answer_keys and are never exposed through
-- the Data API. Students therefore cannot grade themselves. These SECURITY
-- DEFINER functions grade a submitted attempt on the database side and only
-- reveal the correct answers for attempts that the caller has already
-- submitted.

-- Mirrors normaliseAnswer() in apps/web/src/models/quiz/quiz.model.ts so the
-- web preview and the stored grade always agree. Punctuation becomes a
-- space, so "fault-tree" matches "fault tree".
create or replace function private.normalise_quiz_answer(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(
    regexp_replace(
      regexp_replace(lower(coalesce(p_value, '')), '[^[:alnum:][:space:]]', ' ', 'g'),
      '[[:space:]]+',
      ' ',
      'g'
    )
  );
$$;

create or replace function public.submit_quiz_attempt(
  p_quiz_id bigint,
  p_answers jsonb,
  p_started_at timestamptz default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_attempt_id bigint;
  v_question_count integer;
  v_now timestamptz := now();
  v_started_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then
    raise exception 'p_answers must be a JSON object keyed by question position'
      using errcode = '22023';
  end if;

  -- Only the owner of the source document may attempt (and see keys for)
  -- the quiz generated from it.
  perform 1
  from public.quizzes q
  join public.documents d on d.id = q.document_id
  where q.id = p_quiz_id
    and q.status = 'ready'
    and d.owner_id = v_user_id;

  if not found then
    raise exception 'quiz does not exist or is not available'
      using errcode = '22023';
  end if;

  select count(*) into v_question_count
  from public.quiz_questions
  where quiz_id = p_quiz_id;

  if v_question_count = 0 then
    raise exception 'quiz has no questions' using errcode = '22023';
  end if;

  -- Ignore a forged or stale client start time.
  v_started_at := case
    when p_started_at is null
      or p_started_at > v_now
      or p_started_at < v_now - interval '1 day'
    then v_now
    else p_started_at
  end;

  insert into public.quiz_attempts (
    quiz_id, user_id, status, started_at, submitted_at, graded_at
  )
  values (p_quiz_id, v_user_id, 'submitted', v_started_at, v_now, null)
  returning id into v_attempt_id;

  insert into public.quiz_answers (
    attempt_id,
    quiz_id,
    question_id,
    response,
    is_correct,
    awarded_points,
    graded_at
  )
  select
    v_attempt_id,
    p_quiz_id,
    question.id,
    to_jsonb(left(coalesce(p_answers ->> question.position::text, ''), 1000)),
    graded.is_correct,
    case when graded.is_correct then question.points else 0 end,
    v_now
  from public.quiz_questions question
  join private.quiz_answer_keys answer_key on answer_key.question_id = question.id
  cross join lateral (
    select
      private.normalise_quiz_answer(p_answers ->> question.position::text) <> ''
      and private.normalise_quiz_answer(p_answers ->> question.position::text)
        = private.normalise_quiz_answer(answer_key.correct_answer #>> '{}')
      as is_correct
  ) graded
  where question.quiz_id = p_quiz_id;

  update public.quiz_attempts attempt
  set
    status = 'graded',
    graded_at = v_now,
    score = totals.score,
    max_score = totals.max_score
  from (
    select
      coalesce(sum(answer.awarded_points), 0) as score,
      (select coalesce(sum(points), 0) from public.quiz_questions where quiz_id = p_quiz_id)
        as max_score
    from public.quiz_answers answer
    where answer.attempt_id = v_attempt_id
  ) totals
  where attempt.id = v_attempt_id;

  return v_attempt_id;
end;
$$;

-- Read one graded attempt with the answer key. Returns no rows when the
-- attempt belongs to somebody else or has not been graded.
create or replace function public.get_quiz_attempt_review(p_attempt_id bigint)
returns table (
  question_position smallint,
  question_type text,
  prompt text,
  options jsonb,
  response text,
  is_correct boolean,
  awarded_points numeric,
  points numeric,
  correct_answer text,
  explanation text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    question.position,
    question.question_type,
    question.prompt,
    question.options,
    coalesce(answer.response #>> '{}', ''),
    coalesce(answer.is_correct, false),
    coalesce(answer.awarded_points, 0),
    question.points,
    answer_key.correct_answer #>> '{}',
    answer_key.explanation
  from public.quiz_attempts attempt
  join public.quiz_questions question on question.quiz_id = attempt.quiz_id
  join private.quiz_answer_keys answer_key on answer_key.question_id = question.id
  left join public.quiz_answers answer
    on answer.attempt_id = attempt.id
   and answer.question_id = question.id
  where attempt.id = p_attempt_id
    and attempt.user_id = (select auth.uid())
    and attempt.status = 'graded'
  order by question.position;
$$;

revoke execute on function private.normalise_quiz_answer(text)
from public, anon, authenticated;

revoke execute on function public.submit_quiz_attempt(bigint, jsonb, timestamptz)
from public, anon;
grant execute on function public.submit_quiz_attempt(bigint, jsonb, timestamptz)
to authenticated, service_role;

revoke execute on function public.get_quiz_attempt_review(bigint)
from public, anon;
grant execute on function public.get_quiz_attempt_review(bigint)
to authenticated, service_role;

-- Attempt history is read newest first per student and per quiz.
create index if not exists quiz_attempts_user_quiz_submitted_idx
on public.quiz_attempts (user_id, quiz_id, submitted_at desc);
