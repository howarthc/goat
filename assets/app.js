// GOAT front-end
const statusEl = document.getElementById('status');
const gridEl = document.getElementById('grid');
const ctx = document.getElementById('chart');
const form = document.getElementById('loc');
const postcodeInput = document.getElementById('postcode');

let chart;

const fmtMoney = p => `${Number(p).toFixed(1)}p`;
const tzOpts = { hour: '2-digit', minute: '2-digit' };

// ---- Persistence of postcode via URL & localStorage ----
function getPostcodeFromURL() {
  const u = new URL(window.location.href);
  return (u.searchParams.get('postcode') || '').trim();
}
function setPostcodeInURL(pc) {
  const u = new URL(window.location.href);
  u.searchParams.set('postcode', pc);
  history.replaceState({}, '', u.toString());
}
function loadInitialPostcode() {
  const fromUrl = getPostcodeFromURL();
  if (fromUrl) return fromUrl;
  const ls = localStorage.getItem('goat_postcode') || '';
  return ls;
}
function savePostcode(pc) {
  localStorage.setItem('goat_postcode', pc);
  setPostcodeInURL(pc);
}

// ---- Colour palette based on price (p/kWh inc VAT) ----
function colorForPrice(p) {
  if (p < 0) return 'rgba(27,75,155,0.9)'; // dark blue
  if (p < 6) return 'rgba(90,168,50,0.9)'; // green
  if (p < 12) return 'rgba(166,206,57,0.9)'; // light green
  if (p < 20) return 'rgba(239,139,26,0.9)'; // orange
  return 'rgba(217,75,61,0.9)'; // red
}
function borderForPrice(p) {
  const c = colorForPrice(p).replace('0.9', '1');
  return c;
}

// ---- API helpers ----
async function safeJson(res) {
  const ct = res.headers.get('content-type') || '';
  const text = await res.text();
  if (!ct.includes('application/json')) {
    const firstLine = text.split('\n')[0].slice(0,180);
    throw new Error(`Expected JSON but got: ${firstLine}`);
  }
  try { return JSON.parse(text); } catch(e){ throw new Error(`Bad JSON: ${e.message}`); }
}

async function getGspByPostcode(postcode) {
  const res = await fetch(`api/region.php?postcode=${encodeURIComponent(postcode)}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Region lookup failed: ${res.status}`);
  const j = await safeJson(res);
  if (!j.gsp) throw new Error('Could not resolve region from postcode');
  return j.gsp;
}

// Fetch from "now" to +36h so we include all future data published
async function fetchRates(gsp) {
  const now = new Date();
  const from = now.toISOString();
  const to = new Date(now.getTime() + 36*3600*1000).toISOString();
  const qs = new URLSearchParams({ gsp, from, to });
  const res = await fetch(`api/agile.php?${qs.toString()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Rates fetch failed: ${res.status}`);
  return safeJson(res);
}

// ---- Compute current/next/cheapest ----
function computeSummary(rates) {
  const now = Date.now();
  let currentIdx = -1, nextIdx = -1, cheapIdx = -1, cheapVal = Infinity;
  for (let i=0;i<rates.length;i++) {
    const s = Date.parse(rates[i].start), e = Date.parse(rates[i].end);
    if (now >= s && now < e) currentIdx = i;
    if (s > now && nextIdx === -1) nextIdx = i;
    const v = Number(rates[i].price_inc_vat_p_per_kwh);
    if (s >= now && v < cheapVal) { cheapVal = v; cheapIdx = i; }
  }
  return { currentIdx, nextIdx, cheapIdx };
}

function setCard(elBase, startISO, endISO, price) {
  const t = (iso) => new Date(iso).toLocaleTimeString('en-GB', tzOpts);
  document.getElementById(`${elBase}-time`).textContent = `${t(startISO)}–${t(endISO)}`;
  document.getElementById(`${elBase}-price`).textContent = fmtMoney(price);
  // background tint by price for current & next; cheapest gets teal-ish for standout unless negative
  const card = document.querySelector(`.card.${elBase}`);
  if (elBase !== 'cheapest') {
    card.style.backgroundColor = colorForPrice(price);
  } else {
    // cheapest: if negative use dark blue, else teal-ish mapping towards cheap/green
    card.style.backgroundColor = (price < 0) ? 'rgba(27,75,155,0.95)' : 'rgba(14,128,148,0.95)';
  }
}

// ---- Render chart & table ----
function render(rates) {
  if (!Array.isArray(rates) || !rates.length) throw new Error('No data returned');
  // Keep future-only points (>= now)
  const now = Date.now();
  const future = rates.filter(r => Date.parse(r.end) > now);
  if (!future.length) throw new Error('No future slots available yet');
  const points = future.map(r => ({ x: new Date(r.start), y: Number(r.price_inc_vat_p_per_kwh) }));

  // Summary cards
  const { currentIdx, nextIdx, cheapIdx } = computeSummary(rates);
  if (currentIdx >= 0) {
    const r = rates[currentIdx];
    setCard('current', r.start, r.end, Number(r.price_inc_vat_p_per_kwh));
  }
  if (nextIdx >= 0) {
    const r = rates[nextIdx];
    setCard('next', r.start, r.end, Number(r.price_inc_vat_p_per_kwh));
  }
  if (cheapIdx >= 0) {
    const r = rates[cheapIdx];
    setCard('cheapest', r.start, r.end, Number(r.price_inc_vat_p_per_kwh));
  }

  // Chart
  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type: 'bar',
    data: {
      datasets: [{
        label: 'p/kWh (inc VAT)',
        data: points,
        borderWidth: 1,
        backgroundColor: ctx => colorForPrice(ctx.raw.y),
        borderColor: ctx => borderForPrice(ctx.raw.y),
        maxBarThickness: 20,
        barPercentage: 0.98,
        categoryPercentage: 1.0
      }]
    },
    options: {
      parsing: false,
      maintainAspectRatio: false,
      animation: false,
      scales: {
        x: {
          type: 'time',
          time: { unit: 'hour', displayFormats: { hour: 'HH:mm' } },
          ticks: { source: 'auto' },
          min: points[0].x, // start from first future slot (≈ now)
        },
        y: {
          title: { display: true, text: 'Price (p/kWh)' },
          beginAtZero: true
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: items => items.length
              ? new Date(items[0].parsed.x).toLocaleTimeString('en-GB', tzOpts) : '',
            label: ctx => fmtMoney(ctx.parsed.y)
          }
        }
      }
    }
  });

  // Table with current slot bold
  const nowIdx = computeSummary(future).currentIdx; // relative to full rates; recompute for future subset
  gridEl.innerHTML = `<tr><th>Start</th><th>End</th><th>Price</th></tr>` +
    future.map((r, i) => {
      const s = new Date(r.start).toLocaleTimeString('en-GB', tzOpts);
      const e = new Date(r.end).toLocaleTimeString('en-GB', tzOpts);
      const cls = (Date.now() >= Date.parse(r.start) && Date.now() < Date.parse(r.end)) ? ' class="now"' : '';
      return `<tr${cls}><td>${s}</td><td>${e}</td><td>${fmtMoney(Number(r.price_inc_vat_p_per_kwh))}</td></tr>`;
    }).join('');
}

// ---- Orchestration ----
async function loadForPostcode(pc) {
  statusEl.textContent = 'Resolving region…';
  const gsp = await getGspByPostcode(pc);
  statusEl.textContent = `Region ${gsp}. Fetching future rates…`;
  const rates = await fetchRates(gsp);
  render(rates);
  statusEl.textContent = `Region ${gsp}. Showing from now.`;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const pc = postcodeInput.value.trim();
  if (!pc) return;
  try {
    savePostcode(pc);
    await loadForPostcode(pc);
  } catch (err) {
    statusEl.textContent = err.message;
  }
});

// Initial load
(async function init() {
  const pc = loadInitialPostcode();
  if (pc) {
    postcodeInput.value = pc;
    try {
      await loadForPostcode(pc);
    } catch (e) {
      statusEl.textContent = e.message;
    }
  } else {
    // no postcode yet: show form only
    statusEl.textContent = 'Enter a UK postcode to load Agile rates.';
  }
})();
