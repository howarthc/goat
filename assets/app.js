// GOAT v0.9
const VERSION = '0.9';
const statusEl = document.getElementById('status');
const gridEl = document.getElementById('grid');
const form = document.getElementById('loc');
const postcodeInput = document.getElementById('postcode');

const fmtMoney = p => `${Number(p).toFixed(1)}p`;
const tzOpts = { hour: '2-digit', minute: '2-digit' };

function getPostcodeFromURL(){ const u=new URL(location.href); return (u.searchParams.get('postcode')||'').trim(); }
function setPostcodeInURL(pc){ const u=new URL(location.href); u.searchParams.set('postcode', pc); history.replaceState({},'',u.toString()); }
function loadInitialPostcode(){ return getPostcodeFromURL() || localStorage.getItem('goat_postcode') || ''; }
function savePostcode(pc){ localStorage.setItem('goat_postcode', pc); setPostcodeInURL(pc); }

// Colour mapping (as v0.8): < -10 royal blue; -10..0 blue->white; 0..13 white->yellow; 13..27 yellow->red; >27 red
const stops = [
  {v:-10, c:[65,105,225]},
  {v:0,   c:[255,255,255]},
  {v:13,  c:[255,255,0]},
  {v:27,  c:[255,0,0]}
];
function lerp(a,b,t){ return a + (b-a)*t; }
function lerpColor(c1,c2,t){ return [Math.round(lerp(c1[0],c2[0],t)), Math.round(lerp(c1[1],c2[1],t)), Math.round(lerp(c1[2],c2[2],t))]; }
function colorForValue(v){
  if (v <= stops[0].v) return `rgb(${stops[0].c.join(',')})`;
  if (v >= stops[stops.length-1].v) return `rgb(${stops[stops.length-1].c.join(',')})`;
  for (let i=0;i<stops.length-1;i++){
    const a=stops[i], b=stops[i+1];
    if (v >= a.v && v <= b.v) {
      const t=(v-a.v)/(b.v-a.v);
      const c=lerpColor(a.c,b.c,t);
      return `rgb(${c.join(',')})`;
    }
  }
  return `rgb(${stops[stops.length-1].c.join(',')})`;
}
function textColorForBg(rgbStr){
  const m = rgbStr.match(/rgb\((\d+),(\d+),(\d+)\)/);
  if (!m) return '#111';
  const r=+m[1], g=+m[2], b=+m[3];
  const L=(0.2126*r + 0.7152*g + 0.0722*b);
  return L < 140 ? '#fff' : '#111';
}

async function safeJson(res){
  const ct=res.headers.get('content-type')||''; const text=await res.text();
  if (!ct.includes('application/json')) { throw new Error(`Expected JSON but got: ${text.split('\n')[0].slice(0,160)}`); }
  try { return JSON.parse(text); } catch(e){ throw new Error(`Bad JSON: ${e.message}`); }
}
async function getGspByPostcode(pc){
  const res=await fetch(`api/region.php?postcode=${encodeURIComponent(pc)}`,{cache:'no-store'});
  if(!res.ok) throw new Error(`Region lookup failed: ${res.status}`);
  const j=await safeJson(res); if(!j.gsp) throw new Error('Could not resolve region'); return j.gsp;
}
async function fetchRates(gsp, fromISO, toISO){
  const qs = new URLSearchParams({ gsp, from: fromISO, to: toISO });
  const res=await fetch(`api/agile.php?${qs.toString()}`,{cache:'no-store'});
  if(!res.ok) throw new Error(`Rates fetch failed: ${res.status}`);
  return safeJson(res);
}

function computeSummary(rates){
  const now=Date.now();
  let currentIdx=-1,nextIdx=-1,cheapIdx=-1,expIdx=-1;
  let cheapVal=Infinity, expVal=-Infinity;
  for(let i=0;i<rates.length;i++){
    const s=Date.parse(rates[i].start), e=Date.parse(rates[i].end), v=Number(rates[i].price_inc_vat_p_per_kwh);
    if(now>=s && now<e) currentIdx=i;
    if(s>now && nextIdx===-1) nextIdx=i;
    if(s>=now && v<cheapVal){ cheapVal=v; cheapIdx=i; }
    if(s>=now && v>expVal){ expVal=v; expIdx=i; }
  }
  return {currentIdx,nextIdx,cheapIdx,expIdx};
}
function setTopCell(idBase, startISO, endISO, price){
  const timeEl = document.getElementById(`${idBase}-time`);
  const priceEl = document.getElementById(`${idBase}-price`);
  const cell = document.getElementById(`cell-${idBase}`);
  const t = (iso)=> new Date(iso).toLocaleTimeString('en-GB', {hour:'2-digit',minute:'2-digit'});
  const bg = colorForValue(price);
  const fg = textColorForBg(bg);
  cell.style.background = bg;
  cell.style.color = fg;
  timeEl.textContent = `${t(startISO)}–${t(endISO)}`;
  priceEl.textContent = fmtMoney(price);
}

function render(rates){
  if(!Array.isArray(rates)||!rates.length) throw new Error('No data returned');
  rates = rates.slice().sort((a,b)=>a.start.localeCompare(b.start));

  const { currentIdx, nextIdx, cheapIdx, expIdx } = computeSummary(rates);
  if (currentIdx >= 0) { const r = rates[currentIdx]; setTopCell('current', r.start, r.end, Number(r.price_inc_vat_p_per_kwh)); }
  if (nextIdx >= 0) { const r = rates[nextIdx]; setTopCell('next', r.start, r.end, Number(r.price_inc_vat_p_per_kwh)); }
  if (cheapIdx >= 0) { const r = rates[cheapIdx]; setTopCell('cheapest', r.start, r.end, Number(r.price_inc_vat_p_per_kwh)); }
  if (expIdx >= 0) { const r = rates[expIdx]; setTopCell('expensive', r.start, r.end, Number(r.price_inc_vat_p_per_kwh)); }

  gridEl.innerHTML = `<tr><th>Start</th><th>End</th><th>Price</th><th>Trend</th></tr>` +
    rates.map((r,i)=>{
      const s=new Date(r.start).toLocaleTimeString('en-GB', tzOpts);
      const e=new Date(r.end).toLocaleTimeString('en-GB', tzOpts);
      const val = Number(r.price_inc_vat_p_per_kwh);
      const bg = colorForValue(val);
      const fg = textColorForBg(bg);
      let trendHtml = '<span class="trend-same">-</span>';
      if (i > 0) {
        const prev = Number(rates[i-1].price_inc_vat_p_per_kwh);
        const diff = val - prev;
        if (Math.abs(diff) < 0.001) trendHtml = '<span class="trend-same">-</span>';
        else if (diff > 0) trendHtml = '<span class="trend-up">▲</span>';
        else trendHtml = '<span class="trend-down">▼</span>';
      }
      const now = Date.now();
      const isNow = now >= Date.parse(r.start) && now < Date.parse(r.end);
      const nowCls = isNow ? ' class="now"' : '';
      return `<tr${nowCls}>
        <td>${s}</td>
        <td>${e}</td>
        <td class="price-cell" style="background:${bg};color:${fg}"><span class="price-text">${fmtMoney(val)}</span></td>
        <td class="trend-cell">${trendHtml}</td>
      </tr>`;
    }).join('');
}

async function loadForPostcode(pc){
  statusEl.textContent='Resolving region…';
  const gsp=await getGspByPostcode(pc);
  const now=new Date(); const base=new Date(now); base.setHours(0,0,0,0);
  const from=base.toISOString(); const to=new Date(base.getTime()+36*3600*1000).toISOString();
  statusEl.textContent=`Region ${gsp}. Fetching rates…`;
  const rates=await fetchRates(gsp, from, to);
  render(rates);
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