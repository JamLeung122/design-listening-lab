// Design Listening Lab: offline-first app shell (same-origin only).
// Model weight downloads and external CDN modules are deliberately not cached here.
const CACHE='design-listening-lab-v3.8';
const CORE=['./index.html','./app.js','./safe-area.css','./diagnostics.js','./manifest.webmanifest','./icon.svg'];
const OFFLINE_PAGE='./index.html';
self.addEventListener('install',event=>{
 event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  await cache.addAll(CORE);
  await self.skipWaiting();
 })());
});
self.addEventListener('activate',event=>{
 event.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(k=>k.startsWith('design-listening-lab-')&&k!==CACHE).map(k=>caches.delete(k)));
  await self.clients.claim();
 })());
});
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==self.location.origin)return;
 if(request.mode==='navigate'){
  event.respondWith((async()=>{
   // Offline-first navigation: cached entry point remains usable without connection.
   const cache=await caches.open(CACHE);
   const cached=await cache.match(OFFLINE_PAGE);
   if(cached)return cached;
   try{return await fetch(request)}catch{return Response.error()}
  })());return;
 }
 event.respondWith((async()=>{
  const cache=await caches.open(CACHE);
  const cached=await cache.match(request,{ignoreSearch:true});
  if(cached)return cached;
  return fetch(request);
 })());
});
