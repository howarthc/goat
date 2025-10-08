// GOAT v1.1 — London-fixed day/night shading & header spacing tweaks
const VERSION='1.1';
const statusEl=document.getElementById('status');
const gridEl=document.getElementById('grid');
const form=document.getElementById('loc');
const postcodeInput=document.getElementById('postcode');

const fmtMoney=p=>`${Number(p).toFixed(1)}p`;
const tzOpts={hour:'2-digit',minute:'2-digit'};

function getPostcodeFromURL(){const u=new URL(location.href);return(u.searchParams.get('postcode')||'').trim()}
function setPostcodeInURL(pc){const u=new URL(location.href);u.searchParams.set('postcode',pc);history.replaceState({},"",u.toString())}
function loadInitialPostcode(){return getPostcodeFromURL()||localStorage.getItem('goat_postcode')||''}
function savePostcode(pc){localStorage.setItem('goat_postcode',pc);setPostcodeInURL(pc)}

// ----- Price colour mapping with 27→100 band -----
const stops=[
  {v:-10,c:[65,105,225]},
  {v:0,c:[255,255,255]},
  {v:13,c:[255,255,0]},
  {v:27,c:[255,0,0]},
  {v:100,c:[10,30,120]}
];
function lerp(a,b,t){return a+(b-a)*t}
function lerpColor(c1,c2,t){return[Math.round(lerp(c1[0],c2[0],t)),Math.round(lerp(c1[1],c2[1],t)),Math.round(lerp(c1[2],c2[2],t))]}
function colorForValue(v){
  if(v<=stops[0].v) return `rgb(${stops[0].c.join(',')})`;
  if(v>=stops[stops.length-1].v) return `rgb(${stops[stops.length-1].c.join(',')})`;
  for(let i=0;i<stops.length-1;i++){const a=stops[i],b=stops[i+1];if(v>=a.v&&v<=b.v){const t=(v-a.v)/(b.v-a.v);const c=lerpColor(a.c,b.c,t);return `rgb(${c.join(',')})`}}
  return `rgb(${stops[stops.length-1].c.join(',')})`
}
function textColorForBg(rgbStr){
  const m=rgbStr.match(/rgb\((\d+),(\d+),(\d+)\)/); if(!m) return '#111';
  const r=+m[1],g=+m[2],b=+m[3]; const L=(0.2126*r+0.7152*g+0.0722*b); return L<140?'#fff':'#111';
}

// ---- London-fixed sunrise/sunset with robust fallback ----
function getSunTimesLondon(dateLocal){
  const d = new Date(dateLocal); d.setHours(0,0,0,0);
  const month=d.getMonth(); // 0..11
  // Very lightweight month table for London (approx local sunrise/sunset)
  const approx = [
    [8,16.0],[7.5,17.0],[6.5,18.5],[6.0,20.0],[5.0,21.0],[4.45,21.30],
    [4.55,21.15],[5.20,20.30],[6.10,19.15],[7.00,18.00],[7.45,16.30],[8.15,16.00]
  ][month];
  const srH = Math.floor(approx[0]); const srM = Math.round((approx[0]-srH)*60);
  const ssH = Math.floor(approx[1]); const ssM = Math.round((approx[1]-ssH)*60);
  const sunrise=new Date(d); sunrise.setHours(srH,srM,0,0);
  const sunset=new Date(d); sunset.setHours(ssH,ssM,0,0);
  return {sunrise, sunset};
}

// ---- API helpers ----
async function safeJson(res){
  const ct=res.headers.get('content-type')||''; const text=await res.text();
  if(!ct.includes('application/json')) throw new Error(`Expected JSON but got: ${text.split('\\n')[0].slice(0,160)}`);
  try{return JSON.parse(text)}catch(e){throw new Error(`Bad JSON: ${e.message}`)}
}
async function getGspByPostcode(pc){
  const res=await fetch(`api/region.php?postcode=${encodeURIComponent(pc)}`,{cache:'no-store'});
  if(!res.ok) throw new Error(`Region lookup failed: ${res.status}`);
  const j=await safeJson(res); if(!j.gsp) throw new Error('Could not resolve region'); return j.gsp;
}
async function fetchRates(gsp,fromISO,toISO){
  const qs=new URLSearchParams({gsp,from:fromISO,to:toISO});
  const res=await fetch(`api/agile.php?${qs.toString()}`,{cache:'no-store'});
  if(!res.ok) throw new Error(`Rates fetch failed: ${res.status}`);
  return safeJson(res);
}

// ---- Summaries ----
function computeSummary(rates){
  const now=Date.now(); let currentIdx=-1,nextIdx=-1,cheapIdx=-1,expIdx=-1;
  let cheapVal=Infinity, expVal=-Infinity;
  for(let i=0;i<rates.length;i++){
    const s=Date.parse(rates[i].start), e=Date.parse(rates[i].end), v=Number(rates[i].price_inc_vat_p_per_kwh);
    if(now>=s && now<e) currentIdx=i;
    if(s>now && nextIdx===-1) nextIdx=i;
    if(s>=now && v<cheapVal){cheapVal=v; cheapIdx=i;}
    if(s>=now && v>expVal){expVal=v; expIdx=i;}
  }
  return {currentIdx,nextIdx,cheapIdx,expIdx};
}
function setTopCell(idBase,startISO,endISO,price){
  const timeEl=document.getElementById(`${idBase}-time`);
  const priceEl=document.getElementById(`${idBase}-price`);
  const cell=document.getElementById(`cell-${idBase}`);
  const t=iso=>new Date(iso).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
  const bg=colorForValue(price); const fg=textColorForBg(bg);
  cell.style.background=bg; cell.style.color=fg;
  timeEl.textContent=`${t(startISO)}–${t(endISO)}`; priceEl.textContent=fmtMoney(price);
}

// ---- Render ----
async function render(rates){
  if(!Array.isArray(rates)||!rates.length) throw new Error('No data returned');
  rates=rates.slice().sort((a,b)=>a.start.localeCompare(b.start));
  const now=Date.now(); rates=rates.filter(r=>Date.parse(r.end)>now);

  const {currentIdx,nextIdx,cheapIdx,expIdx}=computeSummary(rates);
  if(currentIdx>=0){const r=rates[currentIdx]; setTopCell('current',r.start,r.end,Number(r.price_inc_vat_p_per_kwh));}
  if(nextIdx>=0){const r=rates[nextIdx]; setTopCell('next',r.start,r.end,Number(r.price_inc_vat_p_per_kwh));}
  if(cheapIdx>=0){const r=rates[cheapIdx]; setTopCell('cheapest',r.start,r.end,Number(r.price_inc_vat_p_per_kwh));}
  if(expIdx>=0){const r=rates[expIdx]; setTopCell('expensive',r.start,r.end,Number(r.price_inc_vat_p_per_kwh));}

  // London sun times for today & tomorrow
  const today=new Date(); today.setHours(0,0,0,0);
  const tomorrow=new Date(today); tomorrow.setDate(today.getDate()+1);
  const sunToday=getSunTimesLondon(today);
  const sunTomorrow=getSunTimesLondon(tomorrow);
  const sunFor=(d)=> d.toDateString()===today.toDateString()?sunToday:sunTomorrow;

  let html=`<tr><th>Start</th><th>End</th><th>Price</th><th>Trend</th></tr>`;
  for(let i=0;i<rates.length;i++){
    const r=rates[i];
    const sDate=new Date(r.start), eDate=new Date(r.end);
    const {sunrise:srS, sunset:ssS}=sunFor(sDate);
    const {sunrise:srE, sunset:ssE}=sunFor(eDate);
    const sStr=sDate.toLocaleTimeString('en-GB',tzOpts);
    const eStr=eDate.toLocaleTimeString('en-GB',tzOpts);
    const val=Number(r.price_inc_vat_p_per_kwh);
    const bg=colorForValue(val), fg=textColorForBg(bg);
    let trendHtml='<span class="trend-same">-</span>';
    if(i>0){const prev=Number(rates[i-1].price_inc_vat_p_per_kwh); const diff=val-prev; trendHtml = Math.abs(diff)<0.001 ? '<span class="trend-same">-</span>' : (diff>0? '<span class="trend-up">▲</span>' : '<span class="trend-down">▼</span>');}
    const isNow=now>=Date.parse(r.start)&&now<Date.parse(r.end); const nowCls=isNow?' class="now"':'';
    const startIsDay=(sDate>=srS&&sDate<ssS); const endIsDay=(eDate>=srE&&eDate<ssE);
    const startBg=startIsDay?'var(--day)':'var(--night)'; const endBg=endIsDay?'var(--day)':'var(--night)';
    html+=`<tr${nowCls}>
      <td class="time-start" style="background:${startBg}">${sStr}</td>
      <td class="time-end" style="background:${endBg}">${eStr}</td>
      <td class="price-cell" style="background:${bg};color:${fg}"><span class="price-text">${fmtMoney(val)}</span></td>
      <td class="trend-cell">${trendHtml}</td>
    </tr>`;
  }
  gridEl.innerHTML=html;
}

// ---- Load window: today 00:00 to tomorrow 23:59:59 ----
async function loadForPostcode(pc){
  statusEl.textContent='Resolving region…';
  const gsp=await getGspByPostcode(pc);
  const now=new Date();
  const from=new Date(now); from.setHours(0,0,0,0);
  const to=new Date(now); to.setDate(now.getDate()+1); to.setHours(23,59,59,999);
  statusEl.textContent=`Region ${gsp}. Fetching rates…`;
  const rates=await fetchRates(gsp, from.toISOString(), to.toISOString());
  await render(rates);
  statusEl.textContent=`Region ${gsp}. v${VERSION}`;
}

form.addEventListener('submit', async e=>{
  e.preventDefault();
  const pc=postcodeInput.value.trim(); if(!pc) return;
  try{ savePostcode(pc); await loadForPostcode(pc); } catch(err){ statusEl.textContent=err.message; }
});

(async function init(){
  const pc=loadInitialPostcode();
  if(pc){ postcodeInput.value=pc; try{ await loadForPostcode(pc); } catch(e){ statusEl.textContent=e.message; } }
  else { statusEl.textContent='Enter a UK postcode to load Agile rates.'; }
})();