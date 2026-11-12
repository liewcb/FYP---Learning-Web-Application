-- Study recommendations
--
-- A quiz question records the positions of the sentences it was generated
-- from, but those positions refer to the (possibly trimmed) sentence list
-- sent to Gemini, not to the document. The question now also keeps the text
-- of those sentences, so a missed question can be matched to the topics
-- found by content analysis and a study recommendation can be generated
-- (Take Quiz use case, steps 8-10).

alter table public.quiz_questions
  add column source_sentences text[] not null default '{}';

alter table public.quiz_questions
  add constraint quiz_questions_source_sentences_count_check
  check (cardinality(source_sentences) <= 10);

-- As in 20261012152329_complete_generated_quiz_rpc.sql, now also storing
-- source_sentences. Older AI service versions that do not send the field
-- keep working: it defaults to an empty array.
create or replace function public.complete_generated_quiz(
  p_quiz_id bigint,
  p_generation_model text,
  p_prompt_version text,
  p_questions jsonb
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_question_count integer;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  if jsonb_typeof(p_questions) <> 'array' then
    raise exception 'p_questions must be a JSON array' using errcode = '22023';
  end if;

  v_question_count := jsonb_array_length(p_questions);
  if v_question_count not between 1 and 50 then
    raise exception 'p_questions must contain between 1 and 50 questions'
      using errcode = '22023';
  end if;

  perform 1
  from public.quizzes q
  where q.id = p_quiz_id
    and q.status = 'generating'
  for update;

  if not found then
    raise exception 'quiz does not exist or is not generating'
      using errcode = '22023';
  end if;

  with input_questions as materialized (
    select *
    from jsonb_to_recordset(p_questions) as question (
      position smallint,
      question_type text,
      prompt text,
      options jsonb,
      correct_answer text,
      explanation text,
      source_sentence_indexes integer[],
      source_sentences text[]
    )
  ),
  inserted_questions as (
    insert into public.quiz_questions (
      quiz_id,
      position,
      question_type,
      prompt,
      options,
      source_sentence_indexes,
      source_sentences
    )
    select
      p_quiz_id,
      question.position,
      question.question_type,
      question.prompt,
      coalesce(question.options, '[]'::jsonb),
      coalesce(question.source_sentence_indexes, '{}'::integer[]),
      coalesce(question.source_sentences, '{}'::text[])
    from input_questions question
    returning id, position
  )
  insert into private.quiz_answer_keys (
    question_id,
    correct_answer,
    explanation
  )
  select
    inserted.id,
    to_jsonb(question.correct_answer),
    question.explanation
  from inserted_questions inserted
  join input_questions question using (position);

  update public.quizzes
  set
    status = 'ready',
    question_count = v_question_count,
    generation_model = p_generation_model,
    prompt_version = p_prompt_version,
    error_message = null,
    completed_at = now()
  where id = p_quiz_id;

  return p_quiz_id;
end;
$$;

