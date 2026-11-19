/* The build replaces these two values with the exact app shell assets. */
const SHELL='__CACHE_NAME__';
const ASSETS=__ASSETS__;
const BASE=new URL('./',self.location.href);
/* Verified holiday files outlive app versions so offline recurrence keeps working. */
const HOLIDAYS='weekflow-holidays-'+BASE.pathname;
self.addEventListener('install',event=>event.waitUntil(caches.open(SHELL).then(cache=>cache.addAll(ASSETS.map(p=>new Request(new URL(p,BASE).href,{cache:'reload'}))))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('weekflow-shell-'+BASE.pathname)&&k!==SHELL).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('message',event=>{if(event.data==='ACTIVATE_UPDATE')self.skipWaiting()});
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==BASE.origin||!url.pathname.startsWith(BASE.pathname))return;
if(event.request.mode==='navigate'){event.respondWith(caches.open(SHELL).then(async cache=>(await cache.match(new URL('index.html',BASE).href))||fetch(event.request)));return;}
if(url.pathname.includes('/holidays/')){event.respondWith(fetch(event.request).then(async response=>{if(response.ok&&(response.headers.get('content-type')||'').includes('json')){const body=await response.clone().json();if(body.complete===true&&body.source==='KASI-SpcdeInfoService')(await caches.open(HOLIDAYS)).put(event.request,response.clone());}return response;}).catch(async()=>await caches.match(event.request)||new Response('Unavailable',{status:503})));return;}
if(ASSETS.some(p=>new URL(p,BASE).href===url.href))event.respondWith(caches.match(event.request,{ignoreVary:true}).then(cached=>cached||fetch(event.request)));
});
self.addEventListener('push',event=>{let payload={title:'WEEKFLOW',body:'플래너에서 알림을 확인하세요.',url:BASE.href+'#/planner'};try{payload={...payload,...event.data.json()}}catch{};event.waitUntil(self.registration.showNotification(payload.title,{body:payload.body,tag:payload.tag,icon:new URL('icon-192.png',BASE).href,badge:new URL('icon-192.png',BASE).href,data:{url:payload.url}}).then(()=>self.clients.matchAll({type:"window",includeUncontrolled:true})).then(clients=>{for(const client of clients)client.postMessage({type:"WEEKFLOW_PUSH_RECEIVED",tag:payload.tag});}));});
self.addEventListener('notificationclick',event=>{event.notification.close();let target=new URL(event.notification.data?.url||'#/planner',BASE);if(target.origin!==BASE.origin||!target.pathname.startsWith(BASE.pathname))target=new URL('#/planner',BASE);event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async clients=>{const existing=clients.find(c=>new URL(c.url).origin===BASE.origin&&new URL(c.url).pathname.startsWith(BASE.pathname));if(existing){await existing.navigate(target.href);return existing.focus()}return self.clients.openWindow(target.href)}));});
