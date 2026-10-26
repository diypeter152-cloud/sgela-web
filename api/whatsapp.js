// ============================================================
//  SGELA AI — WhatsApp bot (Meta WhatsApp Cloud API)
//  GET  /api/whatsapp -> webhook verification handshake
//  POST /api/whatsapp -> handle a student's message (text OR photo)
//
//  Features: 7-day free trial per number, PayFast pay-by-link gating,
//  photo reading (vision), short per-student memory. Same Sgela brain.
//
//  Env (Vercel): WHATSAPP_VERIFY_TOKEN, WHATSAPP_TOKEN, WHATSAPP_PHONE_ID,
//  OPENAI_API_KEY, UPSTASH_REDIS_REST_* , PAYFAST_* (already set)
// ============================================================

import fs from "fs";
import path from "path";
import { kvConfigured, kvGet, kvSet, kvIncr } from "./_kv.js";
import { getUser, bumpCount, daysLeft } from "./_wauser.js";

const SYSTEM_PROMPT = fs.readFileSync(
  path.join(process.cwd(), "api", "system_prompt.txt"),
  "utf8"
);
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || "";
const WA_TOKEN = process.env.WHATSAPP_TOKEN || "";
const WA_PHONE_ID = process.env.WHATSAPP_PHONE_ID || "";

// Raise the serverless timeout so a photo (vision) call has room to finish.
export const maxDuration = 30;

export default async function handler(req, res) {
  // 1. Webhook verification (Meta calls once on connect)
  if (req.method === "GET") {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    if (mode === "subscribe" && token && token === VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }
    return res.status(403).send("Forbidden");
  }
  if (req.method !== "POST") return res.status(405).end();

  // Do the work FIRST, then ack. On Vercel the function can be frozen the
  // moment the response is sent, so acking early drops the reply.
  try {
    await handleMessage(req);
  } catch (e) {
    console.error("whatsapp handler error", e);
  }
  try { res.status(200).end(); } catch {}
}

async function handleMessage(req) {
  const value = req.body?.entry?.[0]?.changes?.[0]?.value;
  const message = value?.messages?.[0];
  if (!message) return;
  const from = message.from;
  if (!from) return;

  // ---- de-dupe: Meta re-delivers if we're slow; answer each message once ----
  if (kvConfigured() && message.id) {
    try {
      const seen = await kvGet(`waseen:${message.id}`);
      if (seen) return;
      await kvSet(`waseen:${message.id}`, "1", 600);
    } catch {}
  }

  {
    // ---- gating ----
    const user = await getUser(from);
    const origin = `https://${req.headers.host}`;

    if (user.state === "expired") {
      const link = `${origin}/api/pay-wa?n=${encodeURIComponent(from)}`;
      const returning = user.paidUntil && user.paidUntil > 0; // has subscribed before
      const msg = returning
        ? `Your Sgela subscription has ended. 🎓\n\nRenew to keep your Matric tutor — Maths, Sciences, Geography, English & Afrikaans — for *R50/month*.\n\nTap to renew (card or instant EFT):\n${link}\n\nOnce you've paid, message me again and we're back. 💪`
        : `🎓 Welcome to *Sgela* — your own *private* Matric tutor, right here on WhatsApp.\n\nIt's finals. Stuck on a question at 11pm? Send it to me — *type it or snap a photo* — and I'll walk you through it step by step, the way the exam wants it. ✍️\n\n📚 Maths · Sciences · Geography · English · Afrikaans\n⏰ 24/7, instant help\n💡 Teaches you how marks are actually awarded\n\nUnlock everything for *R50/month* — less than one textbook, cheaper than one tutoring session.\n\n👉 Tap to start (card or instant EFT):\n${link}\n\nPay once, message me, and we're in. Let's get those marks 💪`;
      await sendWhatsApp(from, msg);
      try { await kvIncr("stat:prompts"); } catch {} // funnel: pay prompts shown
      return;
    }

    // ---- build the question (text or photo) ----
    let userContent = null;      // string or vision-style array
    let plainForMemory = "";

    if (message.type === "text") {
      plainForMemory = (message.text?.body || "").trim();
      if (!plainForMemory) return;
      userContent = plainForMemory;
    } else if (message.type === "image") {
      const b64 = await fetchWhatsAppImage(message.image?.id);
      if (!b64) {
        await sendWhatsApp(from, "I couldn't open that image — try sending it again, or type the question out 🙏");
        return;
      }
      const caption = (message.image?.caption || "").trim();
      plainForMemory = caption ? `[photo] ${caption}` : "[photo of a question]";
      userContent = [
        { type: "text", text: caption || "Here's a photo of a question I'm stuck on. Please read it and help me solve it, step by step the CAPS way." },
        { type: "image_url", image_url: { url: `data:${message.image?.mime_type || "image/jpeg"};base64,${b64}` } },
      ];
    } else {
      // voice notes, stickers, etc. — gently steer
      await sendWhatsApp(from, "Send me a question as *text* or a *photo* of it and I'll help you solve it 📚");
      return;
    }

    // ---- short memory (text only; images are one-shot) ----
    let history = [];
    if (kvConfigured()) {
      try { const raw = await kvGet(`wa:${from}`); if (raw) history = JSON.parse(raw); } catch {}
    }
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...history,
      { role: "user", content: userContent },
    ];

    const answer = await askSgela(messages);

    // save memory as plain text so it stays small
    history.push({ role: "user", content: plainForMemory });
    history.push({ role: "assistant", content: answer });
    if (kvConfigured()) {
      try { await kvSet(`wa:${from}`, JSON.stringify(history.slice(-12)), 30 * 24 * 3600); } catch {} // remember the student (name, context) for ~30 days
    }

    // trial countdown nudge on the way out (only near the end)
    let suffix = "";
    if (user.state === "trial") {
      const d = daysLeft(user);
      if (d <= 2) suffix = `\n\n⏳ ${d} day${d === 1 ? "" : "s"} left on your free trial.`;
    }

    await sendWhatsApp(from, answer + suffix);
    await bumpCount(from, user);
  }
}

// ---- OpenAI (vision-capable) ----
async function askSgela(messages) {
  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model: "gpt-4o-mini", messages, max_tokens: 800 }),
    });
    const data = await resp.json();
    if (data.error) { console.error("OpenAI error:", data.error); return "Eish, I hit a snag there. Try again in a sec 🙏"; }
    return (data.choices?.[0]?.message?.content || "…").trim();
  } catch (e) { console.error("askSgela", e); return "Something went wrong on my side. Try again 🙏"; }
}

// ---- download a WhatsApp image and return base64 ----
async function fetchWhatsAppImage(mediaId) {
  if (!mediaId) return null;
  try {
    const meta = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${WA_TOKEN}` },
    }).then((r) => r.json());
    if (!meta.url) return null;
    const buf = await fetch(meta.url, { headers: { Authorization: `Bearer ${WA_TOKEN}` } })
      .then((r) => r.arrayBuffer());
    return Buffer.from(buf).toString("base64");
  } catch (e) { console.error("fetchWhatsAppImage", e); return null; }
}

// ---- send a WhatsApp text message ----
async function sendWhatsApp(to, text) {
  try {
    await fetch(`https://graph.facebook.com/v21.0/${WA_PHONE_ID}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${WA_TOKEN}` },
      body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: text } }),
    });
  } catch (e) { console.error("sendWhatsApp", e); }
}
