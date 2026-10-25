// ── STABLEFORD CLONE of the TourneyLoader in TourneyJoin.jsx ───────────────
// Loads a Stableford game by ID from sf_tournaments and routes to the Sf
// captain/spectator views. The Best Ball TourneyLoader is untouched.
import React, { useState, useEffect } from "react";
import { sb } from "./supabase.js";

const C = {
  bg:"#080f0a", surface:"#0e1a10", card:"#121e14",
  border:"rgba(123,180,80,0.18)", green:"#7bb450", gold:"#e8b84b",
  red:"#e05050", text:"#e8f0e9", muted:"#6b7f6d", dim:"#1e2f20",
};

// ── TourneyLoader ─────────────────────────────────────────────────────────────
// Used when someone taps a captain or spectator LINK (has tourneyId in URL)
// Loads the tournament by ID, routes directly to captain or spectator view
export function SfTourneyLoader({ tourneyId, teamIdx, isSpectator, onBack, onCaptain, onSpectator }) {
  const [status, setStatus] = useState("loading");
  const [error,  setError]  = useState("");

  useEffect(() => { load(); }, []);

  async function load() {
    setStatus("loading");
    const { data, error } = await sb.from("sf_tournaments").select("*").eq("id", tourneyId).single();
    if (error || !data) {
      // Clear stale localStorage immediately — prevents the infinite loop
      // where Back reloads the page and press_link_params re-triggers this screen
      try{
        localStorage.removeItem("press_link_params");
        localStorage.removeItem("press_captain_session");
      }catch(e){}
      setError("Tournament not found. The link may have expired.");
      setStatus("error");
      return;
    }
    // Route immediately based on URL params
    if (isSpectator) {
      onSpectator(data);
    } else if (teamIdx !== null && teamIdx !== undefined) {
      onCaptain(data, teamIdx);
    } else {
      // Bare tournament link — go to spectator
      onSpectator(data);
    }
  }

  if (status === "loading") return (
    <div style={{ fontFamily:"Georgia,serif", minHeight:"100vh", background:C.bg, color:C.text, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:16 }}>
      <div style={{ width:40, height:40, border:`3px solid ${C.dim}`, borderTop:`3px solid ${C.green}`, borderRadius:"50%", animation:"spin 0.8s linear infinite" }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ color:C.muted, fontSize:14 }}>Loading Stableford tournament...</div>
    </div>
  );

  return (
    <div style={{ fontFamily:"Georgia,serif", minHeight:"100vh", background:C.bg, color:C.text, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
      <div style={{ textAlign:"center", maxWidth:320 }}>
        <div style={{ fontSize:48, marginBottom:16 }}>⛳</div>
        <div style={{ fontSize:18, fontWeight:700, color:C.red, marginBottom:8 }}>Tournament Not Found</div>
        <div style={{ fontSize:14, color:C.muted, marginBottom:24, lineHeight:1.5 }}>{error}</div>
        <button onClick={onBack} style={{ background:C.green, border:"none", color:"#0a1a0f", padding:"14px 28px", borderRadius:12, fontSize:15, fontWeight:700, cursor:"pointer" }}>← Back</button>
      </div>
    </div>
  );
}

