export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = url.origin;
    const cors = {'Access-Control-Allow-Origin': origin,'Access-Control-Allow-Methods':'GET, OPTIONS','Access-Control-Allow-Headers':'Content-Type'};
    if (request.method === 'OPTIONS') return new Response(null,{headers:cors});

    if (url.pathname.endsWith('/api/region') || url.pathname.endsWith('/api/region.php')) {
      const postcode = (url.searchParams.get('postcode') || '').toUpperCase().replace(/\s+/g,'');
      if (!postcode) return json({error:'postcode required'},400,cors);
      const upstream = `https://api.octopus.energy/v1/industry/grid-supply-points/?postcode=${postcode}`;
      const res = await cachedFetch(upstream, 86400, ctx);
      const data = await res.json();
      const gsp = data?.results?.[0]?.group_id ? String(data.results[0].group_id).replace(/_/g,'').toUpperCase() : null;
      return json({gsp},200,cors);
    }

    if (url.pathname.endsWith('/api/agile') || url.pathname.endsWith('/api/agile.php')) {
      const gsp = (url.searchParams.get('gsp')||'').toUpperCase();
      const from = url.searchParams.get('from'); const to = url.searchParams.get('to');
      if (!/^[A-Z]$/.test(gsp)) return json({error:'Valid gsp letter required'},400,cors);
      if (!from || !to) return json({error:'from/to required ISO'},400,cors);

      const productsUrl='https://api.octopus.energy/v1/products/?brand=OCTOPUS_ENERGY&page_size=250';
      const pRes = await cachedFetch(productsUrl, 43200, ctx);
      const plist = await pRes.json();
      const prod = (plist.results||[]).find(p=>/Agile/i.test(p.display_name||'') && p.is_variable);
      if (!prod?.code) return json({error:'Could not determine Agile product'},502,cors);

      const tariff = `E-1R-${prod.code}-${gsp}`;
      let next = `https://api.octopus.energy/v1/products/${prod.code}/electricity-tariffs/${tariff}/standard-unit-rates/?period_from=${encodeURIComponent(from)}&period_to=${encodeURIComponent(to)}&page_size=250`;
      const now = new Date();
      const inPublishWindow = (now.getHours()===15 && now.getMinutes()>=45) || (now.getHours()===16 && now.getMinutes()<=30);
      const edgeTtl = inPublishWindow ? 180 : 3600;

      const out=[];
      while (next) {
        const r = await cachedFetch(next, edgeTtl, ctx);
        const j = await r.json();
        for (const item of (j.results||[])) {
          const inc = (item.value_inc_vat!=null) ? item.value_inc_vat : (item.value_exc_vat!=null ? Math.round(item.value_exc_vat*105)/100 : null);
          if (inc==null) continue;
          out.push({start:item.valid_from,end:item.valid_to,price_inc_vat_p_per_kwh:inc});
        }
        next = j.next || null;
      }
      out.sort((a,b)=>a.start.localeCompare(b.start));
      return json(out,200,{...cors,'Cache-Control':'public, max-age=300, s-maxage=3600, stale-while-revalidate=600'});
    }
    return json({error:'not found'},404,cors);
  }
};
function json(body,status=200,extra={}){return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8',...extra}})}
async function cachedFetch(u,ttl,ctx){const req=new Request(u,{cf:{cacheEverything:true,cacheTtl:ttl,cacheKey:u}});const cache=caches.default;let res=await cache.match(req);if(res)return res;const upstream=await fetch(req);if(!upstream.ok)return upstream;const headers=new Headers(upstream.headers);headers.set('Cache-Control',`public, max-age=${ttl}`);const cached=new Response(await upstream.arrayBuffer(),{status:upstream.status,headers});ctx.waitUntil(cache.put(req,cached.clone()));return cached;}
