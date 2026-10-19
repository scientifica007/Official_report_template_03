// DOM helpers; plain text only, no untrusted HTML interpolation.
export function node(tag, text="", className=""){
 const e=document.createElement(tag);
 if(text!==null)e.textContent=String(text);
 if(className)e.className=className;
 return e;
}
export function add(parent,...children){for(const c of children)parent.append(c);return parent;}
export function clear(e){e.replaceChildren();return e;}
export function labelValue(parent,label,value,onChange,type="text"){
 const wrap=node("label","","field");
 add(wrap,node("span",label));
 const inp=node("input");
 inp.type=type;inp.value=value??"";
 if(type==="number"){inp.step="0.5";inp.min="0";}
 inp.addEventListener("change",()=>onChange(inp.value));
 add(wrap,inp);parent.append(wrap);return inp;
}
export function textValue(parent,label,value,onChange){
 const wrap=node("label","","field");
 add(wrap,node("span",label));
 const textarea=node("textarea");textarea.rows=3;textarea.value=value||"";
 textarea.addEventListener("change",()=>onChange(textarea.value));
 add(wrap,textarea);parent.append(wrap);return textarea;
}
export function action(parent,label,onClick){
 const b=node("button",label);b.type="button";
 b.addEventListener("click",onClick);parent.append(b);return b;
}
