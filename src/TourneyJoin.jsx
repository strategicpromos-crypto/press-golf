import React, { useState, useEffect } from "react";
import { sb } from "./supabase.js";

const C = {
  bg:"#080f0a", surface:"#0e1a10", card:"#121e14",
  border:"rgba(123,180,80,0.18)", green:"#7bb450", gold:"#e8b84b",
  red:"#e05050", text:"#e8f0e9", muted:"#6b7f6d", dim:"#1e2f20",
};

const inp = {width:"100%",padding:"13px 14px",background:"#0a1500",border:"1px solid rgba(123,180,80,0.2)",borderRadius:10,color:"#e8f0e9",fontSize:15,outline:"none",boxSizing:"border-box"};

export default function TourneyJoin({ code, teamIdx, onDirector, onCaptain, onSpectator }) {
  const [status,         setStatus]         = useState("loading");
  const [pinInput,       setPinInput]       = useState("");
  const [pendingCaptain, setPendingCaptain] = useState(null);
  const [tourney,        setTourney]        = useState(null);
  const [codeInput,      setCodeInput]      = useState("");
  const [error,          setError]          = useState("");
  const [installPrompt,  setInstallPrompt]  = useState(null);
  const [showInstall,    setShowInstall]    = useState(false);
  const [isIOS,          setIsIOS]          = useState(false);
  const [isInstalled,    setIsInstalled]    = useState(false);

  // Account prompt state
  const [authMode,  setAuthMode]  = useState("prompt"); // prompt | login | signup
  const [authEmail, setAuthEmail] = useState("");
  const [authPass,  setAuthPass]  = useState("");
  const [authName,  setAuthName]  = useState("");
  const [authErr,   setAuthErr]   = useState("");
  const [authMsg,   setAuthMsg]   = useState("");
  const [authLoad,  setAuthLoad]  = useState(false);
  const [readyTourney, setReadyTourney] = useState(null); // tourney+idx to pass after auth/skip

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

    // Director: contains # → e.g. WEDS48-ABC#XQ7
    const isDirector = upper.includes("#");

    // Captain: ends in -T1, -T2 etc → e.g. WEDS48-ABC-T2
    const captainMatch = upper.match(/^(.+)-T(\d+)$/);

    // Spectator: public code, no # and no -T suffix → e.g. WEDS48-ABC
    const isSpectator = !isDirector && !captainMatch;

    // Derive the public code to look up spectator_code in DB
    let lookupCode;
    if (isDirector) {
      lookupCode = upper; // look up by director_code
    } else if (captainMatch) {
      lookupCode = captainMatch[1]; // base code before -T2
    } else {
      lookupCode = upper; // bare public code
    }

    // Director code: plain 6 chars
    const dirCode = isSpectator ? upper.slice(1)
      : captainMatch ? captainMatch[1]
      : upper;

    let data;
    if (isDirector) {
      const res = await sb.from("team_tournaments").select("*").eq("director_code", upper).single();
      data = res.data;
    } else {
      const res = await sb.from("team_tournaments").select("*").eq("spectator_code", lookupCode).single();
      data = res.data;
    }

    if (!data) { setStatus("invalid"); setError("Code not found. Check the code and try again."); return; }
    setTourney(data);

    if (isDirector) { onDirector(data); return; }

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

    // Bare public code → spectator
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
      <div style={{ fontFamily:"Georgia,serif", minHeight:"100vh", background:C.bg, color:C.text, display:"flex", flexDirection:"column" }}>

        {/* Install banner */}
        {showInstall && !isInstalled && (
          <div style={{ background:"linear-gradient(135deg,rgba(123,180,80,0.18),rgba(123,180,80,0.08))", borderBottom:`1px solid ${C.green}44`, padding:"14px 20px" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:12 }}>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:700, fontSize:13, color:C.green, marginBottom:2 }}>⛳ Add Press to your home screen</div>
                {isIOS
                  ? <div style={{ fontSize:11, color:C.muted }}>Tap <b style={{color:C.text}}>Share ↑</b> → <b style={{color:C.text}}>Add to Home Screen</b></div>
                  : <div style={{ fontSize:11, color:C.muted }}>Free golf bet tracker — works like a native app</div>
                }
              </div>
              {!isIOS && installPrompt
                ? <button onClick={handleInstall} style={{ background:C.green, border:"none", color:"#0a1a0f", padding:"8px 14px", borderRadius:8, fontSize:12, fontWeight:800, cursor:"pointer", flexShrink:0 }}>Install</button>
                : <button onClick={()=>setShowInstall(false)} style={{ background:"transparent", border:"none", color:C.muted, fontSize:18, cursor:"pointer" }}>✕</button>
              }
            </div>
          </div>
        )}

        <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
          <div style={{ width:"100%", maxWidth:340, textAlign:"center" }}>
            <div style={{ fontSize:40, marginBottom:12 }}>🏆</div>
            <div style={{ fontSize:22, fontWeight:800, marginBottom:4 }}>{pendingCaptain.tourney.name}</div>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:8, marginBottom:20 }}>
              <div style={{ width:12, height:12, borderRadius:"50%", background:team?.color }}/>
              <div style={{ fontSize:16, fontWeight:700, color:team?.color }}>{team?.name}</div>
            </div>
            <div style={{ fontSize:14, color:C.muted, marginBottom:28 }}>Enter your 4-digit captain PIN</div>
            <input
              autoFocus
              value={pinInput}
              onChange={e => setPinInput(e.target.value.replace(/\D/g,"").slice(0,4))}
              placeholder="· · · ·"
              maxLength={4}
              inputMode="numeric"
              style={{ width:"100%", padding:"20px", background:C.surface, border:`2px solid ${pinInput.length===4?C.green:C.border}`, borderRadius:14, color:C.text, fontSize:40, fontWeight:800, outline:"none", textAlign:"center", letterSpacing:16, boxSizing:"border-box", marginBottom:12, transition:"border-color 0.2s" }}
            />
            {error && <div style={{ color:C.red, fontSize:13, marginBottom:12 }}>{error}</div>}
            <button onClick={async () => {
              if (pinInput === team?.pin) {
                // Check if already logged in
                const { data: { session } } = await sb.auth.getSession();
                if (session) {
                  // Already logged in — go straight to scoring
                  onCaptain(pendingCaptain.tourney, pendingCaptain.idx);
                } else {
                  // Not logged in — show account prompt
                  setReadyTourney({ tourney: pendingCaptain.tourney, idx: pendingCaptain.idx });
                  setStatus("account");
                }
              } else {
                setError("Wrong PIN — check the text from your director.");
                setPinInput("");
              }
            }} disabled={pinInput.length !== 4} style={{
              width:"100%", padding:"18px", background:pinInput.length===4?C.green:"#1a2a1a",
              color:pinInput.length===4?"#0a1a0f":C.muted, border:"none", borderRadius:14,
              fontSize:17, fontWeight:800, cursor:pinInput.length===4?"pointer":"not-allowed", marginBottom:16
            }}>Enter Tournament →</button>
            <button onClick={() => { setStatus("prompt"); setPinInput(""); setError(""); }} style={{ background:"transparent", border:"none", color:C.muted, fontSize:13, cursor:"pointer" }}>
              Wrong tournament? Enter a different code
            </button>
          </div>
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

  // ── ACCOUNT PROMPT after successful PIN ───────────────────────────────────
  if (status === "account" && readyTourney) {
    const team = (readyTourney.tourney.teams || [])[readyTourney.idx];

    async function doSignup() {
      setAuthErr(""); setAuthLoad(true);
      if (!authName.trim()) { setAuthErr("Enter your name."); setAuthLoad(false); return; }
      if (authPass.length < 6) { setAuthErr("Password must be 6+ characters."); setAuthLoad(false); return; }
      const { error } = await sb.auth.signUp({ email: authEmail, password: authPass, options: { data: { display_name: authName.trim() } } });
      setAuthLoad(false);
      if (error) { setAuthErr(error.message); return; }
      setAuthMsg("✓ Account created! Check your email to confirm, then you'll be signed in automatically.");
      setTimeout(() => onCaptain(readyTourney.tourney, readyTourney.idx), 2000);
    }

    async function doLogin() {
      setAuthErr(""); setAuthLoad(true);
      const { data, error } = await sb.auth.signInWithPassword({ email: authEmail, password: authPass });
      setAuthLoad(false);
      if (error) { setAuthErr(error.message); return; }
      onCaptain(readyTourney.tourney, readyTourney.idx);
    }

    async function doReset() {
      if (!authEmail) { setAuthErr("Enter your email first."); return; }
      await sb.auth.resetPasswordForEmail(authEmail);
      setAuthMsg("Password reset email sent!");
    }

    return (
      <div style={{ fontFamily:"Georgia,serif", minHeight:"100vh", background:C.bg, color:C.text, display:"flex", flexDirection:"column" }}>

        {/* Install banner */}
        {showInstall && !isInstalled && (
          <div style={{ background:"linear-gradient(135deg,rgba(123,180,80,0.15),rgba(123,180,80,0.08))", borderBottom:`1px solid ${C.green}44`, padding:"12px 20px" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:12 }}>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:700, fontSize:13, color:C.green }}>⛳ Add Press to your home screen</div>
                {isIOS
                  ? <div style={{ fontSize:11, color:C.muted }}>Tap <b style={{color:C.text}}>Share ↑</b> → <b style={{color:C.text}}>Add to Home Screen</b></div>
                  : <div style={{ fontSize:11, color:C.muted }}>Works like a native app — free to install</div>}
              </div>
              {!isIOS && installPrompt
                ? <button onClick={handleInstall} style={{ background:C.green, border:"none", color:"#0a1a0f", padding:"8px 14px", borderRadius:8, fontSize:12, fontWeight:800, cursor:"pointer" }}>Install</button>
                : <button onClick={()=>setShowInstall(false)} style={{ background:"transparent", border:"none", color:C.muted, fontSize:18, cursor:"pointer" }}>✕</button>}
            </div>
          </div>
        )}

        <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
          <div style={{ width:"100%", maxWidth:380 }}>

            {/* Team welcome */}
            <div style={{ textAlign:"center", marginBottom:24 }}>
              <div style={{ fontSize:36, marginBottom:8 }}>⛳</div>
              <div style={{ fontWeight:800, fontSize:18, marginBottom:4 }}>PIN accepted!</div>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:8, marginBottom:4 }}>
                <div style={{ width:10, height:10, borderRadius:"50%", background:team?.color }}/>
                <div style={{ fontSize:15, fontWeight:700, color:team?.color }}>{team?.name}</div>
              </div>
              <div style={{ fontSize:13, color:C.muted }}>{readyTourney.tourney.name}</div>
            </div>

            {/* Account options */}
            {authMode === "prompt" && (
              <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:16, padding:"20px" }}>
                <div style={{ fontSize:15, fontWeight:700, marginBottom:6 }}>Save your progress</div>
                <div style={{ fontSize:13, color:C.muted, marginBottom:20, lineHeight:1.5 }}>
                  Create a free account to keep your match history, bets, and season stats. Takes 30 seconds.
                </div>
                <button onClick={()=>setAuthMode("signup")} style={{ width:"100%", padding:"14px", background:C.green, color:"#0a1a0f", border:"none", borderRadius:12, fontSize:15, fontWeight:800, cursor:"pointer", marginBottom:10 }}>
                  Create Free Account
                </button>
                <button onClick={()=>setAuthMode("login")} style={{ width:"100%", padding:"12px", background:"transparent", color:C.green, border:`1.5px solid ${C.green}44`, borderRadius:12, fontSize:14, fontWeight:700, cursor:"pointer", marginBottom:10 }}>
                  Sign In to Existing Account
                </button>
                <button onClick={()=>onCaptain(readyTourney.tourney, readyTourney.idx)} style={{ width:"100%", padding:"10px", background:"transparent", color:C.muted, border:"none", fontSize:13, cursor:"pointer" }}>
                  Skip for now →
                </button>
              </div>
            )}

            {(authMode === "signup" || authMode === "login") && (
              <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:16, padding:"20px" }}>
                <div style={{ display:"flex", gap:0, marginBottom:20, border:`1px solid ${C.border}`, borderRadius:10, overflow:"hidden" }}>
                  {["signup","login"].map(m=>(
                    <button key={m} onClick={()=>{setAuthMode(m);setAuthErr("");setAuthMsg("");}}
                      style={{ flex:1, padding:"11px", background:authMode===m?C.green:"transparent", color:authMode===m?"#0a1a0f":C.muted, border:"none", fontSize:13, fontWeight:700, cursor:"pointer" }}>
                      {m==="signup"?"Create Account":"Sign In"}
                    </button>
                  ))}
                </div>
                <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                  {authMode==="signup" && (
                    <input value={authName} onChange={e=>setAuthName(e.target.value)} placeholder="Your name" style={inp}/>
                  )}
                  <input type="email" value={authEmail} onChange={e=>setAuthEmail(e.target.value)} placeholder="Email address" autoCapitalize="none" style={inp}/>
                  <input type="password" value={authPass} onChange={e=>setAuthPass(e.target.value)} placeholder={authMode==="signup"?"Password (6+ chars)":"Password"} style={inp}/>
                  {authErr && <div style={{ background:"rgba(224,80,80,0.1)", border:"1px solid rgba(224,80,80,0.3)", borderRadius:8, padding:"10px 12px", fontSize:13, color:C.red }}>{authErr}</div>}
                  {authMsg && <div style={{ background:"rgba(123,180,80,0.1)", border:"1px solid rgba(123,180,80,0.3)", borderRadius:8, padding:"10px 12px", fontSize:13, color:C.green }}>{authMsg}</div>}
                  <button onClick={authMode==="signup"?doSignup:doLogin} disabled={authLoad}
                    style={{ width:"100%", padding:"14px", background:authLoad?"#1a2a1a":C.green, color:authLoad?C.muted:"#0a1a0f", border:"none", borderRadius:12, fontSize:15, fontWeight:800, cursor:authLoad?"wait":"pointer" }}>
                    {authLoad?"...":(authMode==="signup"?"Create Account →":"Sign In →")}
                  </button>
                  {authMode==="login" && <button onClick={doReset} style={{ background:"none", border:"none", color:C.muted, fontSize:12, cursor:"pointer", textAlign:"center" }}>Forgot password?</button>}
                  <button onClick={()=>setAuthMode("prompt")} style={{ background:"none", border:"none", color:C.muted, fontSize:12, cursor:"pointer", textAlign:"center" }}>← Back</button>
                </div>
              </div>
            )}

          </div>
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
            { code:"WEDS48-ABC", label:"Spectator", desc:"Watch the live leaderboard — read only", color:C.muted },
            { code:"WEDS48-ABC-T2", label:"Team Captain", desc:"Enter scores for your team (you'll need your PIN too)", color:C.green },
            { code:"WEDS48-ABC#XQ7", label:"Director", desc:"Full access — create and manage the tournament", color:C.gold },
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
