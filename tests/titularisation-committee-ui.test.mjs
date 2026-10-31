import test from "node:test";
import assert from "node:assert/strict";
import {freshCommittee,editNote,editScore,changeMode,submit} from "../prototypes/titularisation-committee/committee-engine.mjs";

class Element {
 constructor(tag){this.tag=tag;this.children=[];this.textContent="";this.value="";this.events={}}
 append(...children){this.children.push(...children)}
 replaceChildren(){this.children=[]}
 setAttribute(key,value){this[key]=value}
 addEventListener(key,fn){this.events[key]=fn}
}
globalThis.document={createElement:tag=>new Element(tag)};
const {renderDocuments}=await import("../prototypes/titularisation-committee/preview.mjs");
const {renderForm}=await import("../prototypes/titularisation-committee/form-ui.mjs");
const {renderMembers}=await import("../prototypes/titularisation-committee/members-ui.mjs");
function words(e){return (e.textContent||"")+" "+e.children.map(words).join(" ")}
function all(e,tag){return (e.tag===tag?[e]:[]).concat(e.children.flatMap(c=>all(c,tag)))}
test("previews contain two unapproved paper documents with physical signature spaces",()=>{
 let s=freshCommittee();
 s=editNote(s,"final","general","تقدير مفتش اصطناعي");
 s=editNote(s,"final","lesson","رأي في التنشيط","g1");
 s=editScore(s,"final","lesson","g1",3.5);
 const target=new Element("main");
 renderDocuments(target,s);
 assert.equal(all(target,"article").length,2);
 const text=words(target);
 assert.match(text,/تقدير مفتش اصطناعي/);
 assert.match(text,/رأي في التنشيط/);
 assert.match(text,/3.5/);
 assert.match(text,/إمضاءات أعضاء اللجنة/);
 assert.doesNotMatch(text,/معاينة تجريبية غير مطابقة بعد للقالب الرسمي/);
});
test("chair editor remains separate from member contributions",()=>{
 let s=changeMode(freshCommittee(),"individual");
 s=editScore(s,"member1","lesson","g1",2);
 s=editNote(s,"member1","general","كتابة عضو اللجنة");
 s=submit(s,"member1");
 s=editScore(s,"final","lesson","g1",9.5);
 const editor=new Element("section"),members=new Element("section");
 renderForm(editor,s,"final",()=>{});
 renderMembers(members,s);
 assert.match(words(editor),/المفتش — تحرير نتيجة المداولة/);
 assert.match(words(members),/كتابة عضو اللجنة/);
 const finalInputs=all(editor,"input").filter(x=>x.value===9.5);
 assert.equal(finalInputs.length,1);
});
