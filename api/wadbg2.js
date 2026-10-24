// TEMPORARY diagnostic. Runs the bot's REAL handling path step by step.
//   /api/wa-debug?key=sgela-debug&to=27664199659
// Remove this file once the bot is confirmed working.

import fs from "fs";
import path from "path";
import { kvConfigured, kvGet, kvSet } from "./_kv.js";
import { getUser, daysLeft } from "./_wauser.js";

export const maxDuration = 30;

export default async function handler(req, res) {
  if ((req.query.key || "") !== "sgela-debug") {
    return res.status(403).json({ error: "forbidden" });
  }
  const to = (req.query.to || "").replace(/[^0-9]/g, "");
  const steps = {};

  // step 0: env
  steps.env = {
    phoneId: process.env.WHATSAPP_PHONE_ID || null,
    tokenLen: (process.env.WHATSAPP_TOKEN || "").length,
    openai: !!process.env.OPENAI_API_KEY,
    kvConfigured: kvConfigured(),
  };

  // step 1: read system prompt
  try {
    const sp = fs.readFileSync(path.join(process.cwd(), "api", "system_prompt.txt"), "utf8");
    steps.systemPrompt = { ok: true, length: sp.length };
    steps._sp = sp;
  } catch (e) {
    steps.systemPrompt = { ok: false, error: String(e) };
  }

  // step 2: getUser (KV gating)
  try {
    const u = await getUser(to || "27000000000");
    steps.getUser = { ok: true, state: u.state, daysLeft: daysLeft(u) };
  } catch (e) {
    steps.getUser = { ok: false, error: String(e), stack: e?.stack };
  }

  // step 3: KV round-trip
  try {
    await kvSet("wadebug:ping", "1", 60);
    const v = await kvGet("wadebug:ping");
    steps.kv = { ok: true, readBack: v };
  } catch (e) {
    steps.kv = { ok: false, error: String(e) };
  }

  // step 4: full askSgela (system prompt + question)
  let answer = null;
  try {
    const messages = [
      { role: "system", content: steps._sp || "You are a helpful tutor." },
      { role: "user", content: "Explain Newton's 3rd law" },
    ];
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model: "gpt-4o-mini", max_tokens: 800, messages }),
    });
    const j = await r.json();
    if (j.error) steps.askSgela = { ok: false, error: j.error };
    else { answer = (j.choices?.[0]?.message?.content || "").trim(); steps.askSgela = { ok: true, chars: answer.length, preview: answer.slice(0, 80) }; }
  } catch (e) {
    steps.askSgela = { ok: false, error: String(e) };
  }

  // step 5: send the real answer
  if (to && answer) {
    try {
      const r = await fetch(`https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_ID}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` },
        body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: answer } }),
      });
      steps.send = { status: r.status, body: await r.json() };
    } catch (e) {
      steps.send = { ok: false, error: String(e) };
    }
  } else {
    steps.send = "skipped";
  }

  delete steps._sp;
  res.status(200).json(steps);
}
