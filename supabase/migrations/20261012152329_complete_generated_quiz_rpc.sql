-- Complete one generated quiz in a single short transaction. This function is
-- SECURITY DEFINER only because the private answer-key table is intentionally
-- unavailable through the Data API. Execution is restricted to service_role.
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
      source_sentence_indexes integer[]
    )
  ),
  inserted_questions as (
    insert into public.quiz_questions (
      quiz_id,
      position,
      question_type,
      prompt,
      options,
      source_sentence_indexes
    )
    select
      p_quiz_id,
      question.position,
      question.question_type,
      question.prompt,
      coalesce(question.options, '[]'::jsonb),
      coalesce(question.source_sentence_indexes, '{}'::integer[])
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

revoke execute on function public.complete_generated_quiz(
  bigint,
  text,
  text,
  jsonb
) from public, anon, authenticated;

grant execute on function public.complete_generated_quiz(
  bigint,
  text,
  text,
  jsonb
) to service_role;
