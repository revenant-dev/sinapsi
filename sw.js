/* Sinapsi: service worker per l'uso offline.
   - Pagina, app.js e config.js: prima la rete (così gli aggiornamenti arrivano subito), poi la copia salvata.
   - Librerie, font e icone (tutti nella stessa cartella della pagina): prima la copia salvata, perché non cambiano.
   - Google (accesso e Drive) non passa mai di qui. */
const VERSION='sinapsi-v2';
const CORE=['./','index.html','app.js','config.js','manifest.webmanifest','fonts.css',
  'bricolage-grotesque-latin-opsz-normal.woff2','bricolage-grotesque-latin-ext-opsz-normal.woff2',
  'three.min.js','CopyShader.js','LuminosityHighPassShader.js','EffectComposer.js','RenderPass.js',
  'ShaderPass.js','UnrealBloomPass.js','OrbitControls.js','sql-wasm.js','sql-wasm.wasm',
  'favicon.svg','favicon-32.png','icon-192.png','icon-512.png','apple-touch-icon.png'];
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
  const stable=/\.(wasm|woff2|png|svg)$|(three\.min|CopyShader|LuminosityHighPassShader|EffectComposer|RenderPass|ShaderPass|UnrealBloomPass|OrbitControls|sql-wasm)\.js$/.test(url.pathname);
  if(stable){
    e.respondWith(caches.match(req).then(hit=>hit||fetch(req).then(res=>{if(res.ok){const copy=res.clone();caches.open(VERSION).then(c=>c.put(req,copy));}return res;})));
    return;
  }
  e.respondWith(fetch(req).then(res=>{
    if(res.ok){const copy=res.clone();caches.open(VERSION).then(c=>c.put(req,copy));}
    return res;
  }).catch(()=>caches.match(req).then(hit=>hit||(req.mode==='navigate'?caches.match('index.html'):Response.error()))));
});
