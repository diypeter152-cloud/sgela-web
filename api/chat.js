// ============================================================
//  SGELA AI — backend (Vercel serverless, streaming)
//  Streams the answer back token-by-token like ChatGPT/Claude.
//  Your OpenAI key never leaves the server.
// ============================================================

import fs from "fs";
import path from "path";

const SYSTEM_PROMPT = fs.readFileSync(
  path.join(process.cwd(), "api", "system_prompt.txt"),
  "utf8"
);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { messages } = req.body || {};
    if (!Array.isArray(messages)) {
      return res.status(400).json({ error: "messages must be an array" });
    }
    const recent = messages.slice(-10);

    const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        stream: true,
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...recent],
        max_tokens: 800,
      }),
    });

    if (!upstream.ok || !upstream.body) {
      const errText = await upstream.text().catch(() => "");
      console.error("OpenAI error:", errText);
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      return res
        .status(502)
        .end("Eish, I hit a snag thinking that through. Try again in a sec 🙏");
    }

    // Stream plain text chunks to the browser as they arrive
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // OpenAI sends Server-Sent-Events lines: "data: {json}\n\n"
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith("data:")) continue;
        const payload = t.slice(5).trim();
        if (payload === "[DONE]") continue;
        try {
          const json = JSON.parse(payload);
          const token = json.choices?.[0]?.delta?.content;
          if (token) res.write(token);
        } catch {
          /* ignore keep-alive / partial lines */
        }
      }
    }
    res.end();
  } catch (err) {
    console.error("Server error:", err);
    try {
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.status(500).end("Something went wrong on my side. Give it another go 🙏");
    } catch {}
  }
}
