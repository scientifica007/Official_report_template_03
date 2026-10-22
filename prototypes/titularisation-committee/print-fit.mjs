// Layout-only assistant for the existing five-page print preview.
// Never adjusts grades, authored prose or committee decisions.
export function fitPrintPages(root){
 const pages=[...(root?.querySelectorAll?.(".reference-page")||[])];
 for(const page of pages){
  if(!page.style?.setProperty||!page.getBoundingClientRect)continue;
  const nonFooter=[...page.children].filter(el=>!el.className?.includes("reference-report-footer"));
  const last=nonFooter.at(-1);
  if(!last?.getBoundingClientRect)continue;
  const bounds=page.getBoundingClientRect();
  if(bounds.height<=0)continue;
  const footer=page.querySelector?.(".reference-report-footer");
  const footHeight=footer?.getBoundingClientRect?.().height||0;
  const allowance=footHeight+18;
  let low=10.5,high=15;
  for(let i=0;i<9;i++){
   const size=(low+high)/2;
   page.style.setProperty("--reference-print-font",size+"pt");
   const bottom=last.getBoundingClientRect().bottom-bounds.top;
   if(bottom>bounds.height-allowance)high=size;
   else low=size;
  }
  page.style.setProperty("--reference-print-font",low.toFixed(2)+"pt");
  page.dataset.printFont=low.toFixed(2);
 }
}
