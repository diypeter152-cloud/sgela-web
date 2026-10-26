// PayFast ITN (Instant Transaction Notification) handler.
// PayFast POSTs here server-to-server after a payment. We verify it,
// then mark the payment as paid so the browser can claim its code.
//
// LIVE mode (passphrase set): strict — signature + PayFast postback required.
// SANDBOX mode (no passphrase): lenient — status + amount + record match,
//   since the shared sandbox merchant doesn't sign ITNs the same way.
import { PF, pfVerifyItnSignature, pfValidateUrl, phpUrlEncode } from "./_payfast.js";
import { kvConfigured, kvGet, kvSet, kvIncr } from "./_kv.js";
import { markPaid } from "./_wauser.js";

// Send a WhatsApp text (used to welcome a student the moment payment confirms)
async function sendWhatsApp(to, text) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  if (!token || !phoneId || !to) return;
  await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: text } }),
  });
}

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
    let data = {};
    if (req.body && typeof req.body === "object" && Object.keys(req.body).length) {
      data = req.body;
    } else if (typeof req.body === "string" && req.body.length) {
      data = parseForm(req.body);
    } else {
      data = parseForm(await readRawBody(req));
    }

    const id = data && data.m_payment_id;
    if (!id) { res.status(200).end(); return; }

    // basic checks (both modes)
    const complete = data.payment_status === "COMPLETE";
    const amountOk = parseFloat(data.amount_gross) === 50.0;

    // must correspond to a payment we created
    const existing = await kvGet(`pay:${id}`);
    if (!existing) { res.status(200).end(); return; }
    const alreadyProcessed = existing === "paid"; // PayFast may retry the ITN

    const isLive = !!PF.passphrase;

    if (isLive) {
      // strict: signature + postback
      if (!pfVerifyItnSignature(data)) { res.status(200).end(); return; }
      if (!complete || !amountOk) { res.status(200).end(); return; }
      const body = Object.keys(data)
        .filter((k) => k !== "signature")
        .map((k) => `${k}=${phpUrlEncode(data[k])}`)
        .join("&");
      let valid = false;
      try {
        const v = await fetch(pfValidateUrl(), {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body,
        });
        valid = (await v.text()).includes("VALID");
      } catch { valid = false; }
      if (!valid) { res.status(200).end(); return; }
    } else {
      // sandbox: just confirm the payment completed for the right amount
      if (!complete || !amountOk) { res.status(200).end(); return; }
    }

    await kvSet(`pay:${id}`, "paid", 7200);

    // Do the unlock + welcome + analytics only once per payment (ITN can retry).
    if (!alreadyProcessed) {
      try { await kvIncr("stat:payments"); } catch {} // funnel: completed payments

      // If this payment came from a WhatsApp pay-by-link, custom_str1 holds the
      // student's number. Unlock that number for 30 days and welcome them in.
      const waNumber = (data.custom_str1 || "").replace(/[^0-9]/g, "");
      if (waNumber) {
        try { await markPaid(waNumber); } catch (e) { console.error("markPaid failed", e); }
        try {
          await sendWhatsApp(
            waNumber,
            `🎉 You're in! Your *Skolo* subscription is active for the next 30 days.\n\nAsk me anything — type a question or snap a photo of it. Maths, Sciences, Geography, English & Afrikaans.\n\nLet's get those marks 📚💪`
          );
        } catch (e) { console.error("welcome send failed", e); }
      }
    }

    res.status(200).end();
  } catch (e) {
    console.error("pay-notify error", e);
    res.status(200).end();
  }
}
