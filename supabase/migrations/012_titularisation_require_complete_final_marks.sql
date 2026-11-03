-- M5.7 — Mandatory marks (but optional narrative) on FINAL member submissions.
-- This constraint is enforced in Postgres itself, not just the browser.
--
-- Deliberately NOT applied retroactively to submitted field-test rows that
-- predate this rule. These remain visible and editable; the next correction
-- must complete any missing marks before it can be resubmitted.
--
-- The trigger fires on INSERT or UPDATE of payload/status only. In particular,
-- Auth Admin deletion may NULL author_user_id without updating payload/status:
-- deleting short-lived committee Auth accounts must continue to work.
begin;

create or replace function public.check_titularisation_final_score_completeness()
returns trigger
language plpgsql security definer set search_path = '' as $complete$
declare
 v_rubric text;
 v_profile jsonb;
 v_discussion_rubric text;
 v_missing_lesson integer := 0;
 v_missing_discussion integer := 0;
begin
 if new.status <> 'submitted' then
  return new; -- partial score drafts stay valid
 end if;

 select rubric_id,rubric_profile into v_rubric,v_profile
 from public.titularisation_missions
 where id=new.mission_id;

 if v_rubric is null then
  raise exception 'Mission rubric not found' using errcode='22023';
 end if;

 -- Re-run all the existing cap, half-point, payload and profile checks so
 -- that a bypass of the UI or RPC cannot insert a submitted forged score.
 if v_rubric='lesson_derived_indicators_v1' then
  perform public.validate_titularisation_analytical_payload(
   new.mission_id,new.payload
  );

  -- 14 independent lesson indicators. A frozen cap of ZERO means that
  -- indicator is not scored; it is intentionally not required.
  select count(*) into v_missing_lesson
  from jsonb_each(v_profile->'weights') as w(item_id,cap)
  where (w.cap::text)::numeric > 0
   and not ((new.payload #> '{grading,scores,lesson}') ? w.item_id);

  v_discussion_rubric:='lesson_grouped_5_v1';
 else
  perform public.validate_titularisation_member_payload(
   v_rubric,new.payload
  );
  -- Legacy fixed rubrics: five criteria OR ten indicators; all positive-cap
  -- lesson items must be explicitly graded, including genuine zero grades.
  select count(*) into v_missing_lesson
  from public.titularisation_score_caps c
  where c.rubric_id=v_rubric and c.phase='lesson' and c.cap>0
   and not ((new.payload #> '{grading,scores,lesson}') ? c.item_id);

  v_discussion_rubric:=v_rubric;
 end if;

 -- All seven discussion marks are mandatory for final submission.
 select count(*) into v_missing_discussion
 from public.titularisation_score_caps c
 where c.rubric_id=v_discussion_rubric and c.phase='discussion' and c.cap>0
  and not ((new.payload #> '{grading,scores,discussion}') ? c.item_id);

 if v_missing_lesson>0 or v_missing_discussion>0 then
  raise exception
   'يجب إكمال جميع العلامات قبل الإرسال النهائي: الحصة ناقصة %، المناقشة ناقصة %',
    v_missing_lesson,v_missing_discussion
   using errcode='22023';
 end if;

 -- All written notes, summaries and observations remain optional.
 -- The existing validators accept empty prose without affecting this gate.
 return new;
end;
$complete$;

revoke all on function public.check_titularisation_final_score_completeness()
 from public,anon,authenticated;

create trigger titularisation_final_marks_before_accept
after insert or update of payload,status
on public.titularisation_contributions
for each row
when (new.status='submitted')
execute function public.check_titularisation_final_score_completeness();

commit;
