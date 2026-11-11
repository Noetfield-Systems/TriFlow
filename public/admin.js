// Founder-only analytics: token never persisted; all user content rendered as text.
const el=id=>document.getElementById(id);
let token='',feedbackRows=[];
function node(tag,cls,txt){const n=document.createElement(tag);if(cls)n.className=cls;if(txt!==undefined)n.textContent=String(txt);return n;}
function day(ts){return new Date(ts).toLocaleString();}
function setStatus(text,error=false){const p=el('tfAdminStatus');p.textContent=text;p.classList.toggle('tf-admin-error',error);}
async function refresh(){
 if(!token)return;
 const btn=el('tfAdminRefresh');btn.disabled=true;setStatus('Loading verified data…');
 try{
  const r=await fetch('/api/admin/insights',{headers:{authorization:'Bearer '+token},cache:'no-store'});
  if(r.status===401){token='';throw Error('The admin token was not accepted. Check Railway → triflow-app → Variables.');}
  if(!r.ok)throw Error('Insights could not be loaded (HTTP '+r.status+').');
  const body=await r.json(),overview=body.overview||{};
  el('tfEvents').textContent=String(overview.events??0);
  el('tfVisitors').textContent=String(overview.visitors??0);
  feedbackRows=Array.isArray(body.feedback)?body.feedback:[];
  el('tfFeedbackCount').textContent=String(feedbackRows.length);
  const sums=new Map();
  for(const event of body.events||[])sums.set(event.event,(sums.get(event.event)||0)+event.count);
  const max=Math.max(1,...sums.values());
  const events=el('tfEventBars');events.replaceChildren();
  if(!sums.size)events.append(node('p','tf-empty','No users have opted in to analytics yet.'));
  for(const [key,value] of [...sums].sort((a,b)=>b[1]-a[1])){
   const row=node('div','tf-event-row'),head=node('div','tf-event-label'),bar=node('div','tf-event-track'),fill=node('i','tf-event-fill');
   head.append(node('strong',null,key.split('_').join(' ')),node('span',null,value));
   fill.style.width=Math.max(3,100*value/max)+'%';
   bar.append(fill);row.append(head,bar);events.append(row);
  }
  const list=el('tfFeedbackList');list.replaceChildren();
  if(!feedbackRows.length)list.append(node('p','tf-empty','No feedback submitted yet.'));
  for(const item of feedbackRows){
   const card=node('article','tf-feedback-item'),head=node('div','tf-feedback-head'),body=node('p','tf-feedback-body',item.comment||'');
   head.append(node('strong',null,(item.category||'General')+' · '+(item.rating?item.rating+' / 5':'Unrated')),
     node('small',null,(item.alias||'Anonymous')+' · '+day(item.at)));
   card.append(head,body);
   if(item.languages)card.append(node('small','tf-feedback-languages','Languages: '+item.languages));
   list.append(card);
  }
  el('tfAdminContent').hidden=false;setStatus('Updated '+new Date().toLocaleTimeString()+'.');
 }catch(e){setStatus(e.message||'Unable to retrieve metrics.',true);if(!token)el('tfAdminContent').hidden=true;}
 finally{btn.disabled=false;}
}
el('tfAdminUnlock').addEventListener('submit',async e=>{
 e.preventDefault();token=el('tfAdminKey').value.trim();el('tfAdminKey').value='';if(token)await refresh();
});
el('tfAdminRefresh').addEventListener('click',refresh);
el('tfExportFeedback').addEventListener('click',()=>{
 if(!feedbackRows.length)return;
 const keys=['id','at','category','rating','alias','languages','comment'];
 const escapeCsv=v=>{
  let s=String(v??'');
  if(/^[=+\-@]/.test(s))s="'"+s;
  return '"'+s.replaceAll('"','""')+'"';
 };
 const csv=[keys.join(','),...feedbackRows.map(row=>keys.map(k=>escapeCsv(row[k])).join(','))].join('\r\n');
 const u=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
 const a=node('a');a.href=u;a.download='triflow-feedback-'+new Date().toISOString().slice(0,10)+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);
});
