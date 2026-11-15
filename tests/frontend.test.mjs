import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import worker from '../backend/worker.js';
const source=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const online=source.slice(source.indexOf('// Online AI is optional'),source.indexOf('async function explain()'));
function page({selected='visual language',connected=true}={}){
 const nodes={},stored=new Map(),calls=[];
 const context={URL,AbortController,setTimeout,clearTimeout,Error,String,
  $:id=>nodes[id]??={
   value:'',textContent:'',disabled:false,
   replaceChildren(...children){this.children=children;this.textContent=children.map(child=>child.textContent).join('')}
  },
  document:{createTextNode:textContent=>({textContent}),createElement:tagName=>({tagName,textContent:''})},
  localStorage:{getItem:k=>stored.get(k),setItem:(k,v)=>stored.set(k,v)},
  selectedTranscriptText:()=>selected,selection:'',navigator:{onLine:connected},openModal:()=>{},
  fetch:async(url,options)=>{calls.push({url,...options});return Response.json({answer:'视觉语言'})}
 };
 vm.createContext(context);vm.runInContext(online,context);
 function configure(token='test-app-passphrase',url='https://test.workers.dev/explain'){
  nodes.onlineEndpoint.value=url;context.$('onlineToken').value=token;nodes.saveOnlineSettings.onclick();
 }
 return {nodes,stored,calls,context,configure};
}
test('frontend sends only selection, keeps token in memory and renders plain text',async()=>{
 const p=page();p.configure();
 const request=p.context.fetch;
 p.context.fetch=async(...args)=>{await request(...args);return Response.json({answer:'**视觉语言** <b>plain</b>'})};
 await p.nodes.onlineExplainBtn.onclick();
 assert.equal(p.calls.length,1);assert.deepEqual(JSON.parse(p.calls[0].body),{text:'visual language',mode:'quick'});
 assert.equal(p.calls[0].credentials,'omit');assert.equal(p.calls[0].redirect,'error');
 assert.deepEqual([...p.stored.keys()],['dll_online_endpoint']);assert.equal(p.nodes.aiOutput.textContent,'视觉语言 <b>plain</b>');
 assert.deepEqual(p.nodes.aiOutput.children.filter(child=>child.tagName),[{tagName:'strong',textContent:'视觉语言'}]);assert.equal(p.nodes.onlineExplainBtn.disabled,false);
});
test('offline, empty and oversized selections never call network',async()=>{
 for(const options of [{connected:false},{selected:''},{selected:'a'.repeat(1201)}]){
  const p=page(options);p.configure();await p.nodes.onlineExplainBtn.onclick();assert.equal(p.calls.length,0);
 }
});
test('rejects provider keys and unsafe endpoints',()=>{
 const p=page();p.configure('sk-fake-provider-key');assert.equal(p.stored.size,0);
 for(const url of ['http://test.workers.dev/explain','https://test.workers.dev/explain?key=bad','https://user:pass@test.workers.dev/explain','https://test.workers.dev/other']){p.configure('test-app-passphrase',url);assert.equal(p.stored.size,0)}
});
test('duplicate clicks are suppressed and errors leave the button usable',async()=>{
 const p=page();p.configure();let finish;
 p.context.fetch=()=>new Promise(resolve=>{finish=resolve});
 const first=p.nodes.onlineExplainBtn.onclick();assert.equal(p.nodes.onlineExplainBtn.disabled,true);
 await p.nodes.onlineExplainBtn.onclick();finish(Response.json({error:'quota stopped'},{status:502}));await first;
 assert.match(p.nodes.aiOutput.textContent,/quota stopped/);assert.equal(p.nodes.onlineExplainBtn.disabled,false);
});
test('frontend and worker contract round trip with simulated provider',async()=>{
 const p=page();p.configure();const original=globalThis.fetch;
 globalThis.fetch=async()=>Response.json({choices:[{message:{content:'视觉语言 — visual communication'}}]});
 try{
  p.context.fetch=(url,options)=>worker.fetch(new Request(url,{...options,headers:{...options.headers,Origin:'https://jamleung122.github.io'}}),{DASHSCOPE_API_KEY:'test-only',APP_ACCESS_TOKEN:'test-app-passphrase',AI_RATE_LIMITER:{limit:async()=>({success:true})}});
  await p.nodes.onlineExplainBtn.onclick();assert.equal(p.nodes.aiOutput.textContent,'视觉语言 — visual communication');
 }finally{globalThis.fetch=original}
});

test('missing, malformed or unavailable transcript storage can fall back to the sample',()=>{
 const setup=source.slice(source.indexOf('function readStoredArray'),source.indexOf('// User-controlled transcript size'));
 for(const getItem of [()=>null,()=>'{bad JSON',()=>JSON.stringify({text:'legacy'}),()=>{throw Error('Blocked')}]){
  const context={localStorage:{getItem}};
  vm.runInNewContext(setup,context);
  assert.match(vm.runInNewContext('paras[0]',context),/An illustrator/);
  assert.equal(vm.runInNewContext('hidden.size',context),0);
 }
 const context={localStorage:{getItem:()=>JSON.stringify(['My imported transcript.'])}};
 vm.runInNewContext(setup,context);
 assert.equal(vm.runInNewContext('paras[0]',context),'My imported transcript.');
 assert.equal(vm.runInNewContext('hidden.size',context),1);
});
