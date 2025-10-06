const statusEl = document.getElementById('status');
const gridEl = document.getElementById('grid');
const ctx = document.getElementById('chart');
let chart;

function fmtMoney(p) { return `${Number(p).toFixed(1)} p/kWh`; }

function findCurrentIndex(rates) {
  const now = Date.now();
  for (let i = 0; i < rates.length; i++) {
    const s = Date.parse(rates[i].start);
    const e = Date.parse(rates[i].end);
    if (now >= s && now < e) return i;
  }
  return -1;
}

async function getGspByPostcode(postcode) {
  const res = await fetch(`api/region.php?postcode=${encodeURIComponent(postcode)}`);
  const j = await res.json();
  if (!j.gsp) throw new Error('Could not resolve region');
  return j.gsp;
}

async function fetchRates(gsp, from, to) {
  const qs = new URLSearchParams({ gsp, from, to });
  const res = await fetch(`api/agile.php?${qs.toString()}`);
  if (!res.ok) throw new Error(`Rates fetch failed: ${res.status}`);
  return res.json();
}

function render(rates) {
  const points = rates.map(r => ({ x: new Date(r.start), y: Number(r.price_inc_vat_p_per_kwh) }));
  const nowIndex = findCurrentIndex(rates);

  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type: 'bar',
    data: {
      datasets: [{
        label: 'p/kWh (inc VAT)',
        data: points,
        borderWidth: 1,
        backgroundColor: ctx =>
          ctx.dataIndex === nowIndex ? 'rgba(255,159,64,0.9)' : 'rgba(54,162,235,0.6)',
        borderColor: ctx =>
          ctx.dataIndex === nowIndex ? 'rgba(255,159,64,1)' : 'rgba(54,162,235,1)',
        maxBarThickness: 18,
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
          ticks: { source: 'auto' }
        },
        y: {
          title: { display: true, text: 'p/kWh' },
          beginAtZero: true
        }
      },
      plugins: {
        tooltip: {
          callbacks: {
            title: items => items.length
              ? new Date(items[0].parsed.x).toLocaleTimeString('en-GB', { hour: '2-digit', minute:'2-digit' })
              : '',
            label: ctx => fmtMoney(ctx.parsed.y)
          }
        },
        legend: { display: false }
      }
    }
  });

  const tzOpts = { hour: '2-digit', minute: '2-digit' };
  gridEl.innerHTML = `<tr><th>Start</th><th>End</th><th>Price</th></tr>` +
    rates.map((r, i) => {
      const s = new Date(r.start).toLocaleTimeString('en-GB', tzOpts);
      const e = new Date(r.end).toLocaleTimeString('en-GB', tzOpts);
      const cls = i === nowIndex ? ' class="now"' : '';
      return `<tr${cls}><td>${s}</td><td>${e}</td><td>${fmtMoney(Number(r.price_inc_vat_p_per_kwh))}</td></tr>`;
    }).join('');
}

async function show(dayOffset) {
  try {
    statusEl.textContent = 'Loading…';
    const postcode = document.getElementById('postcode').value.trim();
    if (!postcode) throw new Error('Enter a postcode');
    const gsp = await getGspByPostcode(postcode);

    const base = new Date(); base.setHours(0,0,0,0); base.setDate(base.getDate() + dayOffset);
    const from = base.toISOString();
    const to = new Date(base.getTime() + 24*3600*1000).toISOString();

    const rates = await fetchRates(gsp, from, to);
    if (!Array.isArray(rates) || !rates.length) throw new Error('No data returned');
    render(rates);
    statusEl.textContent = `Region ${gsp}. ${dayOffset===0 ? 'Today' : 'Tomorrow'} shown.`;
  } catch (e) {
    statusEl.textContent = e.message;
  }
}

document.getElementById('loc').addEventListener('submit', e => { e.preventDefault(); show(0); });
document.getElementById('todayBtn').addEventListener('click', ()=>show(0));
document.getElementById('tomorrowBtn').addEventListener('click', ()=>show(1));
