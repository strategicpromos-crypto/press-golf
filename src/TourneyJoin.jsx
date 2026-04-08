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
  const [status,         setStatus]         = useState("loading");
  const [pinInput,       setPinInput]       = useState("");
  const [pendingCaptain, setPendingCaptain] = useState(null); // {tourney, idx}
  const [tourney,        setTourney]        = useState(null);
  const [codeInput,      setCodeInput]      = useState("");
  const [error,          setError]          = useState("");

  useEffect(() => {
    if (code) resolve(code);
    else setStatus("prompt");
  }, [code]);

  async function resolve(raw) {
    setStatus("loading");
    setError("");
    const upper = raw.trim().toUpperCase();

    // Spectator: starts with S, rest matches a director code (no dash)
    const isSpectator = upper.startsWith("S") && !upper.includes("-") && upper.length >= 5;

    // Captain code: WEDS48-T3 format
    const captainMatch = upper.match(/^([A-Z]+\d+)-T(\d+)$/);

    // Director code: plain 6 chars
    const dirCode = isSpectator ? upper.slice(1)
      : captainMatch ? captainMatch[1]
      : upper;

    const { data } = await sb.from("team_tournaments")
      .select("*")
      .eq("director_code", dirCode)
      .single();

    if (!data) { setStatus("invalid"); setError("Code not found. Check the code and try again."); return; }
    setTourney(data);

    if (isSpectator) { onSpectator(data); return; }

    if (captainMatch) {
      const idx = parseInt(captainMatch[2], 10) - 1; // T1 = index 0
      const team = (data.teams || [])[idx];
      if (!team) { setStatus("invalid"); setError("Team not found. Check your code."); return; }
      // Ask for PIN before granting captain access
      setPendingCaptain({ tourney: data, idx });
      setStatus("pin");
      return;
    }

    // teamIdx provided via URL param
    if (teamIdx !== null && teamIdx !== undefined) {
      const idx = parseInt(teamIdx, 10);
      const team = (data.teams || [])[idx];
      if (!team) { setStatus("invalid"); setError("Team not found."); return; }
      onCaptain(data, idx);
      return;
    }

    // Bare director code → show team picker
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

  // PIN entry screen for captains
  if (status === "pin" && pendingCaptain) {
    const team = (pendingCaptain.tourney.teams || [])[pendingCaptain.idx];
    return (
      <div style={{ fontFamily:"Georgia,serif", minHeight:"100vh", background:C.bg, color:C.text, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
        <div style={{ width:"100%", maxWidth:340, textAlign:"center" }}>
          <div style={{ fontSize:40, marginBottom:12 }}>🔐</div>
          <div style={{ fontSize:22, fontWeight:800, marginBottom:4 }}>{team?.name}</div>
          <div style={{ fontSize:14, color:C.muted, marginBottom:28 }}>Enter your 4-digit captain PIN</div>
          <input
            value={pinInput}
            onChange={e => setPinInput(e.target.value.replace(/\D/g,"").slice(0,4))}
            placeholder="----"
            maxLength={4}
            inputMode="numeric"
            style={{ width:"100%", padding:"18px", background:C.surface, border:`2px solid ${C.border}`, borderRadius:14, color:C.text, fontSize:36, fontWeight:800, outline:"none", textAlign:"center", letterSpacing:12, boxSizing:"border-box", marginBottom:12 }}
          />
          {error && <div style={{ color:C.red, fontSize:13, marginBottom:12 }}>{error}</div>}
          <button onClick={() => {
            const correctPin = team?.pin;
            if (pinInput === correctPin) {
              onCaptain(pendingCaptain.tourney, pendingCaptain.idx);
            } else {
              setError("Wrong PIN. Check with your tournament director.");
              setPinInput("");
            }
          }} disabled={pinInput.length !== 4} style={{
            width:"100%", padding:"18px", background:pinInput.length===4?C.green:"#1a2a1a",
            color:pinInput.length===4?"#0a1a0f":C.muted, border:"none", borderRadius:14,
            fontSize:17, fontWeight:800, cursor:pinInput.length===4?"pointer":"not-allowed", marginBottom:12
          }}>Enter →</button>
          <button onClick={() => { setStatus("prompt"); setPinInput(""); setError(""); }} style={{ background:"transparent", border:"none", color:C.muted, fontSize:13, cursor:"pointer" }}>
            ← Try a different code
          </button>
        </div>
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
