// Synthetic, loopback-only service. Never forwards requests to production.
const http = require('node:http');
const user = {id:'visual-preview', username:'preview', display_name:'林间', email:'preview@example.test', avatar:'http://localhost:8020/missing-avatar.png'};
const tags = ['日常','阅读','旅行','工作'].map((name,i)=>({uid:'tag-'+i,name,bbtalk_count:4,color:'#64748B',sort_order:i}));
const records = ['今天的风很舒服。','读完一本好书，记下喜欢的句子。','下班路上绕了一点远路，看到了很美的晚霞。\n\n偶尔慢下来，也挺好。','周末的计划\n\n1. 去公园走走\n2. 整理书架\n3. 做一道喜欢的饭'].map((content,i)=>({uid:'record-'+i,content,visibility:i===1?'friends':'private',tags:i===2?[tags[0]]:[],attachments:[],create_time:new Date().toISOString(),update_time:new Date().toISOString(),comment_count:0,context:{}}));
http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost:8020');
  const p=url.pathname;
  let data;
  if(p.endsWith('/auth/token')||p.endsWith('/auth/token/refresh'))data={access:'visual-fixture',refresh:'visual-refresh',user};
  else if(p.endsWith('/user/me'))data=user;
  else if(p.endsWith('/tags'))data=tags;
  else if(p.endsWith('/date-counts'))data=[1,2,4,5,8,9,12,13].map((d,i)=>({date:`${new Date().toISOString().slice(0,7)}-${String(d).padStart(2,'0')}`,count:i%3+1}));
  else if(p.endsWith('/comments'))data=[];
  else if(p==='/api/v1/bbtalk')data={items:records,total:records.length,total_count:records.length,page:1,page_size:20,has_more:false};
  else if(p.includes('/record-'))data=records.find(r=>p.endsWith(r.uid));
  else if(p.includes('missing-avatar')){res.writeHead(404);res.end();return;}
  else data={registration_enabled:false,password_recovery_enabled:false};
  console.log(req.method,p);
  res.writeHead(200,{'content-type':'application/json','access-control-allow-origin':'*'});
  res.end(JSON.stringify(data??{}));
}).listen(8020,'127.0.0.1',()=>console.log('Fixture API listening on loopback:8020'));
