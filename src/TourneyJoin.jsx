import React, { useState, useEffect } from "react";
import { sb } from "./supabase.js";

const C = {
  bg:"#080f0a", surface:"#0e1a10", card:"#121e14",
  border:"rgba(123,180,80,0.18)", green:"#7bb450", gold:"#e8b84b",
  red:"#e05050", text:"#e8f0e9", muted:"#6b7f6d", dim:"#1e2f20",
};

// Shown when someone opens press-golf.vercel.app?tourney=SUN247 or ?tourney=SUN247&team=3
// Resolves the code → routes to captain or spectator view
export default function TourneyJoin({ code, teamIdx, onDirector, onCaptain, onSpectator }) {
  const [status,   setStatus]   = useState("loading"); // loading | found | invalid | prompt
  const [tourney,  setTourney]  = useState(null);
  const [codeInput,setCodeInput]= useState("");
  const [error,    setError]    = useState("");

  useEffect(() => {
    if (code) resolve(code);
    else setStatus("prompt");
  }, [code]);

  async function resolve(raw) {
    setStatus("loading");
    setError("");
    const isSpectator = raw.startsWith("S") && raw.length === 7;
    const dirCode     = isSpectator ? raw.slice(1) : raw;

    // Look up by director_code
    const { data } = await sb.from("team_tournaments")
      .select("*")
      .eq("director_code", dirCode)
      .single();

    if (!data) { setStatus("invalid"); setError("Code not found. Check the code and try again."); return; }
    setTourney(data);

    if (isSpectator) {
      onSpectator(data);
      return;
    }

    // teamIdx provided in URL → captain mode
    if (teamIdx !== null && teamIdx !== undefined) {
      const idx = parseInt(teamIdx, 10);
      const team = (data.teams || [])[idx];
      if (!team) { setStatus("invalid"); setError("Team not found."); return; }
      onCaptain(data, idx);
      return;
    }

    // Just a bare director code → show the join screen
    setStatus("found");
  }

  if (status === "loading") {
    return (
      <div style={{ fontFamily:"Georgia,serif", minHeight:"100vh", background:C.bg, color:C.text, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:16 }}>
        <div style={{ width:40, height:40, border:`3px solid ${C.dim}`, borderTop:`3px solid ${C.green}`, borderRadius:"50%", animation:"spin 0.8s linear infinite" }}/>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <div style={{ color:C.muted, fontSize:14 }}>Finding tournament...</div>
      </div>
    );
  }

  if (status === "invalid") {
    return (
      <div style={{ fontFamily:"Georgia,serif", minHeight:"100vh", background:C.bg, color:C.text, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
        <div style={{ textAlign:"center", maxWidth:320 }}>
          <div style={{ fontSize:48, marginBottom:16 }}>⛳</div>
          <div style={{ fontSize:20, fontWeight:700, marginBottom:8, color:C.red }}>Invalid Code</div>
          <div style={{ fontSize:14, color:C.muted, marginBottom:24 }}>{error}</div>
          <button onClick={() => setStatus("prompt")} style={{ background:C.green, border:"none", color:"#0a1a0f", padding:"14px 32px", borderRadius:12, fontSize:15, fontWeight:700, cursor:"pointer" }}>Try Another Code</button>
        </div>
      </div>
    );
  }

  if (status === "found" && tourney) {
    const teams = tourney.teams || [];
    return (
      <div style={{ fontFamily:"Georgia,serif", minHeight:"100vh", background:C.bg, color:C.text, paddingBottom:40 }}>
        <div style={{ background:`linear-gradient(180deg,${C.card} 0%,transparent 100%)`, padding:"50px 24px 24px", textAlign:"center" }}>
          <div style={{ fontSize:48, marginBottom:8 }}>🏆</div>
          <div style={{ fontSize:24, fontWeight:800 }}>{tourney.name}</div>
          <div style={{ fontSize:13, color:C.muted, marginTop:4 }}>Select your role below</div>
        </div>

        <div style={{ padding:"0 20px" }}>

          {/* Spectator option */}
          <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:"16px", marginBottom:16 }}>
            <div style={{ fontWeight:700, fontSize:16, marginBottom:4 }}>👀 Watch the Leaderboard</div>
            <div style={{ fontSize:12, color:C.muted, marginBottom:12 }}>View live scores — read only</div>
            <button onClick={() => onSpectator(tourney)} style={{ width:"100%", padding:"14px", background:"transparent", color:C.gold, border:`1.5px solid ${C.gold}`, borderRadius:10, fontSize:14, fontWeight:700, cursor:"pointer" }}>
              View Leaderboard 📊
            </button>
          </div>

          {/* Team captain options */}
          <div style={{ fontSize:11, color:C.green, letterSpacing:1.5, textTransform:"uppercase", marginBottom:10, fontWeight:600 }}>I'm a Team Captain</div>
          {teams.map((team, i) => (
            <button key={i} onClick={() => onCaptain(tourney, i)} style={{
              width:"100%", padding:"14px 16px", background:C.card,
              border:`1px solid ${team.color}44`, borderRadius:12,
              marginBottom:8, cursor:"pointer", display:"flex", alignItems:"center", gap:12, textAlign:"left"
            }}>
              <div style={{ width:14, height:14, borderRadius:"50%", background:team.color, flexShrink:0 }}/>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:700, fontSize:15, color:C.text }}>{team.name}</div>
                <div style={{ fontSize:11, color:C.muted }}>{team.players?.filter(Boolean).join(", ") || "No players set"}</div>
              </div>
              <div style={{ color:C.muted, fontSize:18 }}>›</div>
            </button>
          ))}

          {/* Director option */}
          <div style={{ marginTop:16 }}>
            <button onClick={() => onDirector(tourney)} style={{ width:"100%", padding:"12px", background:"transparent", color:C.muted, border:`1px solid ${C.border}`, borderRadius:10, fontSize:13, fontWeight:600, cursor:"pointer" }}>
              I'm the Tournament Director 🎯
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Prompt for code entry
  return (
    <div style={{ fontFamily:"Georgia,serif", minHeight:"100vh", background:C.bg, color:C.text, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
      <div style={{ width:"100%", maxWidth:360, textAlign:"center" }}>
        <div style={{ fontSize:52, marginBottom:16 }}>⛳</div>
        <div style={{ fontSize:26, fontWeight:800, marginBottom:6 }}>Join Tournament</div>
        <div style={{ fontSize:14, color:C.muted, marginBottom:32 }}>Enter the code your Tournament Director sent you</div>
        <input
          value={codeInput}
          onChange={e => setCodeInput(e.target.value.toUpperCase())}
          placeholder="e.g. SUN247"
          maxLength={8}
          style={{ width:"100%", padding:"18px", background:C.surface, border:`2px solid ${C.border}`, borderRadius:14, color:C.text, fontSize:28, fontWeight:800, outline:"none", textAlign:"center", letterSpacing:6, boxSizing:"border-box", marginBottom:12 }}
        />
        {error && <div style={{ color:C.red, fontSize:13, marginBottom:12 }}>{error}</div>}
        <button onClick={() => resolve(codeInput)} disabled={codeInput.length < 6} style={{
          width:"100%", padding:"18px", background:codeInput.length>=6?C.green:"#1a2a1a",
          color:codeInput.length>=6?"#0a1a0f":C.muted, border:"none", borderRadius:14,
          fontSize:17, fontWeight:800, cursor:codeInput.length>=6?"pointer":"not-allowed"
        }}>
          Join →
        </button>
        <div style={{ marginTop:24, fontSize:12, color:C.muted }}>
          Add Press to your home screen for the best experience
        </div>
      </div>
    </div>
  );
}

