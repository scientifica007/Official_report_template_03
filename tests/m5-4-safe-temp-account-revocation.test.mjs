import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(path,"utf8");
const migration=read("supabase/migrations/009_titularisation_safe_temp_auth_deletion.sql");
const edge=read("supabase/functions/titularisation-access/index.ts");
const oldMigration=read("supabase/migrations/008_titularisation_member_links_and_revisions.sql");
const qa=read("qa-titularisation/app.mjs");
const prod=read("cloud-config.js");

test("M5.4: Auth deletion may detach only author_user_id without changing assessment",()=>{
 assert.match(migration,/old\.author_user_id is not null/);
 assert.match(migration,/new\.author_user_id is null/);
 assert.match(migration,/new\.revision = old\.revision/);
 assert.match(migration,/to_jsonb\(new\) - 'author_user_id'/);
 assert.match(migration,/to_jsonb\(old\) - 'author_user_id'/);
 assert.match(migration,/return new;/);
});
test("M5.4: professional changes still require version bump and prior assessment archive",()=>{
 assert.match(migration,/new\.revision <> old\.revision \+ 1/);
 assert.match(migration,/raise exception 'Contribution revision must increment by one'/);
 assert.match(migration,/insert into public\.titularisation_contribution_revisions/);
 assert.match(migration,/old\.payload,old\.status/);
 assert.match(oldMigration,/create trigger titularisation_archive_before_update/);
 assert.match(migration,/revoke all on function public\.archive_titularisation_contribution_revision\(\)/);
});
test("M5.4: revoke also revokes direct invite and handles repeat revoked-seat cleanups",()=>{
 assert.match(edge,/if\(seat\.status!=="revoked"\)/);
 assert.match(edge,/\.from\("titularisation_member_links"\)/);
 assert.match(edge,/\.update\(\{revoked_at:new Date\(\)\.toISOString\(\)\}\)/);
 assert.match(edge,/\.is\("revoked_at",null\)/);
 assert.match(edge,/db\.auth\.admin\.deleteUser\(seat\.auth_user_id\)/);
 assert.match(edge,/if\(deleted\)await record\(db,missionId,seatCode,actor,"account_deleted"\)/);
 assert.match(edge,/if\(action==="revoke"\)return await revoke/);
});
test("M5.4: temporary account professional-profile false positive cleaned server-side",()=>{
 assert.match(edge,/app_metadata:\{account_type:"titularisation_temporary"\}/);
 assert.match(edge,/db\.from\("inspector_profiles"\)/);
 assert.match(edge,/if\(profileCheckError\|\|unexpected\?\.approved\|\|unexpected\?\.is_admin\)/);
 assert.match(edge,/\.delete\(\)\.eq\("id",uid\)\.eq\("approved",false\)\.eq\("is_admin",false\)/);
 assert.match(edge,/if\(cleanupError\|\|!deleted\)/);
 assert.doesNotMatch(qa,/SUPABASE_SERVICE_ROLE_KEY/);
 assert.match(prod,/temporaryCommitteeEnabled: false/);
});
