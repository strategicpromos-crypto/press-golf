// ── PRESS GOLF — RULES TAB ─────────────────────────────────────────────────
// Shared Rules landing page for the director, captain, and spectator views.
// Shows the tournament-wide rules note plus every per-hole note. Read-only:
// only the director writes these, on Tournament Setup. Captains and
// spectators can read them, never change them.
import React from "react";

export function RulesTab({ rules, holeNotes, C }) {
  const keys = Object.keys(holeNotes || {})
    .map((k) => parseInt(k, 10))
    .filter((h) => !isNaN(h) && String(holeNotes[h] || "").trim() !== "")
    .sort((a, b) => a - b);
  const rulesText = (rules || "").trim();
  return (
    <div>
      <div style={{ fontSize:11, color:C.muted, letterSpacing:1.5, textTransform:"uppercase", marginBottom:14, fontWeight:600 }}>📋 Rules</div>
      <div style={{ background:C.card, border:"1px solid "+C.border, borderRadius:12, padding:"14px 16px", marginBottom:16 }}>
        <div style={{ fontWeight:700, fontSize:15, marginBottom:6 }}>Tournament rules</div>
        <div style={{ fontSize:14, lineHeight:1.6 }}>{rulesText ? rulesText : "No special rules for this round."}</div>
      </div>
      {keys.length > 0 && (
        <div style={{ background:C.card, border:"1px solid "+C.border, borderRadius:12, padding:"14px 16px" }}>
          <div style={{ fontWeight:700, fontSize:15, marginBottom:8 }}>Hole notes</div>
          {keys.map((hn) => (
            <div key={hn} style={{ fontSize:14, lineHeight:1.5, marginBottom:6 }}>Hole {hn} — {holeNotes[hn]}</div>
          ))}
        </div>
      )}
    </div>
  );
}
