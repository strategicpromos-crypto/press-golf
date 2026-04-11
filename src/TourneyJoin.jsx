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
export function TourneyLoader({ tourneyId, teamIdx, isSpectator, onBack, onCaptain, onSpectator }) {
  const [status, setStatus] = useState("loading");
  const [error,  setError]  = useState("");

  useEffect(() => { load(); }, []);

  async function load() {
    setStatus("loading");
    const { data, error } = await sb.from("team_tournaments").select("*").eq("id", tourneyId).single();
    if (error || !data) {
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
      <div style={{ color:C.muted, fontSize:14 }}>Loading tournament...</div>
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

// ── TourneyCodeEntry ──────────────────────────────────────────────────────────
// Used when someone taps "🔑 Join a Tournament" from the home screen
// Spectator code only — just a UUID lookup, simple and clean
// Has a back button to return to home screen
export default function TourneyCodeEntry({ onBack, onCaptain, onSpectator }) {
  const [code,    setCode]    = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  async function join() {
    if (!code.trim()) return;
    setLoading(true); setError("");
    // Try to find tournament by spectator_code (for backwards compat) or by id
    let data = null;
    // First try as a direct UUID
    if (code.trim().length === 36) {
      const { data: d } = await sb.from("team_tournaments").select("*").eq("id", code.trim()).single();
      data = d;
    }
    // Then try spectator_code
    if (!data) {
      const { data: d } = await sb.from("team_tournaments").select("*")
        .eq("spectator_code", code.trim().toUpperCase()).single();
      data = d;
    }
    setLoading(false);
    if (!data) { setError("Tournament not found. Check the code and try again."); return; }
    onSpectator(data);
  }

  return (
    <div style={{ fontFamily:"Georgia,serif", minHeight:"100vh", background:C.bg, color:C.text, display:"flex", flexDirection:"column" }}>

      {/* Header with back button */}
      <div style={{ padding:"50px 20px 20px", display:"flex", alignItems:"center", gap:16 }}>
        <button onClick={onBack} style={{ background:"rgba(123,180,80,0.15)", border:`1px solid ${C.green}`, color:C.green, fontSize:14, cursor:"pointer", padding:"8px 16px", borderRadius:20, fontWeight:700 }}>‹ Back</button>
        <div style={{ fontSize:18, fontWeight:800 }}>Join a Tournament</div>
      </div>

      <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", padding:"0 24px 60px" }}>
        <div style={{ width:"100%", maxWidth:380 }}>

          <div style={{ textAlign:"center", marginBottom:32 }}>
            <div style={{ fontSize:48, marginBottom:8 }}>👀</div>
            <div style={{ fontSize:20, fontWeight:800, marginBottom:8 }}>Watch a Tournament</div>
            <div style={{ fontSize:13, color:C.muted, lineHeight:1.6 }}>
              Enter the spectator code from your tournament director to watch the live leaderboard.
            </div>
          </div>

          <input
            value={code}
            onChange={e=>setCode(e.target.value)}
            placeholder="Enter spectator code..."
            autoCapitalize="characters"
            style={{ width:"100%", padding:"18px", background:C.surface, border:`2px solid ${C.border}`, borderRadius:14, color:C.text, fontSize:20, fontWeight:700, outline:"none", textAlign:"center", letterSpacing:2, boxSizing:"border-box", marginBottom:12 }}
          />
          {error && <div style={{ color:C.red, fontSize:13, marginBottom:12, textAlign:"center" }}>{error}</div>}

          <button onClick={join} disabled={!code.trim()||loading}
            style={{ width:"100%", padding:"18px", background:code.trim()&&!loading?C.green:"#1a2a1a", color:code.trim()&&!loading?"#0a1a0f":C.muted, border:"none", borderRadius:14, fontSize:17, fontWeight:800, cursor:code.trim()&&!loading?"pointer":"not-allowed", marginBottom:24 }}>
            {loading?"Finding tournament...":"View Leaderboard →"}
          </button>

          <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:12, padding:"16px" }}>
            <div style={{ fontSize:12, color:C.muted, lineHeight:1.6, textAlign:"center" }}>
              <div style={{ fontWeight:700, color:C.text, marginBottom:6 }}>Are you a team captain?</div>
              You should have received a text from your director with a direct link — just tap that link to enter scores. No code needed.
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
