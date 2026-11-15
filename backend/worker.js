// Cloudflare Worker backend for Design Listening Lab.
// Configure DASHSCOPE_API_KEY and APP_ACCESS_TOKEN as Worker Secrets (both required).
// Never put either secret in a public GitHub repository or browser code.
const ALLOWED_ORIGIN='https://jamleung122.github.io';
const encoder=new TextEncoder();
function cors(origin){
 return {...(origin===ALLOWED_ORIGIN?{'Access-Control-Allow-Origin':origin}:{}),'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization','Vary':'Origin','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
}
function respond(body,status=200,origin=''){
 return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8',...cors(origin)}});
}
async function constantTimeEqual(a,b){
 const left=encoder.encode(a),right=encoder.encode(b);
 if(left.length!==right.length)return false;
 const [x,y]=await Promise.all([crypto.subtle.digest('SHA-256',left),crypto.subtle.digest('SHA-256',right)]);
 const aHash=new Uint8Array(x),bHash=new Uint8Array(y);
 let difference=0;
 for(let i=0;i<aHash.length;i++)difference|=aHash[i]^bHash[i];
 return difference===0;
}
// Bound actual streamed bytes: Content-Length may be missing or untrusted.
async function readPayload(request){
 const reader=request.body?.getReader();
 if(!reader)throw new Error('Invalid JSON');
 const chunks=[];let size=0;
 try{
  while(true){
   const {done,value}=await reader.read();
   if(done)break;
   size+=value.byteLength;
   if(size>8192){await reader.cancel();throw new Error('Request too large')}
   chunks.push(value);
  }
 }finally{reader.releaseLock()}
 const bytes=new Uint8Array(size);let offset=0;
 for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}
 return JSON.parse(new TextDecoder().decode(bytes));
}
export default {
 async fetch(request,env){
  const origin=request.headers.get('Origin')||'';
  const url=new URL(request.url);
  if(url.pathname!=='/explain')return respond({error:'Not found'},404,origin);
  if(origin!==ALLOWED_ORIGIN)return respond({error:'Origin not allowed'},403,origin);
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors(origin)});
  if(request.method!=='POST')return respond({error:'Method not allowed'},405,origin);
  if(!env.DASHSCOPE_API_KEY||!env.APP_ACCESS_TOKEN||!env.AI_RATE_LIMITER)return respond({error:'服务端尚未配置完成'},503,origin);
  const model=env.QWEN_MODEL||'qwen3.8-flash';
  // Fail closed rather than route to a region/provider outside the confirmed quota.
  if((env.QWEN_REGION||'beijing')!=='beijing'||!['qwen3.8-flash','qwen3.7-flash'].includes(model))return respond({error:'请配置北京地域及已确认额度的 Flash 模型'},503,origin);
  const access=request.headers.get('Authorization')?.replace(/^Bearer\s+/i,'')||'';
  if(!access||access.length>512||!await constantTimeEqual(access,env.APP_ACCESS_TOKEN))return respond({error:'Access token invalid'},401,origin);
  if((request.headers.get('Content-Type')||'').split(';')[0].trim().toLowerCase()!=='application/json')return respond({error:'Content-Type must be application/json'},415,origin);
  const size=Number(request.headers.get('Content-Length')||0);
  if(size>8192)return respond({error:'Request too large'},413,origin);
  let payload;
  try{payload=await readPayload(request)}catch(e){return respond({error:e.message==='Request too large'?'Request too large':'Invalid JSON'},e.message==='Request too large'?413:400,origin)}
  const text=typeof payload?.text==='string'?payload.text.trim():'';
  if(!text||text.length>1200)return respond({error:'Text must be 1–1200 characters'},400,origin);
  const mode=payload?.mode==='detailed'?'detailed':'quick';
  const prompt=mode==='detailed'?
    '请用简体中文解释选定英文：1中文含义，2 B1级简明英文改写，3最多3个搭配，4必要的语法与语境，5一个设计或艺术相关的原创英语例句，6一个简短复习问题。保持简洁，不要编造原文出处。':
    '请简洁解释选定英文：中文自然释义，简单英文改写，一至两个重点搭配，一个设计或艺术相关原创英语例句。请用简体中文为主，不编造原文出处。';
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),25000);
  try{
   const limit=await env.AI_RATE_LIMITER.limit({key:'design-listening-lab-explain'});
   if(!limit.success)return respond({error:'请求过于频繁，请稍后再试'},429,origin);
   const providerUrl='https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
   const requestBody={model,messages:[{role:'system',content:prompt},{role:'user',content:text}],max_tokens:mode==='detailed'?600:360,temperature:0.3,enable_thinking:false,stream:false};
   const ai=await fetch(providerUrl,{
    method:'POST',signal:controller.signal,redirect:'error',
    headers:{'Authorization':'Bearer '+env.DASHSCOPE_API_KEY,'Content-Type':'application/json'},
    body:JSON.stringify(requestBody)
   });
   const data=await ai.json().catch(()=>({}));
   if(!ai.ok)return respond({error:[402,403,429].includes(ai.status)?'模型额度、权限或频率受限；请在百炼检查，服务不会自动切换模型':'AI 服务调用失败，请检查北京地域密钥和模型设置',code:ai.status},502,origin);
   const content=data?.choices?.[0]?.message?.content;
   const answer=typeof content==='string'?content.trim():'';
   if(!answer)return respond({error:'AI 没有返回文字，请检查模型设置'},502,origin);
   return respond({answer,model:data.model||model,provider:'qwen'},200,origin);
  }catch(e){return respond({error:e?.name==='AbortError'?'AI request timed out':'AI request failed'},504,origin)}
  finally{clearTimeout(timeout)}
 }
};
