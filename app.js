window.addEventListener("error",e=>{const m=document.getElementById("err");if(m){m.style.display="block";m.textContent="⚠️ خطأ: "+e.message+" ("+String(e.filename||"").split("/").pop()+":"+e.lineno+")"}});
const VERSION=11;
const TYPES=[["سوق تجزئة","🛒"],["سوق جملة","🏬"],["سوبرماركت","🏪"],["محل تجاري","🏠"]];
const CATS=[["الخضر","🥕"],["الفواكه","🍎"],["مواد غذائية أساسية","🌾"],["اللحوم","🍗"]];
const PRODUCTS=[
["الخضر","طماطم","1 كلغ"],["الخضر","بصل","1 كلغ"],["الخضر","جزر","1 كلغ"],
["الفواكه","تفاح","1 كلغ"],["الفواكه","موز","1 كلغ"],["الفواكه","برتقال","1 كلغ"],
["مواد غذائية أساسية","فرينة","1 كلغ"],["مواد غذائية أساسية","سميد","25 كلغ"],["مواد غذائية أساسية","زيت","5 لتر"],
["اللحوم","لحوم بيضاء (دجاج)","1 كلغ"],["اللحوم","لحم البقر المحلي","1 كلغ"],["اللحوم","بيض","بالوحدة"]
].map(([cat,name,unit])=>({cat,name,unit}));
const AV=[["كثرة","بكثرة"],["متوسط","متوسط"],["قليل","بقليل"],["غير متوفر","غير متوفر"]];
const TARGET=5,MAXP=20; /* الهدف 5 أسعار، والحد الأقصى 20 سعراً لكل منتج (في البلدية خلال اليوم) */
const SZ=["كبير","متوسط","صغير"],SIZED=["الخضر","الفواكه"];
const $=s=>document.querySelector(s);
const DIRS=["سطيف","بجاية","جيجل","ميلة","مسيلة","برج بوعريريج","بوسعادة"];
const S={dir:"",commune:"",type:"",point:"",cat:"",lat:null,lng:null,acc:null};
let cur={}, allCache=[], stack=["home"];

/* ---------- IndexedDB ---------- */
let db;
function openDB(){return new Promise((res,rej)=>{const r=indexedDB.open("prix-db",1);
 r.onupgradeneeded=()=>r.result.createObjectStore("records",{keyPath:"key"});
 r.onsuccess=()=>{db=r.result;res()};r.onerror=()=>rej(r.error)})}
const st=m=>db.transaction("records",m).objectStore("records");
const rp=r=>new Promise((res,rej)=>{r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});
const getAll=()=>rp(st("readonly").getAll());
const put=o=>rp(st("readwrite").put(o));
const del=k=>rp(st("readwrite").delete(k));

/* ---------- utils ---------- */
const today=()=>new Date().toLocaleDateString("en-CA");
const nowT=()=>new Date().toTimeString().slice(0,5);
function toast(m){const t=$("#toast");t.textContent=m;t.classList.add("on");setTimeout(()=>t.classList.remove("on"),2000)}
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const keyOf=p=>[today(),S.commune,S.type,S.point,p].join("|");

/* ---------- navigation ---------- */
const TITLES={home:"رصد الأسعار",setup:"نقطة البيع",cats:"الفئات",prods:"المنتجات",prog:"المتابعة",exp:"التصدير والإرسال"};
function go(n,push=true){
 document.querySelectorAll(".screen").forEach(s=>s.classList.remove("on"));
 $("#s-"+n).classList.add("on");$("#title").textContent=TITLES[n];
 if(push)stack.push(n);
 $("#back").style.display=n==="home"?"none":"";
 if(n==="home")stack=["home"],refreshHome();
 window.scrollTo(0,0);
}
$("#back").onclick=()=>{stack.pop();go(stack[stack.length-1]||"home",false)};

async function refreshHome(){
 if(!S.dir){$("#homeStat").innerHTML="اختر المديرية الولائية للتجارة للبدء";return}
 const a=await getAll();const d=today();
 const t=a.filter(r=>r.date===d&&(r.dir||S.dir)===S.dir);
 const pts=new Set(t.map(r=>r.commune+"|"+r.type+"|"+r.point));
 $("#homeStat").innerHTML=`اليوم: <b>${pts.size}</b> نقطة بيع — <b>${t.filter(r=>r.price>0).length}</b> سعر مسجّل<br>المجموع المحفوظ: ${a.length} سجل`;
}

/* ---------- location (optional) ---------- */
function locShow(){
 const i=$("#locInfo");if(!i)return;
 if(S.lat==null){i.innerHTML="لم يُحدَّد الموقع — يمكنك المتابعة دون تحديده";return}
 i.innerHTML=`✅ ${S.lat.toFixed(5)} ، ${S.lng.toFixed(5)}${S.acc!=null?` (دقة ≈ ${Math.round(S.acc)} م)`:""} <button class="rm" style="padding:4px 10px;font-size:14px" onclick="clearLoc()">✕ إزالة</button>`;
}
function clearLoc(){S.lat=S.lng=S.acc=null;locShow()}
function getLoc(){
 if(!navigator.geolocation){toast("الجهاز لا يدعم تحديد الموقع");return}
 $("#locInfo").textContent="⏳ جارٍ تحديد الموقع…";
 navigator.geolocation.getCurrentPosition(async p=>{
  S.lat=p.coords.latitude;S.lng=p.coords.longitude;S.acc=p.coords.accuracy;locShow();
  validate();
  if(S.commune&&S.type&&S.point){
   const ex=(await getAll()).filter(samePt);
   for(const r of ex){r.lat=S.lat;r.lng=S.lng;r.acc=S.acc;await put(r)}
  }
  toast("تم تحديد الموقع");
 },e=>{
  $("#locInfo").textContent=e.code===1?"تم رفض إذن الموقع — فعّله من إعدادات المتصفح أو تابع دون موقع":e.code===3?"انتهت المهلة — جرّب في مكان مفتوح أو تابع دون موقع":"تعذّر تحديد الموقع — يمكنك المتابعة دونه";
 },{enableHighAccuracy:true,timeout:20000,maximumAge:0});
}

/* ---------- setup ---------- */
function renderTypes(){
 $("#types").innerHTML=TYPES.map(([n,i])=>`<button class="card ${S.type===n?"sel":""}" data-v="${n}"><span class="ic">${i}</span>${n}</button>`).join("");
 $("#types").querySelectorAll(".card").forEach(b=>b.onclick=()=>{S.type=b.dataset.v;renderTypes();validate()});
}
function validate(){
 S.commune=$("#commune").value.trim();S.point=$("#point").value.trim();
 $("#toCats").classList.toggle("dis",!(S.commune&&S.type&&S.point));
}
$("#commune").oninput=validate;$("#point").oninput=validate;
function startNew(){if(!S.dir){toast("اختر المديرية أولاً");return}
 S.type="";S.point="";S.cat="";clearLoc();
 $("#commune").value=localStorage.getItem("commune")||"";$("#point").value="";
 renderTypes();validate();go("setup")}
function startNewPointSameCommune(){S.type="";S.point="";clearLoc();$("#point").value="";renderTypes();validate();stack=["home"];go("setup")}
async function toCats(){
 validate();if(!(S.commune&&S.type&&S.point)){toast("أكمل البيانات");return}
 if(S.lat==null){const ex=(await getAll()).find(r=>samePt(r)&&r.lat!=null);if(ex){S.lat=ex.lat;S.lng=ex.lng;S.acc=ex.acc}}
 localStorage.setItem("commune",S.commune);
 renderCats();go("cats");
}
function ctxHTML(){return `🏛 ${esc(S.dir)}<br>📍 ${esc(S.commune)} — ${esc(S.type)} — <b>${esc(S.point)}</b>`}
async function renderCats(){
 $("#ctx1").innerHTML=ctxHTML();
 const a=(await getAll()).filter(samePt);
 $("#cats").innerHTML=CATS.map(([n,i])=>{const c=new Set(a.filter(r=>r.cat===n).map(r=>r.product)).size;
  return `<button class="card" data-v="${n}"><span class="ic">${i}</span>${n}${c?`<br><small style="color:var(--g)">✔ ${c} منتج</small>`:""}</button>`}).join("");
 $("#cats").querySelectorAll(".card").forEach(b=>b.onclick=()=>openCat(b.dataset.v));
}

/* ---------- products ---------- */
const samePt=r=>r.date===today()&&(r.dir||S.dir)===S.dir&&r.commune===S.commune&&r.type===S.type&&r.point===S.point;
async function openCat(cat,fresh){
 S.cat=cat;S.fresh=!!fresh;allCache=await getAll();cur={};
 PRODUCTS.filter(p=>p.cat===cat).forEach(p=>{
  const rs=allCache.filter(r=>samePt(r)&&r.product===p.name).sort((a,b)=>(a.seq||0)-(b.seq||0));
  cur[p.name]=fresh?[{avail:"",price:"",size:""}]:(rs.length?[...rs.map(r=>({avail:r.avail,price:r.price>0?String(r.price):"",size:r.size||""})),{avail:"",price:"",size:""}]:[{avail:"",price:"",size:""}]);
 });
 const prev=allCache.filter(r=>samePt(r)&&r.cat===cat&&r.price>0).length;
 $("#ctx2").innerHTML=ctxHTML()+`<br>الفئة: <b>${esc(cat)}</b>`+(fresh&&prev?`<br>➕ نموذج جديد — الأسعار السابقة (${prev}) محفوظة وتُحسب في العدّاد`:"");
 renderProds();go("prods");
}
function othersCount(name){
 return allCache.filter(r=>r.date===today()&&(r.dir||S.dir)===S.dir&&r.commune===S.commune&&r.product===name&&r.price>0&&(S.fresh||!samePt(r))).length;
}
function findInput(n,i){
 for(const el of document.querySelectorAll(".prod"))if(el.dataset.n===n){const x=el.querySelectorAll(".ent")[i];return x&&x.querySelector("input")}
}
function renderProds(){
 $("#plist").innerHTML=PRODUCTS.filter(p=>p.cat===S.cat).map(p=>{
  const es=cur[p.name];
  return `<div class="prod" data-n="${esc(p.name)}">
  <div class="top"><div><span class="nm">${esc(p.name)}</span> <span class="un">— ${esc(p.unit)}</span></div><span class="badge"></span></div>
  ${es.map((c,i)=>`<div class="ent" data-i="${i}">
   ${es.length>1?`<div class="muted" style="margin-top:6px">السعر ${i+1}</div>`:""}
   <div class="chips">${AV.map(([v,l])=>`<button class="chip ${c.avail===v?"sel":""}" data-v="${v}">${l}</button>`).join("")}</div>
   ${SIZED.includes(p.cat)?`<div class="sizes"><b>الحجم</b>${SZ.map(v=>`<button class="szc ${c.size===v?"sel":""}" data-s="${v}">${v}</button>`).join("")}</div>`:""}
   <div class="price"><input type="number" inputmode="decimal" min="0" step="any" placeholder="السعر" value="${esc(c.price)}" ${c.avail==="غير متوفر"?"disabled":""}><span>دج</span>${es.length>1?`<button class="rm">✕</button>`:""}</div>
  </div>`).join("")}
  <button class="addp">＋ سعر آخر لنفس المنتج (محل آخر في السوق)</button>
  </div>`}).join("");
 document.querySelectorAll(".prod").forEach(el=>{
  const n=el.dataset.n;
  el.querySelectorAll(".ent").forEach(ent=>{
   const i=+ent.dataset.i;
   ent.querySelectorAll(".chip").forEach(b=>b.onclick=()=>{
    const v=b.dataset.v,c=cur[n][i];c.avail=c.avail===v?"":v;
    if(c.avail==="غير متوفر")c.price="";
    renderProds();
   });
   ent.querySelector("input").oninput=e=>{const c=cur[n][i];c.price=e.target.value;
    if(c.price&&!c.avail){c.avail="متوسط";ent.querySelectorAll(".chip").forEach(x=>x.classList.toggle("sel",x.dataset.v===c.avail))}
    badge(el,n)};
   ent.querySelectorAll(".szc").forEach(b=>b.onclick=()=>{const c=cur[n][i];c.size=c.size===b.dataset.s?"":b.dataset.s;ent.querySelectorAll(".szc").forEach(x=>x.classList.toggle("sel",x.dataset.s===c.size))});
   const rm=ent.querySelector(".rm");
   if(rm)rm.onclick=()=>{cur[n].splice(i,1);renderProds()};
  });
  el.querySelector(".addp").onclick=()=>{if(othersCount(n)+cur[n].length>=MAXP){toast(`الحد الأقصى ${MAXP} سعراً لهذا المنتج`);return}cur[n].push({avail:"",price:"",size:""});renderProds();
   const inp=findInput(n,cur[n].length-1);if(inp)inp.scrollIntoView({block:"center"})};
  badge(el,n);
 });
}
function badge(el,n){
 const es=cur[n];
 const c=othersCount(n)+es.filter(x=>parseFloat(x.price)>0).length;
 const b=el.querySelector(".badge");b.textContent=c>=MAXP?`${c} — الحد الأقصى`:`${c} / ${TARGET} أسعار`;
 b.classList.toggle("ok",c>=TARGET);
 el.classList.toggle("has",es.some(x=>x.avail));
}
async function saveCat(again){
 for(const p of PRODUCTS.filter(p=>p.cat===S.cat)){
  const tot=othersCount(p.name)+cur[p.name].filter(x=>parseFloat(x.price)>0).length;
  if(tot>MAXP){toast(`${p.name}: ${tot} سعراً — الحد الأقصى ${MAXP}. احذف ${tot-MAXP} بزر ✕`);return}
 }
 let n=0;const all=await getAll();
 for(const p of PRODUCTS.filter(p=>p.cat===S.cat)){
  let seq=0;
  if(S.fresh){seq=Math.max(-1,...all.filter(r=>samePt(r)&&r.product===p.name).map(r=>r.seq||0))+1}
  else for(const r of all)if(samePt(r)&&r.product===p.name)await del(r.key);
  for(const c of cur[p.name]){
   const price=parseFloat(c.price);
   if(!c.avail&&!(price>0))continue;
   await put({key:[today(),S.dir,S.commune,S.type,S.point,p.name,seq].join("|"),seq,dir:S.dir,date:today(),time:nowT(),commune:S.commune,type:S.type,point:S.point,cat:p.cat,
    lat:S.lat,lng:S.lng,acc:S.acc,product:p.name,unit:p.unit,size:SIZED.includes(p.cat)?(c.size||""):"",price:price>0?price:0,avail:c.avail||"متوسط"});
   seq++;n++;
  }
 }
 toast(`تم الحفظ (${n} تسجيل)`);
 stack=["home","setup"];await renderCats();go("cats",false);stack.push("cats");
 if(again)await openCat(S.cat,true);
}

/* ---------- progress ---------- */
async function showProgress(){
 if(!S.dir){toast("اختر المديرية أولاً");return}
 const a=(await getAll()).filter(r=>(r.dir||S.dir)===S.dir);
 const coms=[...new Set(a.map(r=>r.commune))],dates=[...new Set(a.map(r=>r.date))].sort().reverse();
 if(!a.length){toast("لا توجد بيانات بعد");return}
 $("#pcom").innerHTML=coms.map(c=>`<option>${esc(c)}</option>`).join("");
 $("#pdate").innerHTML=dates.map(c=>`<option>${c}</option>`).join("");
 $("#pcom").onchange=$("#pdate").onchange=drawProg;
 drawProg(a);go("prog");
}
async function drawProg(a){
 if(!Array.isArray(a))a=(await getAll()).filter(r=>(r.dir||S.dir)===S.dir);
 const c=$("#pcom").value,d=$("#pdate").value;
 const rows=a.filter(r=>r.commune===c&&r.date===d);
 const pts=new Set(rows.map(r=>r.type+"|"+r.point));
 $("#ptab").innerHTML=`<tr><th>المنتج</th><th>الأسعار</th><th>متوفر</th><th>غير متوفر</th></tr>`+
 PRODUCTS.map(p=>{const r=rows.filter(x=>x.product===p.name);
  const np=r.filter(x=>x.price>0).length,nu=r.filter(x=>x.avail==="غير متوفر").length,na=r.length-nu;
  return `<tr><td>${esc(p.name)} <small class="muted">${esc(p.unit)}</small></td><td style="color:${np>=TARGET?"var(--g)":"var(--rd)"};font-weight:700">${np}/${TARGET}</td><td>${na}</td><td>${nu}</td></tr>`}).join("");
 $("#pnote").textContent=`عدد نقاط البيع المعاينة: ${pts.size}. الأعداد الحمراء تعني أن الهدف (5 أسعار) لم يُبلغ بعد.`;
}

/* ---------- export ---------- */
const HEAD=["المديرية","التاريخ","الوقت","البلدية","نوع نقطة البيع","نقطة البيع","الفئة","المنتج","الوحدة","الحجم","السعر (دج)","درجة التوفر","خط العرض","خط الطول","الدقة (م)","رابط الخريطة"];
const AVL={"كثرة":"متوفر بكثرة","متوسط":"متوفر بكمية متوسطة","قليل":"متوفر بقليل","غير متوفر":"غير متوفر"};
const toRow=r=>[r.dir||"",r.date,r.time,r.commune,r.type,r.point,r.cat,r.product,r.unit,r.size||"",r.price>0?r.price:"",AVL[r.avail]||r.avail,r.lat!=null?+r.lat.toFixed(6):"",r.lat!=null?+r.lng.toFixed(6):"",r.acc!=null?Math.round(r.acc):"",r.lat!=null?`https://maps.google.com/?q=${r.lat},${r.lng}`:""];
const SH=["المديرية","التاريخ","البلدية","الفئة","المنتج","الوحدة","الحجم","عدد الأسعار","أدنى سعر","أعلى سعر","المتوسط","الوسيط"];
function med(a){const s=[...a].sort((x,y)=>x-y),m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2}
const r2=x=>Math.round(x*100)/100;
function summaryRows(rows){
 const g={},order=[];
 const add=(k,meta,price)=>{if(!g[k]){g[k]={meta,v:[]};order.push(k)}g[k].v.push(price)};
 rows.filter(r=>r.price>0).forEach(r=>{
  const base=[r.dir||"",r.date,r.commune,r.cat,r.product,r.unit],bk=base.join("|");
  if(SIZED.includes(r.cat)){
   add(bk+"|0",[...base,"الكل"],r.price);
   const s=r.size||"غير محدد";add(bk+"|1"+s,[...base,s],r.price);
  }else add(bk+"|0",[...base,""],r.price);
 });
 return order.sort().map(k=>{const{meta,v}=g[k];return [...meta,v.length,Math.min(...v),Math.max(...v),r2(v.reduce((a,b)=>a+b,0)/v.length),r2(med(v))]});
}
async function showExport(){
 if(!S.dir){toast("اختر المديرية أولاً");return}
 const a=await getAll();
 if(!a.length){toast("لا توجد بيانات بعد");return}
 const dates=[...new Set(a.map(r=>r.date))].sort().reverse();
 $("#edate").innerHTML=`<option value="">كل البيانات (${a.length} سجل)</option>`+dates.map(d=>`<option>${d}</option>`).join("");
 $("#expStat").innerHTML=`المحفوظ في الهاتف: <b>${a.length}</b> سجل`;
 const ds=[...new Set(a.map(r=>r.dir||"").filter(Boolean))];
 $("#edir").innerHTML='<option value="">كل المديريات</option>'+ds.map(x=>`<option>${x}</option>`).join("");
 $("#edir").value=ds.includes(S.dir)?S.dir:"";
 go("exp");
}
async function selRows(){const d=$("#edate").value;const a=await getAll();
 return a.filter(r=>(!d||r.date===d)&&(!$("#edir").value||(r.dir||"")===$("#edir").value)).sort((x,y)=>(x.date+x.commune+x.point+x.cat).localeCompare(y.date+y.commune+y.point+y.cat))}
const fname=ext=>`prix_${$("#edate").value||"tout"}.${ext}`;
function csvBlob(rows,sum){
 const q=v=>`"${String(v).replace(/"/g,'""')}"`;
 const t="\ufeff"+(sum?[SH,...summaryRows(rows)]:[HEAD,...rows.map(toRow)]).map(r=>r.map(q).join(";")).join("\r\n");
 return new Blob([t],{type:"text/csv;charset=utf-8"});
}
/* minimal xlsx writer (zip "store") */
function crc32(b){let c,t=crc32.t;if(!t){t=crc32.t=[];for(let n=0;n<256;n++){c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0}}
 let r=-1;for(let i=0;i<b.length;i++)r=t[(r^b[i])&255]^(r>>>8);return(r^-1)>>>0}
function zip(files){
 const enc=new TextEncoder(),parts=[],cen=[];let off=0;
 for(const[name,txt]of files){
  const nb=enc.encode(name),d=enc.encode(txt),c=crc32(d);
  const h=new DataView(new ArrayBuffer(30));
  h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint16(6,0x0800,true);h.setUint16(8,0,true);
  h.setUint32(14,c,true);h.setUint32(18,d.length,true);h.setUint32(22,d.length,true);h.setUint16(26,nb.length,true);
  parts.push(h.buffer,nb,d);
  const e=new DataView(new ArrayBuffer(46));
  e.setUint32(0,0x02014b50,true);e.setUint16(4,20,true);e.setUint16(6,20,true);e.setUint16(8,0x0800,true);
  e.setUint32(16,c,true);e.setUint32(20,d.length,true);e.setUint32(24,d.length,true);e.setUint16(28,nb.length,true);e.setUint32(42,off,true);
  cen.push(e.buffer,nb);off+=30+nb.length+d.length;
 }
 let cs=0;cen.forEach(x=>cs+=x.byteLength||x.length);
 const z=new DataView(new ArrayBuffer(22));
 z.setUint32(0,0x06054b50,true);z.setUint16(8,files.length,true);z.setUint16(10,files.length,true);z.setUint32(12,cs,true);z.setUint32(16,off,true);
 return new Blob([...parts,...cen,z.buffer],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
}
function colL(i){return String.fromCharCode(65+i)}
function sheetXml(all,widths){
 const sd=all.map((r,ri)=>`<row r="${ri+1}">`+r.map((v,ci)=>{
  const ref=colL(ci)+(ri+1);
  if(typeof v==="number")return `<c r="${ref}"><v>${v}</v></c>`;
  return `<c r="${ref}" t="inlineStr"><is><t>${esc(v)}</t></is></c>`}).join("")+`</row>`).join("");
 return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView rightToLeft="1" workbookViewId="0"/></sheetViews><cols><col min="1" max="${widths}" width="18" customWidth="1"/></cols><sheetData>${sd}</sheetData></worksheet>`;
}
function xlsxBlob(rows){
 const X='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
 return zip([
 ["[Content_Types].xml",X+'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'],
 ["_rels/.rels",X+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
 ["xl/workbook.xml",X+'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="الأسعار" sheetId="1" r:id="rId1"/><sheet name="الملخص" sheetId="2" r:id="rId2"/></sheets></workbook>'],
 ["xl/_rels/workbook.xml.rels",X+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>'],
 ["xl/worksheets/sheet1.xml",sheetXml([HEAD,...rows.map(toRow)],HEAD.length)],
 ["xl/worksheets/sheet2.xml",sheetXml([SH,...summaryRows(rows)],SH.length)]
 ]);
}
async function makeFile(kind){const rows=await selRows();
 if(!rows.length){toast("لا توجد بيانات");return null}
 const b=kind==="xlsx"?xlsxBlob(rows):csvBlob(rows,kind==="csvsum");
 return new File([b],kind==="csvsum"?fname("csv").replace("prix_","resume_"):fname(kind),{type:b.type});
}
function download(f){const a=document.createElement("a");a.href=URL.createObjectURL(f);a.download=f.name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),4000)}
async function doExport(k){const f=await makeFile(k);if(f){download(f);toast("تم إنشاء الملف")}}
async function shareFile(){
 const f=await makeFile("xlsx");if(!f)return;
 try{if(navigator.canShare&&navigator.canShare({files:[f]})){await navigator.share({files:[f],title:"رصد الأسعار"});return}}catch(e){if(e.name==="AbortError")return}
 download(f);toast("المشاركة غير مدعومة هنا — تم تنزيل الملف");
}
const RISE_MIN=0; /* نسبة الارتفاع الدنيا لوسم 🟡 (0 = أي ارتفاع) */
async function summary(only){
 let rows=await selRows();
 const D=$("#edate").value||rows.reduce((m,r)=>r.date>m?r.date:m,"");
 rows=rows.filter(r=>r.date===D);
 const all=await getAll();
 const by={};
 rows.forEach(r=>{const k=(r.dir?r.dir+" — ":"")+r.commune;(by[k]=by[k]||[]).push(r)});
 let t=only?`🔴 منتجات غير متوفرة — ${D}\n`:`رصد أسعار — ${D}\n🟡 = ارتفاع عن آخر رصد سابق | 🔴 = غير متوفر\n`;
 let any=false;
 for(const k in by){
  const R=by[k];let blk=`\n📍 ${k}\n`;const warn=[];
  PRODUCTS.forEach(p=>{
   const pr=R.filter(r=>r.product===p.name);
   const v=pr.filter(r=>r.price>0).map(r=>r.price);
   const un=pr.filter(r=>r.avail==="غير متوفر").length;
   if(v.length&&!only){
    const m=v.reduce((x,y)=>x+y,0)/v.length,md=med(v);
    const ref=all.filter(r=>r.product===p.name&&r.commune===R[0].commune&&(r.dir||"")===(R[0].dir||"")&&r.date<D&&r.price>0);
    let flag="• ",tail="";
    if(ref.length){
     const pd=ref.reduce((x,r)=>r.date>x?r.date:x,"");
     const pm=med(ref.filter(r=>r.date===pd).map(r=>r.price));
     if(md>pm*(1+RISE_MIN)){flag="🟡 ⬆️ ";tail=` (ارتفاع +${((md/pm-1)*100).toFixed(0)}% عن ${pd})`}
    }
    blk+=`${flag}${p.name} (${p.unit}): ${v.length} أسعار، من ${Math.min(...v)} إلى ${Math.max(...v)}، متوسط ${m.toFixed(0)}، وسيط ${md.toFixed(0)} دج${tail}\n`;
   }
   if(un)warn.push(`🔴 ⚠️ ${p.name} (${p.unit}): غير متوفر${pr.length>1?` في ${un} من ${pr.length} نقطة`:""}`);
  });
  if(only){if(warn.length){any=true;t+=`\n📍 ${k}\n`+warn.join("\n")+"\n"}}
  else{t+=blk;if(warn.length)t+=`\n🔴 تحذير — منتجات غير متوفرة:\n`+warn.join("\n")+"\n"}
 }
 if(only&&!any)t+="\n✅ لا توجد منتجات غير متوفرة\n";
 return t;
}
async function shareWA(){window.open("https://wa.me/?text="+encodeURIComponent(await summary(true)),"_blank")}
async function shareMail(){location.href="mailto:?subject="+encodeURIComponent("رصد الأسعار")+"&body="+encodeURIComponent(await summary())}
async function wipe(){
 const d=$("#edate").value;
 if(!confirm(d?`حذف كل بيانات ${d} ؟ (تأكد أنك صدّرتها)`:"حذف كل البيانات المحفوظة ؟ (تأكد أنك صدّرتها)"))return;
 const a=await getAll();for(const r of a)if((!d||r.date===d)&&(!$("#edir").value||(r.dir||"")===$("#edir").value))await del(r.key);
 toast("تم الحذف");go("home");
}

/* ---------- init ---------- */
function net(){$("#off").style.display=navigator.onLine?"none":"block"}
addEventListener("online",net);addEventListener("offline",net);net();
function gateHome(){document.querySelectorAll(".hb").forEach(b=>b.classList.toggle("dis",!S.dir))}
function initDir(){
 const sel=$("#dirSel");
 sel.innerHTML='<option value="">— اختر المديرية —</option>'+DIRS.map(d=>`<option>${d}</option>`).join("");
 let v="";try{v=localStorage.getItem("dir")||""}catch(e){}
 S.dir=DIRS.includes(v)?v:"";sel.value=S.dir;
 sel.onchange=()=>{S.dir=sel.value;try{localStorage.setItem("dir",S.dir)}catch(e){}gateHome();refreshHome()};
 gateHome();
}
initDir();
$("#ver").textContent="النسخة "+VERSION;
openDB().then(refreshHome);
if("serviceWorker"in navigator)navigator.serviceWorker.register("sw.js");
