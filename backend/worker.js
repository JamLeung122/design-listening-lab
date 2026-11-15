// Cloudflare Worker backend for Design Listening Lab.
// Configure OPENAI_API_KEY and APP_ACCESS_TOKEN as Worker Secrets.
// Never put either secret in a public GitHub repository or browser code.
const ALLOWED_ORIGIN='https://jamleung122.github.io';
const encoder=new TextEncoder();
function cors(origin){
 return {'Access-Control-Allow-Origin':origin===ALLOWED_ORIGIN?origin:'null','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization','Vary':'Origin','Cache-Control':'no-store'};
}
function respond(body,status=200,origin=''){
 return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8',...cors(origin)}});
}
async function constantTimeEqual(a,b){
 const left=encoder.encode(a),right=encoder.encode(b);
 if(left.length!==right.length)return false;
 const [x,y]=await Promise.all([crypto.subtle.digest('SHA-256',left),crypto.subtle.digest('SHA-256',right)]);
 return new Uint8Array(x).every((v,i)=>v===new Uint8Array(y)[i]);
}
export default {
 async fetch(request,env){
  const origin=request.headers.get('Origin')||'';
  const url=new URL(request.url);
  if(url.pathname!=='/explain')return respond({error:'Not found'},404,origin);
  if(origin!==ALLOWED_ORIGIN)return respond({error:'Origin not allowed'},403,origin);
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors(origin)});
  if(request.method!=='POST')return respond({error:'Method not allowed'},405,origin);
  if(!env.OPENAI_API_KEY||!env.APP_ACCESS_TOKEN)return respond({error:'Server not configured'},503,origin);
  const access=request.headers.get('Authorization')?.replace(/^Bearer\s+/i,'')||'';
  if(!access||!await constantTimeEqual(access,env.APP_ACCESS_TOKEN))return respond({error:'Access token invalid'},401,origin);
  const size=Number(request.headers.get('Content-Length')||0);
  if(size>8192)return respond({error:'Request too large'},413,origin);
  let payload;
  try{payload=await request.json()}catch{return respond({error:'Invalid JSON'},400,origin)}
  const text=typeof payload?.text==='string'?payload.text.trim():'';
  if(!text||text.length>1200)return respond({error:'Text must be 1–1200 characters'},400,origin);
  const mode=payload?.mode==='detailed'?'detailed':'quick';
  const prompt=mode==='detailed'?
    '请用简体中文解释选定英文：1中文含义，2 B1级简明英文改写，3最多3个搭配，4必要的语法与语境，5一个设计或艺术相关的原创英语例句，6一个简短复习问题。保持简洁，不要编造原文出处。':
    '请简洁解释选定英文：中文自然释义，简单英文改写，一至两个重点搭配，一个设计或艺术相关原创英语例句。请用简体中文为主，不编造原文出处。';
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),25000);
  try{
   const ai=await fetch('https://api.openai.com/v1/responses',{
    method:'POST',signal:controller.signal,
    headers:{'Authorization':'Bearer '+env.OPENAI_API_KEY,'Content-Type':'application/json'},
    body:JSON.stringify({
     model:env.OPENAI_MODEL||'gpt-4.1-mini',
     instructions:prompt,
     input:text,
     max_output_tokens:mode==='detailed'?500:280,
     store:false
    })
   });
   const data=await ai.json().catch(()=>({}));
   if(!ai.ok)return respond({error:ai.status===429?'AI rate limit reached':'AI provider unavailable',code:ai.status},502,origin);
   const answer=(data.output||[]).flatMap(item=>item.content||[])
    .filter(part=>part.type==='output_text'&&typeof part.text==='string')
    .map(part=>part.text).join('\n').trim();
   if(!answer)return respond({error:'AI returned no text'},502,origin);
   return respond({answer,model:data.model||env.OPENAI_MODEL||'gpt-4.1-mini'},200,origin);
  }catch(e){return respond({error:e?.name==='AbortError'?'AI request timed out':'AI request failed'},504,origin)}
  finally{clearTimeout(timeout)}
 }
};
