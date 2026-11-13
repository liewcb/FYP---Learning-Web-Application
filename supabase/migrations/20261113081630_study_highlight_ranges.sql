-- Study highlights become any stretch of text the student selects, from one
-- character to another (across sentences and passages), in a colour they
-- pick. They used to cover whole passages; each old highlight becomes the
-- same passage as a yellow range.
--
-- A range runs from (start_sentence, start_offset) up to, but not including,
-- (end_sentence, end_offset). Offsets count characters in the sentence as the
-- reader shows it. Highlights may overlap: the newest is drawn on top.

alter table public.study_highlights drop constraint study_highlights_pkey;
alter table public.study_highlights drop constraint study_highlights_sentence_index_check;
alter table public.study_highlights rename column sentence_index to start_sentence;

alter table public.study_highlights
  add column id bigint generated always as identity,
  add column start_offset integer not null default 0,
  add column end_sentence integer,
  add column end_offset integer,
  add column colour text not null default 'yellow';

-- Old highlights: the passage that starts at start_sentence. The reader groups
-- up to four sentences into a passage and starts a new one at a heading-like
-- line (short, capitalised, no closing punctuation); this repeats that rule.
with sentences as (
  select
    h.id,
    h.start_sentence,
    (element.position - 1)::integer as sentence,
    element.text
  from public.study_highlights h
  join public.document_contents c on c.document_id = h.document_id
  cross join lateral jsonb_array_elements_text(c.sentences)
    with ordinality as element(text, position)
  where element.position - 1 between h.start_sentence and h.start_sentence + 3
),
headings as (
  select s.id, min(s.sentence) as sentence
  from sentences s
  cross join lateral (
    select regexp_replace(s.text, '^\s+|\s+$', '', 'g') as trimmed
  ) t
  where s.sentence > s.start_sentence
    and char_length(t.trimmed) between 1 and 80
    and array_length(regexp_split_to_array(t.trimmed, '\s+'), 1) <= 10
    and t.trimmed !~ '[].!?;:,"”'')]$'
    and t.trimmed ~ '^[[:upper:][:digit:]]'
  group by s.id
),
passage_ends as (
  select distinct on (s.id) s.id, s.sentence, char_length(s.text) as length
  from sentences s
  left join headings h on h.id = s.id
  where h.sentence is null or s.sentence < h.sentence
  order by s.id, s.sentence desc
)
update public.study_highlights h
set end_sentence = e.sentence, end_offset = e.length
from passage_ends e
where e.id = h.id;

-- Nothing to show for highlights whose document has no text (or empty text).
delete from public.study_highlights
where end_sentence is null or (end_sentence = start_sentence and end_offset = 0);

alter table public.study_highlights
  alter column start_offset drop default,
  alter column end_sentence set not null,
  alter column end_offset set not null,
  add primary key (id),
  add constraint study_highlights_range_check check (
    start_sentence >= 0
    and start_offset >= 0
    and end_offset >= 0
    and (start_sentence, start_offset) < (end_sentence, end_offset)
  ),
  add constraint study_highlights_colour_check
    check (colour in ('yellow', 'green', 'blue', 'pink', 'purple'));

create index study_highlights_owner_document_idx
on public.study_highlights (owner_id, document_id, id);

-- Changing a highlight's colour is the only edit; moving it is delete + add.
create policy study_highlights_owner_update
on public.study_highlights for update to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

revoke all on public.study_highlights from anon, authenticated;
grant select, delete on public.study_highlights to authenticated;
grant insert (owner_id, document_id, start_sentence, start_offset, end_sentence, end_offset, colour)
on public.study_highlights to authenticated;
grant update (colour) on public.study_highlights to authenticated;
grant select, insert, update, delete on public.study_highlights to service_role;
grant usage, select on sequence public.study_highlights_id_seq to authenticated, service_role;

-- A student keeps at most 1000 highlights per document.
create or replace function private.limit_study_highlights()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (
    select count(*)
    from public.study_highlights h
    where h.owner_id = new.owner_id and h.document_id = new.document_id
  ) >= 1000 then
    raise exception 'A document can have at most 1000 highlights.'
      using errcode = '54000';
  end if;

  return new;
end;
$$;

revoke execute on function private.limit_study_highlights() from public, anon, authenticated;

create trigger study_highlights_limit
before insert on public.study_highlights
for each row execute function private.limit_study_highlights();
