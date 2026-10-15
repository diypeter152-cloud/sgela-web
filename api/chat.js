// ============================================================
//  SGELA AI — backend (Vercel serverless function)
//  The browser NEVER sees your OpenAI key. It lives here, on the server.
//  Flow: student's message (+ recent history) -> OpenAI -> reply
// ============================================================

import fs from "fs";
import path from "path";

// Load the Sgela system prompt once (it sits next to this file)
const SYSTEM_PROMPT = fs.readFileSync(
  path.join(process.cwd(), "api", "system_prompt.txt"),
  "utf8"
);

export default async function handler(req, res) {
  // Only accept POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // The page sends the running conversation so Sgela remembers the thread.
    // We cap it so costs/length stay sane.
    const { messages } = req.body || {};
    if (!Array.isArray(messages)) {
      return res.status(400).json({ error: "messages must be an array" });
    }
    const recent = messages.slice(-10); // last 10 turns only

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...recent,
        ],
        max_tokens: 700,
      }),
    });

    const data = await resp.json();

    if (data.error) {
      console.error("OpenAI error:", data.error);
      return res
        .status(502)
        .json({ reply: "Eish, I hit a snag thinking that through. Try again in a sec 🙏" });
    }

    const reply = data.choices?.[0]?.message?.content?.trim() || "…";
    return res.status(200).json({ reply });
  } catch (err) {
    console.error("Server error:", err);
    return res
      .status(500)
      .json({ reply: "Something went wrong on my side. Give it another go 🙏" });
  }
}
