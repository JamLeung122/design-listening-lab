// Design Listening Lab 3.3 — bounded network and storage diagnostics.
const d=id=>document.getElementById(id);
const log=s=>{const el=d('diagLog');if(el){el.textContent+=(el.textContent?'\n':'')+s;el.scrollTop=el.scrollHeight}};
const base='https://huggingface.co/mlc-ai/Qwen2.5-0.5B-Instruct-q4f16_1-MLC/resolve/main/';
async function probe(url,label,timeout=12000){
 const controller=new AbortController(),start=performance.now();
 const timer=setTimeout(()=>controller.abort('timeout'),timeout);
 try{
  const response=await fetch(url,{method:'GET',mode:'cors',cache:'no-store',headers:{Range:'bytes=0-1023'},signal:controller.signal});
  const status=response.status,range=response.headers.get('content-range'),length=response.headers.get('content-length');
  if(!response.ok)throw Error(`HTTP ${status}`);
  if(status!==206){await response.body?.cancel();log(`${label}: HTTP ${status}，服务器未确认 Range；跳过完整文件下载`);return false}
  const reader=response.body?.getReader();if(reader){await reader.read();await reader.cancel()}
  log(`${label}: HTTP ${status} ✓ ${Math.round(performance.now()-start)}ms${range?' · '+range:''}${length?' · 响应长度 '+length:''}`);return true;
 }catch(e){log(`${label}: 失败 · ${e.name==='AbortError'?'请求超时':e.message||String(e)}`);return false}
 finally{clearTimeout(timer);controller.abort()}
}
async function diagnose(){
 const button=d('diagBtn');if(!button)return;button.disabled=true;d('diagLog').textContent='';
 try{
  log('3.3 分片诊断开始（仅读取少量字节，不下载完整模型）');
  log(`在线 ${navigator.onLine} · WebGPU ${!!navigator.gpu} · ServiceWorker ${!!navigator.serviceWorker?.controller}`);
  if(navigator.storage?.estimate){try{const e=await navigator.storage.estimate();const mb=n=>n==null?'未知':(n/1048576).toFixed(0)+' MB';log(`浏览器存储：已用 ${mb(e.usage)} · 估计配额 ${mb(e.quota)}（非模型专用）`)}catch(e){log('存储估算不可用：'+e.message)}}
  await probe('https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.80/+esm','WebLLM 组件');
  await probe(base+'mlc-chat-config.json','模型配置');
  let ok=0;
  for(let i=0;i<8;i++)if(await probe(base+`params_shard_${i}.bin`,`参数分片 ${i+1}/8`))ok++;
  log(`分片检测完成：${ok}/8 个通过 Range 读取。`);
  log('注意：此测试不能证明 WebLLM 的内部缓存写入或 GPU 初始化一定成功。');
 }finally{button.disabled=false}
}
d('diagBtn')?.addEventListener('click',diagnose);
let lastText='',lastChange=0,watcher=null;
d('installAI')?.addEventListener('click',()=>{
 lastText='';lastChange=Date.now();clearInterval(watcher);
 watcher=setInterval(()=>{
  const t=d('aiStatus')?.textContent||'';
  if(t!==lastText){lastText=t;lastChange=Date.now();return}
  if(/完成|失败|已加载/.test(t)){clearInterval(watcher);return}
  if(Date.now()-lastChange>60000){log('加载监控：状态超过 60 秒未变化。请先运行分片诊断；不要清除网站数据。');clearInterval(watcher)}
 },5000);
},true);
