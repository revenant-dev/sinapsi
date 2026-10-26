/* Sinapsi: service worker per l'uso offline.
   - Pagina, app.js e config.js: prima la rete (così gli aggiornamenti arrivano subito), poi la copia salvata.
   - Librerie, font e icone: prima la copia salvata, perché non cambiano.
   - Google (accesso e Drive) non passa mai di qui. */
const VERSION='sinapsi-v1';
const CORE=['./','index.html','app.js','config.js','manifest.webmanifest','fonts/fonts.css',
  'fonts/bricolage-grotesque-latin-opsz-normal.woff2','fonts/bricolage-grotesque-latin-ext-opsz-normal.woff2',
  'lib/three.min.js','lib/CopyShader.js','lib/LuminosityHighPassShader.js','lib/EffectComposer.js','lib/RenderPass.js',
  'lib/ShaderPass.js','lib/UnrealBloomPass.js','lib/OrbitControls.js','lib/sql-wasm.js','lib/sql-wasm.wasm',
  'icons/favicon.svg','icons/favicon-32.png','icons/icon-192.png','icons/icon-512.png','icons/apple-touch-icon.png'];
self.addEventListener('install',e=>{
  e.waitUntil(caches.open(VERSION).then(c=>Promise.all(CORE.map(u=>c.add(new Request(u,{cache:'reload'})).catch(()=>{})))).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==VERSION).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',e=>{
  const req=e.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(url.origin!==location.origin)return;
  const stable=/\/(lib|fonts|icons)\//.test(url.pathname);
  if(stable){
    e.respondWith(caches.match(req).then(hit=>hit||fetch(req).then(res=>{if(res.ok){const copy=res.clone();caches.open(VERSION).then(c=>c.put(req,copy));}return res;})));
    return;
  }
  e.respondWith(fetch(req).then(res=>{
    if(res.ok){const copy=res.clone();caches.open(VERSION).then(c=>c.put(req,copy));}
    return res;
  }).catch(()=>caches.match(req).then(hit=>hit||(req.mode==='navigate'?caches.match('index.html'):Response.error()))));
});
