// Pay-by-link for WhatsApp. A student taps this link from the chat; we
// build a signed PayFast request tying the payment to their phone number
// (custom_str1) and auto-submit them to PayFast's secure page.
import crypto from "crypto";
import { PF, pfConfigured, pfProcessUrl, pfSignature } from "./_payfast.js";
import { kvConfigured, kvSet, kvIncr } from "./_kv.js";

const PRICE = "50.00";
const ITEM = "Sgela Monthly Subscription";

export default async function handler(req, res) {
  const number = (req.query && req.query.n) ? String(req.query.n).replace(/[^0-9]/g, "") : "";
  if (!number) { res.status(400).send("Missing number"); return; }
  if (!pfConfigured() || !kvConfigured()) {
    res.status(200).send(htmlMessage("Payments aren't switched on yet. Please try again soon."));
    return;
  }

  const origin = `https://${req.headers.host}`;
  const mPaymentId = "wa_" + crypto.randomBytes(8).toString("hex");
  try { await kvSet(`pay:${mPaymentId}`, "pending", 7200); } catch {}
  try { await kvIncr("stat:taps"); } catch {} // funnel: pay links tapped

  const fields = [
    ["merchant_id", PF.merchantId],
    ["merchant_key", PF.merchantKey],
    ["return_url", `${origin}/thanks.html`],
    ["cancel_url", `${origin}/thanks.html?c=1`],
    ["notify_url", `${origin}/api/pay-notify`],
    ["m_payment_id", mPaymentId],
    ["amount", PRICE],
    ["item_name", ITEM],
    ["custom_str1", number], // <- the WhatsApp number to unlock
  ];
  if (PF.passphrase) fields.push(["signature", pfSignature(fields)]);

  const inputs = fields.map(([n, v]) => `<input type="hidden" name="${n}" value="${String(v).replace(/"/g, "&quot;")}">`).join("");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Taking you to PayFast…</title></head>
<body style="font-family:system-ui;background:#15132B;color:#fff;display:grid;place-items:center;height:100vh;margin:0;text-align:center">
<div><div style="font-size:18px">Taking you to secure payment…</div><div style="opacity:.6;margin-top:8px;font-size:14px">PayFast — card or instant EFT</div></div>
<form id="f" action="${pfProcessUrl()}" method="post">${inputs}</form>
<script>document.getElementById('f').submit();</script>
</body></html>`
  );
}

function htmlMessage(msg) {
  return `<!doctype html><html><body style="font-family:system-ui;background:#15132B;color:#fff;display:grid;place-items:center;height:100vh;margin:0;text-align:center"><div>${msg}</div></body></html>`;
}
