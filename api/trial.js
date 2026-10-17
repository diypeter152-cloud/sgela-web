// Issues a fresh 7-day free-trial access code.
// The app calls this once on a new device, stores the code, and sends it
// with every chat request. After 7 days it expires and the paywall shows.
import { makeCode } from "./_auth.js";

export default function handler(req, res) {
  const code = makeCode({ days: 7, type: "trial" });
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({ code });
}
