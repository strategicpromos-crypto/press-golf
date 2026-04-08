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
  const [installPrompt,  setInstallPrompt]  = useState(null);
  const [showInstall,    setShowInstall]    = useState(false);
  const [isIOS,          setIsIOS]          = useState(false);
  const [isInstalled,    setIsInstalled]    = useState(false);

  useEffect(() => {
    if (code) resolve(code);
    else setStatus("prompt");

    // Detect if already installed as PWA
    const standalone = window.matchMedia("(display-mode: standalone)").matches
      || window.navigator.standalone === true;
    setIsInstalled(standalone);

    // Detect iOS
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    setIsIOS(ios);

    // Android: capture install prompt
    const handler = (e) => { e.preventDefault(); setInstallPrompt(e); if(!standalone) setShowInstall(true); };
    window.addEventListener("beforeinstallprompt", handler);
    if (ios && !standalone) setShowInstall(true);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, [code]);

  async function handleInstall() {
    if (installPrompt) {
      installPrompt.prompt();
      const result = await installPrompt.userChoice;
      if (result.outcome === "accepted") { setShowInstall(false); setInstallPrompt(null); }
    }
  }

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

    // Spectator & captain: look up by spectator_code (public code e.g. WEDS48)
    // Director: look up by director_code (secret e.g. WEDS48#7XQ)
    const isDirector = upper.includes("#");

    let data;
    if (isDirector) {
      const res = await sb.from("team_tournaments").select("*").eq("director_code", upper).single();
      data = res.data;
    } else {
      // public code — used by spectators AND captains
      const dirCode = isSpectator ? upper.slice(1) : captainMatch ? captainMatch[1] : upper;
      const res = await sb.from("team_tournaments").select("*").eq("spectator_code", dirCode).single();
      data = res.data;
    }

    if (!data) { setStatus("invalid"); setError("Code not found. Check the code and try again."); return; }
    setTourney(data);

    // Director: has # in code → full access, no PIN needed (code itself is the secret)
    if (isDirector) { onDirector(data); return; }

    // Spectator: starts with S prefix
    if (isSpectator) { onSpectator(data); return; }

    // Captain: WEDS48-T2 format → ask for PIN
    if (captainMatch) {
      const idx = parseInt(captainMatch[2], 10) - 1;
      const team = (data.teams || [])[idx];
      if (!team) { setStatus("invalid"); setError("Team not found. Check your code."); return; }
      setPendingCaptain({ tourney: data, idx });
      setStatus("pin");
      return;
    }

    // URL param team index (direct link) → ask for PIN
    if (teamIdx !== null && teamIdx !== undefined) {
      const idx = parseInt(teamIdx, 10);
      const team = (data.teams || [])[idx];
      if (!team) { setStatus("invalid"); setError("Team not found."); return; }
      setPendingCaptain({ tourney: data, idx });
      setStatus("pin");
      return;
    }

    // Bare public code (e.g. WEDS48) → spectator only, no team picker
    onSpectator(data);
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

  // Prompt for code entry
  return (
    <div style={{ fontFamily:"Georgia,serif", minHeight:"100vh", background:C.bg, color:C.text, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:24 }}>

      {/* Install banner at top */}
      {showInstall && !isInstalled && (
        <div style={{ position:"fixed", top:0, left:0, right:0, background:"linear-gradient(135deg,rgba(123,180,80,0.18),rgba(123,180,80,0.08))", borderBottom:`1px solid ${C.green}44`, padding:"14px 20px", zIndex:100 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:12, maxWidth:480, margin:"0 auto" }}>
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:700, fontSize:14, color:C.green, marginBottom:2 }}>⛳ Add Press to your home screen</div>
              {isIOS ? (
                <div style={{ fontSize:12, color:C.muted, lineHeight:1.5 }}>
                  Tap <span style={{ fontWeight:700, color:C.text }}>Share ↑</span> in Safari, then <span style={{ fontWeight:700, color:C.text }}>Add to Home Screen</span>
                </div>
              ) : (
                <div style={{ fontSize:12, color:C.muted }}>Free golf bet tracker — works like a native app</div>
              )}
            </div>
            {!isIOS && installPrompt ? (
              <button onClick={handleInstall} style={{ background:C.green, border:"none", color:"#0a1a0f", padding:"10px 16px", borderRadius:10, fontSize:13, fontWeight:800, cursor:"pointer", flexShrink:0 }}>
                Install
              </button>
            ) : (
              <button onClick={() => setShowInstall(false)} style={{ background:"transparent", border:"none", color:C.muted, fontSize:18, cursor:"pointer", padding:"0 4px" }}>✕</button>
            )}
          </div>
        </div>
      )}

      <div style={{ width:"100%", maxWidth:380, marginTop: showInstall && !isInstalled ? 80 : 0 }}>
        <div style={{ textAlign:"center", marginBottom:28 }}>
          <div style={{ fontSize:48, marginBottom:12 }}>⛳</div>
          <div style={{ fontSize:26, fontWeight:800, marginBottom:6 }}>Join Tournament</div>
          <div style={{ fontSize:14, color:C.muted }}>Enter the code your Tournament Director sent you</div>
        </div>

        <input
          value={codeInput}
          onChange={e => setCodeInput(e.target.value.toUpperCase().replace(/\s/g,""))}
          placeholder="e.g. WEDS48"
          maxLength={14}
          autoCapitalize="characters"
          style={{ width:"100%", padding:"18px", background:C.surface, border:`2px solid ${C.border}`, borderRadius:14, color:C.text, fontSize:26, fontWeight:800, outline:"none", textAlign:"center", letterSpacing:4, boxSizing:"border-box", marginBottom:12 }}
        />
        {error && <div style={{ color:C.red, fontSize:13, marginBottom:12, textAlign:"center" }}>{error}</div>}
        <button onClick={() => resolve(codeInput)} disabled={codeInput.length < 4} style={{
          width:"100%", padding:"18px", background:codeInput.length>=4?C.green:"#1a2a1a",
          color:codeInput.length>=4?"#0a1a0f":C.muted, border:"none", borderRadius:14,
          fontSize:17, fontWeight:800, cursor:codeInput.length>=4?"pointer":"not-allowed", marginBottom:24
        }}>
          Join →
        </button>

        {/* Code format guide */}
        <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:"16px" }}>
          <div style={{ fontSize:11, color:C.green, letterSpacing:1.5, textTransform:"uppercase", marginBottom:12, fontWeight:600 }}>What code do I use?</div>
          {[
            { code:"WEDS48", label:"Spectator", desc:"Watch the live leaderboard — read only", color:C.muted },
            { code:"WEDS48-T2", label:"Team Captain", desc:"Enter scores for your team (you'll need your PIN too)", color:C.green },
            { code:"WEDS48#7XQ", label:"Director", desc:"Full access — create and manage the tournament", color:C.gold },
          ].map((r,i)=>(
            <div key={i} style={{ display:"flex", alignItems:"center", gap:12, marginBottom:i<2?12:0 }}>
              <div style={{ fontFamily:"monospace", fontSize:13, fontWeight:800, color:r.color, width:110, flexShrink:0 }}>{r.code}</div>
              <div>
                <div style={{ fontSize:12, fontWeight:700, color:C.text }}>{r.label}</div>
                <div style={{ fontSize:11, color:C.muted }}>{r.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
