-- Run AFTER applying migration 028 inside one transaction, before ROLLBACK.
-- Existing task 'تجربة 007' is only a fixture; all writes are rolled back.
select set_config('p2.test_mission',(select id::text from public.titularisation_missions where title='تجربة 007' order by created_at desc limit 1),true);
select set_config('p2.test_owner',(select owner_id::text from public.titularisation_missions where id=current_setting('p2.test_mission')::uuid),true);
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('p2.test_owner'),true);
do $checks$
declare
 test_id uuid:=current_setting('p2.test_mission')::uuid;
 token text; second text; info jsonb;
 m public.titularisation_missions%rowtype;
 notes jsonb:=jsonb_build_object('lesson','{}'::jsonb,'discussion','{}'::jsonb,
 'lessonSummary','','discussionSummary','','general','','recommendations','');
 draft jsonb; complete jsonb; scores_l jsonb; scores_d jsonb;
 rev bigint; denied boolean;
begin
 if has_column_privilege('authenticated','public.titularisation_seats','token_hash','select')
 then raise exception 'SECURITY: token hashes visible';end if;
 if has_table_privilege('anon','public.titularisation_seats','select')
 then raise exception 'SECURITY: anon table read';end if;
 if not has_function_privilege('anon','public.load_prod_titularisation_member(uuid,text,text)','execute')
 then raise exception 'Missing anonymous member load';end if;
 if not has_function_privilege('anon','public.save_prod_titularisation_member(uuid,text,text,jsonb,bigint,boolean)','execute')
 then raise exception 'Missing anonymous member save';end if;
 if has_function_privilege('anon','public.issue_prod_titularisation_invitation(uuid,text,text)','execute')
 then raise exception 'SECURITY: anon issue';end if;
 select * into m from public.titularisation_missions where id=test_id;
 if not found or m.rubric_id<>'lesson_derived_indicators_v1' or m.rubric_profile->'frozen'<>'true'::jsonb
 then raise exception 'Missing pinned test mission';end if;
 info:=public.issue_prod_titularisation_invitation(test_id,'member1','المشارك الاختباري');
 token:=info->>'token';
 if token !~ '^[a-f0-9]{64}$' then raise exception 'Token malformed';end if;
 if (select token_hash from public.titularisation_seats s where s.mission_id=test_id and s.seat_code='member1')=token
 then raise exception 'Token plaintext stored';end if;
 info:=public.load_prod_titularisation_member(test_id,'member1',token);
 if info#>>'{mission,rubric_id}'<>m.rubric_id then raise exception 'Wrong rubric';end if;
 denied:=false;
 begin
  perform public.load_prod_titularisation_member(test_id,'member1',repeat('0',64));
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Wrong token accepted';end if;
 draft:=jsonb_build_object('grading',jsonb_build_object(
  'schema','titularisation-workbench-draft-v1','revision',1,'rubricId',m.rubric_id,
  'profile',m.rubric_profile,'scores',jsonb_build_object('lesson','{"g1_1":2}'::jsonb,'discussion','{}'::jsonb)),
  'notes',notes);
 rev:=public.save_prod_titularisation_member(test_id,'member1',token,draft,0,false);
 if rev<>1 then raise exception 'Draft rev1 error';end if;
 denied:=false;
 begin
  perform public.save_prod_titularisation_member(test_id,'member1',token,draft,1,true);
 exception when invalid_parameter_value then denied:=true;end;
 if not denied then raise exception 'Incomplete final accepted';end if;
 select jsonb_object_agg(key,1) into scores_l from jsonb_each_text(m.rubric_profile->'weights')
 where value::numeric>0;
 select jsonb_object_agg(item_id,1) into scores_d from public.titularisation_score_caps
 where rubric_id='lesson_grouped_5_v1' and phase='discussion' and cap>0;
 complete:=jsonb_set(draft,'{grading,scores}',jsonb_build_object('lesson',scores_l,'discussion',scores_d));
 rev:=public.save_prod_titularisation_member(test_id,'member1',token,complete,1,true);
 if rev<>2 then raise exception 'Complete final rev2 error';end if;
 denied:=false;
 begin
  perform public.save_prod_titularisation_member(test_id,'member1',token,complete,1,true);
 exception when sqlstate '40001' then denied:=true;end;
 if not denied then raise exception 'Stale revision overwritten';end if;
 complete:=jsonb_set(complete,'{notes,general}',to_jsonb('تقدير مصحح'::text));
 rev:=public.save_prod_titularisation_member(test_id,'member1',token,complete,2,true);
 if rev<>3 then raise exception 'Correction rev3 failed';end if;
 if (select count(*) from public.titularisation_contribution_revisions r
   where r.mission_id=test_id and r.seat_code='member1')<>2
 then raise exception 'Revision archive missing';end if;
 info:=public.issue_prod_titularisation_invitation(test_id,'member1','اسم جديد');
 second:=info->>'token';
 denied:=false;
 begin
  perform public.load_prod_titularisation_member(test_id,'member1',token);
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Old token survived rotation';end if;
 if (select revision from public.titularisation_contributions c
   where c.mission_id=test_id and c.seat_code='member1')<>3
 then raise exception 'Rotation erased contribution';end if;
 if not public.revoke_prod_titularisation_invitation(test_id,'member1')
 then raise exception 'Revoke failed';end if;
 denied:=false;
 begin
  perform public.load_prod_titularisation_member(test_id,'member1',second);
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Revoked token still valid';end if;
 perform set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
 denied:=false;
 begin
  perform public.issue_prod_titularisation_invitation(test_id,'member2','unapproved');
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Outsider issued member link';end if;
end $checks$;
rollback;
