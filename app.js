const $=id=>document.getElementById(id);let paras=JSON.parse(localStorage.getItem('dll_paras')||'null')||[
'An illustrator can begin with something ordinary and discover a surprising visual idea. The challenge is not only to draw an object, but to notice a relationship that other people may overlook.',
'Visual communication becomes stronger when a complex idea is reduced to a clear form. A simple image can invite the viewer to make a connection and complete the meaning.',
'Experimentation is part of the creative process. Sketching several possibilities can reveal a direction that was not obvious at the beginning.'
];let hidden=new Set(paras.map((_,i)=>i)),selection='',engine=null,modelName='',aiLoading=false,strokes=[],current=null,pen='#1d2939',erase=false,ctx,canvas,db;
// User-controlled transcript size; persists across offline PWA relaunches.
const fontSizeControl=$('fontSize');
function applyTranscriptFont(value){
 const font=Math.min(26,Math.max(18,Number(value)||20));
 document.documentElement.style.setProperty('--transcript-size',font+'px');
 fontSizeControl.value=String(font);
 try{localStorage.setItem('dll_font_size',String(font))}catch{}
}
try{applyTranscriptFont(localStorage.getItem('dll_font_size')||'20')}catch{applyTranscriptFont('20')}
fontSizeControl.addEventListener('change',()=>applyTranscriptFont(fontSizeControl.value));
const dictionary={illustrator:'插画师',ordinary:'普通的；日常的',visual:'视觉的',idea:'想法；概念',challenge:'挑战',relationship:'关系；关联',communication:'传达；沟通',complex:'复杂的',reduced:'简化；提炼',viewer:'观看者',connection:'联系；联想',experimentation:'实验性探索',creative:'创意的',process:'过程',sketching:'草图绘制',possibilities:'多种可能性',direction:'方向',obvious:'明显的'};
// Mode-driven selection: tap a word or a full sentence; long-press to select any phrase in Safari.
let selectionMode='word',rangeSelectedAt=0;
function selectedTranscriptText(){
 const sel=window.getSelection();
 if(!sel || sel.isCollapsed || !sel.rangeCount)return '';
 const range=sel.getRangeAt(0),host=$('paragraphs');
 if(!host.contains(range.commonAncestorContainer))return '';
 return sel.toString().replace(/\s+/g,' ').trim();
}
function render(){
 const host=$('paragraphs');host.replaceChildren();
 paras.forEach((p,i)=>{
  const el=document.createElement('article');el.className='para';
  const head=document.createElement('div');head.className='meta';
  const name=document.createElement('span');name.textContent='PARAGRAPH '+String(i+1).padStart(2,'0');
  const btn=document.createElement('button');btn.className='small';btn.textContent=hidden.has(i)?'显示原文':'隐藏原文';
  btn.onclick=()=>{hidden.has(i)?hidden.delete(i):hidden.add(i);render()};
  head.append(name,btn);el.append(head);
  const body=document.createElement('div');body.className='body';
  if(hidden.has(i)){body.classList.add('hiddenText');body.textContent='原文已隐藏 · 先听写再揭晓'}
  else {
   // Preserve spaces and punctuation while creating sentence and word targets.
   const sentences=p.match(/[^.!?]+(?:[.!?]+(?=\s|$)|$)/g)||[p];
   for(const sentence of sentences){
    const sentenceSpan=document.createElement('span');sentenceSpan.className='sentence';
    sentenceSpan.title='切换至整句模式后点击选取这句话';
    sentenceSpan.addEventListener('click',()=>{
     if(selectionMode==='sentence' && !selectedTranscriptText() && Date.now()-rangeSelectedAt>700)select(sentence.trim());
    });
    sentence.split(/(\b[A-Za-z][A-Za-z'-]*\b)/g).forEach(token=>{
     if(/^[A-Za-z]/.test(token)){
      const word=document.createElement('span');word.className='word';word.textContent=token;
      word.addEventListener('click',()=>{
       if(selectionMode==='word' && !selectedTranscriptText() && Date.now()-rangeSelectedAt>700)select(token);
      });sentenceSpan.append(word);
     }else sentenceSpan.append(document.createTextNode(token));
    });
    body.append(sentenceSpan);
   }
  }
  el.append(body);host.append(el);
 });
 host.classList.toggle('sentence-mode',selectionMode==='sentence');
 $('modeBtn').textContent=selectionMode==='word'?'选择：单词':'选择：整句';
 $('modeBtn').setAttribute('aria-pressed',String(selectionMode==='sentence'));
}
function select(s){
 selection=s.replace(/\s+/g,' ').trim();
 if(!selection)return;
 $('selected').textContent='选中：'+selection;
 $('aiOutput').textContent='可使用「解释」（内置词库）或「复制到 Noema」（离线解释短语、整句）。';
}
render();
$('modeBtn').onclick=()=>{selectionMode=selectionMode==='word'?'sentence':'word';render()};
$('hideAll').onclick=()=>{hidden=new Set(paras.map((_,i)=>i));render()};
$('showAll').onclick=()=>{hidden.clear();render()};
document.addEventListener('selectionchange',()=>{
 const text=selectedTranscriptText();
 if(text){rangeSelectedAt=Date.now();select(text)}
});
$('selectionBtn').onclick=()=>{
 const text=selectedTranscriptText()||selection;
 if(text)select(text);
 else $('aiOutput').textContent='请在原文中长按并拖动选区，或切换「选择：整句」后点一句话。';
};$('explainBtn').onclick=()=>explain();$('savePhrase').onclick=()=>{if(!selection)return;let a=JSON.parse(localStorage.getItem('dll_phrases')||'[]');a.push({text:selection,created:new Date().toISOString()});localStorage.setItem('dll_phrases',JSON.stringify(a));$('studyInfo').textContent='已收藏：'+selection;scheduleSave()};
// Short prompt for fast learning; detailed prompt remains available.
function currentEnglish(){return selectedTranscriptText()||selection}
function makeNoemaPrompt(text,detailed=false){
 if(!detailed)return [
  '请作为中英双语艺术与设计英语老师，解释以下英文。',
  '简洁回答：①中文含义 ②简明英文改写 ③关键词或搭配 ④一个设计或艺术相关英语例句。',
  '如果有歧义，说明常见用法。不编造来源。',
  '英文：'+text
 ].join('\n');
 return [
  '你是我的中英双语英语学习助手，重点关注插画、数字艺术、视觉传达与汽车座舱 HMI。',
  '请基于下面这一段英文，简短说明：',
  '1. 中文自然释义和简洁英文改写；',
  '2. 最多三个重要单词或常用搭配；',
  '3. 必要时解释语法、语气及用法；',
  '4. 一个设计或艺术相关英语例句；',
  '5. 一个简短复习问题。',
  '不要编造纪录片出处。',
  '英文：'+text
 ].join('\n');
}
function handoffText(){
 const text=currentEnglish();
 if(!text){$('aiOutput').textContent='请先显示原文，并点击单词、整句或长按拖选短语。';return null}
 return text;
}
async function copyForNoema(detailed){
 const text=handoffText();if(!text)return;
 const prompt=makeNoemaPrompt(text,detailed);
 try{
  await navigator.clipboard.writeText(prompt);
  $('aiOutput').textContent=(detailed?'详细':'精简')+'学习提示词已复制：'+text+'\n切换到 Noema 粘贴发送即可。';
 }catch{
  $('aiOutput').textContent='复制失败；请从下方手动复制：\n'+prompt;
 }
}
$('copyQuick').onclick=()=>copyForNoema(false);
$('copyNoema').onclick=()=>copyForNoema(true);


// Online AI is optional and only sends explicitly selected English text when tapped.
// Never put a provider API key in client code or send one from the browser.
let onlineAccessToken='';
let onlineEndpoint='';
try{onlineEndpoint=localStorage.getItem('dll_online_endpoint')||''}catch{}
$('onlineEndpoint').value=onlineEndpoint;
$('onlineSettingsBtn').onclick=()=>{
 $('onlineEndpoint').value=onlineEndpoint;
 $('onlineToken').value=onlineAccessToken;
 $('onlineConfigStatus').textContent='只有你主动点击「在线 AI 解释」时才发送选中的英文。';
 openModal('onlineSettingsModal');
};
$('saveOnlineSettings').onclick=()=>{
 const value=$('onlineEndpoint').value.trim();
 let url;
 try{
  url=new URL(value);
  if(url.protocol!=='https:' || url.pathname!=='/explain' || url.username || url.password || url.search || url.hash)throw Error('invalid');
 }catch{$('onlineConfigStatus').textContent='请输入 HTTPS 地址，并确保路径以 /explain 结尾。';return}
 const token=$('onlineToken').value.trim();
 if(!token){$('onlineConfigStatus').textContent='请输入 APP_ACCESS_TOKEN 访问口令（不是 OpenAI API Key）。';return}
 onlineEndpoint=url.href;
 onlineAccessToken=token;
 try{localStorage.setItem('dll_online_endpoint',onlineEndpoint)}catch{}
 $('onlineConfigStatus').textContent='连接设置已保存在当前页面。现在选择英文并点击「在线 AI 解释」。';
};
let onlineExplaining=false;
$('onlineExplainBtn').onclick=async()=>{
 const text=(selectedTranscriptText()||selection).trim();
 if(!text){$('aiOutput').textContent='请先选中一个英文单词、短语或句子。';return}
 if(!navigator.onLine){$('aiOutput').textContent='当前离线。请使用「基础释义」或复制到 Noema。';return}
 if(!onlineEndpoint||!onlineAccessToken){
  $('aiOutput').textContent='在线 AI 尚未连接。请先点击顶部「在线 AI 设置」。';
  openModal('onlineSettingsModal');return;
 }
 if(onlineExplaining)return;
 onlineExplaining=true;
 $('onlineExplainBtn').disabled=true;
 $('aiOutput').textContent='正在在线解释：'+text;
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),30000);
 try{
  const response=await fetch(onlineEndpoint,{
   method:'POST',
   mode:'cors',
   headers:{'Content-Type':'application/json','Authorization':'Bearer '+onlineAccessToken},
   body:JSON.stringify({text,mode:'quick'}),
   signal:controller.signal
  });
  const data=await response.json();
  if(!response.ok)throw Error(data.error||'HTTP '+response.status);
  if(typeof data.answer!=='string')throw Error('响应中缺少解释文字');
  $('aiOutput').textContent=data.answer;
 }catch(e){
  $('aiOutput').textContent='在线解释未成功：'+(e.name==='AbortError'?'连接超时':e.message||String(e))+'。你的原文与手写不会受到影响。';
 }finally{clearTimeout(timer);onlineExplaining=false;$('onlineExplainBtn').disabled=false}
};

async function explain(){if(!selection)return;$('aiOutput').textContent='正在解释…';if(engine){try{let r=await engine.chat.completions.create({messages:[{role:'system',content:'你是设计英语教师。用简体中文简洁解释所给英文词、词组或句子：中文含义、语境、发音或语法提示，以及一个设计或艺术相关的原创英语例句。不要声称来自纪录片原文。'},{role:'user',content:selection}],temperature:0.2,max_tokens:280});$('aiOutput').textContent=r.choices[0].message.content||'模型没有返回内容';return}catch(e){$('aiOutput').textContent='本地 AI 出错：'+e.message+'\n改用基础释义。\n'}}let meaning=dictionary[selection.toLowerCase().replace(/[^a-z'-]/g,'')];$('aiOutput').textContent=meaning?`${selection}：${meaning}\n\n离线基础词库解释；加载本地 AI 后可查看语境和句法。`:`「${selection}」不在内置基础词库。点击「复制到 Noema」，在已安装的 Qwen3 1.7B 中离线解释短语或整句。`}
function openModal(id){$(id).classList.add('open')}document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).classList.remove('open'));$('importBtn').onclick=()=>openModal('importModal');$('aiBtn').onclick=()=>{openModal('aiModal');checkGPU()};$('subtitleFile').onchange=async e=>{$('sourceText').value=await e.target.files[0].text()};function normalize(t){return t.replace(/^WEBVTT.*$/gm,'').replace(/^\d+\s*$/gm,'').replace(/^\d\d:\d\d:\d\d[.,]\d+\s*-->.*$/gm,'').replace(/^\d\d:\d\d[.,]\d+\s*-->.*$/gm,'').replace(/<[^>]+>/g,'').split(/\n\s*\n/).map(s=>s.trim().replace(/\n/g,' ')).filter(Boolean)}$('doImport').onclick=()=>{let t=$('sourceText').value.trim();if(!t)return;paras=normalize(t);hidden=new Set(paras.map((_,i)=>i));localStorage.setItem('dll_paras',JSON.stringify(paras));render();scheduleSave();$('importModal').classList.remove('open')};
const audio=$('audio');let audioURL=null,a=null,b=null,loop=false;$('audioFile').onchange=e=>{if(audioURL)URL.revokeObjectURL(audioURL);audioURL=URL.createObjectURL(e.target.files[0]);audio.src=audioURL};$('speed').onchange=e=>audio.playbackRate=+e.target.value;$('back').onclick=()=>audio.currentTime=Math.max(0,audio.currentTime-5);$('setA').onclick=()=>{a=audio.currentTime;$('setA').textContent='A '+a.toFixed(1)};$('setB').onclick=()=>{b=audio.currentTime;$('setB').textContent='B '+b.toFixed(1)};$('loop').onclick=()=>{loop=!loop;$('loop').textContent='循环:'+(loop?'开':'关')};audio.ontimeupdate=()=>{if(loop&&a!==null&&b!==null&&b>a&&audio.currentTime>=b)audio.currentTime=a};
canvas=$('ink');ctx=canvas.getContext('2d');function resize(){let rect=$('paper').getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(rect.width*dpr);canvas.height=Math.round(rect.height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);redraw()}function redraw(){let w=canvas.clientWidth,h=canvas.clientHeight;ctx.clearRect(0,0,w,h);ctx.fillStyle='#f8f9f4';ctx.fillRect(0,0,w,h);ctx.strokeStyle='#d9e0dc';ctx.lineWidth=1;for(let y=35;y<h;y+=30){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke()}for(let s of strokes){ctx.strokeStyle=s.erase?'#f8f9f4':s.color;ctx.lineWidth=s.erase?18:2.5;ctx.lineJoin='round';ctx.lineCap='round';ctx.beginPath();s.points.forEach(([x,y],i)=>i?ctx.lineTo(x*w,y*h):ctx.moveTo(x*w,y*h));ctx.stroke()}}function pos(e){let r=canvas.getBoundingClientRect();return [(e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height]}canvas.onpointerdown=e=>{e.preventDefault();canvas.setPointerCapture(e.pointerId);current={color:pen,erase,points:[pos(e)]};strokes.push(current);redraw()};canvas.onpointermove=e=>{if(!current)return;current.points.push(pos(e));redraw()};canvas.onpointerup=()=>{current=null;hasEditedInk=true;scheduleSave()};canvas.onpointercancel=()=>{current=null;hasEditedInk=true;scheduleSave()};new ResizeObserver(resize).observe($('paper'));document.querySelectorAll('[data-color]').forEach(el=>el.onclick=()=>{pen=el.dataset.color;erase=false});$('penBtn').onclick=()=>erase=false;$('eraserBtn').onclick=()=>erase=true;$('undoBtn').onclick=()=>{strokes.pop();redraw();hasEditedInk=true;scheduleSave()};$('clearBtn').onclick=()=>{if(confirm('确定清空手写区域？')){strokes=[];redraw();hasEditedInk=true;scheduleSave()}};
function download(filename,blob){let url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),3000)}$('pngBtn').onclick=()=>canvas.toBlob(blob=>download('dictation.png',blob),'image/png');function backup(){return {version:4,paras,strokes,phrases:JSON.parse(localStorage.getItem('dll_phrases')||'[]'),created:new Date().toISOString()}}$('jsonBtn').onclick=()=>download('design-listening-lab-backup.json',new Blob([JSON.stringify(backup(),null,2)],{type:'application/json'}));
function openDB(){return new Promise((resolve,reject)=>{let r=indexedDB.open('design-listening-lab',1);r.onupgradeneeded=()=>r.result.createObjectStore('notes');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}let saveTimer=null,hasEditedInk=false;
async function save(){try{db=db||await openDB();await new Promise((resolve,reject)=>{const tx=db.transaction('notes','readwrite');tx.objectStore('notes').put(backup(),'latest');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('transaction aborted'));});$('studyInfo').textContent='已保存笔迹和学习数据 · 建议定期导出 JSON'}catch(e){$('studyInfo').textContent='保存失败，请导出 JSON：'+e.message}}
function scheduleSave(){clearTimeout(saveTimer);saveTimer=setTimeout(save,700)}
$('saveBtn').onclick=save;async function restore(){try{db=await openDB();let tx=db.transaction('notes');let req=tx.objectStore('notes').get('latest');req.onsuccess=()=>{if(req.result?.strokes&&!hasEditedInk){strokes=req.result.strokes;redraw()}}}catch{}}setTimeout(restore,300);document.addEventListener('visibilitychange',()=>{if(document.hidden){clearTimeout(saveTimer);void save()}});

// Toggle handwriting without discarding strokes; keep the same audio element in reading mode.
const viewToggle=$('viewToggle'), layout=document.querySelector('.layout');
const audioPlayer=document.querySelector('#handwritingPane .player');
const audioParent=audioPlayer.parentElement, audioNext=audioPlayer.nextSibling;
function setReadingMode(reading){
 if(reading===layout.classList.contains('reading-mode'))return;
 if(reading){
  $('readingAudioDock').append(audioPlayer);
 }else{
  audioParent.insertBefore(audioPlayer,audioNext);
 }
 layout.classList.toggle('reading-mode',reading);
 viewToggle.setAttribute('aria-pressed',String(reading));
 viewToggle.textContent=reading?'展开手写 · 听写模式':'收起手写 · 阅读模式';
 // Canvas resize is observed and normalized strokes remain available on reopening.
 try{localStorage.setItem('dll_reading_mode',reading?'1':'0')}catch{}
}
viewToggle.addEventListener('click',()=>setReadingMode(!layout.classList.contains('reading-mode')));
try{if(localStorage.getItem('dll_reading_mode')==='1')setReadingMode(true)}catch{}

async function checkGPU(){let ok=!!navigator.gpu;$('gpuStatus').textContent=ok?'检测到 WebGPU 接口（尚需实际模型验证）':'未检测到 WebGPU：此浏览器无法运行当前本地模型方案';$('modelInfo').textContent='3.1 诊断版：分阶段检测运行组件、模型下载与 GPU 初始化。首次安装需联网。';$('installAI').disabled=!ok}
function aiReport(stage,message){$('aiStatus').textContent='【'+stage+'】 '+message;console.info('[ListeningLab AI]',stage,message)}
async function loadWebLLM(){let urls=['https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.80/+esm','https://esm.run/@mlc-ai/web-llm@0.2.80'];let errors=[];for(let url of urls){try{aiReport('组件加载','尝试 '+new URL(url).hostname);let lib=await import(/* webpackIgnore: true */ url);if(typeof lib.CreateMLCEngine!=='function'||!lib.prebuiltAppConfig?.model_list?.length)throw Error('模块导出不完整');return lib}catch(e){errors.push(new URL(url).hostname+': '+(e?.message||String(e)))}}throw Error('两个组件地址均加载失败：'+errors.join('；'))}
$('installAI').onclick=async()=>{
 if(aiLoading)return;
 aiLoading=true;
 $('installAI').disabled=true;
 try{
  if(!navigator.onLine)throw Error('首次安装需要联网');
  if(!navigator.gpu)throw Error('当前浏览器未提供 WebGPU');
  const selected=$('modelChoice').value;
  if(!['SmolLM2-360M-Instruct-q4f16_1-MLC','Qwen2.5-0.5B-Instruct-q4f16_1-MLC'].includes(selected))throw Error('未知模型选择');
  const webllm=await loadWebLLM();
  const available=webllm.prebuiltAppConfig.model_list.find(m=>m.model_id===selected);
  if(!available)throw Error('当前 WebLLM 运行组件不包含所选模型：'+selected);
  modelName=selected;
  aiReport('模型下载 / GPU 初始化','正在准备 '+modelName+'；首次安装可能需要下载多个分片。');
  const progressTimer={last:Date.now(),text:''};
  let checkTimer=setInterval(()=>{
   if(!aiLoading){clearInterval(checkTimer);return}
   if(Date.now()-progressTimer.last>90000){
    aiReport('提醒','模型进度超过 90 秒没有变化。可暂时停止尝试；请不要反复删除 Safari 缓存。');
    progressTimer.last=Date.now();
   }
  },10000);
  try{
   engine=await webllm.CreateMLCEngine(modelName,{
    initProgressCallback:p=>{
     const percent=typeof p.progress==='number'?Math.round(p.progress*100)+'%':'进度未知';
     const value=percent+' · '+(p.text||'正在加载');
     if(value!==progressTimer.text){progressTimer.text=value;progressTimer.last=Date.now()}
     aiReport('模型下载 / GPU 初始化',value);
    }
   });
  }finally{clearInterval(checkTimer)}
  aiReport('完成','模型已加载：'+modelName+'。请点击测试。离线重启是否可用仍需单独验证。');
  $('testAI').disabled=false;
 }catch(e){
  aiReport('失败',(e?.message||String(e))+'。可以继续使用听写和 Noema；不需要重复下载原模型。');
 }finally{aiLoading=false;$('installAI').disabled=!navigator.gpu}
};
$('testAI').onclick=async()=>{if(!engine){$('aiStatus').textContent='请先加载模型';return}selection='visual language';$('aiModal').classList.remove('open');await explain()};async function net(){
 let ready=false;
 try{
  if('caches'in window){
   const cache=await caches.open('design-listening-lab-v4.0');
   const core=['./index.html','./app.js','./safe-area.css','./diagnostics.js','./manifest.webmanifest','./icon.svg'];
   ready=(await Promise.all(core.map(url=>cache.match(url)))).every(Boolean);
  }
 }catch{}
 $('network').textContent=(navigator.onLine?'在线':'离线')+' · '+(ready?'网页已缓存':'等待离线缓存');
}
window.addEventListener('online',net);
window.addEventListener('offline',net);
if('serviceWorker'in navigator){
 navigator.serviceWorker.addEventListener('controllerchange',net);
 navigator.serviceWorker.register('./sw.js').then(()=>setTimeout(net,600)).catch(e=>{console.warn(e);net()});
}else net();
