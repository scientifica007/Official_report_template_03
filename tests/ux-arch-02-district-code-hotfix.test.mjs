import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
const sql=readFileSync("supabase/migrations/018_ux_arch02_work_district_two_digit_codes.sql","utf8");
const ui=readFileSync("prototypes/ux-arch-02/app.mjs","utf8");
const html=readFileSync("prototypes/ux-arch-02/index.html","utf8");

test("UX-ARCH-02 correction: accept Algerian two-digit code 09, preserve uniqueness and uppercase syntax",()=>{
 const check=/^[A-Z0-9][A-Z0-9._-]{1,39}$/;
 assert.ok(check.test("09"));
 assert.ok(check.test("09-01"));
 assert.ok(check.test("BLIDA-02"));
 assert.ok(!check.test("9"),"single character remains invalid");
 assert.ok(!check.test("09/02"));
 assert.ok(!check.test("09 02"));
 assert.ok(!check.test("x@"));
 assert.ok(!check.test("X".repeat(41)));
 assert.match(sql,/drop constraint if exists work_districts_code_check/);
 assert.match(sql,/add constraint work_districts_code_check/);
 assert.match(sql,/\{1,39\}/);
 assert.doesNotMatch(sql,/drop table|update public\.inspector_profiles|update public\.shared_institutions/i);
});
test("UX-ARCH-02 correction: consistent browser and server code validators",()=>{
 assert.match(ui,/pattern="\[A-Z0-9\]\[A-Z0-9\._-\]\{1,39\}"/);
 assert.match(ui,/minlength="2"/);
 assert.match(ui,/^\s*if\(!\/\^\[A-Z0-9\]/m);
 assert.match(ui,/رمز مقاطعة العمل غير صالح/);
 assert.match(ui,/رمز مقاطعة العمل مستخدم سابقًا/);
 assert.match(ui,/رمز مقاطعة العمل هنا|الرمز هنا معرّف فريد/);
 assert.match(ui,/09-02/);
 assert.match(ui,/لا يُستنتج انتماء أي مفتش من الرمز/);
 assert.match(ui,/p_code:code,p_label:label/);
 assert.match(ui,/إسناد مقاطعة العمل إلى مفتش/);
});
test("UX-ARCH-02 correction: refreshed script and safe ESM",()=>{
 assert.match(html,/app\.mjs\?v=uxarch02-3-district-code/);
 assert.doesNotThrow(()=>execFileSync(process.execPath,["--check","prototypes/ux-arch-02/app.mjs"],{stdio:"pipe"}));
});
