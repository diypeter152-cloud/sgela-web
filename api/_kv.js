// ============================================================
//  Sgela — tiny KV store (Upstash Redis REST)
//  Used to remember which payments PayFast has confirmed, so the
//  student's browser can claim their unlock code after paying.
//  Works over plain HTTPS fetch — no SDK needed.
// ============================================================

const URL = process.env.UPSTASH_REDIS_REST_URL || "";
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || "";

export function kvConfigured() {
  return !!(URL && TOKEN);
}

async function cmd(args) {
  const res = await fetch(URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error("kv error " + res.status);
  const data = await res.json();
  return data.result;
}

// set key=val with a TTL in seconds
export async function kvSet(key, val, ttlSeconds) {
  return cmd(["SET", key, val, "EX", String(ttlSeconds)]);
}
export async function kvGet(key) {
  return cmd(["GET", key]);
}
export async function kvDel(key) {
  return cmd(["DEL", key]);
}
// increment a counter (creates it at 1 if missing); used for funnel analytics
export async function kvIncr(key) {
  try { return await cmd(["INCR", key]); } catch { return null; }
}
