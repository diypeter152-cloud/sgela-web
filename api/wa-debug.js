// TEMPORARY diagnostic endpoint. Visit:
//   /api/wa-debug?key=sgela-debug            -> env + OpenAI check
//   /api/wa-debug?key=sgela-debug&to=27664199659  -> also tries to WhatsApp that number
// Remove this file once the bot is confirmed working.

export const maxDuration = 30;

export default async function handler(req, res) {
  if ((req.query.key || "") !== "sgela-debug") {
    return res.status(403).json({ error: "forbidden" });
  }

  const out = { env: {}, openai: null, send: null };

  // 1. Which env vars are present (booleans only — never leak values)
  out.env = {
    WHATSAPP_PHONE_ID: !!process.env.WHATSAPP_PHONE_ID,
    WHATSAPP_TOKEN: !!process.env.WHATSAPP_TOKEN,
    WHATSAPP_VERIFY_TOKEN: !!process.env.WHATSAPP_VERIFY_TOKEN,
    OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
    UPSTASH_REDIS_REST_URL: !!process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: !!process.env.UPSTASH_REDIS_REST_TOKEN,
  };
  out.env.WHATSAPP_PHONE_ID_value = process.env.WHATSAPP_PHONE_ID || null; // id is not secret
  out.env.WHATSAPP_TOKEN_len = (process.env.WHATSAPP_TOKEN || "").length;

  // 2. Tiny OpenAI call
  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model: "gpt-4o-mini", max_tokens: 5, messages: [{ role: "user", content: "say ok" }] }),
    });
    const j = await r.json();
    out.openai = j.error ? { ok: false, error: j.error } : { ok: true, reply: j.choices?.[0]?.message?.content };
  } catch (e) {
    out.openai = { ok: false, error: String(e) };
  }

  // 3. Try sending a WhatsApp message (only if ?to= given)
  const to = (req.query.to || "").replace(/[^0-9]/g, "");
  if (to) {
    try {
      const r = await fetch(`https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_ID}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` },
        body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: "Sgela debug ✅ — your bot can message you." } }),
      });
      out.send = { status: r.status, body: await r.json() };
    } catch (e) {
      out.send = { ok: false, error: String(e) };
    }
  } else {
    out.send = "skipped (no ?to= given)";
  }

  res.status(200).json(out);
}
