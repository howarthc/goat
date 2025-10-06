// GOAT v3
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

// colours
function colorForPrice(p){
  if (p < 0) return 'rgba(27,75,155,0.9)'; // dark blue
  if (p < 6) return 'rgba(90,168,50,0.9)'; // green
  if (p < 12) return 'rgba(166,206,57,0.9)'; // light green
  if (p < 20) return 'rgba(239,139,26,0.9)'; // orange
  return 'rgba(217,75,61,0.9)'; // red
}
function borderForPrice(p){ return colorForPrice(p).replace('0.9','1'); }

// API helpers
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
  const now=Date.now(); let currentIdx=-1,nextIdx=-1,cheapIdx=-1,cheapVal=Infinity;
  for(let i=0;i<rates.length;i++){
    const s=Date.parse(rates[i].start), e=Date.parse(rates[i].end), v=Number(rates[i].price_inc_vat_p_per_kwh);
    if(now>=s && now<e) currentIdx=i;
    if(s>now && nextIdx===-1) nextIdx=i;
    if(v<cheapVal){ cheapVal=v; cheapIdx=i; }
  }
  return {currentIdx,nextIdx,cheapIdx};
}

function setCard(elBase, startISO, endISO, price){
  const t = (iso)=> new Date(iso).toLocaleTimeString('en-GB', tzOpts);
  document.getElementById(`${elBase}-time`).textContent = `${t(startISO)}–${t(endISO)}`;
  document.getElementById(`${elBase}-price`).textContent = fmtMoney(price);
  const card=document.querySelector(`.card.${elBase}`);
  if(elBase!=='cheapest'){ card.style.backgroundColor=colorForPrice(price); }
  else { card.style.backgroundColor = (price<0)?'rgba(27,75,155,0.95)':'rgba(14,128,148,0.95)'; }
}

// render chart and table using ALL points
function render(rates){
  if(!Array.isArray(rates)||!rates.length) throw new Error('No data returned');
  // ensure chronological & use ALL points
  rates = rates.slice().sort((a,b)=>a.start.localeCompare(b.start));

  const labels = rates.map(r => new Date(r.start).toLocaleTimeString('en-GB', tzOpts));
  const values = rates.map(r => Number(r.price_inc_vat_p_per_kwh));
  const { currentIdx, nextIdx, cheapIdx } = computeSummary(rates);

  if(currentIdx>=0){ const r=rates[currentIdx]; setCard('current', r.start, r.end, Number(r.price_inc_vat_p_per_kwh)); }
  if(nextIdx>=0){ const r=rates[nextIdx]; setCard('next', r.start, r.end, Number(r.price_inc_vat_p_per_kwh)); }
  if(cheapIdx>=0){ const r=rates[cheapIdx]; setCard('cheapest', r.start, r.end, Number(r.price_inc_vat_p_per_kwh)); }

  const bg = values.map(v => colorForPrice(v));
  const bd = values.map(v => borderForPrice(v));

  if(chart) chart.destroy();
  chart = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ label:'p/kWh (inc VAT)', data: values, backgroundColor: bg, borderColor: bd, borderWidth: 1, maxBarThickness: 20 }] },
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

  gridEl.innerHTML = `<tr><th>Start</th><th>End</th><th>Price</th></tr>` +
    rates.map((r,i)=>{
      const s=new Date(r.start).toLocaleTimeString('en-GB', tzOpts);
      const e=new Date(r.end).toLocaleTimeString('en-GB', tzOpts);
      const cls = (i===currentIdx)?' class="now"':'';
      return `<tr${cls}><td>${s}</td><td>${e}</td><td>${fmtMoney(Number(r.price_inc_vat_p_per_kwh))}</td></tr>`;
    }).join('');
}

// orchestration
async function loadForPostcode(pc){
  statusEl.textContent='Resolving region…';
  const gsp=await getGspByPostcode(pc);
  // from local midnight to +36h to include today + tomorrow when published
  const now=new Date(); const base=new Date(now); base.setHours(0,0,0,0);
  const from=base.toISOString(); const to=new Date(base.getTime()+36*3600*1000).toISOString();
  statusEl.textContent=`Region ${gsp}. Fetching rates…`;
  const rates=await fetchRates(gsp, from, to);
  render(rates);
  statusEl.textContent=`Region ${gsp}.`;
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