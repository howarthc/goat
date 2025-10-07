// GOAT v0.6
const VERSION = '0.6';
const statusEl = document.getElementById('status');
const gridEl = document.getElementById('grid');
const ctx = document.getElementById('chart');
const form = document.getElementById('loc');
const postcodeInput = document.getElementById('postcode');

let chart;

const fmtMoney = p => `${Number(p).toFixed(1)}p`;
const tzOpts = { hour: '2-digit', minute: '2-digit' };

// persistence
function getPostcodeFromURL(){ const u=new URL(location.href); return (u.searchParams.get('postcode')||'').trim(); }
function setPostcodeInURL(pc){ const u=new URL(location.href); u.searchParams.set('postcode', pc); history.replaceState({},'',u.toString()); }
function loadInitialPostcode(){ return getPostcodeFromURL() || localStorage.getItem('goat_postcode') || ''; }
function savePostcode(pc){ localStorage.setItem('goat_postcode', pc); setPostcodeInURL(pc); }

// ----- Colour temperature mapping (gradients) -----
// Stops: [-10, blue] -> [0, white] -> [15, green] -> [27, yellow] -> [50, red]
const stops = [
  {v:-10, c:[27,75,155]},   // blue #1b4b9b
  {v:0,   c:[255,255,255]}, // white
  {v:15,  c:[90,168,50]},   // green #5aa832
  {v:27,  c:[255,210,60]},  // yellow #ffd23c
  {v:50,  c:[217,75,61]}    // red #d94b3d
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
  const m = rgbStr.match(/rgb\\((\\d+),(\\d+),(\\d+)\\)/);
  if (!m) return '#111';
  const r=+m[1], g=+m[2], b=+m[3];
  const L=(0.2126*r + 0.7152*g + 0.0722*b);
  return L < 140 ? '#fff' : '#111';
}

// API helpers
async function safeJson(res){
  const ct=res.headers.get('content-type')||''; const text=await res.text();
  if (!ct.includes('application/json')) { throw new Error(`Expected JSON but got: ${text.split('\\n')[0].slice(0,160)}`); }
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
  const now=Date.now(); let currentIdx=-1,nextIdx=-1,cheapIdx=-1,cheapVal=Infinity;
  for(let i=0;i<rates.length;i++){
    const s=Date.parse(rates[i].start), e=Date.parse(rates[i].end), v=Number(rates[i].price_inc_vat_p_per_kwh);
    if(now>=s && now<e) currentIdx=i;
    if(s>now && nextIdx===-1) nextIdx=i;
    if(s>=now && v<cheapVal){ cheapVal=v; cheapIdx=i; }
  }
  return {currentIdx,nextIdx,cheapIdx};
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

  const { currentIdx, nextIdx, cheapIdx } = computeSummary(rates);
  if (currentIdx >= 0) { const r = rates[currentIdx]; setTopCell('current', r.start, r.end, Number(r.price_inc_vat_p_per_kwh)); }
  if (nextIdx >= 0) { const r = rates[nextIdx]; setTopCell('next', r.start, r.end, Number(r.price_inc_vat_p_per_kwh)); }
  if (cheapIdx >= 0) { const r = rates[cheapIdx]; setTopCell('cheapest', r.start, r.end, Number(r.price_inc_vat_p_per_kwh)); }

  // Chart: ALL points (category axis)
  const labels = rates.map(r => new Date(r.start).toLocaleTimeString('en-GB', tzOpts));
  const values = rates.map(r => Number(r.price_inc_vat_p_per_kwh));
  const colors = values.map(v => colorForValue(v));

  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ label:'p/kWh (inc VAT)', data: values, backgroundColor: colors, borderColor: colors, borderWidth: 1, maxBarThickness: 24 }] },
    options: {
      maintainAspectRatio:false,
      parsing:false,
      animation:false,
      scales:{
        x:{ type:'category', ticks:{ autoSkip:true, maxRotation:60, minRotation:60 } },
        y:{ beginAtZero:true, title:{display:true, text:'Price (p/kWh)'} }
      },
      plugins:{
        legend:{display:false},
        tooltip:{ callbacks:{ label: ctx => fmtMoney(Number(ctx.raw)) } }
      }
    }
  });

  // Lower table with Trend column & coloured price cell
  gridEl.innerHTML = `<tr><th>Start</th><th>End</th><th>Price</th><th>Trend</th></tr>` +
    rates.map((r,i)=>{
      const s=new Date(r.start).toLocaleTimeString('en-GB', tzOpts);
      const e=new Date(r.end).toLocaleTimeString('en-GB', tzOpts);
      const val = Number(r.price_inc_vat_p_per_kwh);
      const bg = colorForValue(val);
      const fg = textColorForBg(bg);
      let trendHtml = '';
      if (i === 0) trendHtml = '<span class="trend-same" title="No previous"></span>';
      else {
        const prev = Number(rates[i-1].price_inc_vat_p_per_kwh);
        const diff = val - prev;
        if (Math.abs(diff) < 0.001) trendHtml = '<span class="trend-same" title="Same price"></span>';
        else if (diff > 0) trendHtml = '<span class="trend-up" title="Higher">▲</span>';
        else trendHtml = '<span class="trend-down" title="Lower">▼</span>';
      }
      const now = Date.now();
      const isNow = now >= Date.parse(r.start) && now < Date.parse(r.end);
      const nowCls = isNow ? ' class="now"' : '';
      return `<tr${nowCls}>
        <td>${s}</td>
        <td>${e}</td>
        <td class="price-cell"><span class="price-text" style="color:${fg}">${fmtMoney(val)}</span></td>
        <td class="trend-cell">${trendHtml}</td>
      </tr>
      <style>
        #grid tr:nth-child(${i+2}) td.price-cell::before { background: ${bg}; }
      </style>`;
    }).join('');
}

// load
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