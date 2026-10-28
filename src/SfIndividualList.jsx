// SFTOGGLE-2026-10-28 (SfIndividualList — Points/Strokes toggle, Individuals)
import React, { useState } from "react";
import { sfIndividualPoints } from "./stableford.js";

// Shared by the Stableford clone views (director, captain, spectator).
// Ranks players by Stableford points, highest first. Count-up totals already
// include the player's handicap (added by sfIndividualPoints).
export function SfIndividualList({ teams, course, holePars, sfCfg, C, highlightTeamIdx = null }) {
  // PG-SFTOGGLE-2026-10-28 — Points/Strokes toggle. Display only: ranking stays by
  // points in both modes. Separate key from the Outing toggle, so it never flips that one.
  const [sfScoreMode, setSfScoreMode] = useState(()=>{ try{ return localStorage.getItem("pg-sf-individual-score-mode")==="strokes" ? "strokes" : "points"; }catch(e){ return "points"; } });
  const showStrokes = sfScoreMode === "strokes";
  const setSfMode = (m)=>{ setSfScoreMode(m); try{ localStorage.setItem("pg-sf-individual-score-mode", m); }catch(e){} };
  const players = sfIndividualPoints(teams, course.holes, holePars, sfCfg).filter(p => p.holesPlayed > 0);
  const medals = ["1st", "2nd", "3rd"];
  const frontHoles = course.holes.filter(h => h.side === "front");
  const backHoles = course.holes.filter(h => h.side === "back");
  const toggle = (
    <div style={{display:"flex",gap:0,marginBottom:12,border:"1px solid "+C.border,borderRadius:10,overflow:"hidden"}}>
      {[["points","Points"],["strokes","Strokes"]].map(([id,lbl])=>(
        <button key={id} onClick={()=>setSfMode(id)} style={{flex:1,padding:"9px",fontSize:12,fontWeight:sfScoreMode===id?700:500,background:sfScoreMode===id?C.green:"transparent",color:sfScoreMode===id?"#0a1a0f":C.muted,border:"none",cursor:"pointer"}}>{lbl}</button>
      ))}
    </div>
  );
  if (players.length === 0) return (
    <div>
      {toggle}
      <div style={{ textAlign: "center", padding: "40px 20px", color: C.muted }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>🎯</div>
        <div style={{ fontSize: 14 }}>Individual scores appear here as players enter their scores.</div>
      </div>
    </div>
  );
  return (
    <div>
      {toggle}
      <div style={{ fontSize: 11, color: C.muted, letterSpacing: 2, textTransform: "uppercase", marginBottom: 12, textAlign: "center" }}>Individual · {showStrokes ? "Gross strokes" : "Stableford points"}</div>
      {players.map((p, i) => {
        const isMe = highlightTeamIdx !== null && p.teamIdx === highlightTeamIdx;
        return (
          <div key={`${p.teamIdx}-${p.pi}`} style={{ background: isMe ? "rgba(123,180,80,0.06)" : i === 0 ? "rgba(232,184,75,0.06)" : C.card, border: `1px solid ${isMe ? C.green + "44" : i === 0 ? C.gold + "44" : C.border}`, borderRadius: 12, padding: "10px 12px", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <div style={{ width: 28, textAlign: "center", fontSize: i < 3 ? 16 : 12, fontWeight: 800, color: i < 3 ? C.gold : C.muted, flexShrink: 0 }}>
                {i < 3 ? medals[i] : i + 1}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 14, color: isMe ? C.green : i === 0 ? C.gold : C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}{isMe ? " *" : ""}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 1 }}>
                  <div style={{ width: 7, height: 7, borderRadius: "50%", background: p.teamColor, flexShrink: 0 }} />
                  <div style={{ fontSize: 10, color: C.muted }}>{p.teamName} · HDCP {p.hdcp}</div>
                </div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: C.green }}>{showStrokes ? p.grossTotal : p.total + " pts"}</div>
                <div style={{ fontSize: 9, color: C.dim }}>thru {p.holesPlayed}</div>
              </div>
            </div>
            <div style={{ overflowX: "auto" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 2, marginBottom: 3, minWidth: 280 }}>
                <div style={{ width: 20, fontSize: 8, color: C.muted, flexShrink: 0, textAlign: "right", paddingRight: 3 }}>F</div>
                {frontHoles.map(h => (
                  <div key={h.hole} style={{ flex: 1, height: 22, borderRadius: 3, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ fontSize: 9, fontWeight: 700, color: (showStrokes ? p.grossByHole[h.hole] : p.byHole[h.hole]) !== undefined ? C.text : C.dim }}>{(showStrokes ? p.grossByHole[h.hole] : p.byHole[h.hole]) !== undefined ? (showStrokes ? p.grossByHole[h.hole] : p.byHole[h.hole]) : ""}</span>
                  </div>
                ))}
                <div style={{ width: 26, height: 22, borderRadius: 3, background: "rgba(123,180,80,0.08)", border: "1px solid rgba(123,180,80,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <span style={{ fontSize: 9, fontWeight: 800, color: C.green }}>{showStrokes ? p.grossFront : p.front}</span>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 2, minWidth: 280 }}>
                <div style={{ width: 20, fontSize: 8, color: C.muted, flexShrink: 0, textAlign: "right", paddingRight: 3 }}>B</div>
                {backHoles.map(h => (
                  <div key={h.hole} style={{ flex: 1, height: 22, borderRadius: 3, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ fontSize: 9, fontWeight: 700, color: (showStrokes ? p.grossByHole[h.hole] : p.byHole[h.hole]) !== undefined ? C.text : C.dim }}>{(showStrokes ? p.grossByHole[h.hole] : p.byHole[h.hole]) !== undefined ? (showStrokes ? p.grossByHole[h.hole] : p.byHole[h.hole]) : ""}</span>
                  </div>
                ))}
                <div style={{ width: 26, height: 22, borderRadius: 3, background: "rgba(123,180,80,0.08)", border: "1px solid rgba(123,180,80,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <span style={{ fontSize: 9, fontWeight: 800, color: C.green }}>{showStrokes ? p.grossBack : p.back}</span>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
