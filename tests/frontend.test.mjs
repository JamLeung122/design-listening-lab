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
 assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(importSegments(raw).map(s=>s.text))',context)),[text]);
 context.raw=Array.from({length:170},(_,i)=>'word'+i).join(' ');
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


test('trimmed estimates skip intro, credits, and gaps while keeping original time coordinates',()=>{
 const context=lessonFunctions();
 const data=JSON.parse(vm.runInContext(`
  const window=trimWindows({start:10,end:45,skips:[{start:20,end:30},{start:25,end:35}]},60);
  JSON.stringify({
   window,
   estimates:estimateRanges(['first','second'],60,window),
   subtitle:clipRange(5,22,window),
   excluded:clipRange(24,29,window)
  })
 `,context));
 assert.deepEqual(data,{
  window:[{start:10,end:20},{start:35,end:45}],
  estimates:[{start:10,end:20},{start:35,end:45}],
  subtitle:{start:10,end:20},excluded:null
 });
});

test('trim rejects invalid and fully excluded ranges',()=>{
 const context=lessonFunctions();
 assert.equal(vm.runInContext("parseTrim('7','30','10–15',45).trim.skips[0].end",context),15);
 for(const [start,end,skips] of [['15','10',''],['5','18','4–8'],['5','18','5–18']]){
  context.input=[start,end,skips,45];
  assert.equal(vm.runInContext("typeof parseTrim(...input).error",context),'string');
 }
});

test('playback jumps a marked gap and stops at the segment end',()=>{
 const logic=source.slice(source.indexOf('function enforcePlaybackBounds()'),source.indexOf('async function playSegment'));
 const audio={paused:false,seeking:false,currentTime:21,playbackRate:1,pause(){this.paused=true}};
 const context={audio,stopTimer:null,clearTimeout:()=>{},setTimeout:()=>{},rawAudioPreview:()=>false,
  keptWindows:[{start:10,end:20},{start:30,end:45}],activeSegment:{start:10,end:38},audioTrim:true,loop:false,clipRange:()=>null,
  stopSegment(){context.activeSegment=null}
 };
 vm.runInNewContext(logic+';enforcePlaybackBounds();',context);
 assert.equal(audio.currentTime,30);
 assert.equal(audio.paused,false);
 audio.currentTime=38.1;
 vm.runInNewContext(logic+';enforcePlaybackBounds();',context);
 assert.equal(audio.currentTime,38);
 assert.equal(audio.paused,true);
});


test('calibrated boundaries anchor the next text segment without moving later fixed ranges',()=>{
 const context=lessonFunctions();
 const actual=JSON.parse(vm.runInContext(`
 const stops=[{start:5,end:15},{start:20,end:45}];
 JSON.stringify(alignSegments(
  ['First','Second','Third','Fourth'].map(text=>({text,start:null,end:null})),
  [{start:6,end:12},null,null,{start:32,end:39}],stops,45
 ));
 `,context));
 assert.deepEqual(actual,[
  {start:6,end:12,kind:'已校准'},
  {start:12,end:24.5,kind:'承接估算'},
  {start:24.5,end:32,kind:'承接估算'},
  {start:32,end:39,kind:'已校准'}
 ]);
});

test('calibrated subtitle segment shifts later cues while retaining their spacing',()=>{
 const context=lessonFunctions();
 const actual=JSON.parse(vm.runInContext(`
 JSON.stringify(alignSegments(
  [{text:'First',start:0,end:6},{text:'Second',start:8,end:15},{text:'Third',start:16,end:20}],
  [{start:3,end:10}],[{start:0,end:30}],30
 ));
 `,context));
 assert.deepEqual(actual,[
  {start:3,end:10,kind:'已校准'},
  {start:12,end:19,kind:'随前段调整'},
  {start:20,end:24,kind:'随前段调整'}
 ]);
});

test('merging only carries an already learned mark when both segments were learned',()=>{
 const context=lessonFunctions();
 assert.equal(vm.runInContext("JSON.stringify([...mergeStudyFlags(new Set([0,2,3]),1)])",context),'[0,2]');
 assert.equal(vm.runInContext("JSON.stringify([...mergeStudyFlags(new Set([1,2]),1)])",context),'[1]');
});
