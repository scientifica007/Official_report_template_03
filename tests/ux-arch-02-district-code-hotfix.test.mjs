import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
const sql=readFileSync("supabase/migrations/015_ux_arch02_district_data_foundation.sql","utf8");
const ui=readFileSync("prototypes/ux-arch-02/app.mjs","utf8");
const html=readFileSync("prototypes/ux-arch-02/index.html","utf8");

test("UX-ARCH-02 correction: 09 is a wilaya code, not a unique work-district ID",()=>{
 const check=/^[A-Z0-9][A-Z0-9._-]{2,39}$/;
 assert.ok(!check.test("09"));
 assert.ok(check.test("09-01"));
 assert.ok(check.test("09-02"));
 assert.ok(check.test("BLIDA-02"));
 assert.ok(!check.test("09/02"));
 assert.ok(!check.test("09 02"));
 assert.ok(!check.test("x@"));
 assert.ok(!check.test("X".repeat(41)));
 assert.match(sql,/\{2,39\}/);
 assert.match(sql,/code text not null unique/);
});
test("UX-ARCH-02 correction: browser and server use the same existing district rule",()=>{
 assert.match(ui,/pattern="\[A-Z0-9\]\[A-Z0-9\._-\]\{2,39\}"/);
 assert.match(ui,/minlength="3"/);
 assert.match(ui,/if\(!\/\^\[A-Z0-9\]\[A-Z0-9\._-\]\{2,39\}\$\/\.test\(code\)\)/);
 assert.match(ui,/09 رمز ولاية البليدة/);
 assert.match(ui,/09-01/);
 assert.match(ui,/09-02/);
 assert.match(ui,/لا يُستنتج انتماء أي مفتش من الرمز/);
 assert.match(ui,/p_code:code,p_label:label/);
 assert.match(ui,/إسناد مقاطعة العمل إلى مفتش/);
});
test("UX-ARCH-02 correction: refreshed script and safe ESM",()=>{
 assert.match(html,/app\.mjs\?v=uxarch02-3-district-code/);
 assert.doesNotThrow(()=>execFileSync(process.execPath,["--check","prototypes/ux-arch-02/app.mjs"],{stdio:"pipe"}));
});
