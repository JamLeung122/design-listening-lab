import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import worker from '../backend/worker.js';
const source=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const online=source.slice(source.indexOf('function toggleResult(open)'),source.indexOf('async function explain()'));
function page({selected='visual language',connected=true}={}){
 const nodes={},stored=new Map(),calls=[];
 const context={URL,AbortController,setTimeout,clearTimeout,Error,String,
  $:id=>nodes[id]??={
   value:'',textContent:'',disabled:false,hidden:true,dataset:{},setAttribute(){},scrollIntoView(){},focus(){},
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


test('connection check omits credentials and submits no text to the Worker',async()=>{
 const p=page();
 p.nodes.onlineEndpoint.value='https://test.workers.dev/explain';
 p.context.fetch=async(url,options)=>{p.calls.push({url,...options});return new Response(null,{status:405})};
 await p.nodes.testOnlineConnection.onclick();
 assert.equal(p.calls.length,1);
 assert.equal(p.calls[0].credentials,'omit');
 assert.equal(p.calls[0].headers,undefined);
 assert.equal(p.calls[0].body,undefined);
 assert.match(p.nodes.onlineConfigStatus.textContent,/已连到释义服务器/);
});

test('collapsing an in-flight explanation preserves its result for reopening',async()=>{
 const p=page();p.configure();let finish;
 p.context.fetch=()=>new Promise(resolve=>{finish=resolve});
 const pending=p.nodes.onlineExplainBtn.onclick();
 p.nodes.collapseResult.onclick();
 finish(Response.json({answer:'视觉语言'}));
 await pending;
 assert.equal(p.nodes.resultPanel.hidden,true);
 p.nodes.reopenResult.onclick();
 assert.equal(p.nodes.resultPanel.hidden,false);
 assert.equal(p.nodes.aiOutput.textContent,'视觉语言');
});


function lessonFunctions(){
 const logic=source.slice(source.indexOf("const LESSON_KEY="),source.indexOf("const savedTranscript="));
 const context=vm.createContext({});
 vm.runInContext(logic,context);
 return context;
}

test('plain transcripts break into numbered study-size segments without losing text',()=>{
 const context=lessonFunctions();
 const text='This is one sentence. This is another sentence. A third sentence begins. This is the fourth sentence.';
 context.raw=text;
 assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(importSegments(raw).map(s=>s.text))',context)),[
  'This is one sentence. This is another sentence.','A third sentence begins. This is the fourth sentence.'
 ]);
 context.raw=Array.from({length:110},(_,i)=>'word'+i).join(' ');
 assert.equal(vm.runInContext('importSegments(raw).length',context),3);
 assert.equal(vm.runInContext("importSegments(raw).map(s=>s.text).join(' ')",context),context.raw);
});

test('SRT and WebVTT retain cue times and separate pauses in the source audio',()=>{
 const context=lessonFunctions();
 for(const raw of [
  '1\r\n00:00:02,250 --> 00:00:04,000\r\n<i>First cue.</i>\r\n\r\n2\r\n00:00:04,100 --> 00:00:06,500\r\nSecond cue.\r\n\r\n3\r\n00:00:10,000 --> 00:00:12,000\r\nThird cue.',
  'WEBVTT\n\n00:02.250 --> 00:04.000 align:start\nFirst cue.\n\n00:04.100 --> 00:06.500\nSecond cue.\n\n00:10.000 --> 00:12.000\nThird cue.'
 ]){
  context.raw=raw;
  assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(importSegments(raw))',context)),[
   {text:'First cue. Second cue.',start:2.25,end:6.5},{text:'Third cue.',start:10,end:12}
  ]);
 }
});

test('untimed ranges are contiguous and fill the imported recording',()=>{
 const context=lessonFunctions();
 const data=JSON.parse(vm.runInContext("JSON.stringify(estimateRanges(['first','one two three'],20))",context));
 assert.deepEqual(data,[{start:0,end:5},{start:5,end:20}]);
});
