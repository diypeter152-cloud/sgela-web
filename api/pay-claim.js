// After returning from PayFast, the browser polls this with its payment id.
// Once the ITN has marked it paid, we mint a 30-day access code, hand it
// over once, and retire the record so it can't be claimed twice.
import { makeCode } from "./_auth.js";
import { kvConfigured, kvGet, kvSet, kvDel } from "./_kv.js";

export default async function handler(req, res) {
  if (!kvConfigured()) return res.status(503).json({ error: "not_configured" });

  const id = (req.query && req.query.id) || "";
  if (!id) return res.status(400).json({ error: "missing_id" });

  try {
    const status = await kvGet(`pay:${id}`);
    if (status === "paid") {
      const code = makeCode({ days: 30, type: "paid" });
      // mark claimed so the same payment can't mint endless codes
      await kvDel(`pay:${id}`);
      await kvSet(`claimed:${id}`, code, 7200);
      return res.status(200).json({ status: "paid", code });
    }
    // if already claimed, return the same code (so a refresh still works)
    const claimed = await kvGet(`claimed:${id}`);
    if (claimed) return res.status(200).json({ status: "paid", code: claimed });

    if (status === "pending") return res.status(200).json({ status: "pending" });
    return res.status(200).json({ status: "unknown" });
  } catch (e) {
    console.error("pay-claim error", e);
    return res.status(500).json({ error: "server" });
  }
}
