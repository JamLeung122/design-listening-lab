// 3.2 diagnostics: non-invasive preflight before WebLLM initialization.
const $diag = id => document.getElementById(id);
const log = (s) => { const e=$diag('diagLog');if(e){e.textContent += (e.textContent?'\n':'')+s;e.scrollTop=e.scrollHeight;} };
const withTimeout=(promise,ms)=>Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(Error(`超过 ${ms/1000} 秒未响应`)),ms))]);
const probe=async(url,label)=>{const start=Date.now();try{const r=await withTimeout(fetch(url,{method:'GET',headers:{Range:'bytes=0-1023'},cache:'no-store',mode:'cors'}),15000);log(`${label}: HTTP ${r.status}, CORS 可读取, ${Date.now()-start}ms`);if(!r.ok)throw Error('HTTP '+r.status);await withTimeout(r.body?.cancel()??Promise.resolve(),5000);return true}catch(e){log(`${label}: 请求失败：${e.message}`);return false}};
async function diagnose(){const b=$diag('diagBtn');b.disabled=true;$diag('diagLog').textContent='';log('3.2 诊断开始；此测试不会下载整个模型。');log('在线：'+navigator.onLine+'；WebGPU：'+!!navigator.gpu+'；ServiceWorker：'+!!navigator.serviceWorker?.controller);
await probe('https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.80/+esm','运行组件 CDN');
const base='https://huggingface.co/mlc-ai/Qwen2.5-0.5B-Instruct-q4f16_1-MLC/resolve/main/';
await probe(base+'mlc-chat-config.json','模型配置文件');await probe(base+'params_shard_7.bin','模型参数分片');
log('说明：浏览器直接下载成功不代表跨域 fetch 成功；若上方失败，请截图日志。');b.disabled=false;
}
$diag('diagBtn')?.addEventListener('click',diagnose);
// Watchdog: report long stalls without disrupting a potentially active download.
const install=$diag('installAI');let watchdog;
install?.addEventListener('click',()=>{clearTimeout(watchdog);watchdog=setTimeout(()=>{const t=$diag('aiStatus')?.textContent||'';if(/0%|Start to fetch params/i.test(t))log('提示：模型加载超过 60 秒仍停留 0%。建议停止重试并运行网络诊断。');},60000)},true);
