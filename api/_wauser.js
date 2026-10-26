// ============================================================
//  Sgela — WhatsApp user status (trial / paid gating by phone number)
//  Stored in Upstash:  wauser:<number> = { firstSeen, trialEnds, paidUntil, msgCount }
// ============================================================

import { kvConfigured, kvGet, kvSet, kvIncr } from "./_kv.js";

const TRIAL_DAYS = 0; // Free trial OFF — new users must subscribe. Set to 7 to re-enable.
const PAID_DAYS = 30;
const DAY = 86400;

function now() { return Math.floor(Date.now() / 1000); }

// Load (or create) a user record. New numbers start a 7-day free trial.
export async function getUser(number) {
  if (!kvConfigured()) {
    // no store -> treat everyone as trial so the bot still works
    return { state: "trial", trialEnds: now() + TRIAL_DAYS * DAY, msgCount: 0, _ephemeral: true };
  }
  let u = null;
  try { const raw = await kvGet(`wauser:${number}`); if (raw) u = JSON.parse(raw); } catch {}
  if (!u) {
    u = { firstSeen: now(), trialEnds: now() + TRIAL_DAYS * DAY, paidUntil: 0, msgCount: 0 };
    try { await kvSet(`wauser:${number}`, JSON.stringify(u), 400 * DAY); } catch {}
    try { await kvIncr("stat:newusers"); } catch {} // funnel: first-time students
  }
  return withState(u);
}

function withState(u) {
  const t = now();
  let state = "expired";
  if (u.paidUntil && u.paidUntil > t) state = "paid";
  else if (u.trialEnds && u.trialEnds > t) state = "trial";
  return { ...u, state };
}

export async function bumpCount(number, u) {
  if (!kvConfigured() || u._ephemeral) return;
  u.msgCount = (u.msgCount || 0) + 1;
  const { state, _ephemeral, ...clean } = u;
  try { await kvSet(`wauser:${number}`, JSON.stringify(clean), 400 * DAY); } catch {}
}

// Mark a number as paid for 30 days (called from the PayFast notification).
export async function markPaid(number, days = PAID_DAYS) {
  if (!kvConfigured()) return;
  let u = {};
  try { const raw = await kvGet(`wauser:${number}`); if (raw) u = JSON.parse(raw); } catch {}
  u.paidUntil = now() + days * DAY;
  if (!u.firstSeen) u.firstSeen = now();
  try { await kvSet(`wauser:${number}`, JSON.stringify(u), 400 * DAY); } catch {}
}

export function daysLeft(u) {
  const t = now();
  const end = u.state === "paid" ? u.paidUntil : u.trialEnds;
  return Math.max(0, Math.ceil((end - t) / DAY));
}
