// PayFast ITN (Instant Transaction Notification) handler.
// PayFast POSTs here server-to-server after a payment. We verify it,
// then mark the payment as paid so the browser can claim its code.
import { PF, pfVerifyItnSignature, pfValidateUrl, phpUrlEncode } from "./_payfast.js";
import { kvConfigured, kvGet, kvSet } from "./_kv.js";

function parseForm(str) {
  const out = {};
  for (const pair of String(str).split("&")) {
    if (!pair) continue;
    const idx = pair.indexOf("=");
    const k = decodeURIComponent(pair.slice(0, idx));
    const v = decodeURIComponent(pair.slice(idx + 1).replace(/\+/g, " "));
    out[k] = v;
  }
  return out;
}
function readRawBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
    req.on("error", () => resolve(""));
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(200).end(); return; }
  if (!kvConfigured()) { res.status(200).end(); return; }

  try {
    // Vercel may have already parsed the body. Handle every shape.
    let data = {};
    if (req.body && typeof req.body === "object" && Object.keys(req.body).length) {
      data = req.body;
    } else if (typeof req.body === "string" && req.body.length) {
      data = parseForm(req.body);
    } else {
      data = parseForm(await readRawBody(req));
    }

    if (!data || !data.m_payment_id) { res.status(200).end(); return; }

    // 1) signature valid (sandbox has no passphrase, so this checks the plain signature)
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
    let valid = false;
    try {
      const verify = await fetch(pfValidateUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      const txt = await verify.text();
      valid = txt.includes("VALID");
    } catch { valid = false; }
    if (!valid) { res.status(200).end(); return; }

    // All good — mark this payment paid (only if we created it)
    const id = data.m_payment_id;
    const existing = await kvGet(`pay:${id}`);
    if (existing) await kvSet(`pay:${id}`, "paid", 7200);

    res.status(200).end();
  } catch (e) {
    console.error("pay-notify error", e);
    res.status(200).end();
  }
}
