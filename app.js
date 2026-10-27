(function(){
'use strict';
if(window.top!==window.self){
  document.body.textContent='';
  const p=document.createElement('p');p.style.cssText='margin:40px auto;max-width:36ch;font:16px/1.5 system-ui,sans-serif;color:#e7e9ff;text-align:center';
  p.textContent='Per sicurezza Sinapsi non funziona dentro un’altra pagina. ';
  const a=document.createElement('a');a.href=location.href;a.target='_top';a.rel='noopener';a.textContent='Aprila a pagina intera';a.style.color='#9a89ff';
  p.appendChild(a);document.body.style.background='#060819';document.body.appendChild(p);return;
}
/* ===================== CONFIGURAZIONE ACCESSO E SINCRONIZZAZIONE =====================
   L’ID client OAuth di Google si scrive nel file config.js, accanto a questo index.html.
   Senza ID client (o aprendo il file dal disco) Sinapsi funziona solo in locale. */
const GOOGLE_CLIENT_ID=String((window.SINAPSI_CONFIG&&window.SINAPSI_CONFIG.googleClientId)||'').trim();
const DB_NAME='sinapsi.db';
/* ===================================================================================== */
const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
function mk(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e;}
function fatal(msg){const f=$('#fatal');f.textContent=msg;f.hidden=false;}

/* Copia pulita del documento, per esportare il visualizzatore */
const SOURCE_CLONE=(function(){
  try{
    const c=document.documentElement.cloneNode(true);
    c.querySelectorAll('script').forEach(s=>{
      const src=s.getAttribute('src')||'';
      if(!/^(lib\/[\w.-]+\.js|app\.js)$/.test(src))s.remove();
    });
    return c;
  }catch(e){return null;}
})();

if(!window.THREE||!THREE.OrbitControls){fatal('Non è stato possibile caricare la grafica 3D. Controlla la connessione e ricarica la pagina.');return;}

const EMBED=window.SINAPSI_EMBED||null;
const READONLY=!!(EMBED&&EMBED.readonly);
if(READONLY)document.body.classList.add('readonly');

const KEY2='sinapsi-v2',KEY1='sinapsi-mappa-v1',CLIPKEY='sinapsi-appunti';
const HUES=[188,258,318,36,150];
const SWATCHES=[[null,'Bianco'],[188,'Ciano'],[258,'Viola'],[318,'Magenta'],[36,'Ambra'],[150,'Verde']];
const LINK_TYPES=[['normal','Normale'],['maybe','Incerto'],['strong','Forte'],['arrow','Con direzione']];
const LAYOUTS=[
  ['force','Libera','Le idee si dispongono da sole come una rete di neuroni. Puoi spostarle e fissarle.'],
  ['sphere','Radiale','L’idea centrale al centro, i rami che si aprono a raggiera in tutte le direzioni.'],
  ['shells','A livelli','Ogni livello di profondità su un guscio sferico più ampio del precedente.'],
  ['tags','Per tag','Le idee si raccolgono in gruppi secondo il loro tag principale.'],
  ['timeline','Cronologia','Le idee in fila nel tempo, per scadenza o data di creazione, una corsia per ramo.']
];
const DEFAULT_SETTINGS={glow:1.1,pulses:1,spin:1,lite:false,linkLabels:true,constellations:true,minimap:innerWidth>720,dropAction:'ask',focus:true,fog:.5};
let fogK=1;
const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
const COARSE=matchMedia('(pointer: coarse)').matches;
const MAX_DPR=COARSE?1.75:2;
function isNarrow(){return matchMedia('(max-width: 720px)').matches;}
const hasClaude=!!(window.claude&&typeof window.claude.use==='function');
const dlCap=hasClaude?Promise.resolve(window.claude.use('downloads')).catch(()=>null):Promise.resolve(null);
let sampleFn=null;
if(hasClaude&&!READONLY)Promise.resolve(window.claude.use('sample')).then(s=>{sampleFn=s||null;document.body.classList.toggle('has-ai',!!s);}).catch(()=>{});
const DAY=86400000;
const IMP_SCALE=[1,.5,.75,1,1.55,2.25];
const fmtShort=new Intl.DateTimeFormat('it-IT',{day:'numeric',month:'short'});
const fmtLong=new Intl.DateTimeFormat('it-IT',{day:'numeric',month:'long',year:'numeric'});
const fmtStamp=new Intl.DateTimeFormat('it-IT',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});

/* ================= Renderer e scena ================= */
let renderer;
try{renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});}
catch(e){fatal('Questo browser non riesce ad avviare WebGL. Apri la pagina con Chrome, Edge, Firefox o Safari aggiornati.');return;}
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,MAX_DPR));
renderer.setSize(innerWidth,innerHeight);
renderer.xr.enabled=true;
$('#stage').appendChild(renderer.domElement);
const cv=renderer.domElement;

const scene=new THREE.Scene();
const BG=new THREE.Color('#060819');
scene.background=(function(){
  const c=document.createElement('canvas');c.width=c.height=512;const g=c.getContext('2d');
  let gr=g.createRadialGradient(256,230,0,256,256,380);
  gr.addColorStop(0,'#111640');gr.addColorStop(.45,'#090c26');gr.addColorStop(1,'#020309');
  g.fillStyle=gr;g.fillRect(0,0,512,512);
  gr=g.createRadialGradient(150,380,0,150,380,260);gr.addColorStop(0,'rgba(40,120,150,.10)');gr.addColorStop(1,'rgba(40,120,150,0)');g.fillStyle=gr;g.fillRect(0,0,512,512);
  gr=g.createRadialGradient(390,140,0,390,140,240);gr.addColorStop(0,'rgba(120,60,150,.10)');gr.addColorStop(1,'rgba(120,60,150,0)');g.fillStyle=gr;g.fillRect(0,0,512,512);
  const t=new THREE.CanvasTexture(c);return t;
})();
scene.fog=new THREE.FogExp2(BG,0.0017);
const world=new THREE.Group();scene.add(world);
const inner=new THREE.Group();world.add(inner);
const camera=new THREE.PerspectiveCamera(55,innerWidth/innerHeight,1,6000);
camera.position.set(0,60,340);
const controls=new THREE.OrbitControls(camera,cv);
controls.enableDamping=true;controls.dampingFactor=.08;controls.rotateSpeed=.6;controls.zoomSpeed=.9;controls.panSpeed=.8;
controls.minDistance=18;controls.maxDistance=2400;controls.autoRotateSpeed=.35;

let composer=null,bloomPass=null;
if(THREE.EffectComposer&&THREE.UnrealBloomPass){
  composer=new THREE.EffectComposer(renderer);
  composer.addPass(new THREE.RenderPass(scene,camera));
  bloomPass=new THREE.UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight),1.1,.62,.2);
  composer.addPass(bloomPass);
}

function glowTexture(){
  const c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d');
  const gr=g.createRadialGradient(64,64,0,64,64,64);
  gr.addColorStop(0,'rgba(255,255,255,1)');gr.addColorStop(.1,'rgba(255,255,255,.78)');gr.addColorStop(.3,'rgba(255,255,255,.22)');gr.addColorStop(.62,'rgba(255,255,255,.05)');gr.addColorStop(1,'rgba(255,255,255,0)');
  g.fillStyle=gr;g.fillRect(0,0,128,128);return new THREE.CanvasTexture(c);
}
function ringTexture(){
  const c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d');
  g.strokeStyle='#fff';g.lineWidth=6;g.shadowColor='#fff';g.shadowBlur=8;g.beginPath();g.arc(64,64,48,0,Math.PI*2);g.stroke();
  return new THREE.CanvasTexture(c);
}
function bokehTexture(){
  const c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d');
  const gr=g.createRadialGradient(64,64,0,64,64,62);
  gr.addColorStop(0,'rgba(255,255,255,.32)');gr.addColorStop(.72,'rgba(255,255,255,.26)');gr.addColorStop(.9,'rgba(255,255,255,.42)');gr.addColorStop(1,'rgba(255,255,255,0)');
  g.fillStyle=gr;g.fillRect(0,0,128,128);return new THREE.CanvasTexture(c);
}
const glowTex=glowTexture(),ringTex=ringTexture(),bokehTex=bokehTexture();

function randUnit(){const v=new THREE.Vector3();do{v.set(Math.random()*2-1,Math.random()*2-1,Math.random()*2-1);}while(v.lengthSq()>1||v.lengthSq()<1e-4);return v.normalize();}
function nodeColor(n){return n.hue==null?new THREE.Color('#ece8ff'):new THREE.Color().setHSL(n.hue/360,.9,.62);}
function cssColor(h){return h==null?'#ece8ff':'hsl('+h+' 90% 62%)';}
function newId(p){return (p||'n')+Date.now().toString(36)+Math.random().toString(36).slice(2,7);}
function plural(n,one,many){return n===1?'1 '+one:n+' '+many;}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

/* Shader per aloni e anelli: dimensione in unità del mondo, colore e trasparenza per punto */
const pointVS='attribute float asize;attribute float aalpha;attribute vec3 acolor;varying vec3 vC;varying float vA;uniform float uScale;uniform float uWorld;uniform float uFog;'+
  'void main(){vec4 mv=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*mv;float d=max(-mv.z,0.001);gl_PointSize=clamp(asize*uWorld*uScale/d,0.0,2048.0);float f=exp(-uFog*uFog*d*d);vC=acolor;vA=aalpha*f;}';
const pointFS='uniform sampler2D uMap;varying vec3 vC;varying float vA;void main(){vec4 t=texture2D(uMap,gl_PointCoord);float a=t.a*vA;if(a<0.003)discard;gl_FragColor=vec4(vC*t.rgb*a,1.0);}';
function pointMaterial(tex){
  return new THREE.ShaderMaterial({uniforms:{uMap:{value:tex},uScale:{value:1},uWorld:{value:1},uFog:{value:.0017}},vertexShader:pointVS,fragmentShader:pointFS,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});
}
const haloMat=pointMaterial(glowTex),ringMat=pointMaterial(ringTex),fiberMat=pointMaterial(glowTex),bokehMat=pointMaterial(bokehTex);
bokehMat.uniforms.uFog.value=0;
function updatePointScale(){
  const h=renderer.getDrawingBufferSize(new THREE.Vector2()).y;
  const s=h/(2*Math.tan(camera.fov*Math.PI/360));
  haloMat.uniforms.uScale.value=s;ringMat.uniforms.uScale.value=s;fiberMat.uniforms.uScale.value=s;bokehMat.uniforms.uScale.value=s;
}

const dust=(function(){
  const N=1600,p=new Float32Array(N*3);
  for(let i=0;i<N;i++){const v=randUnit().multiplyScalar(280+Math.random()*1100);p[i*3]=v.x;p[i*3+1]=v.y;p[i*3+2]=v.z;}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(p,3));
  const pts=new THREE.Points(g,new THREE.PointsMaterial({color:0x7f8ce0,size:2,map:glowTex,transparent:true,opacity:.42,depthWrite:false,blending:THREE.AdditiveBlending}));
  scene.add(pts);return pts;
})();
const bokeh=(function(){
  const N=90,g=new THREE.BufferGeometry(),p=new Float32Array(N*3),c=new Float32Array(N*3),sz=new Float32Array(N),al=new Float32Array(N);
  const hues=[188,258,318,36,150,215];
  for(let i=0;i<N;i++){
    const v=randUnit().multiplyScalar(650+Math.random()*900);p[i*3]=v.x;p[i*3+1]=v.y;p[i*3+2]=v.z;
    const col=new THREE.Color().setHSL(hues[i%hues.length]/360,.65,.55);c[i*3]=col.r;c[i*3+1]=col.g;c[i*3+2]=col.b;
    sz[i]=50+Math.random()*170;al[i]=.035+Math.random()*.075;
  }
  g.setAttribute('position',new THREE.BufferAttribute(p,3));g.setAttribute('acolor',new THREE.BufferAttribute(c,3));
  g.setAttribute('asize',new THREE.BufferAttribute(sz,1));g.setAttribute('aalpha',new THREE.BufferAttribute(al,1));
  const pts=new THREE.Points(g,bokehMat);pts.frustumCulled=false;pts.renderOrder=-1;scene.add(pts);return pts;
})();

/* ================= Geometrie condivise e istanze ================= */
const coreGeo=new THREE.SphereGeometry(1,28,20);
const coreMat=new THREE.ShaderMaterial({
  uniforms:{uFog:{value:.0017},uTime:{value:0},uBg:{value:new THREE.Color('#080b22')}},
  vertexShader:`varying vec3 vN;varying vec3 vV;varying vec3 vC;varying vec3 vP;varying float vD;
void main(){
  vec4 mv=modelViewMatrix*instanceMatrix*vec4(position,1.0);
  vN=normalize(mat3(modelViewMatrix*instanceMatrix)*normal);vV=normalize(-mv.xyz);
#ifdef USE_INSTANCING_COLOR
  vC=instanceColor;
#else
  vC=vec3(1.0);
#endif
  vP=position;vD=-mv.z;gl_Position=projectionMatrix*mv;
}`,
  fragmentShader:`uniform float uFog;uniform float uTime;uniform vec3 uBg;
varying vec3 vN;varying vec3 vV;varying vec3 vC;varying vec3 vP;varying float vD;
void main(){
  vec3 n=normalize(vN),v=normalize(vV);
  float ndv=clamp(dot(n,v),0.0,1.0);
  float rim=pow(1.0-ndv,2.3),core=pow(ndv,3.5);
  float lit=clamp(dot(n,normalize(vec3(-0.35,0.55,0.75))),0.0,1.0);
  float mem=0.5+0.5*sin(vP.x*7.0+uTime*0.7)*sin(vP.y*6.0-uTime*0.5)*sin(vP.z*8.0+uTime*0.3);
  float lum=max(max(vC.r,vC.g),vC.b);
  vec3 c=vC*(0.05+0.24*lit)+vC*core*(0.26+0.22*mem)+vC*rim*1.15+vec3(1.0)*pow(rim,5.0)*0.26*lum+vec3(1.0)*pow(core,9.0)*0.10*lum;
  float f=exp(-uFog*uFog*vD*vD);
  gl_FragColor=vec4(mix(uBg,c,f),1.0);
}`});
const coneGeo=new THREE.ConeGeometry(.9,2.6,10);coneGeo.translate(0,-1.3,0);
const coneMat=new THREE.MeshBasicMaterial({color:0xffffff});
const linkMat=new THREE.LineBasicMaterial({vertexColors:true,transparent:true,opacity:.85,blending:THREE.AdditiveBlending,depthWrite:false});
const twigMat=new THREE.LineBasicMaterial({vertexColors:true,transparent:true,opacity:1,blending:THREE.AdditiveBlending,depthWrite:false});
const TWIG_VERTS=300,SEG=20,TWIG_LIMIT=700;
let nodeCap=0,linkCap=0,coreMesh=null,haloPts=null,ringPts=null,twigLines=null,linkLines=null,coneMesh=null,fiberPts=null;
function dynAttr(n,size){return new THREE.BufferAttribute(new Float32Array(n*size),size).setUsage(THREE.DynamicDrawUsage);}
function ensureNodeCapacity(n){
  if(coreMesh&&n<=nodeCap)return;
  nodeCap=Math.max(64,Math.ceil(n*1.5));
  [coreMesh,haloPts,ringPts,twigLines].forEach(o=>{if(o){inner.remove(o);if(o.geometry&&o!==coreMesh)o.geometry.dispose();}});
  coreMesh=new THREE.InstancedMesh(coreGeo,coreMat,nodeCap);
  coreMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  coreMesh.instanceColor=new THREE.InstancedBufferAttribute(new Float32Array(nodeCap*3),3);
  coreMesh.frustumCulled=false;coreMesh.count=0;inner.add(coreMesh);
  const hg=new THREE.BufferGeometry();
  hg.setAttribute('position',dynAttr(nodeCap,3));hg.setAttribute('acolor',dynAttr(nodeCap,3));hg.setAttribute('asize',dynAttr(nodeCap,1));hg.setAttribute('aalpha',dynAttr(nodeCap,1));
  haloPts=new THREE.Points(hg,haloMat);haloPts.frustumCulled=false;inner.add(haloPts);
  const rg=new THREE.BufferGeometry();
  rg.setAttribute('position',dynAttr(nodeCap,3));rg.setAttribute('acolor',dynAttr(nodeCap,3));rg.setAttribute('asize',dynAttr(nodeCap,1));rg.setAttribute('aalpha',dynAttr(nodeCap,1));
  ringPts=new THREE.Points(rg,ringMat);ringPts.frustumCulled=false;inner.add(ringPts);
  const tg=new THREE.BufferGeometry();
  const tv=Math.min(nodeCap,TWIG_LIMIT)*TWIG_VERTS;
  tg.setAttribute('position',dynAttr(tv,3));tg.setAttribute('color',dynAttr(tv,3));
  twigLines=new THREE.LineSegments(tg,twigMat);twigLines.frustumCulled=false;inner.add(twigLines);
  geomDirty=styleDirty=true;
}
function ensureLinkCapacity(n){
  if(linkLines&&n<=linkCap)return;
  linkCap=Math.max(64,Math.ceil(n*1.5));
  if(linkLines){inner.remove(linkLines);linkLines.geometry.dispose();}
  if(coneMesh)inner.remove(coneMesh);
  if(fiberPts){inner.remove(fiberPts);fiberPts.geometry.dispose();}
  const fg=new THREE.BufferGeometry(),fc=linkCap*(SEG+4);
  fg.setAttribute('position',dynAttr(fc,3));fg.setAttribute('acolor',dynAttr(fc,3));fg.setAttribute('asize',dynAttr(fc,1));fg.setAttribute('aalpha',dynAttr(fc,1));
  fiberPts=new THREE.Points(fg,fiberMat);fiberPts.frustumCulled=false;inner.add(fiberPts);
  const lg=new THREE.BufferGeometry();
  lg.setAttribute('position',dynAttr(linkCap*SEG*6,3));lg.setAttribute('color',dynAttr(linkCap*SEG*6,3));
  linkLines=new THREE.LineSegments(lg,linkMat);linkLines.frustumCulled=false;inner.add(linkLines);
  coneMesh=new THREE.InstancedMesh(coneGeo,coneMat,linkCap);
  coneMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  coneMesh.instanceColor=new THREE.InstancedBufferAttribute(new Float32Array(linkCap*3),3);
  coneMesh.frustumCulled=false;coneMesh.count=0;inner.add(coneMesh);
  geomDirty=styleDirty=true;
}

/* ================= Stato ================= */
let store,map;
const nodes=new Map();
let nodeList=[],simList=[],links=[],simLinks=[];
let rootId=null,selected=null,pick=null,path=null,pathLinkList=[],pathLinks=null;
const multi=new Set();
let multiMode=false,focusMode=true,activeTag=null,pres=null,down=null,lasso=null,searchTerm='';
let alpha=1,anim=null,autoRotateOn=!reduceMotion,layoutMoving=false,geomDirty=true,styleDirty=true;
let undoStack=[],redoStack=[],clip=null,groups=[],ticks=[],timelineAxis=null;
const lastSel=new THREE.Vector3();
const labelsEl=$('#labels');
try{const c=localStorage.getItem(CLIPKEY);if(c&&!READONLY)clip=JSON.parse(c);}catch(e){}

/* ================= Dati ================= */
function blankNode(label,hue){return {id:newId(),label,note:'',hue:hue===undefined?null:hue,p:null,tags:[],img:null,pinned:false,collapsed:false,imp:3,due:null,created:Date.now()};}
function sampleMap(){
  const ns=[],ls=[];let i=0;const t0=Date.now()-30*DAY;
  const iso=d=>new Date(Date.now()+d*DAY).toISOString().slice(0,10);
  const add=(label,hue,parent,o)=>{o=o||{};const n={id:'n'+(++i),label,note:o.note||'',hue,p:null,tags:o.tags||[],img:null,pinned:false,collapsed:false,imp:o.imp||3,due:o.due||null,created:t0+i*DAY};ns.push(n);if(parent)ls.push({s:parent.id,t:n.id,label:o.ll||'',type:'normal'});return n;};
  const root=add('Viaggio in Sicilia',null,null,{imp:5,note:'Dieci giorni a giugno, in auto, da Palermo a Catania.\n\n- [x] Scegliere le date\n- [x] Prenotare il volo\n- [ ] Prenotare tutti gli alloggi\n- [ ] Noleggiare l’auto'});
  const tree=[
    ['Itinerario',188,{note:'Da ovest a est, con rientro da Catania.',imp:4},[
      ['Palermo',{tags:['città'],note:'- Mercato di Ballarò\n- Cattedrale\n- Teatro Massimo'}],
      ['Cefalù',{tags:['mare'],note:'Una mezza giornata: il duomo e la spiaggia.'}],
      ['Agrigento',{tags:['storia'],note:'Valle dei Templi: meglio verso il tramonto.'}],
      ['Siracusa',{tags:['storia','mare'],note:'Ortigia e il teatro greco.'}],
      ['Taormina',{tags:['città'],note:'Il teatro antico con vista sull’Etna.'}],
      ['Etna',{tags:['natura'],imp:4,due:iso(20),note:'- [ ] Prenotare l’escursione guidata ai crateri\n- [ ] Controllare il meteo il giorno prima'}]]],
    ['Trasporti',258,{note:'Come muoversi.'},[
      ['Volo',{tags:['prenotato'],note:'Andata su Palermo, ritorno da Catania.'}],
      ['Auto a noleggio',{tags:['da fare'],imp:4,due:iso(-2),note:'- [ ] Confrontare almeno tre preventivi\n- [ ] Scegliere l’assicurazione completa'}],
      ['Parcheggi',{note:'Nei centri storici ci sono le ZTL: meglio lasciare l’auto fuori.'}]]],
    ['Alloggi',318,{note:'Una base per zona.'},[
      ['B&B a Palermo',{tags:['prenotato']}],
      ['Agriturismo vicino ad Agrigento',{tags:['da fare'],due:iso(5)}],
      ['Casa a Ortigia',{tags:['da fare']}]]],
    ['Cucina',36,{note:'Da assaggiare almeno una volta.'},[
      ['Arancine',{}],['Pasta alla Norma',{}],['Cannoli',{}],
      ['Granita e brioche',{note:'A colazione, come si fa a Catania.'}]]],
    ['Da portare',150,{note:'Lista per la valigia.'},[
      ['Documenti',{imp:4,note:'- [x] Carta d’identità\n- [ ] Patente\n- [ ] Tessera sanitaria'}],
      ['Crema solare',{}],['Scarpe da trekking',{}]]]
  ];
  const by={};
  for(const [b,h,o,kids] of tree){const bn=add(b,h,root,o);for(const [k,ko] of kids)by[k]=add(k,h,bn,ko);}
  [['Etna','Scarpe da trekking','richiede','arrow'],['Auto a noleggio','Agrigento','serve per','arrow'],['B&B a Palermo','Palermo','si trova a','strong'],['Casa a Ortigia','Siracusa','si trova a','strong'],['Cannoli','Palermo','tipici di','maybe'],['Granita e brioche','Taormina','da provare a','normal']]
    .forEach(([a,b,l,t])=>ls.push({s:by[a].id,t:by[b].id,label:l,type:t}));
  return {id:null,name:'Viaggio in Sicilia',nodes:ns,links:ls,tour:[],layout:'sphere',views:[],versions:[],created:Date.now()};
}
function sanitizeMap(obj){
  if(!obj||!Array.isArray(obj.nodes))throw new Error('manca l’elenco “nodes”.');
  const ids=new Set(),base=Date.now()-obj.nodes.length*60000;
  const ns=obj.nodes.map((n,i)=>{
    if(!n||typeof n.label!=='string')throw new Error('l’idea numero '+(i+1)+' non ha un titolo.');
    const id=String(n.id!=null?n.id:'n'+i);
    if(ids.has(id))throw new Error('l’identificativo “'+id+'” compare due volte.');
    ids.add(id);
    const p=Array.isArray(n.p)&&n.p.length===3&&n.p.every(Number.isFinite)?n.p:null;
    const seenT=new Set();
    const tags=(Array.isArray(n.tags)?n.tags:[]).filter(t=>typeof t==='string').map(t=>t.trim().slice(0,24)).filter(t=>{const k=t.toLowerCase();if(!t||seenT.has(k))return false;seenT.add(k);return true;}).slice(0,12);
    const img=typeof n.img==='string'&&/^data:image\/(png|jpe?g|webp|gif);base64,/.test(n.img)&&n.img.length<3e6?n.img:null;
    return {id,label:n.label.slice(0,120)||'Senza titolo',note:typeof n.note==='string'?n.note.slice(0,20000):'',hue:typeof n.hue==='number'&&isFinite(n.hue)?n.hue:null,p,tags,img,
      pinned:!!n.pinned,collapsed:!!n.collapsed,imp:clamp(Math.round(+n.imp)||3,1,5),due:typeof n.due==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(n.due)?n.due:null,
      created:Number.isFinite(+n.created)&&+n.created>0?+n.created:base+i*60000,
      p3:Array.isArray(n.p3)&&n.p3.length===3&&n.p3.every(Number.isFinite)?n.p3:undefined};
  });
  if(!ns.length)throw new Error('la mappa non contiene idee.');
  const seen=new Set(),types=new Set(LINK_TYPES.map(t=>t[0]));
  const ls=(Array.isArray(obj.links)?obj.links:[])
    .filter(l=>l&&ids.has(String(l.s))&&ids.has(String(l.t))&&String(l.s)!==String(l.t))
    .map(l=>({s:String(l.s),t:String(l.t),label:typeof l.label==='string'?l.label.slice(0,40):'',type:types.has(l.type)?l.type:'normal'}))
    .filter(l=>{const k=[l.s,l.t].sort().join('|');if(seen.has(k))return false;seen.add(k);return true;});
  const tour=[...new Set((Array.isArray(obj.tour)?obj.tour:[]).map(String).filter(id=>ids.has(id)))];
  const views=(Array.isArray(obj.views)?obj.views:[]).filter(v=>v&&Array.isArray(v.t)&&Array.isArray(v.c)&&v.t.length===3&&v.c.length===3&&v.t.concat(v.c).every(Number.isFinite))
    .map(v=>({id:String(v.id||newId('v')),name:String(v.name||'Vista').slice(0,40),t:v.t,c:v.c})).slice(0,30);
  const versions=(Array.isArray(obj.versions)?obj.versions:[]).filter(v=>v&&typeof v.snap==='string').map(v=>({id:String(v.id||newId('s')),name:String(v.name||'Versione').slice(0,60),date:+v.date||Date.now(),count:+v.count||0,snap:v.snap})).slice(-20);
  return {id:typeof obj.id==='string'?obj.id:null,name:typeof obj.name==='string'&&obj.name.trim()?obj.name.trim().slice(0,60):'Mappa senza nome',nodes:ns,links:ls,tour,
    layout:LAYOUTS.some(l=>l[0]===obj.layout)?obj.layout:'sphere',view2d:!!obj.view2d,views,versions,created:Number(obj.created)||Date.now(),updated:Number(obj.updated)||0};
}
function loadStore(){
  if(EMBED&&EMBED.map){
    let m;try{m=sanitizeMap(EMBED.map);}catch(e){m=sampleMap();}
    m.id='embed';return {v:3,current:'embed',maps:{embed:m},settings:Object.assign({},DEFAULT_SETTINGS),deleted:{},owner:null};
  }
  try{
    const s=localStorage.getItem(KEY2);
    if(s){
      const o=JSON.parse(s);
      if(o&&o.maps&&typeof o.maps==='object'){
        const maps={};
        for(const k in o.maps){try{const m=sanitizeMap(o.maps[k]);m.id=k;maps[k]=m;}catch(e){}}
        const ids=Object.keys(maps);
        if(ids.length)return {v:3,current:maps[o.current]?o.current:ids[0],maps,settings:Object.assign({},DEFAULT_SETTINGS,o.settings||{}),deleted:o.deleted&&typeof o.deleted==='object'?o.deleted:{},owner:typeof o.owner==='string'?o.owner:null};
      }
    }
  }catch(e){}
  let first=null;
  try{const s=localStorage.getItem(KEY1);if(s){first=sanitizeMap(JSON.parse(s));first.name='La mia mappa';}}catch(e){}
  if(!first)first=sampleMap();
  first.id=newId('m');
  return {v:3,current:first.id,maps:{[first.id]:first},settings:Object.assign({},DEFAULT_SETTINGS),deleted:{},owner:null};
}
function syncPositions(){for(const n of map.nodes){const r=nodes.get(n.id);if(r)n.p=[+r.pos.x.toFixed(1),+r.pos.y.toFixed(1),+r.pos.z.toFixed(1)];}}
let saveTimer,quotaWarned=false;
function saveNow(){if(READONLY)return;clearTimeout(saveTimer);syncPositions();try{localStorage.setItem(KEY2,JSON.stringify(store));}catch(e){}}
function save(){
  if(READONLY)return;
  clearTimeout(saveTimer);
  saveTimer=setTimeout(()=>{
    syncPositions();
    try{localStorage.setItem(KEY2,JSON.stringify(store));}
    catch(e){if(!quotaWarned){quotaWarned=true;toast('Lo spazio di salvataggio del browser è pieno: elimina qualche versione o immagine, oppure scarica la mappa da Importa ed esporta.',7000);}}
  },400);
}
function exportMap(){syncPositions();return JSON.parse(JSON.stringify({v:3,name:map.name,nodes:map.nodes,links:map.links,tour:map.tour,layout:map.layout,view2d:!!map.view2d,views:map.views}));}

/* Annulla e ripristina */
function snapshot(){syncPositions();return JSON.stringify({nodes:map.nodes,links:map.links,tour:map.tour});}
function commit(){if(READONLY)return;touch();undoStack.push(snapshot());if(undoStack.length>60)undoStack.shift();redoStack=[];updateUndoUI();}
function restore(json){
  touch();
  const o=JSON.parse(json);
  const m=sanitizeMap({nodes:o.nodes,links:o.links,tour:o.tour});
  map.nodes=m.nodes;map.links=m.links;map.tour=m.tour;
  const keep=selected;
  build({keepCamera:true});
  if(keep&&nodes.has(keep)&&!nodes.get(keep).hidden)selectNode(keep,{fly:false});
  save();updateUndoUI();
}
function undo(){if(!undoStack.length||pres||READONLY)return;redoStack.push(snapshot());restore(undoStack.pop());toast('Modifica annullata.');}
function redo(){if(!redoStack.length||pres||READONLY)return;undoStack.push(snapshot());restore(redoStack.pop());toast('Modifica ripristinata.');}
function updateUndoUI(){$('#b-undo').disabled=$('#m-undo').disabled=!undoStack.length;$('#b-redo').disabled=$('#m-redo').disabled=!redoStack.length;}

/* ================= Nodi ================= */
function makeTwigs(){
  const pts=[],ks=[];const count=6+(Math.random()*5|0);
  const grow=(p,d,len,steps,k0,depth)=>{
    const step=len/steps;
    for(let s=0;s<steps&&pts.length<(TWIG_VERTS-2)*3;s++){
      d.add(randUnit().multiplyScalar(.28)).normalize();
      const q=p.clone().addScaledVector(d,step);
      pts.push(p.x,p.y,p.z,q.x,q.y,q.z);ks.push(k0*(1-s/steps),k0*(1-(s+1)/steps));
      if(depth<2&&s>=1&&s<steps-1&&Math.random()<.3){const fd=d.clone().add(randUnit().multiplyScalar(.85)).normalize();grow(q.clone(),fd,len*.55,Math.max(2,steps-s-1),k0*(1-s/steps)*.85,depth+1);}
      p=q;
    }
  };
  for(let i=0;i<count;i++){const d=randUnit();grow(d.clone().multiplyScalar(.92),d,1.6+Math.random()*3.4,7,1,0);}
  return {p:new Float32Array(pts),k:new Float32Array(ks)};
}
function buildNode(n){
  const r={id:n.id,data:n,pos:n.p?new THREE.Vector3(n.p[0],n.p[1],n.p[2]):new THREE.Vector3(),vel:new THREE.Vector3(),target:null,
    deg:0,out:0,nb:new Set(),flash:0,radius:3,vis:false,L:1,hidden:false,hiddenCount:0,imgSprite:null,twig:makeTwigs(),
    hc:new THREE.Color(),tParent:null,tKids:[],depth:0,branch:null,own:{done:0,total:0},prog:{done:0,total:0},dueState:null,onscreen:false};
  r.color=nodeColor(n);
  const el=mk('div','label');
  el.addEventListener('click',e=>{e.stopPropagation();hideHint();handlePick(n.id,e);});
  labelsEl.appendChild(el);
  r.el=el;
  nodes.set(n.id,r);
  setNodeImage(r);
  return r;
}
function disposeNode(r){
  if(r.imgSprite){inner.remove(r.imgSprite);r.imgSprite.material.map.dispose();r.imgSprite.material.dispose();r.imgSprite=null;}
  r.el.remove();
}
function setNodeImage(r){
  if(r.imgSprite){inner.remove(r.imgSprite);r.imgSprite.material.map.dispose();r.imgSprite.material.dispose();r.imgSprite=null;}
  const src=r.data.img;if(!src)return;
  const im=new Image();
  im.onload=()=>{
    if(nodes.get(r.id)!==r||r.data.img!==src)return;
    const c=document.createElement('canvas');c.width=c.height=256;const g=c.getContext('2d');
    g.save();g.beginPath();g.arc(128,128,116,0,Math.PI*2);g.clip();
    const s=Math.max(256/im.width,256/im.height);
    g.drawImage(im,(256-im.width*s)/2,(256-im.height*s)/2,im.width*s,im.height*s);g.restore();
    g.lineWidth=12;g.strokeStyle='#'+r.color.getHexString();g.beginPath();g.arc(128,128,118,0,Math.PI*2);g.stroke();
    const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c),color:0xc4c4c4,transparent:true}));
    sp.renderOrder=2;inner.add(sp);r.imgSprite=sp;styleDirty=true;applyStyles();
  };
  im.src=src;
}
function dueInfo(r){
  const d=r.data.due;if(!d)return null;
  const today=new Date();today.setHours(0,0,0,0);
  const dd=new Date(d+'T00:00:00');const days=Math.round((dd-today)/DAY);
  const complete=r.prog.total>0&&r.prog.done===r.prog.total;
  let state=complete?'done':days<0?'late':days<=3?'soon':'later';
  return {days,state,date:dd};
}
function renderLabel(r){
  scheduleSide();
  const el=r.el;el.textContent='';
  const lab=r.data.label;
  if(searchTerm&&lab.toLowerCase().includes(searchTerm)){
    const i=lab.toLowerCase().indexOf(searchTerm);
    el.append(lab.slice(0,i));const m=mk('mark',null,lab.slice(i,i+searchTerm.length));el.append(m,lab.slice(i+searchTerm.length));
  }else el.append(lab);
  if(r.data.collapsed&&r.hiddenCount)el.appendChild(mk('span','more',' +'+r.hiddenCount));
  if(r.prog.total){const pc=Math.round(r.prog.done/r.prog.total*100);el.appendChild(mk('span','prog'+(pc===100?' full':''),' '+pc+'%'));}
  const di=dueInfo(r);r.dueState=di?di.state:null;
  if(di&&di.state!=='done')el.appendChild(mk('span','due '+(di.state==='late'?'late':di.state==='soon'?'soon':''),' '+fmtShort.format(di.date)));
  el.classList.toggle('pinned',!!r.data.pinned&&map.layout==='force');
  el.classList.toggle('root',!!r.isRoot);
  el.classList.toggle('imp',r.data.imp>=4);
}

/* ================= Collegamenti ================= */
function buildLink(l){
  const a=nodes.get(l.s),b=nodes.get(l.t);if(!a||!b||a===b)return null;
  const rt={data:l,a,b,pts:new Float32Array((SEG+1)*3),seed:randUnit(),ctrl:new THREE.Vector3(),len:50,k:.6,dead:false,el:null,vis:false,visible:true};
  links.push(rt);renderLinkLabel(rt);return rt;
}
function disposeLink(l){l.dead=true;if(l.el){l.el.remove();l.el=null;}}
function renderLinkLabel(l){
  const show=store.settings.linkLabels&&l.data.label;
  if(show){if(!l.el){l.el=mk('div','link-label');labelsEl.appendChild(l.el);l.vis=false;}l.el.textContent=l.data.label;}
  else if(l.el){l.el.remove();l.el=null;}
}
function rebuildLinks(){for(const l of links)disposeLink(l);links=[];map.links.forEach(buildLink);}
const _ab=new THREE.Vector3(),_perp=new THREE.Vector3(),_q=new THREE.Vector3(),_p=new THREE.Vector3(),_c=new THREE.Vector3(),_d=new THREE.Vector3(),_v=new THREE.Vector3(),_m=new THREE.Matrix4(),_quat=new THREE.Quaternion(),_up=new THREE.Vector3(0,1,0),_col=new THREE.Color();
function linkCtrl(rt){
  const a=rt.a.pos,b=rt.b.pos;_ab.subVectors(b,a);const len=_ab.length()||1;
  _perp.crossVectors(_ab,rt.seed);if(_perp.lengthSq()<1e-6)_perp.set(0,1,0);
  _perp.normalize().multiplyScalar(len*.16);rt.ctrl.addVectors(a,b).multiplyScalar(.5).add(_perp);
}
function bez(rt,t,out){const u=1-t,a=rt.a.pos,b=rt.b.pos,c=rt.ctrl;return out.set(u*u*a.x+2*u*t*c.x+t*t*b.x,u*u*a.y+2*u*t*c.y+t*t*b.y,u*u*a.z+2*u*t*c.z+t*t*b.z);}
function linkBetween(a,b){return links.find(l=>(l.a.id===a&&l.b.id===b)||(l.a.id===b&&l.b.id===a));}

/* ================= Topologia ================= */
function computeHidden(){
  const out=new Map();
  for(const l of map.links)(out.get(l.s)||out.set(l.s,[]).get(l.s)).push(l.t);
  const collapsed=new Set(map.nodes.filter(n=>n.collapsed).map(n=>n.id));
  const hidden=new Set(),descOf=new Map();
  if(collapsed.size){
    const all=new Set();
    for(const c of collapsed){
      const desc=new Set(),st=[...(out.get(c)||[])];
      while(st.length){const x=st.pop();if(x===c||desc.has(x))continue;desc.add(x);(out.get(x)||[]).forEach(y=>st.push(y));}
      descOf.set(c,desc);desc.forEach(x=>all.add(x));
    }
    const incoming=new Set(map.links.map(l=>l.t));
    const roots=map.nodes.filter(n=>!incoming.has(n.id)).map(n=>n.id);
    if(rootId&&!roots.includes(rootId))roots.unshift(rootId);
    const vis=new Set(roots),q=[...roots];
    while(q.length){const x=q.shift();if(collapsed.has(x))continue;for(const y of out.get(x)||[])if(!vis.has(y)){vis.add(y);q.push(y);}}
    for(const x of all)if(!vis.has(x))hidden.add(x);
  }
  for(const r of nodes.values()){
    r.hidden=hidden.has(r.id);
    const d=descOf.get(r.id);let c=0;if(d)d.forEach(x=>{if(hidden.has(x))c++;});r.hiddenCount=c;
  }
}
function computeTree(){
  for(const r of nodeList){r.tParent=null;r.tKids=[];r.depth=0;r.branch=null;}
  const out=new Map();for(const l of links)(out.get(l.a.id)||out.set(l.a.id,[]).get(l.a.id)).push(l.b);
  const seen=new Set(),order=[];
  const bfs=start=>{const q=[start];while(q.length){const x=q.shift();order.push(x);for(const y of out.get(x.id)||[]){if(seen.has(y.id))continue;seen.add(y.id);y.tParent=x;y.depth=x.depth+1;x.tKids.push(y);q.push(y);}}};
  const root=nodes.get(rootId);
  if(root){seen.add(root.id);bfs(root);}
  let changed=true;
  while(seen.size<nodeList.length&&changed){
    changed=false;
    for(const r of nodeList){
      if(seen.has(r.id))continue;
      const nb=[...r.nb].map(id=>nodes.get(id)).find(x=>seen.has(x.id));
      if(nb){seen.add(r.id);r.tParent=nb;r.depth=nb.depth+1;nb.tKids.push(r);bfs(r);changed=true;}
    }
    if(!changed){const r=nodeList.find(x=>!seen.has(x.id));if(r){seen.add(r.id);r.depth=1;bfs(r);changed=true;}}
  }
  for(const r of nodeList){let x=r;while(x.tParent&&x.tParent!==root)x=x.tParent;r.branch=(x===root)?null:x;}
  for(const r of nodeList){const o={done:0,total:0};const re=/^\s*[-*+]\s+\[([ xX])\]/gm;let m;while((m=re.exec(r.data.note||''))){o.total++;if(m[1]!==' ')o.done++;}r.own=o;r.prog={done:o.done,total:o.total};}
  for(let i=order.length-1;i>=0;i--){const r=order[i];if(r.tParent){r.tParent.prog.done+=r.prog.done;r.tParent.prog.total+=r.prog.total;}}
  return order;
}
function refreshTopology(){
  rootId=map.nodes.length?map.nodes[0].id:null;
  for(const r of nodes.values()){r.deg=0;r.out=0;r.nb=new Set();r.isRoot=r.id===rootId;}
  for(const l of links){l.a.deg++;l.b.deg++;l.a.out++;l.a.nb.add(l.b.id);l.b.nb.add(l.a.id);}
  nodeList=[...nodes.values()];
  computeHidden();
  computeTree();
  for(const r of nodeList){
    r.radius=((r.isRoot?5:2.3)+Math.sqrt(r.deg)*.85)*IMP_SCALE[r.data.imp];
    renderLabel(r);
  }
  for(const l of links){
    l.len=24+9*Math.sqrt(Math.min(l.a.deg,l.b.deg))+((l.a.isRoot||l.b.isRoot)?24:0)+Math.max(0,l.a.radius+l.b.radius-8)*.9;
    l.visible=!(l.a.hidden||l.b.hidden);
  }
  simList=nodeList.filter(r=>!r.hidden);
  simLinks=links.filter(l=>l.visible);
  ensureNodeCapacity(nodeList.length);ensureLinkCapacity(links.length);
  for(const id of [...multi])if(!nodes.has(id)||nodes.get(id).hidden)multi.delete(id);
  if(selected){const s=nodes.get(selected);if(!s||s.hidden){selected=null;closePanel();}}
  computeGroups();
  if(map.layout!=='force')computeLayout(true);
  updateBrand();
  geomDirty=true;
  applyStyles();
  updateAgendaBadge();scheduleSide();
}
function bfsDist(start,max){
  const dist=new Map([[start,0]]),q=[start];
  while(q.length){const x=q.shift(),d=dist.get(x);if(d>=max)continue;for(const y of nodes.get(x).nb){const ry=nodes.get(y);if(ry.hidden||dist.has(y))continue;dist.set(y,d+1);q.push(y);}}
  return dist;
}
function applyStyles(){
  const sel=selected?nodes.get(selected):null;
  const dist=null;
  const pathSet=path?new Set(path):null;
  for(const r of nodeList){
    let L=1;
    if(pathSet)L=pathSet.has(r.id)?1:.1;
    else if(multi.size>1)L=multi.has(r.id)?1:.4;
    else if(sel){
      if(r===sel||sel.nb.has(r.id))L=1;
      else if(dist)L=dist.has(r.id)?.45:.03;
      else L=.35;
    }
    if(activeTag&&!r.data.tags.includes(activeTag))L=Math.min(L,.1);
    r.L=L;
    r.el.classList.toggle('sel',r===sel);
    r.el.classList.toggle('multi',multi.has(r.id));
    if(r.imgSprite)r.imgSprite.material.color.setScalar(.78*Math.max(L,.08));
  }
  for(const l of links){
    let k;
    if(pathLinks)k=pathLinks.has(l)?1:.05;
    else if(multi.size>1)k=(multi.has(l.a.id)&&multi.has(l.b.id))?1:Math.min(l.a.L,l.b.L)*.4;
    else if(sel)k=(l.a===sel||l.b===sel)?1:Math.min(l.a.L,l.b.L)*.3;
    else k=Math.min(l.a.L,l.b.L)*.6;
    if(l.data.type==='strong')k=Math.min(1,k*1.35);
    if(l.data.type==='maybe')k*=.8;
    l.k=k;
  }
  styleDirty=true;
}

/* ================= Disposizioni ================= */
function spiral(n){
  const out=[];let phi=0;
  for(let i=0;i<n;i++){
    const y=n===1?0:-1+2*i/(n-1);const r=Math.sqrt(Math.max(0,1-y*y));
    if(i>0&&i<n-1)phi+=3.6/Math.sqrt(n*(1-y*y));
    out.push(new THREE.Vector3(Math.cos(phi)*r,y,Math.sin(phi)*r));
  }
  return out;
}
function fib(n){const out=[],g=Math.PI*(3-Math.sqrt(5));for(let i=0;i<n;i++){const y=n===1?0:1-2*(i+.5)/n,r=Math.sqrt(1-y*y);out.push(new THREE.Vector3(Math.cos(g*i)*r,y,Math.sin(g*i)*r));}return out;}
function nodeDate(r){return r.data.due?Date.parse(r.data.due+'T12:00:00'):r.data.created;}
function clearTimeline(){ticks.forEach(t=>t.el.remove());ticks=[];if(timelineAxis){inner.remove(timelineAxis);timelineAxis.geometry.dispose();timelineAxis=null;}}
function circle(n){const out=[];for(let i=0;i<n;i++){const a=2*Math.PI*i/Math.max(1,n)-Math.PI/2;out.push(new THREE.Vector3(Math.cos(a),Math.sin(a),0));}return out;}
function sunflower(n){const out=[],g=Math.PI*(3-Math.sqrt(5));for(let i=0;i<n;i++){const r=Math.sqrt((i+.5)/n);out.push(new THREE.Vector3(Math.cos(g*i)*r,Math.sin(g*i)*r,0));}return out;}
function flatUnit(){const v=randUnit();if(is2D){v.z=0;if(v.lengthSq()<1e-4)v.set(1,0,0);v.normalize();}return v;}
function computeLayout(silent){
  clearTimeline();
  const mode=map.layout||'force';
  if(mode==='force'){for(const r of nodeList)r.target=null;layoutMoving=false;if(!silent)reheat(.6);return;}
  const vis=simList,root=nodes.get(rootId);
  const kidsV=r=>r.tKids.filter(k=>!k.hidden);
  const tops=vis.filter(r=>!r.tParent||r.tParent.hidden);
  const pre=[];const dfsPre=r=>{pre.push(r);kidsV(r).forEach(dfsPre);};tops.forEach(dfsPre);
  const V=(x,y,z)=>new THREE.Vector3(x,y,z);
  if(mode==='sphere'){
    const leaves=pre.filter(r=>!kidsV(r).length&&r!==root);
    const dirs=is2D?circle(leaves.length):spiral(leaves.length);leaves.forEach((l,i)=>{l._dir=dirs[i];});
    const post=r=>{const k=kidsV(r);if(!k.length)return r._dir||(r._dir=flatUnit());const v=new THREE.Vector3();k.forEach(c=>v.add(post(c)));r._dir=v.lengthSq()>1e-6?v.normalize():flatUnit();return r._dir;};
    tops.forEach(post);
    for(const r of vis)r.target=r===root?V(0,0,0):r._dir.clone().multiplyScalar(Math.max(1,r.depth)*64);
  }else if(mode==='shells'){
    const byD=new Map();for(const r of pre){const d=r===root?0:Math.max(1,r.depth);(byD.get(d)||byD.set(d,[]).get(d)).push(r);}
    for(const [d,list] of byD){
      if(d===0){list.forEach((r,i)=>{r.target=V(i*20,0,0);});continue;}
      const pts=is2D?circle(list.length):spiral(list.length),R=d*72+Math.sqrt(list.length)*4;
      list.forEach((r,i)=>{r.target=pts[i].multiplyScalar(R);});
    }
  }else if(mode==='tags'){
    const freq=new Map();for(const r of vis)for(const t of r.data.tags)freq.set(t,(freq.get(t)||0)+1);
    const key=r=>{let best='',bc=-1;for(const t of r.data.tags){const c=freq.get(t);if(c>bc||(c===bc&&t<best)){best=t;bc=c;}}return best;};
    const grp=new Map();for(const r of pre){const k=key(r);(grp.get(k)||grp.set(k,[]).get(k)).push(r);}
    const named=[...grp.keys()].filter(k=>k);const centers=is2D?circle(named.length):fib(named.length);const R=150+named.length*10;
    const centerOf=new Map();named.forEach((k,i)=>centerOf.set(k,centers[i].multiplyScalar(R)));centerOf.set('',V(0,0,0));
    for(const [k,list] of grp){const c=centerOf.get(k),pts=is2D?sunflower(list.length):spiral(list.length),rr=list.length===1?0:10+Math.sqrt(list.length)*11;list.forEach((r,i)=>{r.target=c.clone().addScaledVector(pts[i],rr);});}
  }else if(mode==='timeline'){
    const ts=vis.map(nodeDate),min=Math.min(...ts),max=Math.max(...ts),span=max-min;
    const W=Math.max(340,vis.length*13);
    const lanesArr=root?kidsV(root):[];const laneOf=new Map(lanesArr.map((b,i)=>[b.id,i]));
    const L=Math.max(1,lanesArr.length);
    const sorted=[...vis].sort((a,b)=>nodeDate(a)-nodeDate(b));
    sorted.forEach((r,i)=>{
      const x=span>0?-W+2*W*(nodeDate(r)-min)/span:(i-(sorted.length-1)/2)*24;
      let lane=r.branch&&laneOf.has(r.branch.id)?laneOf.get(r.branch.id):(r===root?-1:L);
      const y=(r===root?(L/2+1)*62:-(lane-(L-1)/2)*62)+(is2D&&r!==root?((i%3)-1)*14:0);
      const z=is2D||r===root?0:-(r.depth-1)*16+((i%3)-1)*6;
      r.target=V(x,y,z);
    });
    const yAxis=-(L/2+1)*62-20;
    const g=new THREE.BufferGeometry().setFromPoints([V(-W-30,yAxis,0),V(W+30,yAxis,0)]);
    timelineAxis=new THREE.Line(g,new THREE.LineBasicMaterial({color:0x6c78c8,transparent:true,opacity:.7}));inner.add(timelineAxis);
    const nT=span>0?4:0;
    for(let i=0;i<=nT;i++){const t=min+span*i/nT;const el=mk('div','tick',fmtShort.format(new Date(t))+' '+new Date(t).getFullYear());labelsEl.appendChild(el);ticks.push({el,pos:V(-W+2*W*i/nT,yAxis-10,0),vis:false});}
  }
  layoutMoving=true;
}
function setLayout(mode){
  if(map.layout===mode)return;
  map.layout=mode;if(mode!=='force')morph=null;computeLayout();computeGroups();
  for(const r of nodeList)renderLabel(r);
  save();updateLayoutState();
  if(mode==='force')toast('Disposizione libera: le idee tornano a muoversi da sole.');
  else toast('Disposizione: '+LAYOUTS.find(l=>l[0]===mode)[1].toLowerCase()+'.');
  setTimeout(()=>{if(!selected)flyToFit(simList.map(r=>({pos:r.target||r.pos})),is2D?FRONT.clone():mode==='timeline'?new THREE.Vector3(0,.12,1):null);},50);
}
function updateLayoutState(){$('#m-layout-state').textContent=LAYOUTS.find(l=>l[0]===map.layout)[1];}

/* Gruppi per i nomi da lontano */
function computeGroups(){
  groups.forEach(g=>g.el.remove());groups=[];
  if(!store.settings.constellations)return;
  const lane=map.layout==='timeline';
  const add=(text,color,members)=>{if(members.length<(lane?1:2))return;const el=mk('div','constellation'+(lane?' lane':''),text);el.style.color=color;labelsEl.appendChild(el);groups.push({el,members,vis:false,lane});};
  if(map.layout==='tags'){
    const by=new Map();for(const r of simList)for(const t of r.data.tags.slice(0,1))(by.get(t)||by.set(t,[]).get(t)).push(r);
    for(const [t,m] of by)add('#'+t,'rgba(200,206,255,.9)',m);
  }else{
    const root=nodes.get(rootId);if(!root)return;
    for(const b of root.tKids){if(b.hidden)continue;const m=simList.filter(r=>r.branch===b);const c=b.color;add(b.data.label,'rgb('+Math.round(c.r*255)+','+Math.round(c.g*255)+','+Math.round(c.b*255)+')',m);}
  }
}

/* ================= Simulazione (con Barnes-Hut oltre 180 idee) ================= */
const CHARGE=1400,SPRING=.12,GRAV=.006,DECAY=.62,ALPHA_DECAY=.99,ALPHA_MIN=.004,THETA2=1;
function reheat(a){alpha=Math.max(alpha,a);}
function addForce(r,x,y,z,m,a){
  let dx=x-r.pos.x,dy=y-r.pos.y,dz=z-r.pos.z,d2=dx*dx+dy*dy+dz*dz;
  if(d2>360000)return;
  if(d2<1){dx=Math.random()-.5;dy=Math.random()-.5;dz=Math.random()-.5;d2=1;}
  const f=CHARGE*a*m/d2/Math.sqrt(d2);r.vel.x-=dx*f;r.vel.y-=dy*f;r.vel.z-=dz*f;
}
function cell(x,y,z,s){return {x,y,z,s,m:0,cx:0,cy:0,cz:0,body:null,kids:null,extra:null};}
function bhInsert(c,r,depth){
  c.m++;c.cx+=r.pos.x;c.cy+=r.pos.y;c.cz+=r.pos.z;
  if(!c.kids){
    if(!c.body&&!c.extra){c.body=r;return;}
    if(depth>22){(c.extra||(c.extra=[])).push(r);return;}
    const b=c.body;c.body=null;c.kids=[null,null,null,null,null,null,null,null];
    if(b)bhKid(c,b,depth);
  }
  bhKid(c,r,depth);
}
function bhKid(c,r,depth){
  const h=c.s/2,ix=r.pos.x>=c.x+h?1:0,iy=r.pos.y>=c.y+h?1:0,iz=r.pos.z>=c.z+h?1:0,i=ix+iy*2+iz*4;
  if(!c.kids[i])c.kids[i]=cell(c.x+ix*h,c.y+iy*h,c.z+iz*h,h);
  bhInsert(c.kids[i],r,depth+1);
}
function bhForce(c,r,a){
  if(!c||!c.m)return;
  if(!c.kids){
    if(c.body&&c.body!==r)addForce(r,c.body.pos.x,c.body.pos.y,c.body.pos.z,1,a);
    if(c.extra)for(const b of c.extra)if(b!==r)addForce(r,b.pos.x,b.pos.y,b.pos.z,1,a);
    return;
  }
  const cx=c.cx/c.m,cy=c.cy/c.m,cz=c.cz/c.m,dx=cx-r.pos.x,dy=cy-r.pos.y,dz=cz-r.pos.z,d2=dx*dx+dy*dy+dz*dz;
  if(c.s*c.s<THETA2*d2){addForce(r,cx,cy,cz,c.m,a);return;}
  for(const k of c.kids)bhForce(k,r,a);
}
function simulate(){
  const dragIds=down&&down.dragging?down.moving:null;
  if(morph){
    let maxd=0;
    for(const [r,t] of morph){if(dragIds&&dragIds.has(r.id))continue;maxd=Math.max(maxd,r.pos.distanceTo(t));if(reduceMotion)r.pos.copy(t);else r.pos.lerp(t,.12);r.vel.set(0,0,0);}
    geomDirty=true;
    if(maxd<.4){for(const [r,t] of morph)if(!(dragIds&&dragIds.has(r.id)))r.pos.copy(t);morph=null;if(map.layout==='force')reheat(.3);save();}
    return;
  }
  if(map.layout!=='force'){
    if(!layoutMoving)return;
    let maxd=0;
    for(const r of simList){
      if(!r.target||(dragIds&&dragIds.has(r.id)))continue;
      const d=r.pos.distanceTo(r.target);maxd=Math.max(maxd,d);
      if(reduceMotion)r.pos.copy(r.target);else r.pos.lerp(r.target,.1);
    }
    geomDirty=true;
    if(maxd<.05){layoutMoving=false;save();}
    return;
  }
  if(alpha<ALPHA_MIN)return;
  const arr=simList,n=arr.length;
  if(n>180){
    let x0=Infinity,y0=Infinity,z0=Infinity,x1=-Infinity,y1=-Infinity,z1=-Infinity;
    for(const r of arr){const p=r.pos;if(p.x<x0)x0=p.x;if(p.y<y0)y0=p.y;if(p.z<z0)z0=p.z;if(p.x>x1)x1=p.x;if(p.y>y1)y1=p.y;if(p.z>z1)z1=p.z;}
    const root=cell(x0-1,y0-1,z0-1,Math.max(x1-x0,y1-y0,z1-z0)+2);
    for(const r of arr)bhInsert(root,r,0);
    for(const r of arr)bhForce(root,r,alpha);
  }else{
    for(let i=0;i<n;i++){
      const a=arr[i];
      for(let j=i+1;j<n;j++){
        const b=arr[j];
        let dx=b.pos.x-a.pos.x,dy=b.pos.y-a.pos.y,dz=b.pos.z-a.pos.z,d2=dx*dx+dy*dy+dz*dz;
        if(d2>360000)continue;
        if(d2<1){dx=Math.random()-.5;dy=Math.random()-.5;dz=Math.random()-.5;d2=1;}
        const f=CHARGE*alpha/d2/Math.sqrt(d2);dx*=f;dy*=f;dz*=f;
        a.vel.x-=dx;a.vel.y-=dy;a.vel.z-=dz;b.vel.x+=dx;b.vel.y+=dy;b.vel.z+=dz;
      }
    }
  }
  for(const l of simLinks){
    const a=l.a,b=l.b;let dx=b.pos.x-a.pos.x,dy=b.pos.y-a.pos.y,dz=b.pos.z-a.pos.z;
    const d=Math.sqrt(dx*dx+dy*dy+dz*dz)||1,k=(d-l.len)/d*SPRING*alpha*.5;
    dx*=k;dy*=k;dz*=k;a.vel.x+=dx;a.vel.y+=dy;a.vel.z+=dz;b.vel.x-=dx;b.vel.y-=dy;b.vel.z-=dz;
  }
  for(const r of arr){
    if(r.data.pinned||(dragIds&&dragIds.has(r.id))){r.vel.set(0,0,0);continue;}
    r.vel.addScaledVector(r.pos,-GRAV*alpha).multiplyScalar(DECAY);r.pos.add(r.vel);
    if(is2D){r.pos.z=0;r.vel.z=0;}
  }
  alpha*=ALPHA_DECAY;geomDirty=true;
  if(alpha<ALPHA_MIN)save();
}
function seedPositions(){
  const placed=new Set();
  for(const start of nodeList){
    if(placed.has(start.id))continue;
    if(!start.data.p)start.pos.copy(placed.size?randUnit().multiplyScalar(120):new THREE.Vector3());
    placed.add(start.id);const queue=[start];
    while(queue.length){
      const r=queue.shift();
      for(const id of r.nb){const nb=nodes.get(id);if(placed.has(nb.id))continue;placed.add(nb.id);if(!nb.data.p)nb.pos.copy(r.pos).addScaledVector(randUnit(),35);queue.push(nb);}
    }
  }
}

/* ================= Impulsi ================= */
const MAXI=360,TAIL=3;
const iPos=new Float32Array(MAXI*3*TAIL),iCol=new Float32Array(MAXI*3*TAIL);
const iGeo=new THREE.BufferGeometry();
iGeo.setAttribute('position',new THREE.BufferAttribute(iPos,3).setUsage(THREE.DynamicDrawUsage));
iGeo.setAttribute('color',new THREE.BufferAttribute(iCol,3).setUsage(THREE.DynamicDrawUsage));
const iMat=new THREE.PointsMaterial({size:7,map:glowTex,vertexColors:true,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});
const iPts=new THREE.Points(iGeo,iMat);iPts.frustumCulled=false;inner.add(iPts);
let impulses=[],spawnAcc=0;
function spawnImpulse(){
  if(impulses.length>=MAXI)return;
  if(pathLinkList.length){const pl=pathLinkList[Math.random()*pathLinkList.length|0];impulses.push({l:pl.l,t:0,fwd:pl.fwd,speed:80+Math.random()*50});return;}
  const pool0=simLinks.filter(l=>l.k>.08);if(!pool0.length)return;
  let pool=pool0,fromSel=false;
  if(selected){const own=pool0.filter(l=>l.a.id===selected||l.b.id===selected);if(own.length&&Math.random()<.6){pool=own;fromSel=true;}}
  const l=pool[Math.random()*pool.length|0];
  let fwd=fromSel?l.a.id===selected:Math.random()<.5;
  if(l.data.type==='arrow')fwd=true;
  impulses.push({l,t:0,fwd,speed:(l.data.type==='strong'?100:70)+Math.random()*60});
}
function updateImpulses(dt){
  const s=store.settings;
  const rate=(reduceMotion?.3:1)*(s.lite?.5:1)*s.pulses*Math.min(40,3+simLinks.length*.5)*(pathLinkList.length?1.6:1);
  spawnAcc+=dt*rate;while(spawnAcc>1){spawnAcc--;spawnImpulse();}
  let n=0;const keep=[];
  for(const im of impulses){
    if(im.l.dead||!im.l.visible)continue;
    const len=im.l.a.pos.distanceTo(im.l.b.pos)||1;
    im.t+=dt*im.speed/len;
    if(im.t>=1){(im.fwd?im.l.b:im.l.a).flash=1;continue;}
    keep.push(im);
    const src=im.fwd?im.l.a:im.l.b,k=Math.sin(Math.PI*im.t)*Math.min(1,im.l.k*1.3),dt2=Math.min(.05,9/len);
    for(let q=0;q<TAIL;q++){
      const tt=im.t-q*dt2;if(tt<0)break;
      bez(im.l,im.fwd?tt:1-tt,_p);const kq=k*(q===0?1:q===1?.42:.16);
      iPos[n*3]=_p.x;iPos[n*3+1]=_p.y;iPos[n*3+2]=_p.z;
      iCol[n*3]=(src.color.r*.6+.4)*kq;iCol[n*3+1]=(src.color.g*.6+.4)*kq;iCol[n*3+2]=(src.color.b*.6+.4)*kq;
      n++;
    }
  }
  impulses=keep;iGeo.setDrawRange(0,n);
  iGeo.attributes.position.needsUpdate=true;iGeo.attributes.color.needsUpdate=true;
}

/* ================= Aggiornamento della grafica ================= */
const LATE=new THREE.Color('#ff4d6d'),SOON=new THREE.Color('#ffb547'),C_SEL=new THREE.Color('#ffcf70'),C_MULTI=new THREE.Color('#8fe9ff'),C_DROP=new THREE.Color('#7dffa8');
function updateNodesGfx(time){
  const n=nodeList.length,lite=store.settings.lite;
  const ha=haloPts.geometry.attributes,hp=ha.position.array,hcol=ha.acolor.array,hs=ha.asize.array,hal=ha.aalpha.array;
  const cc=coreMesh.instanceColor.array;
  for(let i=0;i<n;i++){
    const r=nodeList[i],p=r.pos;
    const s=r.hidden||r.imgSprite?0:r.radius;
    _m.makeScale(s,s,s);_m.setPosition(p);coreMesh.setMatrixAt(i,_m);
    hp[i*3]=p.x;hp[i*3+1]=p.y;hp[i*3+2]=p.z;
    let size=r.radius*(4.2+12/(r.radius+2))*(1+r.flash*.7),alpha=r.hidden?0:(r.id===selected?.62:.5)*r.L*(.75+r.data.imp*.07)*(r.isRoot?.55:1);
    _col.copy(r.color);
    if(r.dueState==='late'){_col.lerp(LATE,.65);size*=1+.3*Math.max(0,Math.sin(time*4));}
    else if(r.dueState==='soon'){_col.lerp(SOON,.4);size*=1+.15*Math.max(0,Math.sin(time*2.2));}
    hcol[i*3]=_col.r;hcol[i*3+1]=_col.g;hcol[i*3+2]=_col.b;hs[i]=r.hidden?0:size;hal[i]=alpha;
    if(styleDirty){const k=Math.max(r.L,.03);cc[i*3]=r.color.r*k;cc[i*3+1]=r.color.g*k;cc[i*3+2]=r.color.b*k;}
    if(r.imgSprite){r.imgSprite.visible=!r.hidden;r.imgSprite.position.copy(p);r.imgSprite.scale.setScalar(r.radius*3.6);}
  }
  coreMesh.count=n;coreMesh.instanceMatrix.needsUpdate=true;if(styleDirty)coreMesh.instanceColor.needsUpdate=true;
  haloPts.geometry.setDrawRange(0,n);ha.position.needsUpdate=ha.acolor.needsUpdate=ha.asize.needsUpdate=ha.aalpha.needsUpdate=true;
  /* anelli di selezione */
  const ra=ringPts.geometry.attributes;let k=0;
  const ring=(r,c,scale)=>{if(!r||r.hidden||k>=nodeCap)return;ra.position.array.set([r.pos.x,r.pos.y,r.pos.z],k*3);ra.acolor.array.set([c.r,c.g,c.b],k*3);ra.asize.array[k]=r.radius*(r.imgSprite?7.6:4.4)*scale;ra.aalpha.array[k]=.95;k++;};
  const pulse=1+Math.sin(time*3.2)*.08;
  if(selected)ring(nodes.get(selected),C_SEL,pulse);
  for(const id of multi)ring(nodes.get(id),C_MULTI,1);
  const dd=(down&&down.drop)||(pendingDrop&&pendingDrop.drop);if(dd)ring(nodes.get(dd),C_DROP,1.2+Math.sin(time*8)*.1);
  ringPts.geometry.setDrawRange(0,k);ra.position.needsUpdate=ra.acolor.needsUpdate=ra.asize.needsUpdate=ra.aalpha.needsUpdate=true;
  /* dendriti e collegamenti: solo quando qualcosa si è mosso o è cambiato lo stile */
  if(!(geomDirty||styleDirty))return;
  const tw=twigLines.geometry.attributes,tp=tw.position.array,tc=tw.color.array;let tv=0;
  if(!lite&&n<=TWIG_LIMIT){
    for(const r of nodeList){
      if(r.hidden||r.imgSprite)continue;
      const t=r.twig.p,tk=r.twig.k,rad=r.radius,kk=.62*r.L;
      if((tv+t.length/3)*3>tp.length)break;
      for(let j=0,q=0;j<t.length;j+=3,q++){const o=tv*3,f=kk*(.15+.85*tk[q]);tp[o]=r.pos.x+t[j]*rad;tp[o+1]=r.pos.y+t[j+1]*rad;tp[o+2]=r.pos.z+t[j+2]*rad;tc[o]=r.color.r*f;tc[o+1]=r.color.g*f;tc[o+2]=r.color.b*f;tv++;}
    }
  }
  twigLines.geometry.setDrawRange(0,tv);tw.position.needsUpdate=tw.color.needsUpdate=true;
  const la=linkLines.geometry.attributes,lp=la.position.array,lc=la.color.array;let lv=0,cones=0;
  const cmc=coneMesh.instanceColor.array;
  const segN=simLinks.length>600?10:SEG;
  const fa=fiberPts.geometry.attributes,fp=fa.position.array,fcl=fa.acolor.array,fsz=fa.asize.array,fal=fa.aalpha.array;let fv=0;
  const fiberOn=!lite&&simLinks.length<=1500;
  const fpt=(x,y,z,r,g,b,size,a)=>{if(fv>=fsz.length)return;fp[fv*3]=x;fp[fv*3+1]=y;fp[fv*3+2]=z;fcl[fv*3]=r;fcl[fv*3+1]=g;fcl[fv*3+2]=b;fsz[fv]=size;fal[fv]=a;fv++;};
  for(const l of links){
    if(!l.visible)continue;
    linkCtrl(l);
    const pts=l.pts;for(let i=0;i<=segN;i++){bez(l,i/segN,_q);pts[i*3]=_q.x;pts[i*3+1]=_q.y;pts[i*3+2]=_q.z;}
    const ca=l.a.color,cb=l.b.color,kk=Math.min(1,l.k),type=l.data.type;
    const copies=type==='strong'?[0,1,-1]:[0];
    let ox=0,oy=0,oz=0;
    if(type==='strong'){_ab.subVectors(l.b.pos,l.a.pos);_perp.crossVectors(_ab,camera.position.clone().sub(l.a.pos)).normalize();const w=.45+_ab.length()*.004;ox=_perp.x*w;oy=_perp.y*w;oz=_perp.z*w;}
    for(const cpy of copies){
      for(let i=0;i<segN;i++){
        if(type==='maybe'&&i%2===1)continue;
        for(let j=i;j<=i+1;j++){
          const t=j/segN,m=(.32+.68*Math.pow(Math.abs(2*t-1),1.5))*kk*(cpy?.55:1),o=lv*3;
          lp[o]=pts[j*3]+ox*cpy;lp[o+1]=pts[j*3+1]+oy*cpy;lp[o+2]=pts[j*3+2]+oz*cpy;
          lc[o]=(ca.r*(1-t)+cb.r*t)*m;lc[o+1]=(ca.g*(1-t)+cb.g*t)*m;lc[o+2]=(ca.b*(1-t)+cb.b*t)*m;lv++;
        }
      }
    }
    if(fiberOn&&kk>.04){
      const len=l.a.pos.distanceTo(l.b.pos)||1,w=type==='strong'?3.4:2.3;
      for(let i=3;i<segN-2;i+=2){const t=i/segN;fpt(pts[i*3],pts[i*3+1],pts[i*3+2],ca.r*(1-t)+cb.r*t,ca.g*(1-t)+cb.g*t,ca.b*(1-t)+cb.b*t,w*(1.2+len*.012),(type==='maybe'?.035:.06)*kk);}
      if(type!=='arrow'){
        const tEnd=Math.max(.5,1-(l.b.radius*1.12)/len);bez(l,tEnd,_p);
        fpt(_p.x,_p.y,_p.z,cb.r*.7+.3,cb.g*.7+.3,cb.b*.7+.3,2.6+l.b.radius*.35,.85*kk);
      }
    }
    if(type==='arrow'&&cones<linkCap){
      const tEnd=Math.max(.5,1-(l.b.radius*1.6+1)/Math.max(1,l.a.pos.distanceTo(l.b.pos)));
      bez(l,tEnd,_p);bez(l,tEnd-.04,_c);_d.subVectors(_p,_c).normalize();
      _quat.setFromUnitVectors(_up,_d);const sc=1.1+Math.min(1.2,l.len*.008);
      _m.compose(_p,_quat,_v.set(sc,sc,sc));coneMesh.setMatrixAt(cones,_m);
      cmc[cones*3]=cb.r*kk;cmc[cones*3+1]=cb.g*kk;cmc[cones*3+2]=cb.b*kk;cones++;
    }
  }
  linkLines.geometry.setDrawRange(0,lv);la.position.needsUpdate=la.color.needsUpdate=true;
  fiberPts.geometry.setDrawRange(0,fv);fa.position.needsUpdate=fa.acolor.needsUpdate=fa.asize.needsUpdate=fa.aalpha.needsUpdate=true;
  coneMesh.count=cones;coneMesh.instanceMatrix.needsUpdate=true;coneMesh.instanceColor.needsUpdate=true;
  geomDirty=styleDirty=false;
}

/* ================= Costruzione ================= */
function fitPose(list,forceDir){
  const c=new THREE.Vector3();list.forEach(r=>c.add(r.pos));c.divideScalar(list.length||1);
  let R=0;list.forEach(r=>{R=Math.max(R,r.pos.distanceTo(c));});
  const fov=camera.fov*Math.PI/180;
  let dist=(R+30)/Math.sin(fov/2);
  if(camera.aspect<1)dist/=Math.max(camera.aspect,.55);
  dist=Math.max(dist,120);
  const dir=forceDir?forceDir.clone():camera.position.clone().sub(controls.target);if(dir.lengthSq()<1e-6)dir.set(0,.25,1);dir.normalize();
  return {target:c,dist,pos:c.clone().addScaledVector(dir,dist)};
}
function clearScene(){for(const r of nodes.values())disposeNode(r);for(const l of links)disposeLink(l);nodes.clear();links=[];impulses=[];}
function build(opts){
  opts=opts||{};
  clearScene();
  selected=null;pick=null;anim=null;multi.clear();
  path=null;pathLinkList=[];pathLinks=null;$('#pathbar').hidden=true;
  document.body.classList.remove('picking');updateBars();
  closePanel();
  is2D=!!map.view2d;morph=null;applyDimControls();
  const fresh=!map.nodes.every(n=>n.p);
  map.nodes.forEach(buildNode);map.links.forEach(buildLink);
  refreshTopology();
  if(is2D)nodeList.forEach(r=>{r.pos.z=0;});
  if(fresh){seedPositions();if(is2D)nodeList.forEach(r=>{r.pos.z=0;});if(map.layout==='force'){alpha=1;for(let i=0;i<420;i++)simulate();alpha=.15;}}
  else alpha=.03;
  if(map.layout!=='force'){computeLayout(true);if(fresh)for(const r of simList)if(r.target)r.pos.copy(r.target);}
  geomDirty=styleDirty=true;
  if(!opts.keepCamera){const o=fitPose(simList.length?simList:nodeList,is2D?FRONT:null);controls.target.copy(o.target);camera.position.copy(o.pos);controls.update();}
  renderFilters();updateLayoutState();
}
function updateBrand(){
  $('#map-name').textContent=map.name;
  $('#count').textContent=plural(map.nodes.length,'idea','idee')+(READONLY?', sola lettura':'');
  document.title='Sinapsi - Web App';
}

/* ================= Camera ================= */
function flyTo(node,point,dist){
  const dir=camera.position.clone().sub(controls.target);if(dir.lengthSq()<1e-6)dir.set(0,0,1);dir.normalize();
  anim={node,point:point?point.clone():null,fc:camera.position.clone(),ft:controls.target.clone(),offset:dir.multiplyScalar(dist),t0:performance.now(),dur:reduceMotion?0:1100};
}
function flyPose(target,cam){anim={node:null,point:target.clone(),fc:camera.position.clone(),ft:controls.target.clone(),offset:cam.clone().sub(target),t0:performance.now(),dur:reduceMotion?0:1200};}
function flyToFit(list,dir){if(!list.length)return;const o=fitPose(list,dir);if(dir)flyPose(o.target,o.pos);else flyTo(null,o.target,o.dist);}
function updateCamera(now){
  const sel=selected?nodes.get(selected):null;
  if(anim){
    const tgt=anim.node?anim.node.pos:anim.point;
    const e=anim.dur?Math.min(1,(now-anim.t0)/anim.dur):1;
    const k=e<.5?4*e*e*e:1-Math.pow(-2*e+2,3)/2;
    controls.target.lerpVectors(anim.ft,tgt,k);
    _c.copy(tgt).add(anim.offset);camera.position.lerpVectors(anim.fc,_c,k);
    if(e>=1){anim=null;if(sel)lastSel.copy(sel.pos);}
  }else if(sel&&(focusMode||pres)){_d.subVectors(sel.pos,lastSel);camera.position.add(_d);controls.target.add(_d);lastSel.copy(sel.pos);}
  controls.autoRotate=autoRotateOn&&!is2D&&!sel&&!anim&&!path&&!multi.size&&!down&&!lasso&&!pick&&!pendingDrop;
}
function overview(){deselect();clearMulti();clearPath();flyToFit(simList.length?simList:nodeList,is2D?FRONT:null);}

/* ================= Vista 2D / 3D ================= */
let is2D=false,morph=null;
const FRONT=new THREE.Vector3(0,0,1);
function applyDimControls(){
  controls.enableRotate=!is2D;
  controls.mouseButtons={LEFT:is2D?THREE.MOUSE.PAN:THREE.MOUSE.ROTATE,MIDDLE:THREE.MOUSE.DOLLY,RIGHT:THREE.MOUSE.PAN};
  controls.touches={ONE:is2D?THREE.TOUCH.PAN:THREE.TOUCH.ROTATE,TWO:THREE.TOUCH.DOLLY_PAN};
  const b=$('#b-dim');b.textContent=is2D?'3D':'2D';
  const t=is2D?'Torna alla vista 3D':'Passa alla vista 2D';b.setAttribute('aria-label',t);b.title=t;
}
function setDim(v){
  if(is2D===v||renderer.xr.isPresenting)return;
  if(pres)stopPresentation();
  is2D=v;map.view2d=v;touch();morph=new Map();
  if(v){
    for(const r of nodeList){r.data.p3=[+r.pos.x.toFixed(1),+r.pos.y.toFixed(1),+r.pos.z.toFixed(1)];morph.set(r,new THREE.Vector3(r.pos.x,r.pos.y,0));}
  }else{
    for(const r of nodeList){const p3=r.data.p3;morph.set(r,p3?new THREE.Vector3().fromArray(p3):new THREE.Vector3(r.pos.x,r.pos.y,(Math.random()-.5)*60));delete r.data.p3;}
  }
  applyDimControls();
  if(map.layout!=='force'){morph=null;computeLayout(true);}
  const list=simList.map(r=>({pos:morph?morph.get(r):(r.target||r.pos)}));
  flyToFit(list,v?FRONT:new THREE.Vector3(.35,.3,1));
  syncMenu();save();
  toast(v?'Vista 2D: trascina lo sfondo per spostarti, pizzica o usa la rotella per lo zoom. La disposizione 3D resta memorizzata.':'Vista 3D: trascina lo sfondo per ruotare la mappa.',4500);
}

/* ================= Etichette, proiezioni, nomi dei rami ================= */
const LABEL_MAX=COARSE?80:160;
function project(p){_v.copy(p).project(camera);return _v;}
function updateLabels(){
  const w=innerWidth,h=innerHeight,tanH=Math.tan(camera.fov*Math.PI/360);
  const cand=[];
  for(const r of nodeList){
    r.onscreen=false;
    if(r.hidden)continue;
    project(r.pos);
    const d=camera.position.distanceTo(r.pos);
    r.sx=(_v.x*.5+.5)*w;r.sy=(-_v.y*.5+.5)*h;r.sd=d;
    r.sr=r.radius*(r.imgSprite?1.8:1)/(d*tanH)*(h/2);
    r.onscreen=_v.z<1&&_v.x>-1.15&&_v.x<1.15&&_v.y>-1.15&&_v.y<1.15;
    if(!r.onscreen)continue;
    const isSel=r.id===selected||multi.has(r.id);
    let o=clamp(1.55-d/(480*fogK),0,1);
    if(r.isRoot)o=Math.max(o,.7);
    if(r.data.imp>=5)o=Math.max(o,clamp(1.9-d/(600*fogK),0,.9));
    if(isSel)o=1;
    if(r.L<1&&!isSel)o*=r.L*.9;
    if(o>.05)cand.push([r,o,isSel]);
  }
  if(cand.length>LABEL_MAX){cand.sort((a,b)=>(b[2]-a[2])||(a[0].sd-b[0].sd));cand.length=LABEL_MAX;}
  const shown=new Set();
  for(const [r,o,isSel] of cand){
    shown.add(r);
    const off=r.sr+4;let s=clamp(200/r.sd,.55,1.3);if(isSel)s=Math.max(s,1.05);
    r.lx=r.sx;r.ly=r.sy-off;r.ls=s;r.lo=o;
    r.el.style.transform='translate3d('+r.sx.toFixed(1)+'px,'+(r.sy-off).toFixed(1)+'px,0) translate(-50%,-100%) scale('+s.toFixed(3)+')';
    r.el.style.opacity=o.toFixed(2);r.el.style.zIndex=String(100000-Math.round(r.sd));
  }
  for(const r of nodeList){const v=shown.has(r);if(v!==r.vis){r.el.style.display=v?'block':'none';r.vis=v;}}
  for(const l of links){
    if(!l.el)continue;
    let show=l.visible&&l.k>.08;
    if(show){
      bez(l,.5,_p);project(_p);const d=camera.position.distanceTo(_p);
      const o=clamp(1.3-d/(380*fogK),0,1)*Math.min(1,l.k*1.4);
      show=_v.z<1&&o>.05&&Math.abs(_v.x)<1.1&&Math.abs(_v.y)<1.1;
      if(show){
        const x=(_v.x*.5+.5)*w,y=(-_v.y*.5+.5)*h,s=clamp(180/d,.6,1.2);
        l.lx=x;l.ly=y;l.ls=s;l.lo=o;
        l.el.style.transform='translate3d('+x.toFixed(1)+'px,'+y.toFixed(1)+'px,0) translate(-50%,-50%) scale('+s.toFixed(3)+')';
        l.el.style.opacity=o.toFixed(2);
      }
    }
    if(show!==l.vis){l.el.style.display=show?'block':'none';l.vis=show;}
  }
  for(const g of groups){
    let show=g.lane||(!selected&&!path&&multi.size<2);
    if(show&&g.lane){
      let lm=null;for(const r of g.members)if(!lm||r.pos.x<lm.pos.x)lm=r;
      _p.set(lm.pos.x-18,lm.pos.y,lm.pos.z);project(_p);
      show=_v.z<1&&Math.abs(_v.x)<1.3&&Math.abs(_v.y)<1.1;
      if(show){const x=(_v.x*.5+.5)*w,y=(-_v.y*.5+.5)*h;g.el.style.transform='translate3d('+x.toFixed(1)+'px,'+y.toFixed(1)+'px,0) translate(-100%,-50%)';g.el.style.opacity='.85';}
    }else if(show){
      _c.set(0,0,0);let mx=-Infinity;for(const r of g.members)_c.add(r.pos);_c.divideScalar(g.members.length);
      for(const r of g.members)mx=Math.max(mx,r.pos.y);
      _p.set(_c.x,mx+14,_c.z);
      const d=camera.position.distanceTo(_c);const o=clamp((d-340)/360,0,.42);
      project(_p);show=o>.03&&_v.z<1&&Math.abs(_v.x)<1.1&&Math.abs(_v.y)<1.1;
      if(show){const x=(_v.x*.5+.5)*w,y=(-_v.y*.5+.5)*h,s=clamp(700/d,.55,1.1);g.el.style.transform='translate3d('+x.toFixed(1)+'px,'+y.toFixed(1)+'px,0) translate(-50%,-100%) scale('+s.toFixed(3)+')';g.el.style.opacity=o.toFixed(2);}
    }
    if(show!==g.vis){g.el.style.display=show?'block':'none';g.vis=show;}
  }
  for(const t of ticks){
    project(t.pos);const show=_v.z<1&&Math.abs(_v.x)<1.1&&Math.abs(_v.y)<1.1;
    if(show){t.el.style.transform='translate3d('+((_v.x*.5+.5)*w).toFixed(1)+'px,'+((-_v.y*.5+.5)*h).toFixed(1)+'px,0) translate(-50%,0)';}
    if(show!==t.vis){t.el.style.display=show?'block':'none';t.vis=show;}
  }
}

/* ================= Minimappa ================= */
const mm=$('#minimap'),mmc=mm.getContext('2d');let mmFrame=0,mmView=null;
function drawMinimap(){
  if(mm.hidden)return;
  const W=mm.width,H=mm.height;mmc.clearRect(0,0,W,H);
  const list=simList;if(!list.length)return;
  const vz=p=>is2D?-p.y:p.z;
  let cx=0,cz=0;list.forEach(r=>{cx+=r.pos.x;cz+=vz(r.pos);});cx/=list.length;cz/=list.length;
  let R=40;list.forEach(r=>{R=Math.max(R,Math.hypot(r.pos.x-cx,vz(r.pos)-cz));});R*=1.15;
  const sx=x=>W/2+(x-cx)/R*(W/2-10),sz=z=>H/2+(z-cz)/R*(H/2-10);
  mmView={cx,cz,R,W,H};
  mmc.globalCompositeOperation='lighter';
  for(const r of list){
    const k=Math.max(r.L,.15);mmc.fillStyle='rgba('+(r.color.r*255|0)+','+(r.color.g*255|0)+','+(r.color.b*255|0)+','+(.85*k)+')';
    const s=r.id===selected?5:(r.isRoot?4:2.4);mmc.beginPath();mmc.arc(sx(r.pos.x),sz(vz(r.pos)),s,0,7);mmc.fill();
  }
  mmc.globalCompositeOperation='source-over';
  if(is2D){
    const d=camera.position.distanceTo(controls.target),hh=d*Math.tan(camera.fov*Math.PI/360),hw=hh*camera.aspect,k=(W/2-10)/R;
    mmc.strokeStyle='#ffcf70';mmc.lineWidth=3;mmc.fillStyle='rgba(255,207,112,.12)';
    mmc.beginPath();mmc.rect(sx(controls.target.x-hw),sz(-controls.target.y-hh),2*hw*k,2*hh*k);mmc.fill();mmc.stroke();
    return;
  }
  const px=clamp(sx(camera.position.x),8,W-8),pz=clamp(sz(camera.position.z),8,H-8);
  const tx=sx(controls.target.x),tz=sz(controls.target.z);
  const ang=Math.atan2(tz-pz,tx-px);
  mmc.fillStyle='rgba(255,207,112,.22)';mmc.beginPath();mmc.moveTo(px,pz);mmc.arc(px,pz,46,ang-.5,ang+.5);mmc.closePath();mmc.fill();
  mmc.fillStyle='#ffcf70';mmc.beginPath();mmc.arc(px,pz,5,0,7);mmc.fill();
}
mm.addEventListener('click',e=>{
  if(!mmView)return;const b=mm.getBoundingClientRect();
  const x=(e.clientX-b.left)/b.width*mmView.W,z=(e.clientY-b.top)/b.height*mmView.H;
  const wx=mmView.cx+(x-mmView.W/2)/(mmView.W/2-10)*mmView.R,wz=mmView.cz+(z-mmView.H/2)/(mmView.H/2-10)*mmView.R;
  deselect();clearMulti();
  if(is2D){const t=new THREE.Vector3(wx,-wz,0),d=camera.position.distanceTo(controls.target);flyPose(t,t.clone().add(new THREE.Vector3(0,0,d)));return;}
  const t=new THREE.Vector3(wx,controls.target.y,wz);
  flyTo(null,t,Math.max(140,camera.position.distanceTo(controls.target)*.7));
});

/* ================= Ciclo ================= */
/* Nebbia proporzionata alla distanza della camera: le idee inquadrate restano nitide
   anche da lontano, solo quelle molto più in profondità si attenuano. */
function updateFog(){
  const cd=Math.max(1,camera.position.distanceTo(controls.target));
  fogK=Math.max(1,cd/340);
  const f=+store.settings.fog;
  const dens=.0017*(Number.isFinite(f)?f:.5)/fogK;
  scene.fog.density=dens;
  haloMat.uniforms.uFog.value=ringMat.uniforms.uFog.value=fiberMat.uniforms.uFog.value=coreMat.uniforms.uFog.value=dens;
}
function renderFrame(){
  const s=store.settings;
  if(renderer.xr.isPresenting){renderer.render(scene,camera);return;}
  updateFog();
  if(composer&&!s.lite&&s.glow>0)composer.render();else renderer.render(scene,camera);
}
let last=performance.now(),time=0;
function loop(now){
  now=now||performance.now();
  const dt=Math.min(.05,(now-last)/1000);last=now;time+=dt;
  coreMat.uniforms.uTime.value=time;
  simulate();
  for(const r of simList)if(r.flash>0)r.flash=Math.max(0,r.flash-dt*2.2);
  updateNodesGfx(time);
  updateImpulses(dt);
  if(renderer.xr.isPresenting){vrTick(dt);renderFrame();return;}
  updateCamera(now);controls.update();
  renderFrame();
  updateLabels();
  if(++mmFrame%4===0)drawMinimap();
}

/* ================= Note: formattazione, attività, evidenziazione ================= */
function inlineMd(s){
  const codes=[];
  s=s.replace(/`([^`]+)`/g,(m,c)=>{codes.push(c);return '\u0000'+(codes.length-1)+'\u0000';});
  s=s.replace(/\[([^\]]+)\]\(((?:https?:\/\/|mailto:)[^\s)]+)\)/g,'<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  s=s.replace(/(^|[\s(])(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g,'$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>');
  s=s.replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>');
  s=s.replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\*)/g,'$1<em>$2</em>');
  s=s.replace(/\u0000(\d+)\u0000/g,(m,i)=>'<code>'+codes[+i]+'</code>');
  return s;
}
function md(text){
  const lines=esc(text||'').split('\n');let html='',list=null,para=[];
  const flush=()=>{if(para.length){html+='<p>'+para.map(inlineMd).join('<br>')+'</p>';para=[];}};
  const close=()=>{if(list){html+='</'+list+'>';list=null;}};
  const open=t=>{flush();if(list!==t){close();html+='<'+t+'>';list=t;}};
  for(const raw of lines){
    const line=raw.trimEnd();
    const tk=line.match(/^\s*[-*+]\s+\[([ xX])\]\s*(.*)$/),ol=line.match(/^\s*\d+[.)]\s+(.*)$/),li=line.match(/^\s*[-*+]\s+(.*)$/),h=line.match(/^\s*#{1,6}\s+(.*)$/);
    if(tk){open('ul');html+='<li class="task'+(tk[1]!==' '?' done':'')+'"><span class="cb" contenteditable="false"></span>'+inlineMd(tk[2])+'</li>';}
    else if(ol){open('ol');html+='<li>'+inlineMd(ol[1])+'</li>';}
    else if(li){open('ul');html+='<li>'+inlineMd(li[1])+'</li>';}
    else if(h){flush();close();html+='<h4>'+inlineMd(h[1])+'</h4>';}
    else if(!line.trim()){flush();close();}
    else{close();para.push(line);}
  }
  flush();close();return html;
}
/* Dall’editor visuale al testo salvato */
function htmlToMd(root){
  const one=s=>s.replace(/\s*\n\s*/g,' ').replace(/[ \t]+/g,' ').trim();
  const inl=n=>{
    if(n.nodeType===3)return n.nodeValue.replace(/\u00a0/g,' ');
    if(n.nodeType!==1)return '';
    if(n.classList.contains('cb'))return '';
    const t=n.tagName,kids=()=>[...n.childNodes].map(inl).join('');
    if(t==='BR')return '\n';
    if(t==='B'||t==='STRONG'){const k=kids();return k.trim()?'**'+k.trim()+'**'+(/\s$/.test(k)?' ':''):k;}
    if(t==='I'||t==='EM'){const k=kids();return k.trim()?'*'+k.trim()+'*'+(/\s$/.test(k)?' ':''):k;}
    if(t==='CODE')return n.textContent?'`'+n.textContent+'`':'';
    if(t==='A'){const k=kids(),h=n.getAttribute('href')||'';if(!/^(https?:|mailto:)/.test(h))return k;return (!k.trim()||k.trim()===h)?h:'['+one(k)+']('+h+')';}
    if(/^(UL|OL|P|DIV|H[1-6])$/.test(t))return '\n'+blockText(n)+'\n';
    return kids();
  };
  const listLines=(el,out)=>{
    let i=1;
    for(const li of el.children){
      if(li.tagName!=='LI')continue;
      const nested=[...li.children].filter(c=>c.tagName==='UL'||c.tagName==='OL');
      const text=one([...li.childNodes].filter(c=>!nested.includes(c)).map(inl).join(''));
      const task=li.classList.contains('task');
      if(text||task)out.push((task?'- ['+(li.classList.contains('done')?'x':' ')+'] ':el.tagName==='OL'?(i++)+'. ':'- ')+text);
      nested.forEach(nl=>listLines(nl,out));
    }
  };
  const blockText=n=>{if(n.tagName==='UL'||n.tagName==='OL'){const o=[];listLines(n,o);return o.join('\n');}return [...n.childNodes].map(inl).join('');};
  const blocks=[];let buf='';
  const flushBuf=()=>{const t=buf.replace(/^\n+|\n+$/g,'');if(t.trim())blocks.push(t);buf='';};
  for(const n of root.childNodes){
    if(n.nodeType===1&&/^(UL|OL)$/.test(n.tagName)){flushBuf();const o=[];listLines(n,o);if(o.length)blocks.push(o.join('\n'));}
    else if(n.nodeType===1&&/^H[1-6]$/.test(n.tagName)){flushBuf();const t=one([...n.childNodes].map(inl).join(''));if(t)blocks.push('# '+t);}
    else if(n.nodeType===1&&/^(P|DIV|BLOCKQUOTE)$/.test(n.tagName)){
      flushBuf();
      if([...n.children].some(c=>/^(P|DIV|UL|OL|H[1-6])$/.test(c.tagName))){const sub=htmlToMd(n);if(sub)blocks.push(sub);}
      else{const t=[...n.childNodes].map(inl).join('').replace(/^\n+|\n+$/g,'').replace(/[ \t]+\n/g,'\n');if(t.trim())blocks.push(t);}
    }
    else buf+=inl(n);
  }
  flushBuf();
  return blocks.join('\n\n').replace(/\n{3,}/g,'\n\n').trim();
}
function highlight(el,term){
  if(!term)return;
  const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);const hits=[];let n;
  while((n=walker.nextNode()))if(n.nodeValue.toLowerCase().includes(term))hits.push(n);
  for(const t of hits){
    const frag=document.createDocumentFragment();let s=t.nodeValue,low=s.toLowerCase(),i;
    while((i=low.indexOf(term))>=0){frag.append(s.slice(0,i));frag.appendChild(mk('mark',null,s.slice(i,i+term.length)));s=s.slice(i+term.length);low=low.slice(i+term.length);}
    frag.append(s);t.parentNode.replaceChild(frag,t);
  }
}

/* ================= Interfaccia ================= */
const panel=$('#panel'),titleIn=$('#f-title'),noteEd=$('#f-note'),bDel=$('#b-del'),nodeMenu=$('#node-menu');
function makeSwatches(box,fn){return SWATCHES.map(([h,name])=>{const b=mk('button','sw');b.type='button';b.setAttribute('role','radio');b.setAttribute('aria-label',name);b.style.setProperty('--c',cssColor(h));b.dataset.hue=h==null?'none':String(h);b.addEventListener('click',()=>fn(h));box.appendChild(b);return b;});}
function makeImp(box,fn){return [1,2,3,4,5].map(v=>{const b=mk('button',null,String(v));b.type='button';b.setAttribute('role','radio');b.setAttribute('aria-label','Importanza '+v+' su 5');b.addEventListener('click',()=>fn(v));box.appendChild(b);return b;});}
const swatchBtns=makeSwatches($('#swatches'),h=>setHue(h));
const gSwatchBtns=makeSwatches($('#g-swatches'),h=>groupApply(r=>{r.data.hue=h;r.color=nodeColor(r.data);if(r.data.img)setNodeImage(r);},'Colore applicato.'));
const impBtns=makeImp($('#f-imp'),v=>{const r=sel();if(!r||r.data.imp===v)return;commit();r.data.imp=v;refreshTopology();fillPanel(r);save();});
const gImpBtns=makeImp($('#g-imp'),v=>groupApply(r=>{r.data.imp=v;},'Importanza '+v+' applicata.'));

let toastTimer;
function toast(msg,ms,action){
  const t=$('#toast'),b=$('#toast-act');$('#toast-text').textContent=msg;
  if(action){b.textContent=action.label;b.hidden=false;b.onclick=()=>{t.classList.remove('show','has-action');action.fn();};t.classList.add('has-action');}
  else{b.hidden=true;b.onclick=null;t.classList.remove('has-action');}
  t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show','has-action'),ms||(action?6500:2600));
}
let hintGone=false;
function hideHint(){if(!hintGone){hintGone=true;$('#hint').classList.add('gone');}}
setTimeout(hideHint,15000);
function updateBars(){document.body.classList.toggle('has-bar',!$('#pathbar').hidden||!$('#modebar').hidden);}
function openPanel(which){panel.hidden=false;$('#single').hidden=which!=='single';$('#group').hidden=which!=='group';document.body.classList.add('panel-open');}
function closePanel(){panel.hidden=true;document.body.classList.remove('panel-open');if(nodeMenu&&!nodeMenu.hidden)openNodeMenu(false);$('#link-row').hidden=true;}

function sel(){return selected?nodes.get(selected):null;}
function fillPanel(r){
  if(document.activeElement!==titleIn)titleIn.value=r.data.label;
  titleIn.readOnly=READONLY;
  panel.style.setProperty('--node',cssColor(r.data.hue));
  const meta=$('#f-meta');meta.innerHTML='';
  meta.appendChild(mk('span','meta-chip',r.deg?plural(r.deg,'collegamento','collegamenti'):'Nessun collegamento'));
  if(r.data.pinned&&map.layout==='force')meta.appendChild(mk('span','meta-chip','Posizione fissa'));
  if(r.data.collapsed)meta.appendChild(mk('span','meta-chip','Ramo compresso'+(r.hiddenCount?', '+plural(r.hiddenCount,'idea nascosta','idee nascoste'):'')));
  const di=dueInfo(r);
  if(di){
    const txt=di.state==='done'?'Completata, scadeva il '+fmtLong.format(di.date):di.days<0?'Scaduta da '+plural(-di.days,'giorno','giorni'):di.days===0?'Scade oggi':di.days===1?'Scade domani':'Scade il '+fmtLong.format(di.date);
    meta.appendChild(mk('span','meta-chip '+(di.state==='late'?'late':di.state==='soon'?'soon':di.state==='done'?'done':''),txt));
  }
  const ti=map.tour.indexOf(r.id);
  if(ti>=0)meta.appendChild(mk('span','meta-chip','Tappa '+(ti+1)+' della presentazione'));
  const pr=r.prog;
  if(pr.total){
    const pc=Math.round(pr.done/pr.total*100);
    meta.appendChild(mk('span','meta-chip'+(pc===100?' done':''),'Attività: '+pr.done+' di '+pr.total+(r.own.total!==pr.total?' nel ramo':'')+' ('+pc+'%)'));
    $('#f-progress').hidden=false;$('#f-progress i').style.width=pc+'%';
  }else $('#f-progress').hidden=true;
  $('#f-thumb').hidden=!r.data.img;if(r.data.img)$('#f-img').src=r.data.img;
  renderTags(r);
  $('#f-due').value=r.data.due||'';$('#b-due-clear').hidden=!r.data.due;
  impBtns.forEach((b,i)=>b.setAttribute('aria-checked',String(i+1===r.data.imp)));
  swatchBtns.forEach(b=>{const h=b.dataset.hue==='none'?null:+b.dataset.hue;b.setAttribute('aria-checked',String(h===(r.data.hue==null?null:r.data.hue)));});
  const bc=$('#b-collapse');bc.hidden=!r.out;bc.setAttribute('aria-pressed',String(!!r.data.collapsed));
  bc.querySelector('span').textContent=r.data.collapsed?'Espandi':'Riduci';
  bc.querySelector('svg').innerHTML=r.data.collapsed?'<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>':'<path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/>';
  bc.title=r.data.collapsed?'Mostra di nuovo le idee di questo ramo':'Nascondi le idee di questo ramo';
  const bp=$('#b-pin');bp.hidden=map.layout!=='force';bp.setAttribute('aria-pressed',String(!!r.data.pinned));
  bp.querySelector('span').textContent=r.data.pinned?'Sblocca':'Fissa';bp.title=r.data.pinned?'Lascia di nuovo muovere l’idea':'Fissa la posizione dell’idea';
  $('#b-root').hidden=!!r.isRoot;
  $('#b-img span').textContent=r.data.img?'Cambia immagine':'Aggiungi immagine';
  $('#b-img-rm').hidden=!r.data.img;
  $('#b-copy span').textContent=r.tKids.length?'Copia ramo':'Copia idea';
  $('#b-paste').disabled=!clip;
  $('#b-tour span').textContent=ti>=0?'Togli dalla presentazione':'Aggiungi alla presentazione';
  $('#links-count').textContent=r.deg?String(r.deg):'';
  $('#f-due').disabled=READONLY;impBtns.forEach(b=>{b.disabled=READONLY;});
  if(panelTab==='ai'&&(READONLY||!document.body.classList.contains('has-ai')))setPanelTab('note');
  renderLinksList(r);
  resetDelete();
}
function renderNoteEditor(r){
  noteEd.contentEditable=READONLY?'false':'true';
  noteEd.dataset.placeholder=READONLY?'Nessuna nota.':'Scrivi una nota…';
  const t=r.data.note||'';
  noteEd.innerHTML=t.trim()?md(t):'';
  if(searchTerm)highlight(noteEd,searchTerm);
}
function renderTags(r){
  const box=$('#f-tags');box.innerHTML='';
  for(const t of r.data.tags){
    const c=mk('span','tag',t);
    if(!READONLY){const x=mk('button',null,'×');x.type='button';x.setAttribute('aria-label','Rimuovi il tag '+t);x.addEventListener('click',()=>{commit();r.data.tags=r.data.tags.filter(y=>y!==t);afterTagChange(r);});c.appendChild(x);}
    box.appendChild(c);
  }
  if(READONLY){if(!r.data.tags.length)box.appendChild(mk('span','hint-text','Nessun tag.'));return;}
  const inp=mk('input','tag-input');inp.placeholder=r.data.tags.length?'Altro tag…':'Aggiungi un tag…';inp.setAttribute('list','tag-list');inp.setAttribute('aria-label','Aggiungi un tag');inp.maxLength=24;
  inp.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===','){e.preventDefault();addTag(r,inp.value);}});
  inp.addEventListener('change',()=>{if(inp.value.trim())addTag(r,inp.value);});
  box.appendChild(inp);
  fillTagList(r.data.tags);
}
function fillTagList(exclude){const dl=$('#tag-list');dl.innerHTML='';allTags().forEach(([t])=>{if(!exclude||!exclude.includes(t)){const o=document.createElement('option');o.value=t;dl.appendChild(o);}});}
function normTag(v){const t=v.replace(/,/g,'').replace(/^#/,'').trim().slice(0,24);if(!t)return null;return allTags().map(x=>x[0]).find(x=>x.toLowerCase()===t.toLowerCase())||t;}
function addTag(r,v){
  const t=normTag(v);if(!t)return;
  if(r.data.tags.some(x=>x.toLowerCase()===t.toLowerCase())){toast('Questa idea ha già il tag “'+t+'”.');return;}
  if(r.data.tags.length>=12){toast('Puoi usare al massimo 12 tag per idea.');return;}
  commit();r.data.tags.push(t);afterTagChange(r);
  const inp=$('#f-tags .tag-input');if(inp)inp.focus();
}
function afterTagChange(r){
  if(activeTag&&!allTags().some(([t])=>t===activeTag))activeTag=null;
  if(r)renderTags(r);renderFilters();
  if(map.layout==='tags'){computeLayout();computeGroups();}
  applyStyles();save();
}
function allTags(){const c=new Map();for(const n of map.nodes)for(const t of n.tags)c.set(t,(c.get(t)||0)+1);return [...c].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'it'));}
function renderLinksList(r){
  const ul=$('#f-links');ul.innerHTML='';
  const mine=links.filter(l=>l.a===r||l.b===r);
  if(!mine.length){const li=mk('li');li.style.display='block';li.appendChild(mk('p','links-empty',READONLY?'Nessun collegamento.':'Questa idea non è collegata a nient’altro. Usa “Collega a…” o trascinala sopra un’altra idea.'));ul.appendChild(li);return;}
  for(const l of mine){
    const other=l.a===r?l.b:l.a,outgoing=l.a===r;
    const li=mk('li');
    const go=mk('button','go');go.type='button';go.appendChild(mk('span','dir',outgoing?'→':'←'));go.appendChild(document.createTextNode(other.data.label));
    go.addEventListener('click',()=>{if(other.hidden)revealNode(other.id);selectNode(other.id);});
    li.appendChild(go);
    if(READONLY){
      const info=[l.data.label,LINK_TYPES.find(t=>t[0]===l.data.type)[1].toLowerCase()].filter(Boolean).join(', ');
      li.appendChild(mk('span','ltype',info));
    }else{
      const row=mk('div','lrow');
      const inp=mk('input');inp.value=l.data.label||'';inp.placeholder='Etichetta';inp.maxLength=40;inp.setAttribute('aria-label','Etichetta del collegamento con '+other.data.label);
      let committed=false;
      inp.addEventListener('focus',()=>{committed=false;});
      inp.addEventListener('input',()=>{if(!committed){commit();committed=true;}l.data.label=inp.value.trim();touch();renderLinkLabel(l);save();});
      inp.addEventListener('keydown',e=>{if(e.key==='Enter')inp.blur();});
      const selT=mk('select');selT.setAttribute('aria-label','Tipo di collegamento');
      LINK_TYPES.forEach(([v,lab])=>{const o=mk('option',null,lab);o.value=v;if(l.data.type===v)o.selected=true;selT.appendChild(o);});
      selT.addEventListener('change',()=>{commit();l.data.type=selT.value;applyStyles();save();});
      row.append(inp,selT);
      const rm=mk('button','rm','×');rm.type='button';rm.setAttribute('aria-label','Scollega da '+other.data.label);rm.title='Scollega';
      rm.addEventListener('click',()=>unlink(l));
      li.append(rm,row);
    }
    ul.appendChild(li);
  }
}
function selectNode(id,opts){
  opts=opts||{};
  const r=nodes.get(id);if(!r||r.hidden)return;
  if(selected!==id){finishNoteEdit();closeAiBox();if(!opts.keepSearch&&searchTerm)setSearchTerm('');}
  if(multi.size)clearMulti(true);
  selected=id;lastSel.copy(r.pos);
  if(!pres){fillPanel(r);if(document.activeElement!==noteEd)renderNoteEditor(r);openPanel('single');}
  outlineScrollTo=id;scheduleSide();
  applyStyles();
  if(opts.fly!==false&&(focusMode||opts.force||pres))flyTo(r,null,70+r.radius*8);
}
function deselect(){
  if(!selected)return;
  finishNoteEdit();closeAiBox();
  selected=null;closePanel();resetDelete();applyStyles();scheduleSide();
}
function focusTitle(){if(READONLY)return;titleIn.focus();titleIn.select();}

/* ---- Selezione multipla ---- */
function clearMulti(silent){if(!multi.size)return;multi.clear();if(!silent){closePanel();applyStyles();}}
function afterMulti(){
  if(multi.size>=2){
    finishNoteEdit();closeAiBox();selected=null;
    $('#g-title').textContent=plural(multi.size,'idea selezionata','idee selezionate');
    $('#g-del').textContent='Elimina '+plural(multi.size,'idea','idee');$('#g-del').classList.remove('armed');gDelArmed=false;
    gImpBtns.forEach(b=>b.setAttribute('aria-checked','false'));gSwatchBtns.forEach(b=>b.setAttribute('aria-checked','false'));
    fillTagList();openPanel('group');
  }else if(multi.size===1){const only=[...multi][0];multi.clear();selectNode(only,{fly:false});return;}
  else{closePanel();}
  applyStyles();scheduleSide();
}
function toggleMulti(id){
  if(READONLY){if(id)selectNode(id);return;}
  if(!id)return;
  if(!multi.size&&selected)multi.add(selected);
  if(multi.has(id))multi.delete(id);else multi.add(id);
  afterMulti();
}
function selectAllVisible(){
  if(READONLY)return;
  multi.clear();simList.filter(r=>r.L>=.1).forEach(r=>multi.add(r.id));
  if(multi.size<2){toast('Non ci sono abbastanza idee visibili da selezionare.');multi.clear();return;}
  afterMulti();toast(plural(multi.size,'idea selezionata','idee selezionate')+'.');
}
function groupApply(fn,msg){
  if(!multi.size)return;commit();
  for(const id of multi){const r=nodes.get(id);if(r)fn(r);}
  refreshTopology();renderFilters();save();if(msg)toast(msg);
}
let gDelArmed=false;
$('#g-del').addEventListener('click',e=>{
  if(!gDelArmed){gDelArmed=true;e.currentTarget.textContent='Tocca di nuovo per eliminare';e.currentTarget.classList.add('armed');return;}
  deleteNodes([...multi]);
});
$('#g-close').addEventListener('click',()=>clearMulti());
$('#g-pin').addEventListener('click',()=>groupApply(r=>{r.data.pinned=true;},'Idee fissate in posizione.'));
$('#g-unpin').addEventListener('click',()=>{groupApply(r=>{r.data.pinned=false;},'Idee sbloccate.');reheat(.3);});
$('#g-copy').addEventListener('click',()=>copySelection());
$('#g-tag').addEventListener('keydown',e=>{
  if(e.key!=='Enter')return;e.preventDefault();
  const t=normTag(e.target.value);if(!t)return;e.target.value='';
  groupApply(r=>{if(!r.data.tags.some(x=>x.toLowerCase()===t.toLowerCase())&&r.data.tags.length<12)r.data.tags.push(t);},'Tag “'+t+'” aggiunto.');
  afterTagChange(null);
});
$('#m-multi').addEventListener('click',()=>{setMultiMode(!multiMode);openMenu(false);});
$('#mode-done').addEventListener('click',()=>setMultiMode(false));
function setMultiMode(v){multiMode=v;$('#modebar').hidden=!v;updateBars();syncMenu();if(v){deselect();toast('Tocca le idee da selezionare o trascina un riquadro sullo sfondo.',4000);}}

/* ---- Creazione, collegamento, eliminazione ---- */
function nextHue(){
  const use=new Map(HUES.map(h=>[h,0]));
  map.nodes.forEach(n=>{if(use.has(n.hue))use.set(n.hue,use.get(n.hue)+1);});
  return [...use].sort((a,b)=>a[1]-b[1])[0][0];
}
function addNode(parent,opts){
  if(READONLY)return;opts=opts||{};
  commit();
  const n=blankNode(opts.label||'Nuova idea',parent&&parent.data.hue!=null?parent.data.hue:(parent&&parent.isRoot?nextHue():(parent?null:nextHue())));
  if(parent&&parent.isRoot)n.hue=nextHue();
  if(opts.note)n.note=opts.note;
  const base=parent?parent.pos:controls.target,off=randUnit().multiplyScalar(18);
  n.p=[base.x+off.x,base.y+off.y,base.z+off.z];
  if(parent&&parent.data.collapsed)parent.data.collapsed=false;
  map.nodes.push(n);buildNode(n);
  if(parent){const l={s:parent.id,t:n.id,label:'',type:'normal'};map.links.push(l);buildLink(l);}
  refreshTopology();reheat(.45);save();renderFilters();
  if(!opts.quiet){selectNode(n.id);focusTitle();}
  return n;
}
function addSibling(){const r=sel();if(!r)return;if(r.isRoot||!r.tParent){addNode(r);return;}addNode(r.tParent);}
function connect(a,b,label){
  if(linkBetween(a,b)){toast('Queste idee sono già collegate.');return false;}
  commit();
  const l={s:a,t:b,label:label||'',type:'normal'};map.links.push(l);buildLink(l);
  refreshTopology();reheat(.3);save();
  const r=sel();if(r)fillPanel(r);
  return true;
}
function unlink(l){
  commit();
  disposeLink(l);links=links.filter(x=>x!==l);map.links=map.links.filter(x=>x!==l.data);
  if(path)clearPath();
  refreshTopology();reheat(.3);save();
  const r=sel();if(r)fillPanel(r);
  toast('Collegamento rimosso.',0,{label:'Annulla',fn:()=>undo()});
}
function deleteNodes(ids){
  ids=ids.filter(id=>nodes.has(id));if(!ids.length)return;
  if(ids.length>=nodes.size){toast('La mappa deve contenere almeno un’idea.');return;}
  commit();
  const set=new Set(ids);
  for(const l of links)if(set.has(l.a.id)||set.has(l.b.id))disposeLink(l);
  links=links.filter(l=>!l.dead);
  map.links=map.links.filter(l=>!set.has(l.s)&&!set.has(l.t));
  map.nodes=map.nodes.filter(n=>!set.has(n.id));
  map.tour=map.tour.filter(x=>!set.has(x));
  for(const id of ids){disposeNode(nodes.get(id));nodes.delete(id);}
  selected=null;multi.clear();closePanel();
  if(path)clearPath();
  refreshTopology();reheat(.4);save();renderFilters();
  toast(ids.length===1?'Idea eliminata.':plural(ids.length,'idea eliminata','idee eliminate')+'.',0,{label:'Annulla',fn:()=>undo()});
}
function setHue(h){
  const r=sel();if(!r)return;commit();
  r.data.hue=h;r.color=nodeColor(r.data);if(r.data.img)setNodeImage(r);
  computeGroups();fillPanel(r);applyStyles();save();
}
function toggleCollapse(){
  const r=sel();if(!r||!r.out)return;commit();
  const was=r.data.collapsed;
  const before=new Set(nodeList.filter(x=>x.hidden).map(x=>x.id));
  r.data.collapsed=!was;refreshTopology();
  if(was){for(const x of nodeList)if(before.has(x.id)&&!x.hidden&&!x.data.pinned){x.pos.copy(r.pos).addScaledVector(randUnit(),6);x.vel.set(0,0,0);}reheat(.5);toast('Ramo espanso.');}
  else{reheat(.2);toast(r.hiddenCount?'Ramo compresso: '+plural(r.hiddenCount,'idea nascosta','idee nascoste')+'.':'Ramo compresso.');}
  if(path)clearPath();save();fillPanel(r);
}
function togglePin(){
  const r=sel();if(!r)return;commit();r.data.pinned=!r.data.pinned;
  if(!r.data.pinned)reheat(.25);renderLabel(r);fillPanel(r);save();
  toast(r.data.pinned?'Posizione fissata: la simulazione non sposterà più questa idea.':'Posizione sbloccata.');
}
function toggleTour(){
  const r=sel();if(!r)return;commit();
  const i=map.tour.indexOf(r.id);if(i>=0)map.tour.splice(i,1);else map.tour.push(r.id);
  fillPanel(r);save();toast(i>=0?'Tolta dalla presentazione.':'Aggiunta come tappa '+map.tour.length+' della presentazione.');
}

/* ---- Spostare un ramo sotto un’altra idea ---- */
function isDescendant(id,of){const st=[of],seen=new Set();while(st.length){const x=st.pop();if(x===id)return true;if(seen.has(x))continue;seen.add(x);for(const l of map.links)if(l.s===x)st.push(l.t);}return false;}
function reparent(id,target){
  const r=nodes.get(id),t=nodes.get(target);if(!r||!t)return;
  if(isDescendant(target,id)){toast('Non puoi spostare un’idea dentro un suo stesso ramo.');return;}
  if(r.tParent===t){toast('“'+r.data.label+'” è già sotto “'+t.data.label+'”.');return;}
  const oldParent=r.tParent;
  map.links=map.links.filter(l=>!((oldParent&&l.s===oldParent.id&&l.t===id)||(l.s===target&&l.t===id)||(l.s===id&&l.t===target)));
  map.links.push({s:target,t:id,label:'',type:'normal'});
  const oldHue=r.data.hue,newHue=t.isRoot?(oldParent&&oldParent.isRoot?oldHue:nextHue()):t.data.hue;
  if(newHue!==oldHue&&oldParent&&(oldParent.data.hue===oldHue||oldParent.isRoot)){
    const st=[r],seen=new Set();
    while(st.length){const x=st.pop();if(seen.has(x.id))continue;seen.add(x.id);if(x.data.hue===oldHue){x.data.hue=newHue;x.color=nodeColor(x.data);if(x.data.img)setNodeImage(x);}x.tKids.forEach(k=>st.push(k));}
  }
  r.data.pinned=false;
  rebuildLinks();refreshTopology();reheat(.5);save();
  if(selected===id)fillPanel(r);
  toast('“'+r.data.label+'” spostata sotto “'+t.data.label+'”.',0,{label:'Annulla',fn:()=>undo()});
}

/* ---- Copia e incolla ---- */
function copySelection(){
  if(READONLY)return;
  let set;
  if(multi.size>1)set=new Set(multi);
  else if(selected){set=new Set();const st=[selected];while(st.length){const x=st.pop();if(set.has(x))continue;set.add(x);for(const l of map.links)if(l.s===x)st.push(l.t);}}
  else return;
  syncPositions();
  const ns=map.nodes.filter(n=>set.has(n.id)).map(n=>JSON.parse(JSON.stringify(n)));
  const ls=map.links.filter(l=>set.has(l.s)&&set.has(l.t)).map(l=>({...l}));
  const inc=new Set(ls.map(l=>l.t));
  clip={nodes:ns,links:ls,roots:ns.filter(n=>!inc.has(n.id)).map(n=>n.id),from:map.name};
  try{localStorage.setItem(CLIPKEY,JSON.stringify(clip));}catch(e){}
  if(selected)fillPanel(sel());
  toast('Copiat'+(ns.length===1?'a 1 idea':'e '+ns.length+' idee')+'. Seleziona dove incollarle e premi Ctrl+V o “Incolla qui”.',3500);
}
function paste(){
  if(READONLY||!clip||!clip.nodes.length){toast('Non c’è niente da incollare: prima copia un ramo.');return;}
  commit();
  const anchor=sel();
  const idMap=new Map();
  const c=new THREE.Vector3();let cnt=0;clip.nodes.forEach(n=>{if(n.p){c.add(_v.fromArray(n.p));cnt++;}});if(cnt)c.divideScalar(cnt);
  const base=(anchor?anchor.pos:controls.target).clone().add(randUnit().multiplyScalar(30));
  const now=Date.now();
  for(const n of clip.nodes){
    const m=JSON.parse(JSON.stringify(n));m.id=newId();m.created=now;m.pinned=false;m.collapsed=false;
    if(n.p){_v.fromArray(n.p).sub(c).add(base);m.p=[_v.x,_v.y,_v.z];}else m.p=[base.x,base.y,base.z];
    idMap.set(n.id,m.id);map.nodes.push(m);buildNode(m);
  }
  for(const l of clip.links){const nl={...l,s:idMap.get(l.s),t:idMap.get(l.t)};map.links.push(nl);buildLink(nl);}
  if(anchor){if(anchor.data.collapsed)anchor.data.collapsed=false;for(const rid of clip.roots){const nl={s:anchor.id,t:idMap.get(rid),label:'',type:'normal'};map.links.push(nl);buildLink(nl);}}
  refreshTopology();reheat(.5);save();renderFilters();
  toast('Incollat'+(clip.nodes.length===1?'a 1 idea':'e '+clip.nodes.length+' idee')+(anchor?' sotto “'+anchor.data.label+'”':'')+'.');
  const first=idMap.get(clip.roots[0]);if(first)selectNode(first);
}

/* ---- Modalità di scelta: collega, percorso ---- */
function startPick(type){
  const r=sel();if(!r)return;
  pick={type,from:r.id};document.body.classList.add('picking');
  toast(type==='link'?'Tocca l’idea da collegare a “'+r.data.label+'”. Tocca uno spazio vuoto per annullare.':'Tocca l’idea di arrivo del percorso da “'+r.data.label+'”. Tocca uno spazio vuoto per annullare.',7000);
}
function cancelPick(msg){pick=null;document.body.classList.remove('picking');if(msg)toast(msg);}
function handlePick(id,ev){
  if(pres){if(id){const i=pres.ids.indexOf(id);if(i>=0)presGo(i);}return;}
  if(pick){
    const p=pick;cancelPick();
    if(!id||id===p.from){toast(p.type==='link'?'Collegamento annullato.':'Ricerca del percorso annullata.');return;}
    if(p.type==='link'){if(connect(p.from,id))toast('Collegamento creato. Puoi dargli un’etichetta e un tipo nel pannello.');}
    else showPath(p.from,id);
    return;
  }
  const additive=ev&&(ev.shiftKey||ev.ctrlKey||ev.metaKey);
  if(additive||multiMode){if(id)toggleMulti(id);else if(!multiMode)clearMulti();return;}
  if(path){clearPath();if(!id)return;}
  if(multi.size){clearMulti();if(!id)return;}
  if(id)selectNode(id);else deselect();
}

/* ---- Percorsi ---- */
function findPath(a,b){
  const prev=new Map([[a,null]]),q=[a];
  while(q.length){const x=q.shift();if(x===b)break;for(const y of nodes.get(x).nb){if(prev.has(y)||nodes.get(y).hidden)continue;prev.set(y,x);q.push(y);}}
  if(!prev.has(b))return null;
  const out=[];for(let x=b;x!=null;x=prev.get(x))out.unshift(x);return out;
}
function showPath(a,b){
  const ids=findPath(a,b);
  if(!ids){toast('Nessun percorso collega queste due idee.');return;}
  finishNoteEdit();selected=null;closePanel();
  path=ids;pathLinkList=[];
  for(let i=0;i<ids.length-1;i++){const l=linkBetween(ids[i],ids[i+1]);pathLinkList.push({l,fwd:l.a.id===ids[i]});}
  pathLinks=new Set(pathLinkList.map(p=>p.l));impulses=[];
  applyStyles();
  $('#path-text').textContent=ids.map(x=>nodes.get(x).data.label).join(' → ');
  $('#pathbar').hidden=false;updateBars();
  toast('Percorso di '+plural(ids.length-1,'passaggio','passaggi')+'.');
  flyToFit(ids.map(x=>nodes.get(x)));
}
function clearPath(){if(!path)return;path=null;pathLinkList=[];pathLinks=null;$('#pathbar').hidden=true;updateBars();applyStyles();}

/* ---- Nota: editor visuale ---- */
let noteCommitted=false,noteTimer=null,panelTab='note',savedRange=null;
function setPanelTab(t){
  panelTab=t;
  $$('.ptabs .tab').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.tab===t)));
  $$('#single .pane').forEach(p=>{p.hidden=p.dataset.pane!==t;});
}
$$('.ptabs .tab').forEach(b=>b.addEventListener('click',()=>setPanelTab(b.dataset.tab)));
setPanelTab('note');
function normalizeTasks(){
  for(const li of noteEd.querySelectorAll('li.task')){
    const f=li.firstChild;
    if(!(f&&f.nodeType===1&&f.classList.contains('cb'))){li.classList.remove('done');li.querySelectorAll('.cb').forEach(c=>c.remove());const cb=mk('span','cb');cb.contentEditable='false';li.prepend(cb);}
  }
  for(const cb of noteEd.querySelectorAll('.cb')){const li=cb.parentElement;if(!li||li.tagName!=='LI'||!li.classList.contains('task')||li.firstChild!==cb)cb.remove();}
}
function saveNoteFromEditor(){
  const r=sel();if(!r||READONLY)return;
  normalizeTasks();
  const t=htmlToMd(noteEd);
  if(t===(r.data.note||'').trim())return;
  if(!noteCommitted){commit();noteCommitted=true;}
  r.data.note=t;touch();save();
}
function finishNoteEdit(){if(document.activeElement===noteEd)noteEd.blur();clearTimeout(noteTimer);}
noteEd.addEventListener('focus',()=>{noteCommitted=false;try{document.execCommand('defaultParagraphSeparator',false,'p');}catch(e){}});
noteEd.addEventListener('input',()=>{normalizeTasks();clearTimeout(noteTimer);noteTimer=setTimeout(saveNoteFromEditor,250);});
noteEd.addEventListener('blur',()=>{
  clearTimeout(noteTimer);
  const r=sel();if(!r)return;
  const before=JSON.stringify(r.prog);saveNoteFromEditor();
  refreshTopology();if(JSON.stringify(r.prog)!==before||true)fillPanel(r);
});
noteEd.addEventListener('mousedown',e=>{if(e.target.closest('.cb'))e.preventDefault();});
noteEd.addEventListener('click',e=>{
  const cb=e.target.closest('.cb');
  if(cb){
    e.preventDefault();if(READONLY)return;
    const r=sel();if(!r)return;
    cb.parentElement.classList.toggle('done');
    commit();r.data.note=htmlToMd(noteEd);save();
    refreshTopology();fillPanel(r);
    return;
  }
  const a=e.target.closest('a');
  if(a&&!READONLY&&(e.ctrlKey||e.metaKey)){e.preventDefault();window.open(a.href,'_blank','noopener');}
});
noteEd.addEventListener('paste',e=>{
  if(READONLY)return;e.preventDefault();
  const t=(e.clipboardData||window.clipboardData).getData('text/plain');
  document.execCommand('insertText',false,t);
});
noteEd.addEventListener('drop',e=>{if(e.dataTransfer&&e.dataTransfer.types.includes('text/html'))e.preventDefault();});
noteEd.addEventListener('keydown',e=>{
  if(e.key==='Escape'){e.preventDefault();e.stopPropagation();noteEd.blur();return;}
  if((e.key==='Enter'&&!e.shiftKey)||e.key==='Backspace'){
    const li=blockOf();
    if(li&&li.tagName==='LI'&&li.classList.contains('task')&&!li.textContent.trim()){
      if(e.key==='Backspace'){const s=getSelection();if(!s.isCollapsed)return;}
      e.preventDefault();exitList(li);
    }
  }
});
function exitList(li){
  const list=li.parentElement,p=document.createElement('p');p.appendChild(document.createElement('br'));
  const after=[];let n=li.nextElementSibling;while(n){after.push(n);n=n.nextElementSibling;}
  list.after(p);
  if(after.length){const nl=document.createElement(list.tagName);after.forEach(x=>nl.appendChild(x));p.after(nl);}
  li.remove();if(!list.children.length)list.remove();
  const rg=document.createRange();rg.setStart(p,0);rg.collapse(true);const s=getSelection();s.removeAllRanges();s.addRange(rg);
  edChanged();
}

function caretToEnd(){const rg=document.createRange();rg.selectNodeContents(noteEd);rg.collapse(false);const s=getSelection();s.removeAllRanges();s.addRange(rg);}
function edFocus(){if(document.activeElement!==noteEd){noteEd.focus();const s=getSelection();if(!s.rangeCount||!noteEd.contains(s.anchorNode))caretToEnd();}}
function blockOf(){const s=getSelection();if(!s.rangeCount)return null;let n=s.anchorNode;while(n&&n!==noteEd){if(n.nodeType===1&&/^(P|DIV|H[1-6]|LI)$/.test(n.tagName))return n;n=n.parentNode;}return null;}
function selectedLis(){
  const s=getSelection();if(!s.rangeCount)return [];
  const rg=s.getRangeAt(0);
  const lis=[...noteEd.querySelectorAll('li')].filter(li=>rg.intersectsNode(li));
  if(!lis.length){const b=blockOf();if(b&&b.tagName==='LI')return [b];}
  return lis;
}
function edChanged(){noteEd.dispatchEvent(new Event('input'));updateToolState();}
function edCmd(c,v){edFocus();document.execCommand(c,false,v);edChanged();}
function toggleTaskList(){
  edFocus();
  let lis=selectedLis();
  if(!lis.length||lis.some(li=>li.parentElement.tagName==='OL')){
    if(lis.length&&lis[0].parentElement.tagName==='OL')document.execCommand('insertOrderedList');
    document.execCommand('insertUnorderedList');lis=selectedLis();
  }
  const allTask=lis.length&&lis.every(li=>li.classList.contains('task'));
  for(const li of lis){
    if(allTask){li.classList.remove('task','done');li.querySelectorAll(':scope > .cb').forEach(c=>c.remove());}
    else if(!li.classList.contains('task')){li.classList.add('task');const cb=mk('span','cb');cb.contentEditable='false';li.prepend(cb);}
  }
  edChanged();
}
function bulletList(){
  edFocus();
  const lis=selectedLis();
  if(lis.length&&lis.some(li=>li.classList.contains('task'))){for(const li of lis){li.classList.remove('task','done');li.querySelectorAll(':scope > .cb').forEach(c=>c.remove());}edChanged();return;}
  edCmd('insertUnorderedList');
}
function toggleHeading(){edFocus();const b=blockOf();edCmd('formatBlock',b&&/^H[1-6]$/.test(b.tagName)?'<p>':'<h4>');}
function clearFormat(){
  edFocus();document.execCommand('removeFormat');
  const s=getSelection();const a=s.anchorNode&&(s.anchorNode.nodeType===1?s.anchorNode:s.anchorNode.parentElement).closest('a');if(a)document.execCommand('unlink');
  const b=blockOf();
  if(b&&b.tagName==='LI'){if(b.classList.contains('task')){b.classList.remove('task','done');b.querySelectorAll(':scope > .cb').forEach(c=>c.remove());}document.execCommand(b.parentElement.tagName==='OL'?'insertOrderedList':'insertUnorderedList');}
  else if(b&&/^H[1-6]$/.test(b.tagName))document.execCommand('formatBlock',false,'<p>');
  edChanged();
}
function openLinkRow(){
  edFocus();
  const s=getSelection();savedRange=s.rangeCount&&noteEd.contains(s.anchorNode)?s.getRangeAt(0).cloneRange():null;
  const node=s.anchorNode&&(s.anchorNode.nodeType===1?s.anchorNode:s.anchorNode.parentElement);
  const a=node&&node.closest&&node.closest('a');
  $('#link-url').value=a?a.getAttribute('href'):'https://';
  $('#link-row').hidden=false;$('#link-url').focus();$('#link-url').select();
}
function applyLink(){
  const url=$('#link-url').value.trim();$('#link-row').hidden=true;
  if(!url||url==='https://')return;
  if(!/^(https?:\/\/|mailto:)\S+$/i.test(url)){toast('Il link deve iniziare con https://, http:// oppure mailto:');return;}
  noteEd.focus();const s=getSelection();s.removeAllRanges();
  if(savedRange)s.addRange(savedRange);else caretToEnd();
  if(s.rangeCount&&!s.getRangeAt(0).collapsed)document.execCommand('createLink',false,url);
  else document.execCommand('insertHTML',false,'<a href="'+esc(url)+'">'+esc(url)+'</a>&nbsp;');
  noteEd.querySelectorAll('a').forEach(a=>{a.target='_blank';a.rel='noopener noreferrer';});
  edChanged();
}
$('#link-ok').addEventListener('click',applyLink);
$('#link-cancel').addEventListener('click',()=>{$('#link-row').hidden=true;noteEd.focus();});
$('#link-url').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();applyLink();}else if(e.key==='Escape'){e.preventDefault();e.stopPropagation();$('#link-row').hidden=true;noteEd.focus();}});
const TOOLS={bold:()=>edCmd('bold'),italic:()=>edCmd('italic'),heading:toggleHeading,ul:bulletList,ol:()=>{const lis=selectedLis();if(lis.some(li=>li.classList.contains('task')))for(const li of lis){li.classList.remove('task','done');li.querySelectorAll(':scope > .cb').forEach(c=>c.remove());}edCmd('insertOrderedList');},task:toggleTaskList,link:openLinkRow,clear:clearFormat};
$$('.note-tools button').forEach(b=>{
  b.addEventListener('mousedown',e=>e.preventDefault());
  b.addEventListener('click',()=>{if(READONLY)return;TOOLS[b.dataset.cmd]();});
});
function updateToolState(){
  if(document.activeElement!==noteEd)return;
  const set=(c,v)=>{const b=$('.note-tools [data-cmd="'+c+'"]');if(b)b.setAttribute('aria-pressed',String(!!v));};
  let bold=false,ital=false;try{bold=document.queryCommandState('bold');ital=document.queryCommandState('italic');}catch(e){}
  const b=blockOf();
  set('bold',bold);set('italic',ital);set('heading',b&&/^H[1-6]$/.test(b.tagName));
  const li=b&&b.tagName==='LI'?b:null;
  set('task',li&&li.classList.contains('task'));set('ul',li&&!li.classList.contains('task')&&li.parentElement.tagName==='UL');set('ol',li&&li.parentElement.tagName==='OL');
}
document.addEventListener('selectionchange',updateToolState);
noteEd.addEventListener('blur',()=>$$('.note-tools button').forEach(b=>b.setAttribute('aria-pressed','false')));

/* ---- Menu “Altro” dell’idea ---- */
function openNodeMenu(v){
  nodeMenu.hidden=!v;$('#b-more').setAttribute('aria-expanded',String(v));
  if(v){
    const b=$('#b-more').getBoundingClientRect(),w=nodeMenu.offsetWidth,h=nodeMenu.offsetHeight;
    nodeMenu.style.left=clamp(b.right-w,8,innerWidth-w-8)+'px';
    let top=b.bottom+6;if(top+h>innerHeight-8)top=b.top-h-6;
    nodeMenu.style.top=Math.max(8,top)+'px';
  }else resetDelete();
}
$('#b-more').addEventListener('click',e=>{e.stopPropagation();openNodeMenu(nodeMenu.hidden);});
panel.addEventListener('scroll',()=>{if(!nodeMenu.hidden)openNodeMenu(false);});
document.addEventListener('pointerdown',e=>{if(!nodeMenu.hidden&&!e.target.closest('#node-menu')&&!e.target.closest('#b-more'))openNodeMenu(false);});
['#b-root','#b-img','#b-img-rm','#b-copy','#b-paste','#b-tour'].forEach(id=>$(id).addEventListener('click',()=>openNodeMenu(false)));

/* ---- Cambiare l’idea centrale ---- */
function makeRoot(id){
  const r=nodes.get(id);if(!r||r.isRoot||READONLY)return;
  commit();
  const adj=new Map();
  for(const l of map.links){(adj.get(l.s)||adj.set(l.s,[]).get(l.s)).push(l);(adj.get(l.t)||adj.set(l.t,[]).get(l.t)).push(l);}
  const seen=new Set([id]),q=[id];
  while(q.length){
    const x=q.shift();
    for(const l of adj.get(x)||[]){
      const y=l.s===x?l.t:l.s;if(seen.has(y))continue;seen.add(y);q.push(y);
      if(l.s!==x&&l.type!=='arrow'){l.s=x;l.t=y;}
    }
  }
  map.nodes.splice(map.nodes.indexOf(r.data),1);map.nodes.unshift(r.data);
  r.data.hue=null;r.data.collapsed=false;
  rebuildLinks();refreshTopology();
  const recolor=(x,h)=>{if(x.data.hue==null&&h!=null){x.data.hue=h;}x.color=nodeColor(x.data);if(x.data.img)setNodeImage(x);x.tKids.forEach(k=>recolor(k,x.data.hue!=null?x.data.hue:h));};
  r.color=nodeColor(r.data);if(r.data.img)setNodeImage(r);
  for(const b of r.tKids){if(b.data.hue==null)b.data.hue=nextHue();recolor(b,b.data.hue);}
  refreshTopology();computeGroups();renderFilters();reheat(.6);save();
  fillPanel(r);flyTo(r,null,70+r.radius*8);
  toast('“'+r.data.label+'” è ora l’idea centrale. Rami e colori sono stati ricalcolati.',0,{label:'Annulla',fn:()=>undo()});
}
$('#b-root').addEventListener('click',()=>{if(selected)makeRoot(selected);});

let titleCommitted=false;
titleIn.addEventListener('focus',()=>{titleCommitted=false;});
titleIn.addEventListener('input',()=>{
  const r=sel();if(!r||READONLY)return;
  if(!titleCommitted){commit();titleCommitted=true;}
  r.data.label=titleIn.value.trim()||'Senza titolo';touch();renderLabel(r);computeGroups();save();
});
titleIn.addEventListener('keydown',e=>{
  if(READONLY)return;
  if(e.key==='Tab'&&!e.shiftKey){e.preventDefault();titleIn.blur();const r=sel();if(r)addNode(r);}
  else if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();titleIn.blur();addSibling();}
  else if(e.key==='Enter'||e.key==='Escape'){e.preventDefault();titleIn.blur();}
});

/* ---- Scadenza ---- */
$('#f-due').addEventListener('change',e=>{const r=sel();if(!r)return;commit();r.data.due=e.target.value||null;renderLabel(r);fillPanel(r);if(map.layout==='timeline')computeLayout();save();});
$('#b-due-clear').addEventListener('click',()=>{const r=sel();if(!r)return;commit();r.data.due=null;renderLabel(r);fillPanel(r);if(map.layout==='timeline')computeLayout();save();});

/* ---- Eliminazione con conferma ---- */
let delArmed=false,delTimer;
function resetDelete(){delArmed=false;clearTimeout(delTimer);bDel.querySelector('span').textContent='Elimina idea';bDel.classList.remove('armed');}
bDel.addEventListener('click',()=>{
  if(!delArmed){delArmed=true;bDel.querySelector('span').textContent='Tocca di nuovo per eliminare';bDel.classList.add('armed');delTimer=setTimeout(resetDelete,3500);return;}
  const id=selected;resetDelete();openNodeMenu(false);deleteNodes([id]);
});

/* ---- Immagini ---- */
function readImage(file){
  return new Promise((res,rej)=>{
    const fr=new FileReader();
    fr.onerror=()=>rej(new Error('non è stato possibile leggere il file.'));
    fr.onload=()=>{
      const im=new Image();
      im.onerror=()=>rej(new Error('il formato dell’immagine non è supportato.'));
      im.onload=()=>{
        const max=320,s=Math.min(1,max/Math.max(im.width,im.height));
        const c=document.createElement('canvas');c.width=Math.max(1,Math.round(im.width*s));c.height=Math.max(1,Math.round(im.height*s));
        const g=c.getContext('2d');g.fillStyle='#ffffff';g.fillRect(0,0,c.width,c.height);g.drawImage(im,0,0,c.width,c.height);
        res(c.toDataURL('image/jpeg',.84));
      };
      im.src=fr.result;
    };
    fr.readAsDataURL(file);
  });
}
$('#b-img').addEventListener('click',()=>$('#file-img').click());
$('#file-img').addEventListener('change',async e=>{
  const f=e.target.files&&e.target.files[0];e.target.value='';const r=sel();if(!f||!r)return;
  try{const url=await readImage(f);commit();r.data.img=url;setNodeImage(r);fillPanel(r);save();toast('Immagine aggiunta.');}
  catch(err){toast('Immagine non caricata: '+err.message);}
});
$('#b-img-rm').addEventListener('click',()=>{const r=sel();if(!r)return;commit();r.data.img=null;setNodeImage(r);fillPanel(r);applyStyles();save();});

/* ---- Pulsanti ---- */
$('#b-child').addEventListener('click',()=>{const p=sel();if(p)addNode(p);});
$('#b-link').addEventListener('click',()=>startPick('link'));
$('#b-path').addEventListener('click',()=>startPick('path'));
$('#b-collapse').addEventListener('click',toggleCollapse);
$('#b-pin').addEventListener('click',togglePin);
$('#b-tour').addEventListener('click',toggleTour);
$('#b-copy').addEventListener('click',copySelection);
$('#b-paste').addEventListener('click',paste);
$('#b-close').addEventListener('click',deselect);
$('#path-close').addEventListener('click',clearPath);
$('#b-undo').addEventListener('click',undo);
$('#b-redo').addEventListener('click',redo);
$('#d-add').addEventListener('click',()=>addNode(sel()));
$('#d-fit').addEventListener('click',overview);
$('#d-pres').addEventListener('click',startPresentation);

/* ---- Menu ---- */
const menu=$('#menu'),moreBtn=$('#d-more');
function openMenu(v){menu.hidden=!v;moreBtn.setAttribute('aria-expanded',String(v));if(v)syncMenu();}
function syncMenu(){
  const set=(id,on)=>{const b=$(id);b.setAttribute('aria-checked',String(on));b.querySelector('.state').textContent=on?'Attiva':'Spenta';};
  set('#m-rot',autoRotateOn);set('#m-dim',is2D);set('#m-focus',focusMode);set('#m-multi',multiMode);set('#m-minimap',!mm.hidden);
  $('#m-paste').disabled=!clip;
  updateLayoutState();
}
moreBtn.addEventListener('click',e=>{e.stopPropagation();openMenu(menu.hidden);});
document.addEventListener('pointerdown',e=>{
  if(!menu.hidden&&!e.target.closest('#menu')&&!e.target.closest('#d-more'))openMenu(false);
  if(!acctMenu.hidden&&!e.target.closest('#acct-menu')&&!e.target.closest('#acct-btn'))openAcctMenu(false);
  if(!e.target.closest('.search')){$('#results').hidden=true;if(!e.target.closest('#b-search'))document.body.classList.remove('search-open');}
  if(pendingDrop&&!e.target.closest('#dropmenu'))finishDrop(pendingDrop,'cancel');
});
$('#m-rot').addEventListener('click',()=>{autoRotateOn=!autoRotateOn;syncMenu();});
$('#m-dim').addEventListener('click',()=>{openMenu(false);setDim(!is2D);});
$('#b-dim').addEventListener('click',()=>setDim(!is2D));
$('#m-focus').addEventListener('click',()=>{focusMode=!focusMode;store.settings.focus=focusMode;syncMenu();save();toast(focusMode?'Modalità focus attiva: quando tocchi un’idea la vista si avvicina e la segue.':'Modalità focus spenta: toccando un’idea la vista resta ferma.',3500);});
$('#m-minimap').addEventListener('click',()=>{store.settings.minimap=mm.hidden;mm.hidden=!store.settings.minimap;syncMenu();save();});
$('#m-png').addEventListener('click',()=>{openMenu(false);snapshotPNG();});
$('#m-data').addEventListener('click',()=>{openMenu(false);openData();});
$('#m-maps').addEventListener('click',()=>{openMenu(false);openMaps();});
$('#m-settings').addEventListener('click',()=>{openMenu(false);openSettings();});
$('#m-keys').addEventListener('click',()=>{openMenu(false);$('#dlg-keys').showModal();});
$('#m-layout').addEventListener('click',()=>{openMenu(false);openLayout();});
$('#m-views').addEventListener('click',()=>{openMenu(false);openViews();});
$('#m-versions').addEventListener('click',()=>{openMenu(false);openVersions();});
$('#m-paste').addEventListener('click',()=>{openMenu(false);paste();});
$('#m-ai').addEventListener('click',()=>{openMenu(false);aiLinks();});
$('#m-vr').addEventListener('click',()=>{openMenu(false);enterVR();});
document.querySelectorAll('.dlg-close').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));

/* ---- Filtri per tag ---- */
function renderFilters(){
  const box=$('#filters'),tags=allTags();box.innerHTML='';
  if(!tags.length){box.hidden=true;document.body.classList.remove('has-filters');activeTag=null;return;}
  box.hidden=false;document.body.classList.add('has-filters');
  const chip=(label,val)=>{const b=mk('button','chip glass',label);b.type='button';b.setAttribute('aria-pressed',String(activeTag===val));
    b.addEventListener('click',()=>{activeTag=val;renderFilters();applyStyles();
      if(val){const m=simList.filter(r=>r.data.tags.includes(val));toast('Tag “'+val+'”: '+plural(m.length,'idea','idee')+'.');if(m.length&&!selected)flyToFit(m);}});
    box.appendChild(b);};
  chip('Tutte le idee',null);tags.forEach(([t,c])=>chip('#'+t+' '+c,t));
}

/* ---- Ricerca (titoli, tag e note) ---- */
const q=$('#q'),results=$('#results');
function setSearchTerm(t){searchTerm=t;for(const r of nodeList)renderLabel(r);const s=sel();if(s&&document.activeElement!==noteEd)renderNoteEditor(s);}
function snippet(text,term){
  const low=text.toLowerCase(),i=low.indexOf(term);if(i<0)return null;
  const a=Math.max(0,i-30),b=Math.min(text.length,i+term.length+50);
  return (a>0?'…':'')+esc(text.slice(a,i))+'<mark>'+esc(text.slice(i,i+term.length))+'</mark>'+esc(text.slice(i+term.length,b))+(b<text.length?'…':'');
}
function revealNode(id){
  const parents=new Map();for(const l of map.links)(parents.get(l.t)||parents.set(l.t,[]).get(l.t)).push(l.s);
  const st=[id],seen=new Set();let changed=false;
  while(st.length){const x=st.pop();if(seen.has(x))continue;seen.add(x);for(const p of parents.get(x)||[]){const n=map.nodes.find(z=>z.id===p);if(n&&n.collapsed){n.collapsed=false;changed=true;}st.push(p);}}
  if(changed){refreshTopology();reheat(.4);save();toast('Ho espanso il ramo che conteneva “'+nodes.get(id).data.label+'”.');}
}
function pickResult(id,term){
  q.value='';results.hidden=true;q.blur();hideHint();document.body.classList.remove('search-open');
  const r=nodes.get(id);if(r&&r.hidden)revealNode(id);
  clearPath();clearMulti(true);
  setSearchTerm(term);selectNode(id,{keepSearch:true,force:true});
}
q.addEventListener('input',()=>{
  const s=q.value.trim().toLowerCase().replace(/^#/,'');results.innerHTML='';
  if(!s){results.hidden=true;if(searchTerm)setSearchTerm('');return;}
  const m=[];
  for(const n of map.nodes){
    const inL=n.label.toLowerCase().includes(s),inT=n.tags.some(t=>t.toLowerCase().includes(s)),sn=snippet(n.note||'',s);
    if(inL||inT||sn)m.push({n,score:inL?0:inT?1:2,sn});
  }
  m.sort((a,b)=>a.score-b.score);
  if(!m.length)results.appendChild(mk('li','empty','Nessuna idea, tag o nota contiene “'+s+'”.'));
  else m.slice(0,10).forEach(({n,sn,score})=>{
    const li=mk('li'),b=mk('button');b.type='button';
    b.innerHTML=(score===0?snippet(n.label,s):esc(n.label))+'<small>'+(score===2?sn:n.tags.map(t=>'#'+esc(t)).join(' ')||'&nbsp;')+'</small>';
    b.addEventListener('click',()=>pickResult(n.id,s));li.appendChild(b);results.appendChild(li);
  });
  if(m.length>10)results.appendChild(mk('li','empty','Altri '+(m.length-10)+' risultati: aggiungi parole per restringere.'));
  results.hidden=false;
});
q.addEventListener('keydown',e=>{
  if(e.key==='Enter'){const b=results.querySelector('button');if(b)b.click();}
  if(e.key==='Escape'){q.value='';results.hidden=true;q.blur();setSearchTerm('');document.body.classList.remove('search-open');}
});

/* ================= Puntatore: selezione, trascinamento, riquadro ================= */
const ray=new THREE.Raycaster(),ndc=new THREE.Vector2(),dragPlane=new THREE.Plane();
function setRay(x,y){ndc.set(x/innerWidth*2-1,-(y/innerHeight)*2+1);ray.setFromCamera(ndc,camera);}
function pickAt(x,y,exclude,touch){
  let best=null,bd=Infinity;
  for(const r of simList){
    if(!r.onscreen||r.L<.1||r.id===exclude)continue;
    const tol=Math.max(r.sr*1.35,touch?20:13);
    const dd=(r.sx-x)**2+(r.sy-y)**2;
    if(dd<=tol*tol&&r.sd<bd){best=r;bd=r.sd;}
  }
  return best?best.id:null;
}
const lassoEl=$('#lasso'),dropHint=$('#drophint');
$('#stage').addEventListener('pointerdown',e=>{
  hideHint();
  if(renderer.xr.isPresenting)return;
  if(down||lasso){controls.enabled=true;down=null;lasso=null;lassoEl.hidden=true;return;}
  if(e.pointerType==='mouse'&&e.button!==0)return;
  const touch=e.pointerType!=='mouse';
  const id=pickAt(e.clientX,e.clientY,null,touch);
  if(!id&&!READONLY&&!pres&&!pick&&(e.shiftKey||multiMode)){
    lasso={x:e.clientX,y:e.clientY,pid:e.pointerId,add:true,moved:false};controls.enabled=false;
    try{cv.setPointerCapture(e.pointerId);}catch(err){}return;
  }
  down={x:e.clientX,y:e.clientY,t:performance.now(),id,dragging:false,pid:e.pointerId,touch,shift:e.shiftKey||e.ctrlKey||e.metaKey};
  if(id&&!pick&&!pres&&!READONLY){controls.enabled=false;try{cv.setPointerCapture(e.pointerId);}catch(err){}}
},true);
cv.addEventListener('pointermove',e=>{
  if(lasso&&e.pointerId===lasso.pid){
    const x0=Math.min(lasso.x,e.clientX),y0=Math.min(lasso.y,e.clientY),w=Math.abs(e.clientX-lasso.x),h=Math.abs(e.clientY-lasso.y);
    if(w+h>8){lasso.moved=true;lassoEl.hidden=false;Object.assign(lassoEl.style,{left:x0+'px',top:y0+'px',width:w+'px',height:h+'px'});}
    return;
  }
  if(down&&down.id&&!controls.enabled&&e.pointerId===down.pid){
    const r=nodes.get(down.id);if(!r)return;
    if(!down.dragging&&Math.hypot(e.clientX-down.x,e.clientY-down.y)>6){
      down.dragging=true;commit();anim=null;
      const group=multi.has(r.id)&&multi.size>1?[...multi].map(id=>nodes.get(id)).filter(Boolean):[r];
      down.group=group.map(m=>({r:m,off:m.pos.clone().sub(r.pos),start:m.pos.clone(),wasPinned:!!m.data.pinned}));
      down.moving=new Set(group.map(m=>m.id));
      if(map.layout==='force')for(const m of group)if(!m.data.pinned){m.data.pinned=true;renderLabel(m);}
      camera.getWorldDirection(_d);dragPlane.setFromNormalAndCoplanarPoint(_d.clone(),r.pos);
    }
    if(down.dragging){
      setRay(e.clientX,e.clientY);
      if(ray.ray.intersectPlane(dragPlane,_p)){
        for(const g of down.group){g.r.pos.copy(_p).add(g.off);g.r.vel.set(0,0,0);}
        geomDirty=true;if(map.layout==='force')reheat(.12);
        if(selected===r.id)lastSel.copy(r.pos);
      }
      if(down.group.length===1){
        const t=pickAt(e.clientX,e.clientY,r.id,down.touch);
        down.drop=t;
        if(t){dropHint.textContent=dropHintText(nodes.get(t).data.label,e);dropHint.hidden=false;dropHint.style.transform='translate('+(e.clientX+16)+'px,'+(e.clientY+14)+'px)';}
        else dropHint.hidden=true;
      }
    }
    return;
  }
  if(e.pointerType==='mouse'&&!e.buttons)cv.style.cursor=pickAt(e.clientX,e.clientY)?(READONLY?'pointer':'grab'):'';
});
let pendingDrop=null;
function dropHintText(label,e){
  const a=store.settings.dropAction;
  if(e&&e.altKey)return 'Rilascia per collegarla a “'+label+'”';
  if(e&&e.shiftKey)return 'Rilascia per spostarla sotto “'+label+'”';
  if(a==='move')return 'Rilascia per spostarla sotto “'+label+'” (Alt: collega)';
  if(a==='link')return 'Rilascia per collegarla a “'+label+'” (Maiusc: sposta)';
  return 'Rilascia su “'+label+'” per scegliere se spostarla o collegarla';
}
function revertDrag(d){
  for(const g of d.group){g.r.pos.copy(g.start);g.r.vel.set(0,0,0);g.r.data.pinned=g.wasPinned;renderLabel(g.r);}
  geomDirty=true;
}
function finishDrop(d,act){
  dropMenu.hidden=true;pendingDrop=null;
  const r=nodes.get(d.id),t=nodes.get(d.drop);if(!r||!t)return;
  if(act==='move'){reparent(d.id,d.drop);return;}
  revertDrag(d);
  if(act==='cancel'){undoStack.pop();updateUndoUI();toast('Nessuna modifica: l’idea è tornata al suo posto.');return;}
  if(linkBetween(d.id,d.drop)){undoStack.pop();updateUndoUI();toast('“'+r.data.label+'” e “'+t.data.label+'” sono già collegate.');return;}
  const l={s:d.id,t:d.drop,label:'',type:'normal'};map.links.push(l);buildLink(l);
  refreshTopology();reheat(.3);save();
  const s=sel();if(s)fillPanel(s);
  toast('“'+r.data.label+'” collegata a “'+t.data.label+'”. Puoi annullare con Ctrl+Z.');
}
const dropMenu=$('#dropmenu');
function openDropMenu(d,x,y){
  pendingDrop=d;const r=nodes.get(d.id),t=nodes.get(d.drop);
  $('#dm-title').textContent='“'+r.data.label+'” su “'+t.data.label+'”';
  $('#dm-move').textContent='Sposta sotto “'+t.data.label+'”';
  $('#dm-link').textContent='Collega a “'+t.data.label+'”';
  dropMenu.hidden=false;
  const b=dropMenu.getBoundingClientRect();
  dropMenu.style.left=clamp(x+12,8,innerWidth-b.width-8)+'px';dropMenu.style.top=clamp(y+12,8,innerHeight-b.height-8)+'px';
  $('#dm-move').focus({preventScroll:true});
}
$('#dm-move').addEventListener('click',()=>{if(pendingDrop)finishDrop(pendingDrop,'move');});
$('#dm-link').addEventListener('click',()=>{if(pendingDrop)finishDrop(pendingDrop,'link');});
$('#dm-cancel').addEventListener('click',()=>{if(pendingDrop)finishDrop(pendingDrop,'cancel');});
let dragToastShown=false;
function endPointer(e,cancel){
  if(lasso){
    const l=lasso;lasso=null;lassoEl.hidden=true;controls.enabled=true;try{cv.releasePointerCapture(l.pid);}catch(err){}
    if(cancel)return;
    if(!l.moved){const id=pickAt(e.clientX,e.clientY);if(id)toggleMulti(id);return;}
    const x0=Math.min(l.x,e.clientX),x1=Math.max(l.x,e.clientX),y0=Math.min(l.y,e.clientY),y1=Math.max(l.y,e.clientY);
    if(!multi.size&&selected)multi.add(selected);
    let added=0;for(const r of simList)if(r.onscreen&&r.L>=.1&&r.sx>=x0&&r.sx<=x1&&r.sy>=y0&&r.sy<=y1){if(!multi.has(r.id))added++;multi.add(r.id);}
    afterMulti();if(added)toast(plural(multi.size,'idea selezionata','idee selezionate')+'.');
    return;
  }
  if(!down)return;
  const d=down;down=null;controls.enabled=true;dropHint.hidden=true;
  try{cv.releasePointerCapture(d.pid);}catch(err){}
  if(cancel)return;
  if(d.dragging){
    if(d.drop&&d.group.length===1){const mod=e.altKey?'link':e.shiftKey?'move':null;const act=mod||(store.settings.dropAction!=='ask'?store.settings.dropAction:null);if(act)finishDrop(d,act);else openDropMenu(d,e.clientX,e.clientY);return;}
    if(map.layout!=='force'){layoutMoving=true;toast('In questa disposizione le posizioni sono calcolate: scegli “Libera” per spostare le idee a mano.',4000);return;}
    save();const r=nodes.get(d.id);if(r&&selected===r.id)fillPanel(r);
    if(!dragToastShown){dragToastShown=true;toast(d.group.length>1?'Idee spostate e fissate in posizione.':'Idea spostata e fissata in posizione. Puoi sbloccarla dal pannello, oppure rilasciarla sopra un’altra idea per spostarla o collegarla.',4500);}
    return;
  }
  if(Math.hypot(e.clientX-d.x,e.clientY-d.y)<7&&performance.now()-d.t<650)handlePick(d.id||pickAt(e.clientX,e.clientY,null,d.touch),{shiftKey:d.shift});
}
cv.addEventListener('pointerup',e=>endPointer(e,false));
cv.addEventListener('pointercancel',e=>endPointer(e,true));
cv.addEventListener('dblclick',e=>{const id=pickAt(e.clientX,e.clientY);if(id&&!pres&&!e.shiftKey){selectNode(id);focusTitle();}});
controls.addEventListener('start',()=>{if(anim){anim=null;const s=sel();if(s)lastSel.copy(s.pos);}});

/* ================= Tastiera ================= */
function navigate(dx,dy){
  const r=sel();
  if(!r){const root=nodes.get(rootId);if(root&&!root.hidden)selectNode(root.id);return;}
  let best=null,bs=-Infinity;
  for(const id of r.nb){
    const o=nodes.get(id);if(o.hidden||!o.onscreen||o.L<.1)continue;
    const vx=o.sx-r.sx,vy=o.sy-r.sy,len=Math.hypot(vx,vy)||1,dot=(vx*dx+vy*dy)/len;
    if(dot<.3)continue;const sc=dot*2-len/600;if(sc>bs){bs=sc;best=o;}
  }
  if(!best){
    for(const id of r.nb){const o=nodes.get(id);if(o.hidden||o.onscreen)continue;best=o;break;}
  }
  if(best)selectNode(best.id);
}
document.addEventListener('keydown',e=>{
  const typing=e.target.closest&&e.target.closest('input,textarea,select,[contenteditable]');
  if(document.querySelector('dialog[open]'))return;
  if(pendingDrop){if(e.key==='Escape'){e.preventDefault();finishDrop(pendingDrop,'cancel');}return;}
  if(pres){
    if(e.key==='ArrowRight'||e.key===' '||e.key==='PageDown'){e.preventDefault();presGo(pres.i+1);}
    else if(e.key==='ArrowLeft'||e.key==='PageUp'){e.preventDefault();presGo(pres.i-1);}
    else if(e.key==='Escape')stopPresentation();
    return;
  }
  if(typing)return;
  const mod=e.ctrlKey||e.metaKey,k=e.key;
  if(e.altKey&&/^Digit[1-9]$/.test(e.code)){const v=map.views[+e.code.slice(5)-1];if(v){e.preventDefault();goView(v);}return;}
  if(mod){
    const kl=k.toLowerCase();
    if(kl==='z'&&!e.shiftKey){e.preventDefault();undo();}
    else if(kl==='y'||(kl==='z'&&e.shiftKey)){e.preventDefault();redo();}
    else if(kl==='c'&&(selected||multi.size>1)&&!window.getSelection().toString()){e.preventDefault();copySelection();}
    else if(kl==='v'&&clip&&!READONLY){e.preventDefault();paste();}
    else if(kl==='a'&&!READONLY){e.preventDefault();selectAllVisible();}
    return;
  }
  if(k==='?'){e.preventDefault();$('#dlg-keys').showModal();return;}
  if(k==='Escape'){
    if(!nodeMenu.hidden){openNodeMenu(false);return;}
    if(!acctMenu.hidden){openAcctMenu(false);return;}
    if(!menu.hidden){openMenu(false);return;}
    if(!side.hidden){openSide(false);return;}
    if(pick){cancelPick(pick.type==='link'?'Collegamento annullato.':'Ricerca del percorso annullata.');return;}
    if(path){clearPath();return;}
    if(multiMode){setMultiMode(false);return;}
    if(multi.size){clearMulti();return;}
    if(searchTerm)setSearchTerm('');
    deselect();return;
  }
  if(k.startsWith('Arrow')){e.preventDefault();navigate(k==='ArrowLeft'?-1:k==='ArrowRight'?1:0,k==='ArrowUp'?-1:k==='ArrowDown'?1:0);return;}
  if(READONLY)return;
  if(k==='Delete'||k==='Backspace'){if(multi.size>1){e.preventDefault();deleteNodes([...multi]);}else if(selected){e.preventDefault();deleteNodes([selected]);}return;}
  if(k==='Tab'&&selected){e.preventDefault();addNode(sel());return;}
  if(k==='Enter'&&selected){e.preventDefault();addSibling();return;}
  if(k==='F2'&&selected){e.preventDefault();focusTitle();return;}
  if(selected&&k.length===1&&k!==' '&&!e.altKey&&!panel.hidden&&!$('#single').hidden){
    e.preventDefault();titleIn.focus();titleIn.value=k;titleIn.dispatchEvent(new Event('input'));titleIn.setSelectionRange(1,1);
  }
});

/* ================= Presentazione ================= */
function tourIds(){
  const valid=map.tour.filter(id=>nodes.has(id)&&!nodes.get(id).hidden);
  if(valid.length)return valid;
  const root=nodes.get(rootId);if(!root)return simList.map(r=>r.id);
  const order=[],dfs=r=>{if(r.hidden)return;order.push(r.id);r.tKids.forEach(dfs);};dfs(root);
  simList.forEach(r=>{if(!order.includes(r.id))order.push(r.id);});
  return order;
}
let presTimer;
function startPresentation(){
  openMenu(false);finishNoteEdit();clearPath();clearMulti(true);if(pick)cancelPick();
  const ids=tourIds();if(!ids.length)return;
  pres={ids,i:0,auto:false};
  closePanel();document.body.classList.add('presenting');$('#pres').hidden=false;
  $('#p-auto').setAttribute('aria-pressed','false');
  if(!map.tour.length)toast('Nessuna tappa scelta: la presentazione segue i rami a partire dall’idea centrale.',4500);
  presGo(0);
}
function presGo(i){
  if(!pres)return;
  pres.i=(i+pres.ids.length)%pres.ids.length;
  const r=nodes.get(pres.ids[pres.i]);if(!r)return;
  selected=null;selectNode(r.id);
  $('#pres-step').textContent=(pres.i+1)+' di '+pres.ids.length;
  $('#pres-title').textContent=r.data.label;
  const pn=$('#pres-note');
  if((r.data.note||'').trim()){pn.innerHTML=md(r.data.note);pn.hidden=false;}else{pn.innerHTML='';pn.hidden=true;}
  clearTimeout(presTimer);if(pres.auto)presTimer=setTimeout(()=>presGo(pres.i+1),7000);
}
function stopPresentation(){
  if(!pres)return;clearTimeout(presTimer);pres=null;
  document.body.classList.remove('presenting');$('#pres').hidden=true;
  const keep=selected;selected=null;applyStyles();if(keep)selectNode(keep,{fly:false});
}
$('#p-prev').addEventListener('click',()=>presGo(pres.i-1));
$('#p-next').addEventListener('click',()=>presGo(pres.i+1));
$('#p-exit').addEventListener('click',stopPresentation);
$('#p-auto').addEventListener('click',()=>{if(!pres)return;pres.auto=!pres.auto;$('#p-auto').setAttribute('aria-pressed',String(pres.auto));clearTimeout(presTimer);if(pres.auto)presTimer=setTimeout(()=>presGo(pres.i+1),7000);});

/* ================= File e download ================= */
function slug(s){return (s||'mappa').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'mappa';}
async function downloadFile(filename,data,say){
  say=say||toast;let dl=null;try{dl=await dlCap;}catch(e){}
  if(dl){
    try{await dl.save({filename,data});say('File “'+filename+'” salvato.');}
    catch(e){
      if(e&&e.code==='declined')return;
      if(e&&e.code==='rate_limited'){say('C’è già una richiesta di salvataggio aperta: completala e riprova.');return;}
      if(e&&(e.code==='extension_not_enabled'||e.code==='rejected_extension')){say('Questo tipo di file non si può salvare da qui. Copia il contenuto, oppure apri la pagina fuori da claude.ai.');return;}
      say('Il file non è stato salvato: '+((e&&e.message)||'salvataggio non disponibile qui.'));
    }
    return;
  }
  try{
    const blob=data instanceof Blob?data:new Blob([data],{type:'text/plain'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;document.body.appendChild(a);a.click();
    setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1500);
  }catch(e){say('Il salvataggio dei file non è disponibile in questa pagina.');}
}
function snapshotPNG(){
  updateNodesGfx(time);renderFrame();
  const src=cv,c=document.createElement('canvas');c.width=src.width;c.height=src.height;
  const g=c.getContext('2d');g.drawImage(src,0,0);
  const pr=src.width/innerWidth,fam='"Bricolage Grotesque", system-ui, sans-serif';
  g.textAlign='center';g.shadowColor='rgba(3,4,14,.9)';g.shadowBlur=8*pr;
  for(const l of links){if(!l.el||!l.vis)continue;g.globalAlpha=l.lo;g.textBaseline='middle';g.font='italic 400 '+(11.5*l.ls*pr)+'px '+fam;g.fillStyle='#98a1dc';g.fillText(l.data.label,l.lx*pr,l.ly*pr);}
  g.textBaseline='bottom';
  for(const r of nodeList){
    if(!r.vis)continue;g.globalAlpha=r.lo;
    const size=(r.isRoot?17:13)*r.ls*pr;g.font=(r.isRoot||r.data.imp>=4?'700 ':'600 ')+size+'px '+fam;
    g.fillStyle=r.id===selected?'#ffcf70':'#e9ecff';
    let t=r.data.label;if(t.length>26)t=t.slice(0,25)+'…';g.fillText(t,r.lx*pr,r.ly*pr-2*pr);
  }
  g.globalAlpha=1;
  c.toBlob(b=>{if(!b){toast('Non è stato possibile creare l’immagine.');return;}downloadFile(slug(map.name)+'.png',b);},'image/png');
}

/* ================= Importa ed esporta ================= */
const dlgData=$('#dlg-data'),dataStatus=t=>{$('#data-status').textContent=t;};
function setTab(which){
  ['json','outline','other'].forEach(t=>{$('#tab-'+t).setAttribute('aria-selected',String(t===which));$('#pane-'+t).hidden=t!==which;});dataStatus('');
}
let resetArmed=false;
function openData(){
  $('#json-text').value=JSON.stringify(exportMap(),null,2);$('#json-text').readOnly=READONLY;
  $('#outline-text').value=toOutline();$('#outline-text').readOnly=READONLY;
  resetArmed=false;$('#json-reset').textContent='Ripristina esempio';$('#json-reset').classList.remove('armed');
  setTab('json');dlgData.showModal();
}
$('#tab-json').addEventListener('click',()=>setTab('json'));
$('#tab-outline').addEventListener('click',()=>setTab('outline'));
$('#tab-other').addEventListener('click',()=>setTab('other'));
function copyText(ta,say){
  const fallback=()=>{ta.focus();ta.select();let ok=false;try{ok=document.execCommand('copy');}catch(e){}say(ok?'Testo copiato negli appunti.':'Testo selezionato: copialo con il menu del dispositivo.');};
  if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(ta.value).then(()=>say('Testo copiato negli appunti.'),fallback);else fallback();
}
$('#json-copy').addEventListener('click',()=>copyText($('#json-text'),dataStatus));
$('#outline-copy').addEventListener('click',()=>copyText($('#outline-text'),dataStatus));
$('#json-dl').addEventListener('click',()=>downloadFile(slug(map.name)+'.json',$('#json-text').value,dataStatus));
$('#outline-dl').addEventListener('click',()=>downloadFile(slug(map.name)+'.md',$('#outline-text').value,dataStatus));
$('#dl-opml').addEventListener('click',()=>downloadFile(slug(map.name)+'.opml',toOPML(),dataStatus));
$('#dl-viewer').addEventListener('click',async()=>{
  dataStatus('Preparo il visualizzatore…');
  let h=null;try{h=await buildViewerHTML();}catch(e){h=null;}
  if(!h){dataStatus('Non riesco a preparare il visualizzatore: controlla la connessione e riprova.');return;}
  downloadFile(slug(map.name)+'-visualizzatore.html',h,dataStatus);
});
$('#json-load').addEventListener('click',()=>{
  let m;
  try{m=sanitizeMap(JSON.parse($('#json-text').value));}
  catch(e){dataStatus('Il testo non è una mappa valida: '+(e instanceof SyntaxError?'controlla che il JSON sia completo.':e.message));return;}
  commit();
  Object.assign(map,{nodes:m.nodes,links:m.links,tour:m.tour,layout:m.layout,views:m.views,name:m.name||map.name});
  activeTag=null;build();save();dlgData.close();toast('Mappa sostituita: '+plural(m.nodes.length,'idea','idee')+'.',0,{label:'Annulla',fn:()=>undo()});
});
$('#json-reset').addEventListener('click',e=>{
  const b=e.currentTarget;
  if(!resetArmed){resetArmed=true;b.textContent='Tocca di nuovo: la mappa aperta verrà sostituita';b.classList.add('armed');return;}
  commit();const s=sampleMap();Object.assign(map,{nodes:s.nodes,links:s.links,tour:[],layout:s.layout,name:s.name});
  activeTag=null;build();save();dlgData.close();toast('Mappa di esempio ripristinata.');
});
function treeOf(){
  const out=new Map();for(const l of map.links)(out.get(l.s)||out.set(l.s,[]).get(l.s)).push(l.t);
  const byId=new Map(map.nodes.map(n=>[n.id,n])),incoming=new Set(map.links.map(l=>l.t));
  const roots=map.nodes.filter(n=>n.id===rootId||!incoming.has(n.id));
  const seen=new Set(),walk=id=>{if(seen.has(id))return null;seen.add(id);const n=byId.get(id);return {n,kids:(out.get(id)||[]).map(walk).filter(Boolean)};};
  const res=roots.map(r=>walk(r.id)).filter(Boolean);map.nodes.forEach(n=>{const t=walk(n.id);if(t)res.push(t);});
  return res;
}
function toOutline(){
  const lines=[];
  const w=(t,d)=>{const n=t.n;lines.push('  '.repeat(d)+'- '+n.label.replace(/\s+/g,' ')+(n.tags.length?' '+n.tags.map(x=>'#'+x.replace(/\s+/g,'_')).join(' '):''));t.kids.forEach(k=>w(k,d+1));};
  treeOf().forEach(t=>w(t,0));
  return '# '+map.name+'\n\n'+lines.join('\n')+'\n';
}
function xmlEsc(s){return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])).replace(/\n/g,'&#10;');}
function toOPML(){
  const w=(t,d)=>{const n=t.n,pad='  '.repeat(d+2);const attrs='text="'+xmlEsc(n.label)+'"'+(n.note?' _note="'+xmlEsc(n.note)+'"':'');return t.kids.length?pad+'<outline '+attrs+'>\n'+t.kids.map(k=>w(k,d+1)).join('')+pad+'</outline>\n':pad+'<outline '+attrs+'/>\n';};
  return '<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0">\n  <head><title>'+xmlEsc(map.name)+'</title></head>\n  <body>\n'+treeOf().map(t=>w(t,0)).join('')+'  </body>\n</opml>\n';
}
function itemsToMap(title,tops,cross){
  const ns=[],ls=[];const idOf=new Map();
  let root=null,topList=tops;
  if(tops.length===1){topList=tops[0].kids;}
  const mkNode=(it,hue)=>{const n=blankNode(it.label.slice(0,120)||'Senza titolo',hue);n.note=(it.note||'').slice(0,20000);n.tags=(it.tags||[]).slice(0,12);n.collapsed=!!it.collapsed;ns.push(n);if(it.xid)idOf.set(it.xid,n.id);return n;};
  root=tops.length===1?mkNode(tops[0],null):mkNode({label:title||'Mappa importata'},null);
  const add=(it,parent,hue)=>{const n=mkNode(it,hue);ls.push({s:parent.id,t:n.id,label:'',type:'normal'});(it.kids||[]).forEach(k=>add(k,n,hue));};
  topList.forEach((it,i)=>add(it,root,HUES[i%HUES.length]));
  ns.forEach((n,i)=>{n.created=Date.now()-(ns.length-i)*60000;});
  (cross||[]).forEach(([a,b])=>{const s=idOf.get(a),t=idOf.get(b);if(s&&t&&s!==t&&!ls.some(l=>(l.s===s&&l.t===t)||(l.s===t&&l.t===s)))ls.push({s,t,label:'',type:'arrow'});});
  root.collapsed=false;
  return {id:null,name:(title||root.label).slice(0,60),nodes:ns,links:ls,tour:[],layout:'sphere',views:[],versions:[],created:Date.now()};
}
function fromOutline(text){
  const raw=text.replace(/\r/g,'').split('\n');let title=null,base=0;const items=[];
  const indents=raw.map(l=>(l.match(/^[ \t]*/)[0].replace(/\t/g,'    ')).length).filter(n=>n>0);
  const unit=indents.length?Math.min(...indents):2;
  for(const line of raw){
    if(!line.trim())continue;
    const indent=line.match(/^[ \t]*/)[0].replace(/\t/g,'    ').length;
    let s=line.trim();const h=s.match(/^(#{1,6})\s+(.*)$/);let level;
    if(h){const n=h[1].length;if(n===1&&title===null&&!items.length){title=h[2].trim();continue;}level=Math.max(0,n-2);base=level+1;s=h[2];}
    else{s=s.replace(/^([-*+]|\d+[.)])\s+/,'').replace(/^\[[ xX]\]\s+/,'');level=base+Math.round(indent/unit);}
    const tags=[];
    s=s.replace(/(^|\s)#([\p{L}\p{N}_-]+)/gu,(m,sp,t)=>{tags.push(t.replace(/_/g,' '));return sp;}).trim();
    if(!s)continue;
    items.push({level,label:s,tags:[...new Set(tags)],kids:[]});
  }
  if(!items.length)throw new Error('il testo non contiene righe utilizzabili.');
  const minL=Math.min(...items.map(x=>x.level));const tops=[],stack=[];
  for(const it of items){const lvl=it.level-minL;while(stack.length&&stack[stack.length-1].lvl>=lvl)stack.pop();if(stack.length)stack[stack.length-1].it.kids.push(it);else tops.push(it);stack.push({lvl,it});}
  return itemsToMap(title,title&&tops.length===1?[{label:title,kids:tops}]:tops);
}
function parseXML(text){const doc=new DOMParser().parseFromString(text,'text/xml');if(doc.querySelector('parsererror'))throw new Error('il file XML non è leggibile.');return doc;}
function fromOPML(text){
  const doc=parseXML(text);const body=doc.querySelector('body');if(!body)throw new Error('il file OPML non ha un elemento body.');
  const title=(doc.querySelector('head > title')||{}).textContent||null;
  const walk=o=>({label:(o.getAttribute('text')||o.getAttribute('title')||'').trim(),note:o.getAttribute('_note')||'',kids:[...o.children].filter(c=>c.tagName==='outline').map(walk)});
  const tops=[...body.children].filter(c=>c.tagName==='outline').map(walk);
  if(!tops.length)throw new Error('il file OPML non contiene voci.');
  return itemsToMap(title&&title.trim(),tops);
}
function fromFreeMind(text){
  const doc=parseXML(text);const top=doc.querySelector('map > node');if(!top)throw new Error('il file non sembra una mappa FreeMind o Freeplane.');
  const cross=[];
  const txt=n=>{const a=n.getAttribute('TEXT');if(a)return a;const rc=[...n.children].find(c=>c.tagName==='richcontent'&&c.getAttribute('TYPE')==='NODE');return rc?rc.textContent.trim().replace(/\s+/g,' '):'';};
  const walk=n=>{
    const noteEl=[...n.children].find(c=>c.tagName==='richcontent'&&c.getAttribute('TYPE')==='NOTE');
    [...n.children].filter(c=>c.tagName==='arrowlink').forEach(a=>{if(n.getAttribute('ID')&&a.getAttribute('DESTINATION'))cross.push([n.getAttribute('ID'),a.getAttribute('DESTINATION')]);});
    return {label:txt(n),xid:n.getAttribute('ID'),collapsed:n.getAttribute('FOLDED')==='true',note:noteEl?noteEl.textContent.trim().replace(/\n\s*\n\s*/g,'\n\n'):'',kids:[...n.children].filter(c=>c.tagName==='node').map(walk)};
  };
  const t=walk(top);return itemsToMap(t.label,[t],cross);
}
$('#outline-new').addEventListener('click',()=>{
  let m;try{m=fromOutline($('#outline-text').value);}catch(e){dataStatus('Non riesco a creare la mappa: '+e.message);return;}
  addMapAndOpen(m);dlgData.close();toast('Nuova mappa “'+m.name+'” creata con '+plural(m.nodes.length,'idea','idee')+'.');
});
$('#import-file').addEventListener('click',()=>$('#file-import').click());
$('#file-import').addEventListener('change',async e=>{
  const f=e.target.files&&e.target.files[0];e.target.value='';if(!f)return;
  let m;
  try{
    const text=await f.text();const name=f.name.toLowerCase();
    if(name.endsWith('.opml')||/<opml[\s>]/i.test(text))m=fromOPML(text);
    else if(name.endsWith('.mm')||/<map[\s>][\s\S]*<node/i.test(text))m=fromFreeMind(text);
    else if(name.endsWith('.json')){m=sanitizeMap(JSON.parse(text));}
    else m=fromOutline(text);
    if(!m.name||m.name==='Mappa senza nome')m.name=f.name.replace(/\.[^.]+$/,'').slice(0,60);
  }catch(err){dataStatus('Importazione non riuscita: '+(err instanceof SyntaxError?'il JSON non è valido.':err.message));return;}
  addMapAndOpen(m);dlgData.close();toast('Importata “'+m.name+'”: '+plural(m.nodes.length,'idea','idee')+'.');
});
async function buildViewerHTML(){
  if(!SOURCE_CLONE)return null;
  const c=SOURCE_CLONE.cloneNode(true);
  c.querySelectorAll('meta[http-equiv],link[rel="manifest"],link[rel~="icon"],link[rel="apple-touch-icon"],link[rel="stylesheet"]').forEach(e=>e.remove());
  for(const sc of [...c.querySelectorAll('script[src]')]){
    const src=sc.getAttribute('src');
    const r=await fetch(src);if(!r.ok)throw new Error(src);
    const n=document.createElement('script');n.textContent=(await r.text()).replace(/<\/script/gi,'<\\/script');
    sc.replaceWith(n);
  }
  const e=document.createElement('script');
  e.textContent='window.SINAPSI_EMBED='+JSON.stringify({readonly:true,map:exportMap()}).replace(/</g,'\\u003c')+';';
  c.querySelector('head').appendChild(e);
  return '<!doctype html>\n'+c.outerHTML;
}

/* ================= Più mappe ================= */
const dlgMaps=$('#dlg-maps'),mapsStatus=t=>{$('#maps-status').textContent=t;};
function openMaps(){if(READONLY)return;renderMaps();mapsStatus('');dlgMaps.showModal();}
$('#maps-btn').addEventListener('click',openMaps);
function addMapAndOpen(m){m.id=newId('m');m.created=m.updated=Date.now();store.maps[m.id]=m;markDirty();switchMap(m.id);}
function renderMaps(){
  const ul=$('#maps-list');ul.innerHTML='';
  const arr=Object.values(store.maps).sort((a,b)=>a.created-b.created);
  for(const m of arr){
    const cur=m.id===store.current;const li=mk('li',cur?'current':'');
    const inp=mk('input','name');inp.value=m.name;inp.maxLength=60;inp.setAttribute('aria-label','Nome della mappa');
    inp.addEventListener('change',()=>{m.name=inp.value.trim()||'Mappa senza nome';inp.value=m.name;touch(m);if(cur)updateBrand();save();});
    inp.addEventListener('keydown',e=>{if(e.key==='Enter')inp.blur();});
    const row=mk('div','row');row.appendChild(mk('span','info',plural(m.nodes.length,'idea','idee')+(cur?', aperta ora':'')));
    if(!cur){const o=mk('button','act small primary','Apri');o.type='button';o.addEventListener('click',()=>{dlgMaps.close();switchMap(m.id);});row.appendChild(o);}
    const dup=mk('button','act small','Duplica');dup.type='button';
    dup.addEventListener('click',()=>{if(cur)syncPositions();const c=JSON.parse(JSON.stringify(m));c.id=newId('m');c.name=(m.name+' (copia)').slice(0,60);c.created=c.updated=Date.now();store.maps[c.id]=c;markDirty();save();renderMaps();mapsStatus('Creata “'+c.name+'”.');});
    row.appendChild(dup);
    const del=mk('button','act small danger','Elimina');del.type='button';let armed=false;
    del.addEventListener('click',()=>{
      if(Object.keys(store.maps).length<=1){mapsStatus('Deve restare almeno una mappa.');return;}
      if(!armed){armed=true;del.textContent='Conferma eliminazione';del.classList.add('armed');return;}
      (store.deleted||(store.deleted={}))[m.id]=Date.now();delete store.maps[m.id];markDirty();
      if(cur){const next=Object.values(store.maps).sort((a,b)=>a.created-b.created)[0];switchMap(next.id);}
      save();renderMaps();mapsStatus('Mappa “'+m.name+'” eliminata.');
    });
    row.appendChild(del);li.append(inp,row);ul.appendChild(li);
  }
}
$('#map-new').addEventListener('click',()=>{
  const n=blankNode('Idea centrale',null);n.p=[0,0,0];n.imp=5;
  const m={id:newId('m'),name:'Nuova mappa',nodes:[n],links:[],tour:[],layout:'sphere',views:[],versions:[],created:Date.now()};
  m.updated=Date.now();store.maps[m.id]=m;markDirty();dlgMaps.close();switchMap(m.id);selectNode(n.id,{fly:false});focusTitle();
});
function switchMap(id){
  if(pres)stopPresentation();
  if(map)syncPositions();
  store.current=id;map=store.maps[id];
  undoStack=[];redoStack=[];updateUndoUI();activeTag=null;searchTerm='';
  build();save();
}

/* ================= Versioni ================= */
const dlgVer=$('#dlg-versions'),verStatus=t=>{$('#versions-status').textContent=t;};
function openVersions(){$('#v-name').value='Versione del '+fmtStamp.format(new Date());renderVersions();verStatus('');dlgVer.showModal();}
function diffSummary(snap){
  const o=JSON.parse(snap);const was=new Map(o.nodes.map(n=>[n.id,n]));const now=new Map(map.nodes.map(n=>[n.id,n]));
  const added=map.nodes.filter(n=>!was.has(n.id)),removed=o.nodes.filter(n=>!now.has(n.id));
  const changed=map.nodes.filter(n=>was.has(n.id)&&(was.get(n.id).label!==n.label||(was.get(n.id).note||'')!==(n.note||'')||JSON.stringify(was.get(n.id).tags)!==JSON.stringify(n.tags)));
  const lk=l=>[l.s,l.t].sort().join('|');const wl=new Set(o.links.map(lk)),nl=new Set(map.links.map(lk));
  const la=[...nl].filter(k=>!wl.has(k)).length,lr=[...wl].filter(k=>!nl.has(k)).length;
  const names=a=>a.slice(0,6).map(n=>'“'+n.label+'”').join(', ')+(a.length>6?' e altre '+(a.length-6):'');
  const parts=[];
  if(added.length)parts.push('Aggiunte da allora: '+names(added)+'.');
  if(removed.length)parts.push('Eliminate da allora: '+names(removed)+'.');
  if(changed.length)parts.push('Modificate: '+names(changed)+'.');
  if(la||lr)parts.push('Collegamenti: '+la+' in più, '+lr+' in meno.');
  return parts.length?parts.join('\n'):'Nessuna differenza rispetto alla mappa attuale.';
}
function renderVersions(){
  const ul=$('#versions-list');ul.innerHTML='';
  if(!map.versions.length){const li=mk('li');li.appendChild(mk('span','info','Nessuna versione salvata per questa mappa.'));ul.appendChild(li);return;}
  [...map.versions].reverse().forEach(v=>{
    const li=mk('li');
    const inp=mk('input','name');inp.value=v.name;inp.maxLength=60;inp.setAttribute('aria-label','Nome della versione');
    inp.addEventListener('change',()=>{v.name=inp.value.trim()||'Versione';touch();save();});
    const row=mk('div','row');row.appendChild(mk('span','info',fmtStamp.format(new Date(v.date))+', '+plural(v.count,'idea','idee')));
    const diffBox=mk('div','diff');diffBox.hidden=true;
    const cmp=mk('button','act small','Confronta');cmp.type='button';cmp.addEventListener('click',()=>{diffBox.hidden=!diffBox.hidden;if(!diffBox.hidden)diffBox.textContent=diffSummary(v.snap);});
    const res=mk('button','act small primary','Ripristina');res.type='button';
    res.addEventListener('click',()=>{commit();restore(v.snap);dlgVer.close();toast('Ripristinata “'+v.name+'”. Puoi annullare con Ctrl+Z.');});
    const del=mk('button','act small danger','Elimina');del.type='button';let armed=false;
    del.addEventListener('click',()=>{if(!armed){armed=true;del.textContent='Conferma';del.classList.add('armed');return;}map.versions=map.versions.filter(x=>x!==v);touch();save();renderVersions();verStatus('Versione eliminata.');});
    row.append(cmp,res,del);li.append(inp,row,diffBox);ul.appendChild(li);
  });
}
$('#v-save').addEventListener('click',()=>{
  const name=$('#v-name').value.trim()||'Versione del '+fmtStamp.format(new Date());
  map.versions.push({id:newId('s'),name,date:Date.now(),count:map.nodes.length,snap:snapshot()});touch();
  let dropped=false;while(map.versions.length>20){map.versions.shift();dropped=true;}
  save();renderVersions();verStatus('Versione “'+name+'” salvata.'+(dropped?' La più vecchia è stata eliminata per restare entro 20.':''));
  $('#v-name').value='Versione del '+fmtStamp.format(new Date());
});

/* ================= Viste salvate ================= */
const dlgViews=$('#dlg-views');
function openViews(){$('#w-name').value='Vista '+(map.views.length+1);renderViews();dlgViews.showModal();}
function goView(v){deselect();clearMulti(true);clearPath();const t=new THREE.Vector3().fromArray(v.t),c=new THREE.Vector3().fromArray(v.c);if(is2D){t.z=0;c.copy(t).add(new THREE.Vector3(0,0,c.distanceTo(new THREE.Vector3().fromArray(v.t))));}flyPose(t,c);toast('Vista “'+v.name+'”.');}
function renderViews(){
  const ul=$('#views-list');ul.innerHTML='';
  if(!map.views.length){const li=mk('li');li.appendChild(mk('span','info','Nessuna vista salvata. Inquadra la mappa come preferisci e premi “Salva la vista attuale”.'));ul.appendChild(li);return;}
  map.views.forEach((v,i)=>{
    const li=mk('li');
    const inp=mk('input','name');inp.value=v.name;inp.maxLength=40;inp.setAttribute('aria-label','Nome della vista');
    inp.addEventListener('change',()=>{v.name=inp.value.trim()||'Vista';touch();save();});
    const row=mk('div','row');row.appendChild(mk('span','info',i<9?'Alt + '+(i+1):''));
    const go=mk('button','act small primary','Vai');go.type='button';go.addEventListener('click',()=>{dlgViews.close();goView(v);});
    const del=mk('button','act small danger','Elimina');del.type='button';del.addEventListener('click',()=>{map.views=map.views.filter(x=>x!==v);touch();save();renderViews();});
    row.append(go,del);li.append(inp,row);ul.appendChild(li);
  });
}
$('#w-save').addEventListener('click',()=>{
  const name=$('#w-name').value.trim()||'Vista '+(map.views.length+1);
  touch();map.views.push({id:newId('v'),name,t:controls.target.toArray().map(x=>+x.toFixed(1)),c:camera.position.toArray().map(x=>+x.toFixed(1))});
  save();renderViews();$('#w-name').value='Vista '+(map.views.length+1);toast('Vista “'+name+'” salvata.');
});

/* ================= Disposizione ================= */
function openLayout(){
  const box=$('#layout-opts');box.innerHTML='';
  for(const [v,name,desc] of LAYOUTS){
    const lab=mk('label','layout-opt');const inp=mk('input');inp.type='radio';inp.name='layout';inp.value=v;inp.checked=map.layout===v;
    inp.addEventListener('change',()=>{if(!READONLY)commit();setLayout(v);});
    const t=mk('span');t.appendChild(mk('b',null,name));t.appendChild(mk('small',null,desc));lab.append(inp,t);box.appendChild(lab);
  }
  $('#dlg-layout').showModal();
}

/* ================= Claude ================= */
const aiBox=$('#ai-box');let aiCtl=null;
function closeAiBox(){if(aiCtl){aiCtl.abort();aiCtl=null;}aiBox.hidden=true;aiBox.innerHTML='';}
function aiError(e){
  const c=e&&e.code;
  if(c==='cancelled')return 'Richiesta interrotta.';
  if(c==='not_granted')return 'L’uso di Claude da questa pagina non è stato autorizzato.';
  if(c==='rate_limited')return 'Troppe richieste ravvicinate: riprova tra qualche istante.';
  if(c==='invalid_json')return 'La risposta non era nel formato atteso: riprova.';
  if(c==='prompt_too_large')return 'La mappa è troppo grande da inviare tutta: prova su un ramo più piccolo.';
  return 'Claude non ha risposto: '+((e&&e.message)||'errore sconosciuto')+'.';
}
function pathTo(r){const out=[];let x=r;while(x){out.unshift(x.data.label);x=x.tParent;}return out.join(' > ');}
function aiStatus(text,stop){
  aiBox.hidden=false;aiBox.innerHTML='';const p=mk('p','ai-status',text);aiBox.appendChild(p);
  if(stop){const b=mk('button','act small','Interrompi');b.type='button';b.addEventListener('click',()=>{if(aiCtl)aiCtl.abort();});aiBox.appendChild(b);}
  return p;
}
async function aiExpand(){
  const r=sel();if(!r||!sampleFn)return;
  closeAiBox();aiCtl=new AbortController();const ctl=aiCtl;
  aiStatus('Claude sta pensando a nuove sotto-idee per “'+r.data.label+'”…',true);
  const sib=r.tParent?r.tParent.tKids.filter(k=>k!==r).map(k=>k.data.label):[];
  const prompt='Aiuti a sviluppare una mappa mentale. Proponi 5 nuove sotto-idee concrete e diverse tra loro per l’idea indicata, che non ripetano quelle già presenti. '+
    'Scrivi nella stessa lingua dei titoli della mappa.\n\nMappa: '+map.name+'\nPercorso dall’idea centrale: '+pathTo(r)+'\nIdea da espandere: '+r.data.label+
    '\nNota dell’idea: '+(r.data.note||'(nessuna)').slice(0,1500)+'\nSotto-idee già presenti: '+(r.tKids.map(k=>k.data.label).join('; ')||'(nessuna)')+
    '\nIdee sorelle: '+(sib.join('; ')||'(nessuna)')+
    '\n\nRispondi solo con un array JSON di 5 oggetti {"label": titolo breve di massimo 6 parole, "note": una frase che spiega l’idea}. Esempio: [{"label":"Titolo","note":"Spiegazione."}]';
  try{
    const res=await sampleFn.json(prompt,{signal:ctl.signal});
    if(ctl!==aiCtl)return;aiCtl=null;
    const items=(Array.isArray(res)?res:[]).filter(x=>x&&typeof x.label==='string'&&x.label.trim()).slice(0,8);
    if(!items.length){aiStatus('Claude non ha proposto idee utilizzabili: riprova.');return;}
    aiBox.innerHTML='';aiBox.appendChild(mk('p','ai-status','Proposte di Claude per “'+r.data.label+'”. Aggiungi quelle che ti servono.'));
    const ul=mk('ul');
    items.forEach(it=>{
      const li=mk('li');li.appendChild(mk('b',null,it.label.trim().slice(0,120)));
      if(it.note)li.appendChild(mk('small',null,String(it.note).slice(0,400)));
      const b=mk('button','act small primary','Aggiungi');b.type='button';
      b.addEventListener('click',()=>{const p=nodes.get(r.id);if(!p)return;addNode(p,{label:it.label.trim().slice(0,120),note:String(it.note||''),quiet:true});b.disabled=true;b.textContent='Aggiunta';toast('“'+it.label.trim()+'” aggiunta.');});
      li.appendChild(b);ul.appendChild(li);
    });
    aiBox.appendChild(ul);
    const row=mk('div','dlg-actions');
    const all=mk('button','act small','Aggiungi tutte');all.type='button';all.addEventListener('click',()=>{ul.querySelectorAll('button.primary:not(:disabled)').forEach(b=>b.click());});
    const cl=mk('button','act small','Chiudi');cl.type='button';cl.addEventListener('click',closeAiBox);
    row.append(all,cl);aiBox.appendChild(row);
  }catch(e){if(ctl===aiCtl){aiCtl=null;aiStatus(aiError(e));}}
}
function branchText(r,max){
  const lines=[];const w=(x,d)=>{if(lines.length>=max)return;lines.push('  '.repeat(d)+'- '+x.data.label+(x.data.note?': '+x.data.note.replace(/\s+/g,' ').slice(0,300):''));x.tKids.forEach(k=>w(k,d+1));};
  w(r,0);return lines.join('\n');
}
async function aiSummary(){
  const r=sel();if(!r||!sampleFn)return;
  closeAiBox();aiCtl=new AbortController();const ctl=aiCtl;
  aiStatus('Claude sta leggendo il ramo “'+r.data.label+'”…',true);
  const prompt='Riassumi questo ramo di una mappa mentale in 4-6 frasi chiare, nella stessa lingua dei titoli. Metti in evidenza i temi principali e i collegamenti tra le parti. '+
    'Scrivi testo semplice, senza titoli; se serve usa righe che iniziano con "- ".\n\nMappa: '+map.name+'\nRamo:\n'+branchText(r,150);
  let out=null;
  try{
    const res=await sampleFn(prompt,{signal:ctl.signal,onText:({text})=>{if(ctl!==aiCtl)return;if(!out){aiBox.innerHTML='';aiBox.appendChild(mk('p','ai-status','Riassunto di Claude'));out=mk('div','ai-text');aiBox.appendChild(out);const b=mk('button','act small','Interrompi');b.type='button';b.addEventListener('click',()=>ctl.abort());b.id='ai-stop';aiBox.appendChild(b);}out.textContent=text;}});
    if(ctl!==aiCtl)return;aiCtl=null;
    const stop=$('#ai-stop');if(stop)stop.remove();
    const text=res.text.trim();
    const row=mk('div','dlg-actions');
    const add=mk('button','act small primary','Aggiungi alla nota');add.type='button';
    add.addEventListener('click',()=>{const n=nodes.get(r.id);if(!n)return;commit();n.data.note=((n.data.note||'').trim()+'\n\n# Riassunto\n'+text).trim();if(selected===n.id){renderNoteEditor(n);refreshTopology();fillPanel(n);}save();add.disabled=true;add.textContent='Aggiunto';});
    const cp=mk('button','act small','Copia');cp.type='button';cp.addEventListener('click',()=>{if(navigator.clipboard)navigator.clipboard.writeText(text).then(()=>toast('Riassunto copiato.'),()=>{});});
    const cl=mk('button','act small','Chiudi');cl.type='button';cl.addEventListener('click',closeAiBox);
    row.append(add,cp,cl);aiBox.appendChild(row);
  }catch(e){if(ctl===aiCtl){aiCtl=null;const keep=e&&e.text;aiStatus(aiError(e));if(keep){const d=mk('div','ai-text',keep);aiBox.appendChild(d);}}}
}
$('#ai-expand').addEventListener('click',aiExpand);
$('#ai-summary').addEventListener('click',aiSummary);
let aiLinksCtl=null;
async function aiLinks(){
  if(!sampleFn)return;
  const dlg=$('#dlg-ai'),box=$('#ai-links'),stop=$('#ai-links-stop');
  box.innerHTML='';box.appendChild(mk('p','ai-status','Claude sta cercando collegamenti tra le idee…'));stop.hidden=false;dlg.showModal();
  if(aiLinksCtl)aiLinksCtl.abort();aiLinksCtl=new AbortController();const ctl=aiLinksCtl;
  stop.onclick=()=>ctl.abort();
  const list=simList.slice(0,260);const idx=new Map(list.map((r,i)=>[i+1,r]));
  const rows=list.map((r,i)=>(i+1)+' | '+r.data.label+(r.data.tags.length?' | #'+r.data.tags.join(' #'):'')+(r.data.note?' | '+r.data.note.replace(/\s+/g,' ').slice(0,120):'')).join('\n');
  const existing=simLinks.map(l=>{const a=list.indexOf(l.a)+1,b=list.indexOf(l.b)+1;return a&&b?a+'-'+b:null;}).filter(Boolean).join(', ');
  const prompt='Questa è una mappa mentale. Ogni riga è un’idea: numero | titolo | tag | inizio della nota. Trova fino a 8 collegamenti significativi tra idee che oggi NON sono collegate, '+
    'preferendo idee di rami diversi. Per ognuno indica i due numeri, un’etichetta breve (1-3 parole, stessa lingua dei titoli) e il motivo in una frase.\n\nMappa: '+map.name+'\nIdee:\n'+rows+
    '\n\nCollegamenti già presenti: '+(existing||'nessuno')+
    '\n\nRispondi solo con un array JSON: [{"a":numero,"b":numero,"label":"etichetta","reason":"motivo"}]';
  try{
    const res=await sampleFn.json(prompt,{signal:ctl.signal});
    if(ctl!==aiLinksCtl)return;aiLinksCtl=null;stop.hidden=true;
    const items=(Array.isArray(res)?res:[]).map(x=>({a:idx.get(+x.a),b:idx.get(+x.b),label:String(x.label||'').slice(0,40),reason:String(x.reason||'').slice(0,300)})).filter(x=>x.a&&x.b&&x.a!==x.b&&!linkBetween(x.a.id,x.b.id));
    box.innerHTML='';
    if(!items.length){box.appendChild(mk('p','ai-status','Claude non ha trovato collegamenti nuovi convincenti.'));return;}
    const ul=mk('ul');
    items.forEach(it=>{
      const li=mk('li');li.appendChild(mk('b',null,it.a.data.label+' → '+it.b.data.label+(it.label?' ('+it.label+')':'')));
      li.appendChild(mk('small',null,it.reason));
      const b=mk('button','act small primary','Collega');b.type='button';
      b.addEventListener('click',()=>{if(!nodes.has(it.a.id)||!nodes.has(it.b.id))return;if(connect(it.a.id,it.b.id,it.label)){b.disabled=true;b.textContent='Collegate';}else{b.disabled=true;b.textContent='Già collegate';}});
      li.appendChild(b);ul.appendChild(li);
    });
    box.appendChild(ul);
  }catch(e){if(ctl===aiLinksCtl){aiLinksCtl=null;stop.hidden=true;box.innerHTML='';box.appendChild(mk('p','ai-status',aiError(e)));}}
}
$('#dlg-ai').addEventListener('close',()=>{if(aiLinksCtl){aiLinksCtl.abort();aiLinksCtl=null;}});

/* ================= Aspetto ================= */
const dlgSet=$('#dlg-settings');
function fmt(v){return (+v).toFixed(1).replace('.',',')+'×';}
function openSettings(){
  const s=store.settings;
  $('#s-glow').value=s.glow;$('#s-fog').value=s.fog!=null?s.fog:.5;$('#s-pulses').value=s.pulses;$('#s-spin').value=s.spin;
  $('#s-labels').checked=s.linkLabels;$('#s-lite').checked=s.lite;$('#s-const').checked=s.constellations;$('#s-drop').value=s.dropAction||'ask';
  syncOutputs();dlgSet.showModal();
}
function fogName(v){v=+v;return v===0?'nessuna':v<=.35?'leggerissima':v<=.65?'leggera':v<=1.05?'normale':'fitta';}
function syncOutputs(){$('#o-fog').textContent=fogName($('#s-fog').value);$('#o-glow').textContent=fmt($('#s-glow').value);$('#o-pulses').textContent=fmt($('#s-pulses').value);$('#o-spin').textContent=fmt($('#s-spin').value);}
function readSettings(){
  const s=store.settings;
  s.glow=+$('#s-glow').value;s.fog=+$('#s-fog').value;s.pulses=+$('#s-pulses').value;s.spin=+$('#s-spin').value;
  s.linkLabels=$('#s-labels').checked;s.lite=$('#s-lite').checked;s.constellations=$('#s-const').checked;s.dropAction=$('#s-drop').value;
  syncOutputs();applySettings();save();
}
['#s-glow','#s-fog','#s-pulses','#s-spin'].forEach(id=>$(id).addEventListener('input',readSettings));
['#s-labels','#s-lite','#s-const','#s-drop'].forEach(id=>$(id).addEventListener('change',readSettings));
$('#s-reset').addEventListener('click',()=>{const mmOn=store.settings.minimap;store.settings=Object.assign({},DEFAULT_SETTINGS,{minimap:mmOn});openSettings();applySettings();save();});
function applySettings(){
  const s=store.settings;
  if(bloomPass)bloomPass.strength=s.glow;
  controls.autoRotateSpeed=.35*s.spin;
  renderer.setPixelRatio(s.lite?1:Math.min(window.devicePixelRatio||1,MAX_DPR));
  renderer.setSize(innerWidth,innerHeight);
  if(composer){if(composer.setPixelRatio)composer.setPixelRatio(renderer.getPixelRatio());composer.setSize(innerWidth,innerHeight);}
  updatePointScale();
  dust.visible=!s.lite;bokeh.visible=!s.lite;
  mm.hidden=!s.minimap;
  links.forEach(renderLinkLabel);
  computeGroups();
  geomDirty=styleDirty=true;applyStyles();
}
addEventListener('resize',()=>{
  if(renderer.xr.isPresenting)return;
  camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight);if(composer)composer.setSize(innerWidth,innerHeight);updatePointScale();
});

/* ================= Realtà virtuale (WebXR) ================= */
let xrSession=null,vrLabels=[],vrControllers=[];
if(navigator.xr&&navigator.xr.isSessionSupported){navigator.xr.isSessionSupported('immersive-vr').then(ok=>{$('#m-vr').hidden=!ok;}).catch(()=>{});}
function textSprite(text,color){
  const c=document.createElement('canvas');const g=c.getContext('2d');const fs=48;
  g.font='600 '+fs+'px "Bricolage Grotesque", system-ui, sans-serif';const w=Math.min(1024,Math.ceil(g.measureText(text).width)+24);
  c.width=w;c.height=fs+20;g.font='600 '+fs+'px "Bricolage Grotesque", system-ui, sans-serif';g.textBaseline='middle';
  g.shadowColor='rgba(3,4,14,.95)';g.shadowBlur=10;g.fillStyle=color;g.fillText(text,12,c.height/2);
  const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c),transparent:true,depthWrite:false}));
  sp.scale.set(w/c.height*5,5,1);return sp;
}
async function enterVR(){
  if(!navigator.xr)return;
  try{
    const session=await navigator.xr.requestSession('immersive-vr',{optionalFeatures:['local-floor']});
    renderer.xr.setReferenceSpaceType('local-floor');
    await renderer.xr.setSession(session);xrSession=session;
    session.addEventListener('end',onVREnd);
    deselect();clearMulti(true);clearPath();
    const c=new THREE.Vector3();simList.forEach(r=>c.add(r.pos));c.divideScalar(simList.length||1);
    let R=40;simList.forEach(r=>{R=Math.max(R,r.pos.distanceTo(c));});
    const s=.75/R;world.scale.setScalar(s);world.position.set(0,1.35,-1.3);inner.position.copy(c).multiplyScalar(-1);
    haloMat.uniforms.uWorld.value=s;ringMat.uniforms.uWorld.value=s;fiberMat.uniforms.uWorld.value=s;iMat.size=7*s;haloMat.uniforms.uFog.value=0;ringMat.uniforms.uFog.value=0;fiberMat.uniforms.uFog.value=0;coreMat.uniforms.uFog.value=0;
    scene.fog.density=0;dust.visible=false;bokeh.visible=false;labelsEl.style.display='none';
    haloMat.uniforms.uScale.value=ringMat.uniforms.uScale.value=fiberMat.uniforms.uScale.value=900;
    const list=[...simList].sort((a,b)=>(b.isRoot-a.isRoot)||(b.data.imp-a.data.imp)||(b.deg-a.deg)).slice(0,160);
    for(const r of list){const sp=textSprite(r.data.label,'#e9ecff');inner.add(sp);vrLabels.push({r,sp});}
    for(let i=0;i<2;i++){
      const ctl=renderer.xr.getController(i);
      const g=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0),new THREE.Vector3(0,0,-1)]);
      const line=new THREE.Line(g,new THREE.LineBasicMaterial({color:0xffcf70}));line.scale.z=3;ctl.add(line);
      ctl.addEventListener('selectstart',()=>vrSelect(ctl));scene.add(ctl);vrControllers.push(ctl);
    }
    toast('Realtà virtuale attiva: punta un’idea e premi il grilletto per selezionarla, usa la levetta per ruotare e ingrandire.',5000);
  }catch(e){toast('Non è stato possibile avviare la realtà virtuale: '+(e.message||'dispositivo non disponibile')+'.');}
}
function vrSelect(ctl){
  const m=new THREE.Matrix4().extractRotation(ctl.matrixWorld);
  const o=new THREE.Vector3().setFromMatrixPosition(ctl.matrixWorld),d=new THREE.Vector3(0,0,-1).applyMatrix4(m);
  const r3=new THREE.Ray(o,d);const inv=new THREE.Matrix4().copy(inner.matrixWorld).invert();r3.applyMatrix4(inv);r3.direction.normalize();
  let best=null,bt=Infinity;
  for(const r of simList){const R=r.radius*2.5;if(r3.distanceSqToPoint(r.pos)<R*R){const t=_v.copy(r.pos).sub(r3.origin).dot(r3.direction);if(t>0&&t<bt){bt=t;best=r;}}}
  if(best){selected=best.id;applyStyles();}else{selected=null;applyStyles();}
}
function vrTick(dt){
  world.rotation.y+=dt*.05*store.settings.spin;
  if(xrSession)for(const src of xrSession.inputSources){
    const gp=src.gamepad;if(!gp||gp.axes.length<4)continue;
    const ax=gp.axes[2],ay=gp.axes[3];
    if(Math.abs(ax)>.15)world.rotation.y+=ax*dt*1.2;
    if(Math.abs(ay)>.15){const s=clamp(world.scale.x*(1-ay*dt),.0005,.05);world.scale.setScalar(s);haloMat.uniforms.uWorld.value=s;ringMat.uniforms.uWorld.value=s;fiberMat.uniforms.uWorld.value=s;iMat.size=7*s;}
  }
  for(const v of vrLabels){v.sp.visible=!v.r.hidden;v.sp.position.copy(v.r.pos);v.sp.position.y+=v.r.radius+4;v.sp.material.color.setScalar(v.r.id===selected?1:.75);}
}
function onVREnd(){
  xrSession=null;world.scale.setScalar(1);world.position.set(0,0,0);world.rotation.set(0,0,0);inner.position.set(0,0,0);
  vrLabels.forEach(v=>{inner.remove(v.sp);v.sp.material.map.dispose();v.sp.material.dispose();});vrLabels=[];
  vrControllers.forEach(c=>scene.remove(c));vrControllers=[];
  haloMat.uniforms.uWorld.value=ringMat.uniforms.uWorld.value=fiberMat.uniforms.uWorld.value=1;iMat.size=7;haloMat.uniforms.uFog.value=ringMat.uniforms.uFog.value=fiberMat.uniforms.uFog.value=coreMat.uniforms.uFog.value=.0017;
  scene.fog.density=.0017;labelsEl.style.display='';applySettings();
  camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();
}


/* ================= Accesso con Google e sincronizzazione su Google Drive (sinapsi.db) ================= */
const DRIVE_SCOPE='https://www.googleapis.com/auth/drive.file';
const GIS_SCOPES='openid email profile '+DRIVE_SCOPE;
const GIS_URL='https://accounts.google.com/gsi/client';
const SQLJS_URL='lib/';
const DRIVE_API='https://www.googleapis.com/drive/v3/files',DRIVE_UP='https://www.googleapis.com/upload/drive/v3/files';
const DB_MIME='application/x-sqlite3';
const SYNC_ENABLED=!READONLY&&!hasClaude&&/\.apps\.googleusercontent\.com$/.test(GOOGLE_CLIENT_ID)&&(location.protocol==='https:'||/^(localhost|127\.0\.0\.1)$/.test(location.hostname));
const TOKKEY='sinapsi-drive-token',SYNCKEY='sinapsi-sync',MODEKEY='sinapsi-accesso',USERKEY='sinapsi-account';
const fmtTime=new Intl.DateTimeFormat('it-IT',{hour:'2-digit',minute:'2-digit'});
const DEVICE_ID=(()=>{try{let d=localStorage.getItem('sinapsi-dispositivo');if(!d){d=newId('d');localStorage.setItem('sinapsi-dispositivo',d);}return d;}catch(e){return newId('d');}})();
const AUTH={user:null,tc:null,cb:null,ecb:null};
const SYNC={state:'off',fileId:null,version:null,dirty:false,dirtyAt:0,busy:false,again:false,timer:null,lastSync:0,error:'',firstSync:false};
const acctMenu=$('#acct-menu');

function markDirty(){
  SYNC.dirty=true;SYNC.dirtyAt=Date.now();
  if(AUTH.user){if(SYNC.state==='ok')setSyncState('pending');scheduleSync();}
}
function touch(m){m=m||map;if(!m)return;m.updated=Date.now();markDirty();}
function scheduleSync(ms){if(!AUTH.user)return;clearTimeout(SYNC.timer);SYNC.timer=setTimeout(()=>syncNow('modifica'),ms==null?3000:ms);}
function fail(msg,extra){const e=new Error(msg);Object.assign(e,extra||{});return e;}

/* Token di Google Drive: dura circa un’ora, si conserva nel browser fino alla scadenza */
function getToken(){
  try{const t=JSON.parse(localStorage.getItem(TOKKEY)||'null');if(t&&AUTH.user&&t.uid===AUTH.user.uid&&t.exp>Date.now()+60000)return t.token;}catch(e){}
  return null;
}
function setToken(tok,sec,uid){try{localStorage.setItem(TOKKEY,JSON.stringify({token:tok,exp:Date.now()+(sec||3600)*1000,uid}));}catch(e){}}
function clearToken(){try{localStorage.removeItem(TOKKEY);}catch(e){}}
function readSyncMeta(){try{return JSON.parse(localStorage.getItem(SYNCKEY)||'null');}catch(e){return null;}}
function writeSyncMeta(){if(!AUTH.user)return;try{localStorage.setItem(SYNCKEY,JSON.stringify({uid:AUTH.user.uid,fileId:SYNC.fileId,version:SYNC.version,lastSync:SYNC.lastSync}));}catch(e){}}
function readUser(){try{const u=JSON.parse(localStorage.getItem(USERKEY)||'null');return u&&u.uid?u:null;}catch(e){return null;}}
function saveUser(u){try{localStorage.setItem(USERKEY,JSON.stringify(u));}catch(e){}}

/* Chiamate a Drive con gestione degli errori di autorizzazione (401/403) */
async function driveFetch(url,opts){
  const tok=getToken();
  if(!tok)throw fail('autorizzazione Drive scaduta',{needAuth:true});
  opts=Object.assign({},opts||{});opts.headers=Object.assign({},opts.headers||{},{Authorization:'Bearer '+tok});
  let r;
  try{r=await fetch(url,opts);}catch(e){throw fail(navigator.onLine?'Google Drive non risponde':'connessione assente',{network:true});}
  if(r.status===401){clearToken();throw fail('autorizzazione Drive scaduta',{needAuth:true});}
  if(!r.ok){
    let j=null;try{j=await r.json();}catch(e){}
    const reason=j&&j.error&&j.error.errors&&j.error.errors[0]&&j.error.errors[0].reason;
    if(r.status===403&&(reason==='insufficientPermissions'||reason==='authError')){clearToken();throw fail('non hai concesso a Sinapsi l’accesso a Google Drive',{needAuth:true});}
    throw fail('Drive ha risposto '+r.status+(j&&j.error&&j.error.message?' ('+j.error.message+')':''),{status:r.status});
  }
  return r;
}
async function driveFind(){
  const q="appProperties has { key='sinapsi' and value='db' } and trashed=false";
  const r=await driveFetch(DRIVE_API+'?spaces=drive&pageSize=10&orderBy=modifiedTime%20desc&fields=files(id,version,modifiedTime)&q='+encodeURIComponent(q));
  const j=await r.json();return (j.files||[])[0]||null;
}
async function driveMeta(id){const r=await driveFetch(DRIVE_API+'/'+id+'?fields=id,version,trashed');return r.json();}
async function driveDownload(id){const r=await driveFetch(DRIVE_API+'/'+id+'?alt=media');return new Uint8Array(await r.arrayBuffer());}
async function resumable(method,url,meta,data){
  const init=await driveFetch(url+(url.includes('?')?'&':'?')+'uploadType=resumable',{method,headers:{'Content-Type':'application/json; charset=UTF-8','X-Upload-Content-Type':DB_MIME},body:JSON.stringify(meta||{})});
  const loc=init.headers.get('Location');if(!loc)throw fail('Drive non ha fornito l’indirizzo di caricamento');
  const r=await driveFetch(loc,{method:'PUT',headers:{'Content-Type':DB_MIME},body:data});
  return r.json();
}
const BIG=4.5e6;
async function driveCreateFile(data){
  const meta={name:DB_NAME,mimeType:DB_MIME,appProperties:{sinapsi:'db'},description:'Database delle mappe di Sinapsi (SQLite). Non modificare a mano.'};
  if(data.length>BIG)return resumable('POST',DRIVE_UP+'?fields=id,version',meta,data);
  const b='sinapsi'+Math.random().toString(36).slice(2);
  const body=new Blob(['--'+b+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+JSON.stringify(meta)+'\r\n--'+b+'\r\nContent-Type: '+DB_MIME+'\r\n\r\n',data,'\r\n--'+b+'--']);
  const r=await driveFetch(DRIVE_UP+'?uploadType=multipart&fields=id,version',{method:'POST',headers:{'Content-Type':'multipart/related; boundary='+b},body});
  return r.json();
}
async function driveUpdate(id,data){
  if(data.length>BIG)return resumable('PATCH',DRIVE_UP+'/'+id+'?fields=id,version',{},data);
  const r=await driveFetch(DRIVE_UP+'/'+id+'?uploadType=media&fields=id,version',{method:'PATCH',headers:{'Content-Type':DB_MIME},body:data});
  return r.json();
}

/* Il database SQLite (sql.js): mappe e cancellazioni. Le impostazioni restano su ogni dispositivo. */
let SQLP=null;
function getSQL(){
  if(!SQLP)SQLP=loadScript(SQLJS_URL+'sql-wasm.js').then(()=>window.initSqlJs({locateFile:f=>SQLJS_URL+f})).catch(e=>{SQLP=null;throw fail('non riesco a caricare il motore del database: controlla la connessione',{network:true});});
  return SQLP;
}
function pruneDeleted(d){const out={},lim=Date.now()-120*DAY;for(const k in d||{})if(d[k]>lim)out[k]=d[k];return out;}
async function dbBytes(){
  const SQL=await getSQL();
  syncPositions();store.deleted=pruneDeleted(store.deleted);
  const db=new SQL.Database();
  try{
    db.run('CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);CREATE TABLE maps(id TEXT PRIMARY KEY,name TEXT NOT NULL,created INTEGER,updated INTEGER,data TEXT NOT NULL);CREATE TABLE deleted(id TEXT PRIMARY KEY,at INTEGER NOT NULL);');
    const mi=db.prepare('INSERT INTO meta VALUES(?,?)');
    [['app','sinapsi'],['schema','1'],['saved_at',String(Date.now())],['device',DEVICE_ID]].forEach(r=>mi.run(r));mi.free();
    const mp=db.prepare('INSERT INTO maps VALUES(?,?,?,?,?)');
    for(const id in store.maps){const m=store.maps[id];mp.run([id,m.name||'',m.created||0,m.updated||0,JSON.stringify(m)]);}
    mp.free();
    const dp=db.prepare('INSERT INTO deleted VALUES(?,?)');
    for(const id in store.deleted)dp.run([id,store.deleted[id]]);
    dp.free();
    return db.export();
  }finally{db.close();}
}
async function readDoc(bytes){
  const head=new TextDecoder().decode(bytes.slice(0,15));
  if(head!=='SQLite format 3'){
    try{return JSON.parse(new TextDecoder().decode(bytes));}catch(e){throw fail('il file su Drive non è un database di Sinapsi valido');}
  }
  const SQL=await getSQL();
  let db;
  try{
    db=new SQL.Database(bytes);
    const rows=sql=>{const r=db.exec(sql);return r[0]?r[0].values:[];};
    const meta={};rows('SELECT key,value FROM meta').forEach(([k,v])=>{meta[k]=v;});
    const maps={};rows('SELECT id,data FROM maps').forEach(([id,d])=>{try{maps[id]=JSON.parse(d);}catch(e){}});
    const deleted={};rows('SELECT id,at FROM deleted').forEach(([id,at])=>{deleted[id]=+at;});
    return {app:meta.app,schema:+meta.schema||1,maps,deleted};
  }catch(e){throw fail('il file sinapsi.db su Drive non è leggibile');}
  finally{if(db)db.close();}
}
function applyRemote(doc){
  if(!doc||doc.app!=='sinapsi'||!doc.maps||typeof doc.maps!=='object')throw fail('il file su Drive non è un database di Sinapsi valido');
  const rmaps={};for(const k in doc.maps){try{const m=sanitizeMap(doc.maps[k]);m.id=k;rmaps[k]=m;}catch(e){}}
  const rdel=doc.deleted&&typeof doc.deleted==='object'?doc.deleted:{};
  syncPositions();
  let lmaps=store.maps;
  if(SYNC.firstSync&&Object.keys(rmaps).length){lmaps={};for(const k in store.maps)if(store.maps[k].updated)lmaps[k]=store.maps[k];}
  const del=Object.assign({},rdel);for(const k in store.deleted||{})del[k]=Math.max(del[k]||0,store.deleted[k]);
  const out={};let needPush=false;
  for(const id of new Set([...Object.keys(lmaps),...Object.keys(rmaps)])){
    const a=lmaps[id],b=rmaps[id];
    const m=!a?b:!b?a:((a.updated||0)>(b.updated||0)?a:b);
    if(del[id]&&del[id]>=(m.updated||0)){if(b)needPush=true;continue;}
    out[id]=m;if(m!==b)needPush=true;
  }
  if(!Object.keys(out).length){const m=sampleMap();m.id=newId('m');m.updated=Date.now();out[m.id]=m;needPush=true;}
  const curOld=store.maps[store.current];
  store.maps=out;store.deleted=del;
  if(needPush){SYNC.dirty=true;SYNC.dirtyAt=Date.now();}
  if(!out[store.current]){
    store.current=Object.keys(out).sort((x,y)=>(out[x].created||0)-(out[y].created||0))[0];
    map=out[store.current];undoStack=[];redoStack=[];updateUndoUI();activeTag=null;build();
  }else if(out[store.current]!==curOld){
    if(pres)stopPresentation();
    map=out[store.current];undoStack=[];redoStack=[];updateUndoUI();
    const keep=selected;build({keepCamera:true});
    if(keep&&nodes.has(keep)&&!nodes.get(keep).hidden)selectNode(keep,{fly:false});
    if(!SYNC.firstSync)toast('Mappa aggiornata con le modifiche fatte su un altro dispositivo.');
  }else updateBrand();
  saveNow();
  if($('#dlg-maps').open)renderMaps();
}
async function locateOrCreate(){
  const found=await driveFind();
  if(found){
    SYNC.fileId=found.id;
    const doc=await readDoc(await driveDownload(found.id));
    applyRemote(doc);SYNC.version=String(found.version);
    if(SYNC.firstSync)toast('Mappe caricate da sinapsi.db nel tuo Google Drive.');
  }else{
    for(const k in store.maps)if(!store.maps[k].updated)store.maps[k].updated=Date.now();
    const f=await driveCreateFile(await dbBytes());
    SYNC.fileId=f.id;SYNC.version=String(f.version);SYNC.dirty=false;
    toast('Ho creato nel tuo Google Drive il file “sinapsi.db” con le tue mappe.',5500);
  }
  SYNC.firstSync=false;writeSyncMeta();
}
async function pushStore(){
  const stamp=SYNC.dirtyAt;
  const meta=await driveUpdate(SYNC.fileId,await dbBytes());
  SYNC.version=String(meta.version);
  if(SYNC.dirtyAt===stamp)SYNC.dirty=false;
}
async function syncNow(reason){
  if(!AUTH.user)return;
  if(SYNC.busy){SYNC.again=true;return;}
  if(!navigator.onLine){setSyncState('offline');return;}
  if(!getToken()){setSyncState('reauth');return;}
  SYNC.busy=true;clearTimeout(SYNC.timer);
  if(SYNC.state!=='ok'||SYNC.dirty)setSyncState('syncing');
  try{
    if(!SYNC.fileId)await locateOrCreate();
    else{
      let meta=null;
      try{meta=await driveMeta(SYNC.fileId);}catch(e){if(e.status!==404)throw e;}
      if(!meta||meta.trashed){SYNC.fileId=null;SYNC.version=null;await locateOrCreate();}
      else if(String(meta.version)!==String(SYNC.version)){
        const doc=await readDoc(await driveDownload(SYNC.fileId));
        applyRemote(doc);SYNC.version=String(meta.version);
      }
    }
    if(SYNC.dirty)await pushStore();
    SYNC.lastSync=Date.now();writeSyncMeta();
    setSyncState(SYNC.dirty?'pending':'ok');
  }catch(e){
    if(e.needAuth)setSyncState('reauth');
    else if(e.network||!navigator.onLine)setSyncState('offline');
    else{setSyncState('error',e.message);console.error('Sinapsi, sincronizzazione:',e);}
  }finally{
    SYNC.busy=false;
    if(SYNC.again){SYNC.again=false;scheduleSync(800);}
  }
}

/* Proprietario dei dati in questo browser: evita di mescolare le mappe di account diversi */
function parseStore(o){
  if(!o||!o.maps)return null;
  const maps={};for(const k in o.maps){try{const m=sanitizeMap(o.maps[k]);m.id=k;maps[k]=m;}catch(e){}}
  const ids=Object.keys(maps);if(!ids.length)return null;
  return {v:3,current:maps[o.current]?o.current:ids[0],maps,settings:Object.assign({},DEFAULT_SETTINGS,o.settings||{}),deleted:o.deleted||{},owner:o.owner||null};
}
function freshStore(){const m=sampleMap();m.id=newId('m');return {v:3,current:m.id,maps:{[m.id]:m},settings:Object.assign({},store.settings),deleted:{},owner:null};}
function replaceStore(next){
  if(pres)stopPresentation();
  store=next;map=store.maps[store.current];
  undoStack=[];redoStack=[];updateUndoUI();activeTag=null;searchTerm='';
  build();applySettings();saveNow();
}
function startSyncForUser(){
  const u=AUTH.user;if(!u)return;
  if(store.owner&&store.owner!==u.uid){
    try{localStorage.setItem(KEY2+'-'+store.owner,JSON.stringify(store));}catch(e){}
    let other=null;try{other=parseStore(JSON.parse(localStorage.getItem(KEY2+'-'+u.uid)||'null'));localStorage.removeItem(KEY2+'-'+u.uid);}catch(e){}
    replaceStore(other||freshStore());
    toast('Le mappe dell’altro account sono state messe da parte su questo dispositivo.',5000);
  }
  SYNC.firstSync=!store.owner;
  store.owner=u.uid;saveNow();
  const meta=readSyncMeta();
  if(meta&&meta.uid===u.uid){SYNC.fileId=meta.fileId||null;SYNC.version=meta.version||null;SYNC.lastSync=meta.lastSync||0;}
  else{SYNC.fileId=null;SYNC.version=null;}
  if(!getToken()){setSyncState('reauth');return;}
  syncNow('accesso');
}

/* Accesso, ricollegamento e uscita con Google Identity Services */
function gisMessage(code){
  if(code==='popup_closed'||code==='access_denied')return 'Accesso annullato.';
  if(code==='popup_failed_to_open')return 'Il browser ha bloccato la finestra di Google: consenti i popup per questo sito e riprova.';
  if(code==='scope')return 'Per salvare le mappe serve il permesso su Google Drive: riprova lasciando spuntata la voce di Drive.';
  if(code==='not_ready')return 'L’accesso con Google non è ancora pronto: riprova tra un istante.';
  return 'Accesso non riuscito'+(code?' ('+code+')':'')+'.';
}
function requestToken(opts){
  return new Promise((res,rej)=>{
    if(!AUTH.tc){rej(fail(gisMessage('not_ready')));return;}
    AUTH.cb=r=>{AUTH.cb=AUTH.ecb=null;
      if(r.error){rej(fail(gisMessage(r.error)));return;}
      if(!google.accounts.oauth2.hasGrantedAllScopes(r,DRIVE_SCOPE)){rej(fail(gisMessage('scope')));return;}
      res(r);};
    AUTH.ecb=e=>{AUTH.cb=AUTH.ecb=null;rej(fail(gisMessage(e&&e.type)));};
    AUTH.tc.requestAccessToken(opts);
  });
}
async function fetchUser(tok){
  let r;
  try{r=await fetch('https://www.googleapis.com/oauth2/v3/userinfo',{headers:{Authorization:'Bearer '+tok}});}catch(e){throw fail('connessione assente');}
  if(!r.ok)throw fail('Google non ha restituito i dati dell’account');
  const j=await r.json();
  return {uid:j.sub,email:j.email||'',displayName:j.name||'',photoURL:j.picture||''};
}
function acceptLogin(u,r){
  const changed=!AUTH.user||AUTH.user.uid!==u.uid;
  AUTH.user=u;saveUser(u);setToken(r.access_token,+r.expires_in||3600,u.uid);
  try{localStorage.setItem(MODEKEY,'google');}catch(e){}
  hideAuthScreen();
  if(changed)startSyncForUser();else syncNow('ricollegamento');
  renderAcct();
}
async function signIn(){
  $('#auth-status').textContent='';
  try{
    const r=await requestToken({prompt:'select_account'});
    const u=await fetchUser(r.access_token);
    acceptLogin(u,r);
  }catch(e){
    if(!$('#auth-screen').hidden)$('#auth-status').textContent=e.message;else toast(e.message,5000);
  }
}
async function reconnectDrive(){
  if(!AUTH.user)return;
  try{
    const r=await requestToken({prompt:'',login_hint:AUTH.user.email});
    const u=await fetchUser(r.access_token);
    if(u.uid!==AUTH.user.uid)toast('Hai scelto un account diverso: ora usi le mappe di '+(u.email||'quell’account')+'.',5000);
    else toast('Google Drive ricollegato.');
    acceptLogin(u,r);
  }catch(e){toast('Drive non ricollegato: '+e.message,5000);}
}
let wipeArmed=false;
async function signOut(wipe){
  if(AUTH.user&&SYNC.dirty&&getToken()&&navigator.onLine){try{await syncNow('uscita');}catch(e){}}
  clearToken();try{localStorage.removeItem(SYNCKEY);localStorage.removeItem(USERKEY);localStorage.setItem(MODEKEY,'local');}catch(e){}
  clearTimeout(SYNC.timer);AUTH.user=null;
  Object.assign(SYNC,{fileId:null,version:null,dirty:false,lastSync:0});
  setSyncState('off');openAcctMenu(false);
  if(wipe){
    try{Object.keys(localStorage).filter(k=>k.startsWith('sinapsi')&&k!=='sinapsi-dispositivo').forEach(k=>localStorage.removeItem(k));localStorage.setItem(MODEKEY,'local');}catch(e){}
    replaceStore(freshStore());
    toast('Sei uscito e le mappe sono state rimosse da questo dispositivo. Restano in sinapsi.db sul tuo Google Drive.',5500);
  }else toast('Sei uscito. Le mappe restano anche in questo browser; accedi di nuovo per riprendere la sincronizzazione.',5500);
}

/* Interfaccia dell’account */
function statusText(){
  switch(SYNC.state){
    case 'ok':return SYNC.lastSync?'Tutto salvato su Google Drive alle '+fmtTime.format(new Date(SYNC.lastSync))+'.':'Tutto salvato su Google Drive.';
    case 'pending':return 'Ci sono modifiche in attesa di essere salvate su Drive.';
    case 'syncing':return 'Sincronizzazione in corso…';
    case 'offline':return 'Sei offline: le modifiche restano in questo browser e partono appena torna la connessione.';
    case 'reauth':return 'L’autorizzazione per Google Drive è scaduta: ricollegalo per continuare a salvare.';
    case 'error':return 'Errore di sincronizzazione'+(SYNC.error?': '+SYNC.error:'')+'.';
    default:return 'In attesa.';
  }
}
function setSyncState(st,err){SYNC.state=st;SYNC.error=err||'';renderAcct();}
function renderAcct(){
  const b=$('#acct-btn');
  if(!SYNC_ENABLED){b.hidden=true;return;}
  b.hidden=false;
  const u=AUTH.user;
  b.classList.toggle('in',!!u);b.dataset.state=u?SYNC.state:'off';
  const av=$('#acct-av');av.innerHTML='';
  if(u&&u.photoURL){const im=mk('img');im.alt='';im.referrerPolicy='no-referrer';im.src=u.photoURL;av.appendChild(im);}
  else if(u)av.textContent=((u.displayName||u.email||'?').trim()[0]||'?').toUpperCase();
  else av.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>';
  const label=u?'Account e sincronizzazione. '+statusText():'Accedi con Google per sincronizzare le mappe';
  b.setAttribute('aria-label',label);b.title=label;
  $('#syncbar').hidden=!(u&&SYNC.state==='reauth');
  if(!acctMenu.hidden)fillAcctMenu();
}
function fillAcctMenu(){
  acctMenu.innerHTML='';const u=AUTH.user;
  const btn=(text,fn,cls)=>{const x=mk('button',cls||null,text);x.type='button';x.setAttribute('role','menuitem');x.addEventListener('click',fn);acctMenu.appendChild(x);return x;};
  if(!u){
    acctMenu.appendChild(mk('p','stat','Stai lavorando in locale: le mappe restano solo in questo browser.'));
    btn('Accedi con Google',()=>{openAcctMenu(false);signIn();});
    return;
  }
  const who=mk('div','who');who.appendChild(mk('b',null,u.displayName||'Account Google'));who.appendChild(mk('span',null,u.email||''));acctMenu.appendChild(who);
  acctMenu.appendChild(mk('p','stat'+(SYNC.state==='error'||SYNC.state==='reauth'?' bad':''),statusText()));
  if(SYNC.state==='reauth')btn('Ricollega Google Drive',()=>{openAcctMenu(false);reconnectDrive();});
  else btn('Sincronizza ora',()=>{syncNow('manuale');});
  if(SYNC.fileId)btn('Mostra sinapsi.db su Google Drive',()=>{openAcctMenu(false);window.open('https://drive.google.com/file/d/'+encodeURIComponent(SYNC.fileId)+'/view','_blank','noopener');});
  acctMenu.appendChild(mk('hr'));
  btn('Esci',()=>signOut(false));
  const w=btn(wipeArmed?'Tocca di nuovo per confermare':'Esci e cancella i dati da questo dispositivo',()=>{if(!wipeArmed){wipeArmed=true;fillAcctMenu();return;}wipeArmed=false;signOut(true);},'danger'+(wipeArmed?' armed':''));
}
function openAcctMenu(v){
  acctMenu.hidden=!v;$('#acct-btn').setAttribute('aria-expanded',String(v));
  if(!v){wipeArmed=false;return;}
  fillAcctMenu();
  const b=$('#acct-btn').getBoundingClientRect(),w=acctMenu.offsetWidth;
  acctMenu.style.left=clamp(b.right-w,8,innerWidth-w-8)+'px';acctMenu.style.top=(b.bottom+8)+'px';
}
$('#acct-btn').addEventListener('click',e=>{e.stopPropagation();if(!AUTH.user&&acctMenu.hidden){openAcctMenu(true);return;}openAcctMenu(acctMenu.hidden);});
$('#sync-reconnect').addEventListener('click',reconnectDrive);
function showSplash(v){$('#splash').hidden=!v;}
function showAuthScreen(){$('#auth-screen').hidden=false;$('#auth-status').textContent='';setTimeout(()=>$('#auth-google').focus(),50);}
function hideAuthScreen(){$('#auth-screen').hidden=true;}
$('#auth-google').addEventListener('click',signIn);
$('#auth-local').addEventListener('click',()=>{try{localStorage.setItem(MODEKEY,'local');}catch(e){}hideAuthScreen();toast('Lavori in locale. Puoi accedere quando vuoi dal pulsante dell’account in alto.',4500);});

function loadScript(src){return new Promise((res,rej)=>{const sc=document.createElement('script');sc.src=src;sc.async=true;sc.onload=res;sc.onerror=()=>rej(new Error('impossibile caricare '+src));document.head.appendChild(sc);});}
function initSync(){
  if(!SYNC_ENABLED){
    $('#acct-btn').hidden=true;
    if(GOOGLE_CLIENT_ID&&location.protocol==='file:')console.info('Sinapsi: l’accesso con Google funziona solo aprendo la pagina dal suo indirizzo web (per esempio GitHub Pages).');
    return;
  }
  loadScript(GIS_URL).then(()=>{
    AUTH.tc=google.accounts.oauth2.initTokenClient({client_id:GOOGLE_CLIENT_ID,scope:GIS_SCOPES,
      callback:r=>{if(AUTH.cb)AUTH.cb(r);},error_callback:e=>{if(AUTH.ecb)AUTH.ecb(e);}});
  }).catch(()=>toast('Il servizio di accesso di Google non è raggiungibile: per ora lavori in locale.',5000));
  getSQL().catch(()=>{});
  let mode=null;try{mode=localStorage.getItem(MODEKEY);}catch(e){}
  const saved=readUser();
  if(saved){AUTH.user=saved;startSyncForUser();}
  else if(mode!=='local')showAuthScreen();
  renderAcct();
}
function flushEdits(){
  if(READONLY)return;
  if(typeof noteEd!=='undefined'&&document.activeElement===noteEd){clearTimeout(noteTimer);saveNoteFromEditor();}
  saveNow();
}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flushEdits();});
addEventListener('pagehide',flushEdits);
document.addEventListener('visibilitychange',()=>{if(!AUTH.user)return;if(document.visibilityState==='visible')syncNow('ritorno');else if(SYNC.dirty)syncNow('uscita dalla pagina');});
addEventListener('online',()=>{if(AUTH.user)syncNow('connessione');});
addEventListener('offline',()=>{if(AUTH.user)setSyncState('offline');});
setInterval(()=>{if(AUTH.user&&document.visibilityState==='visible'&&!SYNC.busy&&SYNC.state!=='reauth')syncNow('controllo');},60000);
addEventListener('beforeunload',e=>{if(AUTH.user&&SYNC.dirty&&navigator.onLine&&getToken()){e.preventDefault();e.returnValue='';}});


/* ================= Elenco e agenda ================= */
const side=$('#side');let sideTab='list',sideRaf=0,outlineScrollTo=null,outlineMapId=null;
const outlineOpen=new Set();
const CHEV='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>';
const fmtAgenda=new Intl.DateTimeFormat('it-IT',{weekday:'short',day:'numeric',month:'short'});
function openSide(v){
  side.hidden=!v;document.body.classList.toggle('side-open',v);$('#b-side').setAttribute('aria-expanded',String(v));
  if(v){if(selected)outlineScrollTo=selected;renderSide();}
}
function setSideTab(t){
  sideTab=t;
  $$('.stabs .tab').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.stab===t)));
  $$('#side .spane').forEach(p=>{p.hidden=p.dataset.spane!==t;});
  renderSide();
}
function scheduleSide(){if(side.hidden||sideRaf)return;sideRaf=requestAnimationFrame(()=>{sideRaf=0;renderSide();});}
function renderSide(){
  if(side.hidden)return;
  const ae=document.activeElement;if(ae&&ae.classList&&ae.classList.contains('orename'))return;
  if(sideTab==='list')renderOutline();else renderAgenda();
}
function nodeBadge(r){
  const di=dueInfo(r);
  if(di&&di.state!=='done'){const b=mk('span','obadge '+(di.state==='late'?'late':di.state==='soon'?'soon':''),fmtShort.format(di.date));b.title=di.days<0?'Scaduta':'Scadenza';return b;}
  if(r.prog.total){const pc=Math.round(r.prog.done/r.prog.total*100);return mk('span','obadge'+(pc===100?' full':''),pc+'%');}
  return null;
}
function outlineRow(r,depth,flat){
  const li=mk('li','orow'+(r.id===selected||multi.has(r.id)?' sel':'')+(r.isRoot?' root':'')+(r.hidden?' hid':''));
  li.setAttribute('role','treeitem');li.dataset.id=r.id;li.setAttribute('aria-level',String(depth+1));
  li.setAttribute('aria-selected',String(r.id===selected));li.tabIndex=r.id===selected?0:-1;
  li.style.paddingLeft=(flat?4:2+depth*16)+'px';
  const kids=r.tKids.length>0&&!flat;
  const tog=mk('button','otog'+(kids?'':' leaf'));tog.type='button';tog.tabIndex=-1;tog.innerHTML=CHEV;
  if(kids){const open=outlineOpen.has(r.id);tog.setAttribute('aria-expanded',String(open));tog.setAttribute('aria-label',(open?'Chiudi ':'Apri ')+r.data.label);li.setAttribute('aria-expanded',String(open));}
  else tog.setAttribute('aria-hidden','true');
  const dot=mk('span','odot');dot.style.setProperty('--c',cssColor(r.data.hue));
  const lab=mk('span','olab',r.data.label);
  if(flat&&r.tParent)li.title=pathTo(r);
  li.append(tog,dot,lab);
  const b=nodeBadge(r);if(b)li.appendChild(b);
  if(!READONLY){const add=mk('button','oadd','+');add.type='button';add.tabIndex=-1;add.title='Aggiungi un’idea sotto';add.setAttribute('aria-label','Aggiungi un’idea sotto '+r.data.label);li.appendChild(add);}
  return li;
}
function renderOutline(){
  const ul=$('#outline'),f=$('#side-filter').value.trim().toLowerCase().replace(/^#/,'');
  if(outlineMapId!==map.id){outlineMapId=map.id;outlineOpen.clear();const root=nodes.get(rootId);if(root)outlineOpen.add(root.id);}
  const s=sel();if(s){let x=s.tParent;while(x){outlineOpen.add(x.id);x=x.tParent;}}
  const frag=document.createDocumentFragment();
  if(f){
    const m=nodeList.filter(r=>r.data.label.toLowerCase().includes(f)||r.data.tags.some(t=>t.toLowerCase().includes(f)));
    m.forEach(r=>frag.appendChild(outlineRow(r,0,true)));
    if(!m.length)frag.appendChild(mk('li','agenda-empty','Nessuna idea corrisponde al filtro.'));
  }else{
    const roots=nodeList.filter(r=>!r.tParent).sort((a,b)=>b.isRoot-a.isRoot);
    const walk=(r,d)=>{frag.appendChild(outlineRow(r,d,false));if(outlineOpen.has(r.id))r.tKids.forEach(k=>walk(k,d+1));};
    roots.forEach(r=>walk(r,0));
  }
  const top=ul.scrollTop;ul.replaceChildren(frag);ul.scrollTop=top;
  if(outlineScrollTo){const row=ul.querySelector('.orow.sel');if(row)row.scrollIntoView({block:'nearest'});outlineScrollTo=null;}
}
function pickFromSide(id){
  const r=nodes.get(id);if(!r)return;
  if(r.hidden)revealNode(id);
  clearPath();
  selectNode(id);
  if(isNarrow())openSide(false);
}
$('#outline').addEventListener('click',e=>{
  const li=e.target.closest('.orow');if(!li)return;const r=nodes.get(li.dataset.id);if(!r)return;
  if(e.target.closest('.otog')){if(!r.tKids.length)return;if(outlineOpen.has(r.id))outlineOpen.delete(r.id);else outlineOpen.add(r.id);renderOutline();return;}
  if(e.target.closest('.oadd')){if(isNarrow())openSide(false);addNode(r);return;}
  pickFromSide(r.id);
});
$('#outline').addEventListener('dblclick',e=>{
  if(READONLY)return;const lab=e.target.closest('.olab');if(!lab)return;
  const r=nodes.get(lab.closest('.orow').dataset.id);if(!r)return;
  const inp=mk('input','orename');inp.value=r.data.label;inp.maxLength=120;inp.setAttribute('aria-label','Nuovo titolo');
  lab.replaceWith(inp);inp.focus();inp.select();
  let done=false;
  const finish=keep=>{
    if(done)return;done=true;
    const v=inp.value.trim();
    if(keep&&v&&v!==r.data.label){commit();r.data.label=v;touch();renderLabel(r);computeGroups();if(selected===r.id)fillPanel(r);save();}
    inp.blur();renderOutline();
  };
  inp.addEventListener('keydown',ev=>{ev.stopPropagation();if(ev.key==='Enter'){ev.preventDefault();finish(true);}else if(ev.key==='Escape'){ev.preventDefault();finish(false);}});
  inp.addEventListener('blur',()=>finish(true));
});
$('#outline').addEventListener('keydown',e=>{
  const li=e.target.closest('.orow');if(!li)return;
  const rows=[...$('#outline').querySelectorAll('.orow')],i=rows.indexOf(li),r=nodes.get(li.dataset.id);
  const go=n=>{const t=rows[n];if(!t)return;e.preventDefault();e.stopPropagation();pickFromSide(t.dataset.id);requestAnimationFrame(()=>{const x=$('#outline').querySelector('.orow.sel');if(x)x.focus();});};
  if(e.key==='ArrowDown')go(i+1);
  else if(e.key==='ArrowUp')go(i-1);
  else if(e.key==='ArrowRight'&&r&&r.tKids.length&&!outlineOpen.has(r.id)){e.preventDefault();e.stopPropagation();outlineOpen.add(r.id);renderOutline();$('#outline').querySelector('.orow.sel')?.focus();}
  else if(e.key==='ArrowLeft'&&r&&outlineOpen.has(r.id)){e.preventDefault();e.stopPropagation();outlineOpen.delete(r.id);renderOutline();$('#outline').querySelector('.orow.sel')?.focus();}
  else if(e.key==='Enter'){e.preventDefault();e.stopPropagation();pickFromSide(r.id);}
});
$('#side-filter').addEventListener('input',renderOutline);
$('#side-filter').addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Escape'){e.target.value='';renderOutline();}});
function agendaGroups(){
  const g={late:[],today:[],week:[],later:[],open:[]};
  for(const r of nodeList){
    const di=dueInfo(r),openTasks=r.own.total-r.own.done;
    if(di&&di.state!=='done'){
      if(di.days<0)g.late.push([r,di]);else if(di.days===0)g.today.push([r,di]);else if(di.days<=7)g.week.push([r,di]);else g.later.push([r,di]);
    }else if(!di&&openTasks>0)g.open.push([r,null]);
  }
  for(const k of ['late','today','week','later'])g[k].sort((a,b)=>a[1].days-b[1].days);
  g.open.sort((a,b)=>a[0].data.label.localeCompare(b[0].data.label,'it'));
  return g;
}
function updateAgendaBadge(){
  const g=agendaGroups(),n=g.late.length+g.today.length;
  const b=$('#side-badge');b.hidden=!n;b.textContent=n>9?'9+':String(n);
  $('#agenda-count').textContent=n?String(n):'';
  $('#b-side').setAttribute('aria-label',n?'Elenco e agenda: '+plural(n,'scadenza','scadenze')+' da guardare':'Elenco e agenda');
}
function renderAgenda(){
  const box=$('#agenda'),g=agendaGroups();box.textContent='';
  const sections=[['late','Scadute'],['today','Oggi'],['week','Prossimi 7 giorni'],['later','Più avanti'],['open','Attività aperte senza scadenza']];
  let any=false;
  for(const [k,title] of sections){
    if(!g[k].length)continue;any=true;
    const sec=mk('section','agroup '+k);sec.appendChild(mk('h3',null,title+' ('+g[k].length+')'));
    for(const [r,di] of g[k]){
      const b=mk('button','aitem');b.type='button';
      const dot=mk('span','odot');dot.style.setProperty('--c',cssColor(r.data.hue));
      const parts=[];if(r.tParent)parts.push(r.tParent.data.label);
      if(r.own.total)parts.push(r.own.done+' di '+r.own.total+' attività');
      const when=mk('span','when'+(di&&di.days<0?' late':di&&di.days<=3?' soon':''),
        !di?'':di.days<-1?'da '+(-di.days)+' giorni':di.days===-1?'ieri':di.days===0?'oggi':di.days===1?'domani':fmtAgenda.format(di.date));
      b.append(dot,mk('b',null,r.data.label),when,mk('small',null,parts.join(', ')||'Idea principale'));
      b.addEventListener('click',()=>pickFromSide(r.id));
      sec.appendChild(b);
    }
    box.appendChild(sec);
  }
  if(!any)box.appendChild(mk('p','agenda-empty',READONLY?'In questa mappa non ci sono scadenze né attività aperte.':'Nessuna scadenza e nessuna attività da fare. Aggiungi una scadenza dalla scheda Dettagli di un’idea, oppure scrivi un’attività da spuntare in una nota.'));
}
$('#b-side').addEventListener('click',()=>openSide(side.hidden));
$('#side-close').addEventListener('click',()=>openSide(false));
$$('.stabs .tab').forEach(b=>b.addEventListener('click',()=>setSideTab(b.dataset.stab)));
setSideTab('list');

/* ================= Telefono: ricerca, pannello, menu ================= */
$('#b-search').addEventListener('click',()=>{document.body.classList.add('search-open');q.focus();});
let gripY=null;
$('#panel-grip').addEventListener('pointerdown',e=>{e.preventDefault();gripY=e.clientY;try{e.target.setPointerCapture(e.pointerId);}catch(err){}});
$('#panel-grip').addEventListener('pointerup',e=>{
  if(gripY==null)return;const dy=e.clientY-gripY;gripY=null;
  if(dy>60){document.body.classList.remove('panel-tall');if(multi.size)clearMulti();else deselect();return;}
  if(dy<-30){document.body.classList.add('panel-tall');}
  else if(Math.abs(dy)<8)document.body.classList.toggle('panel-tall');
  $('#panel-grip').setAttribute('aria-label',document.body.classList.contains('panel-tall')?'Riduci il pannello':'Espandi il pannello');
});
$('#m-undo').addEventListener('click',()=>{openMenu(false);undo();});
$('#m-redo').addEventListener('click',()=>{openMenu(false);redo();});
if(COARSE&&!READONLY)$('#hint').textContent='Trascina per ruotare, pizzica per lo zoom. Tocca un’idea per aprirla, tienila premuta e trascinala per spostarla.';

/* ================= App installabile (PWA) ================= */
let deferredInstall=null;
const isStandalone=matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
const isIOS=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
if('serviceWorker' in navigator&&location.protocol==='https:'&&!EMBED&&!hasClaude){navigator.serviceWorker.register('sw.js').catch(()=>{});}
addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstall=e;$('#m-install').hidden=false;});
addEventListener('appinstalled',()=>{deferredInstall=null;$('#m-install').hidden=true;toast('Sinapsi è installata: la trovi tra le app del dispositivo.',4000);});
if(isIOS&&!isStandalone&&!EMBED)$('#m-install').hidden=false;
$('#m-install').addEventListener('click',async()=>{
  openMenu(false);
  if(deferredInstall){const ev=deferredInstall;deferredInstall=null;ev.prompt();try{await ev.userChoice;}catch(err){}$('#m-install').hidden=true;}
  else $('#dlg-install').showModal();
});

/* ================= Avvio ================= */
store=loadStore();
map=store.maps[store.current];
focusMode=store.settings.focus!==false;
build();
applySettings();
syncMenu();
updateUndoUI();
if(READONLY){$('#hint').innerHTML='Questa è una copia in sola lettura. Trascina per ruotare, pizzica o usa la rotella per lo zoom, tocca un’idea per leggerla.';}
save();
renderer.setAnimationLoop(loop);
initSync();
})();
