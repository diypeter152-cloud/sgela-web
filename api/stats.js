// Skolo funnel dashboard. Private: /api/stats?key=sgela-stats-2026
// Reads the analytics counters and renders a simple live funnel.
import { kvConfigured, kvGet } from "./_kv.js";

const KEY = "sgela-stats-2026";

export default async function handler(req, res) {
  if ((req.query.key || "") !== KEY) { res.status(403).send("Forbidden"); return; }
  if (!kvConfigured()) { res.status(200).send("Stats not available (KV not configured)."); return; }

  const num = async (k) => { try { const v = await kvGet(k); return parseInt(v || "0", 10) || 0; } catch { return 0; } };
  const [newusers, prompts, taps, payments] = await Promise.all([
    num("stat:newusers"), num("stat:prompts"), num("stat:taps"), num("stat:payments"),
  ]);

  const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);
  const rows = [
    { label: "New students (first message)", value: newusers, of: newusers },
    { label: "Pay prompts shown", value: prompts, of: newusers },
    { label: "Pay links tapped", value: taps, of: newusers },
    { label: "Payments completed", value: payments, of: newusers },
  ];
  const tapToPay = pct(payments, taps);
  const newToPay = pct(payments, newusers);
  const revenue = payments * 50;

  const bars = rows.map((r) => {
    const w = r.of > 0 ? Math.max(4, Math.round((r.value / r.of) * 100)) : 4;
    return `<div class="row">
      <div class="lbl">${r.label}</div>
      <div class="track"><div class="fill" style="width:${w}%"></div><span class="v">${r.value}</span></div>
    </div>`;
  }).join("");

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(`<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Skolo — Funnel</title>
<style>
  :root{--bg:#0E0C1D;--card:#15132B;--text:#F3F1FB;--muted:#A9A4C7;--accent:#8B7BFF}
  *{box-sizing:border-box}
  body{font-family:'Plus Jakarta Sans',system-ui,sans-serif;background:
    radial-gradient(800px 400px at 80% -10%,rgba(139,123,255,0.16),transparent 60%),var(--bg);
    color:var(--text);margin:0;padding:34px 18px}
  main{max-width:620px;margin:0 auto}
  h1{font-size:24px;margin:0 0 2px}
  .sub{color:var(--muted);font-size:13px;margin-bottom:24px}
  .kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:26px}
  .kpi{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:16px;text-align:center}
  .kpi .n{font-size:26px;font-weight:800}
  .kpi .k{color:var(--muted);font-size:12px;margin-top:2px}
  .row{margin:12px 0}
  .lbl{font-size:14px;margin-bottom:5px;color:#D8D4EC}
  .track{position:relative;background:rgba(255,255,255,0.05);border-radius:10px;height:34px;overflow:hidden}
  .fill{position:absolute;inset:0 auto 0 0;background:linear-gradient(135deg,#8B7BFF,#B57BFF);border-radius:10px}
  .v{position:absolute;right:12px;top:50%;transform:translateY(-50%);font-weight:700;font-size:14px}
  .foot{color:var(--muted);font-size:12px;margin-top:22px;line-height:1.6}
  .refresh{color:var(--accent);text-decoration:none}
</style></head><body><main>
  <h1>Skolo — Conversion funnel</h1>
  <div class="sub">Live counts since analytics went on · <a class="refresh" href="">refresh</a></div>
  <div class="kpis">
    <div class="kpi"><div class="n">${newToPay}%</div><div class="k">new → paid</div></div>
    <div class="kpi"><div class="n">${tapToPay}%</div><div class="k">tapped → paid</div></div>
    <div class="kpi"><div class="n">R${revenue.toLocaleString()}</div><div class="k">subscriptions × R50</div></div>
  </div>
  ${bars}
  <div class="foot">
    <b>new → paid</b> is your true conversion: of everyone who messaged, how many paid.<br>
    <b>tapped → paid</b> shows how many who reached PayFast actually completed — if this is low, the payment step is the leak.<br>
    Counts are cumulative and reset only if cleared. Revenue is an estimate (payments × R50), not actual settled funds.
  </div>
</main></body></html>`);
}
