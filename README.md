# GOAT v2.0 (Edge API via Cloudflare Workers)
Upload everything except `worker/` to your web root (e.g., `/agile`). Then deploy the Worker:

1) In Cloudflare → Workers, create a Worker and paste `worker/worker.js`. Deploy.
2) Add a Route: https://YOUR_DOMAIN/api/* → this Worker (or edit `worker/wrangler.toml` and run `wrangler deploy`).
3) Visit `https://YOUR_DOMAIN/agile/?postcode=SW1A1AA`.

Static files are cached; API calls run at the edge and are cached per POP.
