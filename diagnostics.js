// Design Listening Lab 3.4: bounded, honest network/cache diagnostics.
const d=id=>document.getElementById(id);
const log=s=>{const el=d('diagLog');if(el){el.textContent+=(el.textContent?'\n':'')+s;el.scrollTop=el.scrollHeight}};
const base='https://huggingface.co/mlc-ai/Qwen2.5-0.5B-Instruct-q4f16_1-MLC/resolve/main/';
async function probe(url,label,timeout=12000){
 const controller=new AbortController(),start=performance.now();
 const timer=setTimeout(()=>controller.abort(),timeout);
 try{
  const response=await fetch(url,{method:'GET',mode:'cors',cache:'no-store',headers:{Range:'bytes=0-1023'},signal:controller.signal});
  const status=response.status,range=response.headers.get('content-range');
  if(!response.ok)throw Error('HTTP '+status);
  // Some CDN assets legitimately return 200; never read an unbounded response.
  if(status!==206){await response.body?.cancel();log(label+': HTTP '+status+'（不支持 Range；已取消响应，未下载完整文件）');return false}
  const reader=response.body?.getReader();if(reader){await reader.read();await reader.cancel()}
  log(label+': HTTP 206 ✓ '+Math.round(performance.now()-start)+'ms'+(range?' · '+range:''));
  return true;
 }catch(e){log(label+': 失败 · '+(e.name==='AbortError'?'超时或被取消':e.message||String(e)));return false}
 finally{clearTimeout(timer);controller.abort()}
}
async function diagnose(){
 const button=d('diagBtn');if(!button)return;button.disabled=true;d('diagLog').textContent='';
 try{
  log('3.4 模型网络诊断（每个请求最多读取少量数据）');
  log('网络状态 '+(navigator.onLine?'在线':'离线')+' · WebGPU '+!!navigator.gpu+' · SW 控制 '+!!navigator.serviceWorker?.controller);
  if(navigator.storage?.estimate){try{const e=await navigator.storage.estimate();const mb=n=>n==null?'未知':(n/1048576).toFixed(0)+' MB';log('浏览器存储：已用 '+mb(e.usage)+' · 配额估计 '+mb(e.quota))}catch(e){log('存储估算不可用：'+e.message)}}
  if('caches'in window){try{const names=await caches.keys();log('Cache Storage：'+(names.length?names.join(', '):'无缓存'))}catch(e){log('缓存查询失败：'+e.message)}}
  if(!navigator.onLine){log('离线状态：跳过远程探测；已缓存模型仍可能可用。');return}
  await probe(base+'mlc-chat-config.json','模型配置');
  // Only check a known first shard. The number of shards varies by model/version.
  await probe(base+'params_shard_0.bin','首个模型参数分片');
  log('诊断说明：首个分片连通不代表全部模型文件完整，也不代表 WebGPU 初始化成功。');
  log('WebLLM 的 CDN 模块不由本站 Service Worker 缓存；离线首次启动可能失败。');
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
  if(Date.now()-lastChange>60000){log('模型加载状态超过 60 秒未变化。请检查网络与缓存，不要立即清除网站数据。');clearInterval(watcher)}
 },5000);
},true);
