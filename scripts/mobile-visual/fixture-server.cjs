// Synthetic, loopback-only service. Never forwards requests to production.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
let empty = false;
const user = {id:'visual-preview', username:'preview', display_name:'林间', email:'preview@example.test', avatar:'http://localhost:8020/missing-avatar.png'};
const tags = ['日常','阅读','旅行','工作'].map((name,i)=>({uid:'tag-'+i,name,bbtalk_count:4,color:'#64748B',sort_order:i}));
const records = ['今天的风很舒服。','读完一本好书，记下喜欢的句子。','下班路上绕了一点远路，看到了很美的晚霞。\n\n偶尔慢下来，也挺好。','周末的计划\n\n1. 去公园走走\n2. 整理书架\n3. 做一道喜欢的饭'].map((content,i)=>({uid:'record-'+i,content,visibility:i===1?'friends':'private',tags:i===2?[tags[0]]:[],attachments:[],create_time:new Date().toISOString(),update_time:new Date().toISOString(),comment_count:0,context:{}}));
const attachment = (uid,type,name) => ({uid,type,original_filename:name,preview_url:`http://localhost:8020/fixtures/${uid}`,file_size:1024,mime_type:type==='image'?'image/png':type==='audio'?'audio/wav':type==='video'?'video/mp4':'application/pdf'});
records.push({...records[0],uid:'record-media',content:'图片、语音和视频',attachments:[attachment('image1','image','照片一.png'),attachment('image2','image','照片二.png'),attachment('audio','audio','sample.wav'),attachment('video','video','sample.mp4'),attachment('document','file','附件.pdf')]});
const wav = Buffer.alloc(44 + 16000 * 2 * 3);
wav.write('RIFF',0);wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(16000,24);wav.writeUInt32LE(32000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);
const fixtures = {
  image1: [fs.readFileSync(path.resolve(__dirname,'../../mobile/assets/icon.png')),'image/png'],
  image2: [fs.readFileSync(path.resolve(__dirname,'../../mobile/assets/icon.png')),'image/png'],
  audio: [wav,'audio/wav'],
  video: [fs.readFileSync(path.resolve(__dirname,'../../backend/cli/demo_assets/sample.mp4')),'video/mp4'],
  document: [Buffer.from('%PDF-1.4'),'application/pdf'],
};
http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost:8020');
  const p=url.pathname;
  // Each audit phase changes fixture state; NSURLCache must not reuse old feeds.
  res.setHeader('cache-control','no-store');
  console.log(req.method,p);
  if(p==='/__visual__/empty' && req.method==='POST') { empty=true;res.writeHead(204);res.end();return; }
  if(p.startsWith('/fixtures/')) {
    const fixture=fixtures[p.slice('/fixtures/'.length)];
    if(!fixture){res.writeHead(404);res.end();return;}
    const [body,type]=fixture;
    const range=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range||'');
    const start=range?Number(range[1]):0;
    const end=range&&range[2]?Math.min(Number(range[2]),body.length-1):body.length-1;
    if(start>end){res.writeHead(416);res.end();return;}
    const headers={'content-type':type,'content-length':end-start+1,'accept-ranges':'bytes','access-control-allow-origin':'*'};
    if(range)headers['content-range']=`bytes ${start}-${end}/${body.length}`;
    res.writeHead(range?206:200,headers);res.end(body.subarray(start,end+1));return;
  }
  let data;
  if(p==='/api/v1/attachments/files' && req.method==='POST') { req.resume(); data=attachment('audio','audio','voice_fixture.wav'); }
  else if(p.endsWith('/auth/token')||p.endsWith('/auth/token/refresh'))data={access:'visual-fixture',refresh:'visual-refresh',user};
  else if(p.endsWith('/user/me'))data=user;
  else if(p.endsWith('/tags'))data=tags;
  else if(p.endsWith('/date-counts'))data=[1,2,4,5,8,9,12,13].map((d,i)=>({date:`${new Date().toISOString().slice(0,7)}-${String(d).padStart(2,'0')}`,count:i%3+1}));
  else if(p.endsWith('/comments'))data={items:[],total:0,page:1,page_size:20,has_more:false,revision:0};
  else if(p.endsWith('/settings/storage'))data=[];
  else if(p==='/api/v1/bbtalk')data={items:empty?[]:records,total:empty?0:records.length,total_count:empty?0:records.length,page:1,page_size:20,has_more:false};
  else if(p.includes('/record-'))data=records.find(r=>p.endsWith(r.uid));
  else if(p.includes('missing-avatar')){res.writeHead(404);res.end();return;}
  else data={registration_enabled:false,password_recovery_enabled:false};
  const body=JSON.stringify(data??{});
  res.writeHead(200,{'content-type':'application/json; charset=utf-8','content-length':Buffer.byteLength(body),'access-control-allow-origin':'*'});
  res.end(body);
}).listen(8020,'127.0.0.1',()=>console.log('Fixture API listening on loopback:8020'));
