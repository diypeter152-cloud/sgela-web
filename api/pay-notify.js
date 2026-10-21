// PayFast ITN (Instant Transaction Notification) handler.
// PayFast POSTs here server-to-server after a payment. We verify it
// four ways, then mark the payment as paid so the browser can claim.
import { PF, pfVerifyItnSignature, pfValidateUrl, phpUrlEncode } from "./_payfast.js";
import { kvConfigured, kvGet, kvSet } from "./_kv.js";

export const config = { api: { bodyParser: false } };

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
  });
}
function parseForm(str) {
  const out = {};
  for (const pair of str.split("&")) {
    if (!pair) continue;
    const [k, v] = pair.split("=");
    out[decodeURIComponent(k)] = decodeURIComponent((v || "").replace(/\+/g, " "));
  }
  return out;
}

export default async function handler(req, res) {
  // Always 200 quickly so PayFast doesn't retry endlessly.
  if (req.method !== "POST") { res.status(200).end(); return; }
  if (!kvConfigured()) { res.status(200).end(); return; }

  try {
    const raw = await readBody(req);
    const data = parseForm(raw);

    // 1) signature valid
    if (!pfVerifyItnSignature(data)) { res.status(200).end(); return; }

    // 2) amount is what we expect (R50.00)
    if (parseFloat(data.amount_gross) !== 50.0) { res.status(200).end(); return; }

    // 3) payment actually complete
    if (data.payment_status !== "COMPLETE") { res.status(200).end(); return; }

    // 4) postback to PayFast to confirm the data is genuine
    const body = Object.keys(data)
      .filter((k) => k !== "signature")
      .map((k) => `${k}=${phpUrlEncode(data[k])}`)
      .join("&");
    const verify = await fetch(pfValidateUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const txt = await verify.text();
    if (!txt.includes("VALID")) { res.status(200).end(); return; }

    // All good — mark this payment paid (only if we created it)
    const id = data.m_payment_id;
    if (id) {
      const existing = await kvGet(`pay:${id}`);
      if (existing) await kvSet(`pay:${id}`, "paid", 7200);
    }
    res.status(200).end();
  } catch (e) {
    console.error("pay-notify error", e);
    res.status(200).end();
  }
}
