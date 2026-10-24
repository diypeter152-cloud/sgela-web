// TEMPORARY. Checks/fixes the WABA->app subscription and shows if the real
// handler has ever run for a number.
//   /api/wadbg3?key=sgela-debug&waba=1885199625979589        -> check
//   /api/wadbg3?key=sgela-debug&waba=1885199625979589&sub=1  -> subscribe
// Remove once the bot works.
import { kvGet } from "./_kv.js";

export const maxDuration = 30;

export default async function handler(req, res) {
  if ((req.query.key || "") !== "sgela-debug") return res.status(403).json({ error: "forbidden" });
  const waba = (req.query.waba || "1885199625979589").replace(/[^0-9]/g, "");
  const token = process.env.WHATSAPP_TOKEN;
  const out = { waba };

  // Has the REAL webhook handler ever run for Peter's number? (only it writes wa:*)
  try { out.waMemory_27664199659 = await kvGet("wa:27664199659"); } catch (e) { out.waMemory_27664199659 = "err " + e; }
  try { out.lastSeenKey = await kvGet("wadebug:lasthook"); } catch {}

  // Current subscribed apps on this WABA
  try {
    const r = await fetch(`https://graph.facebook.com/v21.0/${waba}/subscribed_apps`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    out.subscribed_apps = { status: r.status, body: await r.json() };
  } catch (e) { out.subscribed_apps = "err " + e; }

  // Optionally subscribe this app to the WABA
  if (req.query.sub === "1") {
    try {
      const r = await fetch(`https://graph.facebook.com/v21.0/${waba}/subscribed_apps`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      out.subscribe_result = { status: r.status, body: await r.json() };
    } catch (e) { out.subscribe_result = "err " + e; }
  }

  res.status(200).json(out);
}
