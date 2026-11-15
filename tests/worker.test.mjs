import {test,afterEach,mock} from 'node:test';
import assert from 'node:assert/strict';
import worker from '../backend/worker.js';
const origin='https://jamleung122.github.io';
const env={DASHSCOPE_API_KEY:'test-provider-secret',APP_ACCESS_TOKEN:'test-app-passphrase',QWEN_REGION:'beijing',AI_RATE_LIMITER:{limit:async()=>({success:true})}};
function request(body={text:'visual language'},headers={},method='POST',path='/explain'){
 return new Request('https://example.workers.dev'+path,{method,headers:{Origin:origin,Authorization:'Bearer '+env.APP_ACCESS_TOKEN,'Content-Type':'application/json',...headers},...(method==='POST'?{body:typeof body==='string'?body:JSON.stringify(body)}:{})});
}
afterEach(()=>mock.restoreAll());
function upstream(status=200,data={choices:[{message:{content:'视觉语言：用图形传达想法。'}}]}){
 const calls=[];
 mock.method(globalThis,'fetch',async(url,options)=>{calls.push({url,options,body:JSON.parse(options.body)});return Response.json(data,{status})});
 return calls;
}
test('preflight permits only the actual Pages origin',async()=>{
 const calls=upstream();
 const ok=await worker.fetch(request(undefined,{},'OPTIONS'),{});
 assert.equal(ok.status,204);assert.equal(ok.headers.get('Access-Control-Allow-Origin'),origin);
 for(const bad of ['https://evil.example','null','']){
  const result=await worker.fetch(request(undefined,{Origin:bad},'OPTIONS'),env);
  assert.equal(result.status,403);assert.equal(result.headers.get('Access-Control-Allow-Origin'),null);
 }
 assert.equal(calls.length,0);
});
test('rejects missing configuration, wrong token and invalid routes before spending tokens',async()=>{
 const calls=upstream();
 for(const missing of ['DASHSCOPE_API_KEY','APP_ACCESS_TOKEN','AI_RATE_LIMITER'])assert.equal((await worker.fetch(request(),{...env,[missing]:undefined})).status,503);
 assert.equal((await worker.fetch(request(undefined,{Authorization:'Bearer wrong'}),env)).status,401);
 assert.equal((await worker.fetch(request(undefined,{Authorization:''}),env)).status,401);
 assert.equal((await worker.fetch(request(undefined,{},'GET'),env)).status,405);
 assert.equal((await worker.fetch(request(undefined,{},'POST','/other'),env)).status,404);
 for(const config of [{QWEN_REGION:'singapore'},{QWEN_MODEL:'qwen-turbo'},{DASHSCOPE_API_KEY:'',OPENAI_API_KEY:'test-unused'}])assert.equal((await worker.fetch(request(),{...env,...config})).status,503);
 assert.equal(calls.length,0);
});
test('enforces content type, actual byte size and selected-text limits',async()=>{
 const calls=upstream();
 for(const body of ['{',null,{}, {text:42},{text:' '},{text:'a'.repeat(1201)}])assert.equal((await worker.fetch(request(JSON.stringify(body)===undefined?'':typeof body==='string'?body:JSON.stringify(body)),env)).status,400);
 assert.equal((await worker.fetch(request({}, {'Content-Type':'text/plain'}),env)).status,415);
 for(const headers of [{},{'Content-Length':'1'},{'Content-Length':'9000'}])assert.equal((await worker.fetch(request({text:'ok',unused:'汉'.repeat(3000)},headers),env)).status,413);
 assert.equal(calls.length,0);
});
test('sends only selected text to Beijing, defaults to flash without thinking or redirects',async()=>{
 const calls=upstream();
 const result=await worker.fetch(request({text:'  visual language  ',model:'expensive',url:'https://evil.example',transcript:'private ignored'}),env);
 assert.equal(result.status,200);assert.equal(result.headers.get('Cache-Control'),'no-store');
 const c=calls[0];assert.equal(c.url,'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions');
 assert.equal(c.body.model,'qwen3.8-flash');assert.equal(c.body.enable_thinking,false);assert.equal(c.body.stream,false);assert.equal(c.body.max_tokens,360);
 assert.equal(c.body.messages[1].content,'visual language');assert.equal(c.options.redirect,'manual');
 assert.equal(c.options.headers.Authorization,'Bearer test-provider-secret');
 const answer=await result.text();assert.ok(!answer.includes('secret'));assert.ok(!JSON.stringify(c.body).includes('private ignored'));
});
test('manual backup model and detailed mode have bounded output',async()=>{
 const calls=upstream();await worker.fetch(request({text:'line',mode:'detailed'}),{...env,QWEN_MODEL:'qwen3.7-flash'});
 assert.equal(calls[0].body.model,'qwen3.7-flash');assert.equal(calls[0].body.max_tokens,600);
});
test('rate limiting stops upstream calls',async()=>{
 const calls=upstream();const result=await worker.fetch(request(),{...env,AI_RATE_LIMITER:{limit:async()=>({success:false})}});
 assert.equal(result.status,429);assert.equal(calls.length,0);
});
test('quota errors never retry or fall back and upstream error details remain private',async()=>{
 const calls=upstream(429,{error:{message:'sensitive-provider-detail'}});
 const result=await worker.fetch(request(),env);assert.equal(result.status,502);assert.equal(calls.length,1);
 assert.ok(!(await result.text()).includes('sensitive-provider-detail'));
});
test('empty and malformed answers are handled safely',async()=>{
 for(const data of [null,{}, {choices:[{message:{content:123}}]}, {choices:[{message:{content:' '}}]}]){
  mock.restoreAll();upstream(200,data);assert.equal((await worker.fetch(request(),env)).status,502);
 }
});
test('network failure and timeout do not leak upstream diagnostics',async()=>{
 mock.method(globalThis,'fetch',async()=>{throw new Error('private network detail')});
 let result=await worker.fetch(request(),env);assert.equal(result.status,504);assert.ok(!(await result.text()).includes('private network detail'));
 mock.restoreAll();
 mock.method(globalThis,'setTimeout',(fn)=>{queueMicrotask(fn);return 1});
 mock.method(globalThis,'clearTimeout',()=>{});
 mock.method(globalThis,'fetch',async(_url,{signal})=>{signal.throwIfAborted();throw new DOMException('cancelled','AbortError')});
 result=await worker.fetch(request(),env);assert.equal(result.status,504);assert.match((await result.json()).error,/timed out/);
});

test('invalid provider credentials and limiter errors stop before contacting Bailian',async()=>{
 const calls=upstream();
 const malformed=await worker.fetch(request(),{...env,DASHSCOPE_API_KEY:'北京 API Key'});
 assert.equal(malformed.status,503);assert.match((await malformed.json()).error,/格式/);
 const unavailable=await worker.fetch(request(),{...env,AI_RATE_LIMITER:{limit:async()=>{throw Error('internal')}}});
 assert.equal(unavailable.status,503);assert.match((await unavailable.json()).error,/限流组件/);
 assert.equal(calls.length,0);
});
test('provider redirects are reported without forwarding credentials',async()=>{
 const calls=upstream(307);
 const result=await worker.fetch(request(),env);
 assert.equal(result.status,502);assert.match((await result.json()).error,/重定向/);
 assert.equal(calls.length,1);assert.equal(calls[0].options.redirect,'manual');
});
