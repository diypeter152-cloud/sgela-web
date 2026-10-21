// Starts a PayFast payment. Returns the form action + fields for the
// browser to POST to PayFast's secure page. We store a pending record
// so we can confirm the payment later via the ITN.
import crypto from "crypto";
import { PF, pfConfigured, pfProcessUrl, pfSignature } from "./_payfast.js";
import { kvConfigured, kvSet } from "./_kv.js";

const PRICE = "50.00";
const ITEM = "Sgela Monthly Subscription";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method" });
  if (!pfConfigured() || !kvConfigured()) {
    return res.status(503).json({ error: "payments_not_configured" });
  }

  try {
    const origin = `https://${req.headers.host}`;
    const mPaymentId = crypto.randomBytes(10).toString("hex");

    // remember this payment is pending (TTL 2h)
    await kvSet(`pay:${mPaymentId}`, "pending", 7200);

    // Order matters: the signature is built over these fields in THIS order,
    // and the browser submits them in the same order.
    const fields = [
      ["merchant_id", PF.merchantId],
      ["merchant_key", PF.merchantKey],
      ["return_url", `${origin}/?claim=${mPaymentId}`],
      ["cancel_url", `${origin}/?cancelled=1`],
      ["notify_url", `${origin}/api/pay-notify`],
      ["m_payment_id", mPaymentId],
      ["amount", PRICE],
      ["item_name", ITEM],
    ];
    // PayFast only enforces the signature when a passphrase is configured.
    // In sandbox (no passphrase) we omit it so the shared test merchant works.
    if (PF.passphrase) {
      const signature = pfSignature(fields);
      fields.push(["signature", signature]);
    }

    return res.status(200).json({
      action: pfProcessUrl(),
      fields: fields.map(([name, value]) => ({ name, value })),
      mPaymentId,
    });
  } catch (e) {
    console.error("pay-start error", e);
    return res.status(500).json({ error: "server" });
  }
}

// build: 1792595869
