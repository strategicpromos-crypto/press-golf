import React, { useState, useEffect, useRef } from "react";
import { sb } from "./supabase.js";
import { COURSES, courseHasHdcp } from "./golf.js";
import { SkinsTab } from "./skins.jsx";
import { RulesTab } from "./RulesTab.jsx";
import { SideBetsTab } from "./sideBets.jsx";

// Dark (default) and Day (high-contrast, sunlight-readable) themes.
// The component picks one via `dayMode` and shadows it as `C`, so every
// existing style reference follows the active theme automatically.
const DARK = {
  bg:"#080f0a", surface:"#0e1a10", card:"#121e14",
  border:"rgba(123,180,80,0.18)", green:"#7bb450", gold:"#e8b84b",
  red:"#e05050", text:"#e8f0e9", muted:"#6b7f6d", dim:"#1e2f20",
};
const LIGHT = {
  bg:"#edf2ea", surface:"#ffffff", card:"#ffffff",
  border:"rgba(35,100,45,0.30)", green:"#1f7a2c", gold:"#96690f",
  red:"#c62828", text:"#0d1f10", muted:"#5b6f5d", dim:"#dde6db",
};

function safeInt(v,f=0){const n=parseInt(v,10);return isNaN(n)?f:n;}
function relLabel(d){if(d===null||d===undefined)return"--";if(d===0)return"E";return d>0?"+"+d:String(d);}
// relColor lives inside the component (needs the active theme)

function calcTeamScore(teamScores,teamSize,holeData,birdieBonus,ballsByPar,holePars){
  const getBalls=(par)=>{
    if(typeof ballsByPar==="object"&&ballsByPar!==null&&!Array.isArray(ballsByPar)){
      return parseInt(ballsByPar[par])||parseInt(ballsByPar[4])||2;
    }
    return parseInt(ballsByPar)||Math.min(teamSize,2);
  };
  const byHole={};
  let front=0,back=0,total=0;
  let frontPar=0,backPar=0;
  const hpar=(h)=>(holePars?.[h.hole]??h.par);
  for(const h of holeData){
    const balls=getBalls(hpar(h));
    const scores=[];
    for(let p=0;p<teamSize;p++){const s=teamScores?.[p]?.[h.hole];if(s!==undefined&&s!==null)scores.push(safeInt(s));}
    if(scores.length===0){byHole[h.hole]=null;continue;}
    scores.sort((a,b)=>a-b);
    const bestN=scores.slice(0,balls);
    let raw=bestN.reduce((s,v)=>s+v,0);
    let bonusApplied=0;
    if(birdieBonus){
      const extraBirdies=scores.slice(balls).filter(s=>s<=hpar(h)-1);
      if(extraBirdies.length>0){bonusApplied=extraBirdies.reduce((sum,s)=>sum+(hpar(h)-s),0);raw-=bonusApplied;}
    }
    const diff=raw-(hpar(h)*balls);
    byHole[h.hole]={raw,diff,bonusApplied,scored:true,balls};
    if(h.side==="front"){front+=raw;frontPar+=hpar(h)*balls;}
    else{back+=raw;backPar+=hpar(h)*balls;}
    total+=raw;
  }
  const totalPar=frontPar+backPar;
  return{byHole,front,frontDiff:front-frontPar,back,backDiff:back-backPar,total,totalDiff:total-totalPar};
}

export default function TourneyCaptain({ tourney: initialTourney, teamIdx, onBack }) {
  const [tourney,      setTourney]      = useState(initialTourney);
  const [currentHole,  setCurrentHole]  = useState(initialTourney.current_hole||1);
  const [tab,          setTab]          = useState("scores");
  const [saveStatus,   setSaveStatus]   = useState("");
  const [showSummary,       setShowSummary]       = useState(false);
  const [showCaptainSettings, setShowCaptainSettings] = useState(false);
  const [bTab,         setBTab]         = useState("standings");
  // ── Captain side bets — captains run their own bets (Oct 25, 2026) ──────
  // This is the one exception to "captains change nothing": bets only.
  // Setup / hole pars / rules stay director-only.
  const [showBetSetup, setShowBetSetup] = useState(false);
  const [betA, setBetA] = useState("");
  const [betB, setBetB] = useState("");
  const [betType, setBetType] = useState("skins");
  const [betAmount, setBetAmount] = useState(5);
  const [betStrokesTo, setBetStrokesTo] = useState("none"); // "none" | "A" | "B"
  const [betStrokesCount, setBetStrokesCount] = useState(2);
  const [betPressDown, setBetPressDown] = useState(2);
  const [betCarryOver, setBetCarryOver] = useState(true); // skins only: tied holes roll forward (default)
  const [betSaving, setBetSaving] = useState(false);
  const [ctpPopup,     setCtpPopup]     = useState(false); // simple open/close
  const [ctpName,      setCtpName]      = useState("");
  const [ctpDist,      setCtpDist]      = useState("");
  const [ctpPrompt,    setCtpPrompt]    = useState(false); // "Did you get a closest to the pin?" gate before Next Hole
  const [ctpAdvanceAfterSave, setCtpAdvanceAfterSave] = useState(false); // prompt flow: advance once the CTP save lands
  const ctpAnsweredRef = useRef(new Set()); // holes answered (No, or Yes+saved) this session — don't re-prompt
  const saveTimer      = useRef(null);
  const subRef         = useRef(null);
  const pollTimer      = useRef(null);
  const pendingTeams   = useRef(null);
  const lastConfirmed  = useRef(null); // timestamp of last successful DB write
  const [connStatus,   setConnStatus]   = useState("connecting"); // connecting|online|offline|syncing
  const isWriter       = useRef(false);
  const [readOnlyMode, setReadOnlyMode] = useState(false);
  const [claiming,     setClaiming]     = useState(false); // reclaim in progress

  // ── Day mode (sunlight-readable theme) — persisted per device ──────────
  const [dayMode, setDayMode] = useState(()=>{
    try{ return localStorage.getItem("press_daymode")==="1"; }catch(e){ return false; }
  });
  const C = dayMode ? LIGHT : DARK; // shadows module themes — all styles follow
  function relColor(d){ if(d===null||d===undefined) return C.muted; if(d<0) return C.green; if(d>0) return C.red; return C.muted; }
  function toggleDayMode(){
    const v=!dayMode; setDayMode(v);
    try{ localStorage.setItem("press_daymode", v?"1":"0"); }catch(e){}
  }

  // localStorage key — per tourney per team
  const localKey = `press_writer_${initialTourney.id}_${teamIdx}`;
  // Unsaved scores survive a dead phone / killed tab — restored on next open
  const pendingKey = `press_pending_${initialTourney.id}_${teamIdx}`;

  const ctpEnabled  = tourney.ctp_enabled===true;
  const ctpHoles    = tourney.ctp_holes||[];
  const ctpLeaders  = tourney.ctp_leaders||{};

  const team      = (tourney.teams || [])[teamIdx];
  const course    = COURSES[tourney.course_id || "south-toledo"];
  const holeData  = course?.holes[currentHole - 1];
  const isLastHole= currentHole === (course?.holes?.length || 18);
  const birdieBonus = tourney.birdie_bonus !== false;

  // ── Real-time subscription with auto-reconnect + polling fallback ──────────
  function mergeTourneyUpdate(incoming, prev){
    const myLocalScores = (prev.teams||[])[teamIdx]?.scores;
    const mergedTeams = (incoming.teams||[]).map((t,i)=>
      i===teamIdx&&myLocalScores ? {...t,scores:myLocalScores} : t
    );
    return {...incoming, teams:mergedTeams};
  }

  const offlineTimer = useRef(null);
  // Don't flash the red "not uploading" banner for transient blips (spotty
  // course WiFi/cell) — only show it if the connection is still down after a
  // short grace period. Genuine outages still surface; hiccups stay invisible.
  function markOfflineSoon(){
    if(offlineTimer.current) clearTimeout(offlineTimer.current);
    offlineTimer.current=setTimeout(()=>{ offlineTimer.current=null; setConnStatus("offline"); },2500);
  }
  function clearOfflineTimer(){
    if(offlineTimer.current){ clearTimeout(offlineTimer.current); offlineTimer.current=null; }
  }

  function startSubscription(){
    if(subRef.current) sb.removeChannel(subRef.current);
    const ch = sb
      .channel("captain_"+tourney.id+"_"+teamIdx+"_"+Date.now())
      .on("postgres_changes",{event:"UPDATE",schema:"public",table:"team_tournaments",filter:"id=eq."+tourney.id},
        payload=>{ if(payload.new) setTourney(prev=>mergeTourneyUpdate(payload.new,prev)); })
      .subscribe(status=>{
        if(subRef.current!==ch) return; // stale channel (already replaced) — ignore its callbacks
        if(status==="SUBSCRIBED"){
          clearOfflineTimer();
          // WebSocket up — but only mark online once any pending scores are flushed
          if(pendingTeams.current){
            setConnStatus("syncing"); // amber — reconnected but scores not confirmed yet
            flushSave(pendingTeams.current); // flushSave sets "online" on success
          } else {
            setConnStatus("online");
          }
        } else if(status==="CLOSED"||status==="CHANNEL_ERROR"||status==="TIMED_OUT"){
          markOfflineSoon();
          // Reconnect — use longer delay if we have pending scores to avoid hammering
          const delay = pendingTeams.current ? 2000 : 3000;
          setTimeout(()=>{ if(subRef.current===ch) startSubscription(); }, delay);
        }
      });
    subRef.current = ch;
  }

  function startPolling(){
    if(pollTimer.current) clearInterval(pollTimer.current);
    pollTimer.current = setInterval(async()=>{
      try{
        const{data}=await sb.from("team_tournaments").select("*").eq("id",tourney.id).single();
        if(data) setTourney(prev=>mergeTourneyUpdate(data,prev));
        clearOfflineTimer();
        setConnStatus("online");
      }catch(e){ markOfflineSoon(); }
    }, 30000);
  }

  // ── Write a token into teams[teamIdx].writer_token in Supabase ─────────────
  async function claimWriterToken(token){
    const{data:current}=await sb.from("team_tournaments").select("teams").eq("id",tourney.id).single();
    if(!current) return false;
    const updatedTeams=(current.teams||[]).map((t,i)=>
      i===teamIdx ? {...t, writer_token: token} : t
    );
    const{error}=await sb.from("team_tournaments").update({
      teams: updatedTeams,
      updated_at: new Date().toISOString()
    }).eq("id",tourney.id);
    return !error;
  }

  // ── Reclaim — captain refreshed or PWA reset, localStorage gone ────────────
  async function reclaimWriter(){
    setClaiming(true);
    const newToken = Date.now().toString(36)+"_"+Math.random().toString(36).slice(2,6);
    const ok = await claimWriterToken(newToken);
    if(ok){
      localStorage.setItem(localKey, newToken);
      isWriter.current = true;
      setReadOnlyMode(false);
    }
    setClaiming(false);
  }

  // ── Lazy writer claim — first edit claims the slot, not page load ──────────
  // MUST live at component level: scheduleSync() calls it, and a copy defined
  // inside the useEffect below is out of scheduleSync's scope — that scoping
  // bug silently killed every captain save (fixed Oct 23, 2026).
  async function ensureWriter(){
    if(isWriter.current) return true;
    if(readOnlyMode) return false;
    try{
      const{data}=await sb.from("team_tournaments").select("teams").eq("id",tourney.id).single();
      const sbToken=(data?.teams||[])[teamIdx]?.writer_token||null;
      if(sbToken){ setReadOnlyMode(true); return false; } // someone claimed it first
      const newToken=Date.now().toString(36)+"_"+Math.random().toString(36).slice(2,6);
      const ok=await claimWriterToken(newToken);
      if(ok){ localStorage.setItem(localKey,newToken); isWriter.current=true; return true; }
    }catch(e){}
    return false;
  }

  useEffect(()=>{
    async function initWriter(){
      // 1. What token does this device have in localStorage?
      const myLocalToken = localStorage.getItem(localKey);

      // 2. What token does Supabase have for this team slot?
      const{data}=await sb.from("team_tournaments").select("teams").eq("id",tourney.id).single();
      const sbToken = (data?.teams||[])[teamIdx]?.writer_token || null;

      if(myLocalToken && myLocalToken === sbToken){
        // This device's token matches Supabase — it's the real captain (refresh case)
        isWriter.current = true;
      } else if(sbToken){
        // Claimed by a different device — read-only until reclaimed
        isWriter.current = false;
        setReadOnlyMode(true);
      }
      // Else: nobody has claimed yet. We deliberately do NOT claim on page
      // load — the claim happens on the first score edit instead (see
      // ensureWriter). This stops the director (or anyone previewing the link)
      // from accidentally locking the real captain out of scoring.
    }

    initWriter();

    // Restore unsaved scores from a previous session (phone died, tab killed).
    // The SUBSCRIBED handler flushes pendingTeams automatically once live.
    try{
      const raw = localStorage.getItem(pendingKey);
      if(raw){
        const saved = JSON.parse(raw);
        if(Array.isArray(saved) && saved[teamIdx]){
          pendingTeams.current = saved;
          setTourney(prev=>({...prev, teams: saved}));
        }
      }
    }catch(e){}

    startSubscription();
    startPolling();

    // ── iOS visibility reconnect ───────────────────────────────────────────
    function handleVisibility(){
      if(document.visibilityState === "visible"){
        clearOfflineTimer();
        setConnStatus("connecting");
        startSubscription();
        if(pendingTeams.current) flushSave(pendingTeams.current);
      }
    }
    document.addEventListener("visibilitychange", handleVisibility);

    return()=>{
      if(subRef.current) sb.removeChannel(subRef.current);
      if(pollTimer.current) clearInterval(pollTimer.current);
      if(offlineTimer.current) clearTimeout(offlineTimer.current);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  },[tourney.id, teamIdx]);

  async function flushSave(teamsToSave){
    if(!isWriter.current) return;  // read-only — never write
    try{
      const{data:current,error:readErr}=await sb.from("team_tournaments").select("teams").eq("id",tourney.id).single();
      if(readErr) throw readErr;
      const dbTeams=current?.teams||teamsToSave;
      // Preserve the slot's writer_token — the captain's local team copy may
      // predate the claim, and saving scores must not erase the lock.
      const safeTeams=dbTeams.map((t,i)=>i===teamIdx?{...teamsToSave[i],writer_token:(t.writer_token||teamsToSave[i]?.writer_token||undefined)}:t);
      const{error}=await sb.from("team_tournaments").update({teams:safeTeams,updated_at:new Date().toISOString()}).eq("id",tourney.id);
      if(error) throw error; // never report "saved" when the write failed (e.g. RLS)
      pendingTeams.current=null;
      try{ localStorage.removeItem(pendingKey); }catch(e){} // confirmed in DB — drop the backup
      lastConfirmed.current=Date.now();
      // Only NOW mark as online — scores are confirmed in the database
      clearOfflineTimer();
      setConnStatus("online");
      setSaveStatus("saved");
      setTimeout(()=>setSaveStatus(""),2000);
    }catch(e){
      // Write failed — stay offline, will retry on next reconnect
      markOfflineSoon();
      setTimeout(()=>startSubscription(), 3000);
    }
  }

  function scheduleSync(updatedTeams) {
    pendingTeams.current = updatedTeams;  // always keep latest for flush
    try{ localStorage.setItem(pendingKey, JSON.stringify(updatedTeams)); }catch(e){} // survive dead phone
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveStatus("saving");
    // Claim the writer slot on first edit (not on page load — see initWriter)
    ensureWriter().then(ok=>{
      if(!ok){ setSaveStatus(""); return; } // read-only — the VIEW ONLY banner explains
      saveTimer.current = setTimeout(()=>flushSave(updatedTeams), 800);
    });
  }

  function setPlayerScore(pi, hole, val) {
    const updatedTeams = (tourney.teams || []).map((t, i) => {
      if (i !== teamIdx) return t;
      return { ...t, scores: { ...t.scores, [pi]: { ...(t.scores[pi] || {}), [hole]: val } } };
    });
    setTourney(prev => ({ ...prev, teams: updatedTeams }));
    scheduleSync(updatedTeams);
  }

  function updatePlayerName(pi, name) {
    const updatedTeams = (tourney.teams || []).map((t, i) => {
      if (i !== teamIdx) return t;
      const players = [...(t.players || [])];
      players[pi] = name;
      return { ...t, players };
    });
    setTourney(prev => ({ ...prev, teams: updatedTeams }));
    scheduleSync(updatedTeams);
  }

  function updateTeamSize(size) {
    const updatedTeams = (tourney.teams || []).map((t, i) => {
      if (i !== teamIdx) return t;
      const players = Array.from({ length: size }, (_, j) => (t.players||[])[j] || "");
      return { ...t, size, players };
    });
    setTourney(prev => ({ ...prev, teams: updatedTeams }));
    scheduleSync(updatedTeams);
  }

  function getPlayerScore(pi, hole) {
    const v = team?.scores?.[pi]?.[hole];
    return (v === undefined || v === null) ? null : safeInt(v);
  }

  // ── Captain side bets: write ONLY the side_bets column ──────────────────
  // Never teams/scores, so a bet save can't clobber scoring — and it does
  // NOT need the writer lock, so a captain can set up a bet before entering
  // a score. Read-current-first so a bet saved a moment earlier by the
  // director or another captain isn't overwritten by a stale local list.
  const captainAllPlayers=(tourney.teams||[]).flatMap((t,ti)=>(t.players||[]).map((p,pi)=>({team:ti,pi,name:(p||"").trim(),teamName:t.name||("Team "+(ti+1))})).filter(x=>x.name!==""));
  const captainBetAName=captainAllPlayers.find(p=>p.team+":"+p.pi===betA)?.name;
  const captainBetBName=captainAllPlayers.find(p=>p.team+":"+p.pi===betB)?.name;

  async function saveCaptainBet(){
    if(!betA||!betB){ window.alert("Pick two players first."); return; }
    if(betA===betB){ window.alert("Pick two different players."); return; }
    const parseRef=(v)=>{ const p=v.split(":"); return {team:parseInt(p[0],10),pi:parseInt(p[1],10)}; };
    const count=betStrokesTo==="none"?0:betStrokesCount;
    const strokes=betStrokesTo==="B"?count:betStrokesTo==="A"?-count:0;
    const cid=tourney.course_id||"south-toledo";
    if(strokes!==0&&!courseHasHdcp(cid)){ window.alert("This course has no handicap data, so strokes can't apply here. Ask the director to add handicaps, or set strokes to No strokes."); return; }
    const bet={ id:"bet_"+Date.now()+"_"+Math.floor(Math.random()*1000),
      a:parseRef(betA), b:parseRef(betB), betType, betAmount,
      strokes, pressDown:betType==="nassau-press"?betPressDown:2, carryOver:betCarryOver };
    setBetSaving(true);
    try{
      const{data,error:readErr}=await sb.from("team_tournaments").select("side_bets").eq("id",tourney.id).single();
      if(readErr) throw readErr;
      const next=[...(data?.side_bets||[]), bet];
      const{error}=await sb.from("team_tournaments").update({side_bets:next,updated_at:new Date().toISOString()}).eq("id",tourney.id);
      if(error) throw error;
      setTourney(prev=>({...prev, side_bets:next}));
      setBetA(""); setBetB(""); setShowBetSetup(false);
    }catch(e){
      window.alert("Couldn't save that bet — check your connection and try again. Scores are not affected.");
    }
    setBetSaving(false);
  }

  async function deleteCaptainBet(id){
    try{
      const{data,error:readErr}=await sb.from("team_tournaments").select("side_bets").eq("id",tourney.id).single();
      if(readErr) throw readErr;
      const next=(data?.side_bets||[]).filter(b=>b.id!==id);
      const{error}=await sb.from("team_tournaments").update({side_bets:next,updated_at:new Date().toISOString()}).eq("id",tourney.id);
      if(error) throw error;
      setTourney(prev=>({...prev, side_bets:next}));
    }catch(e){
      window.alert("Couldn't remove that bet — check your connection and try again.");
    }
  }

  if (!team || !holeData) return <div style={{ background:C.bg, minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", color:C.muted }}>Loading...</div>;

  const sc = calcTeamScore(team.scores || {}, team.size || 4, course.holes, birdieBonus, tourney.ball_count_by_par||(tourney.count_balls?{3:tourney.count_balls,4:tourney.count_balls,5:tourney.count_balls}:{3:2,4:2,5:2}), tourney.hole_pars||{});
  const effPar = (tourney.hole_pars||{})[currentHole] ?? holeData.par;  // effective par this hole
  const thisHoleScores = Array.from({length:team.size||4},(_,j)=>({j,s:getPlayerScore(j,currentHole)})).filter(x=>x.s!==null).sort((a,b)=>a.s-b.s);
  const best2Set = new Set(thisHoleScores.slice(0,2).map(x=>x.j));
  const extraBirdies = thisHoleScores.slice(2).filter(x=>x.s<=effPar-1);
  const bonusThisHole = birdieBonus&&extraBirdies.length>0?extraBirdies.reduce((sum,x)=>sum+(effPar-x.s),0):0;

  // ── ROSTER TAB ─────────────────────────────────────────────────────────────
  if (tab === "roster") {
    return (
      <div style={{ fontFamily:"Georgia,serif", minHeight:"100vh", background:C.bg, color:C.text, paddingBottom:60 }}>
        <div style={{ background:`linear-gradient(180deg,${C.card} 0%,transparent 100%)`, padding:"44px 16px 16px" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
            <button onClick={()=>setTab("scores")} style={{ background:"rgba(123,180,80,0.15)", border:`1px solid ${C.green}`, color:C.green, fontSize:13, cursor:"pointer", padding:"6px 14px", borderRadius:16, fontWeight:700 }}>‹ Scores</button>
            <div style={{ fontSize:13, color:saveStatus==="saving"?C.gold:C.green, fontWeight:600 }}>{saveStatus==="saving"?"Saving...":saveStatus==="saved"?"Saved":""}</div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:12 }}>
            <div style={{ width:12, height:12, borderRadius:"50%", background:team.color }}/>
            <div style={{ fontWeight:800, fontSize:20 }}>{team.name}</div>
          </div>
          <div style={{ fontSize:13, color:C.muted, marginTop:4 }}>Edit your roster — updates the leaderboard instantly</div>
        </div>
        <div style={{ padding:"0 16px" }}>
          <div style={{ fontSize:11, color:C.green, letterSpacing:1.5, textTransform:"uppercase", marginBottom:10, fontWeight:600 }}>Team Name</div>
          <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:12, padding:"12px 14px", marginBottom:20 }}>
            <input
              value={team.name || ""}
              onChange={e => {
                const updatedTeams = (tourney.teams || []).map((t, i) =>
                  i === teamIdx ? { ...t, name: e.target.value } : t
                );
                setTourney(prev => ({ ...prev, teams: updatedTeams }));
                scheduleSync(updatedTeams);
              }}
              placeholder="e.g. The Hackers, Dream Team..."
              style={{ width:"100%", padding:"12px", background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, color:C.text, fontSize:18, fontWeight:800, outline:"none", boxSizing:"border-box" }}
            />
            <div style={{ fontSize:11, color:C.muted, marginTop:6 }}>Shows on the leaderboard for everyone to see</div>
          </div>

          <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:12, padding:"14px 16px", marginBottom:14 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div style={{ fontSize:13, color:C.muted }}>Players on team</div>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <button onClick={()=>updateTeamSize(Math.max(1,(team.size||1)-1))} style={{ width:34,height:34,borderRadius:"50%",background:C.dim,border:`1px solid ${C.border}`,color:C.text,fontSize:20,fontWeight:700,cursor:"pointer" }}>−</button>
                <div style={{ width:28,textAlign:"center",fontSize:18,fontWeight:800,color:C.text }}>{team.size||4}</div>
                <button onClick={()=>updateTeamSize(Math.min(6,(team.size||1)+1))} style={{ width:34,height:34,borderRadius:"50%",background:C.dim,border:`1px solid ${C.border}`,color:C.text,fontSize:20,fontWeight:700,cursor:"pointer" }}>+</button>
              </div>
            </div>
          </div>
          <div style={{ fontSize:11, color:C.green, letterSpacing:1.5, textTransform:"uppercase", marginBottom:10, fontWeight:600 }}>Player Names</div>
          {Array.from({ length: team.size || 4 }, (_, j) => (
            <div key={j} style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:12, padding:"12px 14px", marginBottom:10 }}>
              <div style={{ fontSize:11, color:C.muted, marginBottom:6 }}>Player {j + 1}</div>
              <input
                value={team.players?.[j] || ""}
                onChange={e => updatePlayerName(j, e.target.value)}
                placeholder={`Player ${j + 1} name`}
                style={{ width:"100%", padding:"12px", background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, color:C.text, fontSize:16, fontWeight:600, outline:"none", boxSizing:"border-box" }}
              />
            </div>
          ))}
          <div style={{ height:20 }}/>
          <button onClick={()=>setTab("scores")} style={{ width:"100%", padding:"16px", background:C.green, color:"#0a1a0f", border:"none", borderRadius:12, fontSize:15, fontWeight:800, cursor:"pointer" }}>
            ✓ Done — Go to Scoring
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily:"Georgia,serif", minHeight:"100vh", background:C.bg, color:C.text, paddingBottom:120 }}>

      {/* Header */}
      <div style={{ background:`linear-gradient(180deg,${C.card} 0%,transparent 100%)`, padding:"44px 16px 12px" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
          <button onClick={onBack}
            style={{ background:"rgba(123,180,80,0.15)", border:`1px solid ${C.green}`, color:C.green, fontSize:13, cursor:"pointer", padding:"6px 14px", borderRadius:16, fontWeight:700 }}>‹ Back</button>
          <div style={{ textAlign:"center" }}>
            <div style={{ fontSize:11, color:C.muted, letterSpacing:2, textTransform:"uppercase" }}>Hole</div>
            <div style={{ fontSize:48, fontWeight:800, lineHeight:1 }}>{currentHole}</div>
            <div style={{ fontSize:12, color:C.green, fontWeight:600 }}>Par {effPar} · Hdcp {holeData.hdcp}</div>
            {effPar!==holeData.par&&(
              <div style={{fontSize:12,color:C.gold,fontWeight:700,marginTop:4}}>⛳ Par {effPar} today (card: Par {holeData.par})</div>
            )}
            {tourney.hole_notes?.[currentHole]&&(
              <div style={{fontSize:12,background:"rgba(123,180,80,0.12)",border:"1px solid rgba(123,180,80,0.4)",borderRadius:10,padding:"6px 10px",marginTop:6}}>📋 {tourney.hole_notes[currentHole]}</div>
            )}
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <button onClick={toggleDayMode} title={dayMode?"Switch to dark mode":"Day mode — easier to read in sunlight"}
              style={{ background:dayMode?"rgba(35,100,45,0.10)":"rgba(232,184,75,0.10)", border:`1px solid ${dayMode?C.green:C.gold}`, color:dayMode?C.green:C.gold, fontSize:18, cursor:"pointer", padding:"10px 14px", borderRadius:12, fontWeight:700 }}>{dayMode?"🌙":"☀️"}</button>
            <button onClick={()=>setShowCaptainSettings(true)}
              style={{ background:"rgba(123,180,80,0.15)", border:`1px solid ${C.green}`, color:C.green, fontSize:15, cursor:"pointer", padding:"12px 20px", borderRadius:12, fontWeight:700 }}>⚙️ Settings</button>
          </div>
        </div>
        {/* Progress bar */}
        <div style={{ display:"flex", gap:2, marginBottom:8 }}>
          {course.holes.map(h=>(
            <div key={h.hole} style={{ flex:1, height:4, borderRadius:2, background:h.hole<currentHole?C.green:h.hole===currentHole?C.gold:C.dim }}/>
          ))}
        </div>
        {/* ── Fix 5: Connection + Score Status Banner ────────────────── */}
        {(()=>{
          // Calculate team rank for display
          const allScores=(tourney.teams||[]).map((t,i)=>{
            const bbp=tourney.ball_count_by_par||{3:2,4:2,5:2};
            let tot=0,played=0;
            for(const h of course.holes){
              const eff=(tourney.hole_pars||{})[h.hole]??h.par;
              const balls=parseInt(bbp[eff])||2;
              const scs=[];
              for(let p=0;p<(t.size||1);p++){const s=t.scores?.[p]?.[h.hole];if(s!=null)scs.push(safeInt(s));}
              if(scs.length){scs.sort((a,b)=>a-b);const raw=scs.slice(0,balls).reduce((s,v)=>s+v,0);tot+=raw-(eff*balls);played++;}
            }
            return{i,tot,played};
          }).filter(x=>x.played>0).sort((a,b)=>a.tot-b.tot);
          const myRankObj=allScores.find(x=>x.i===teamIdx);
          const myRank=myRankObj?allScores.indexOf(myRankObj)+1:null;
          const totalTeams=(tourney.teams||[]).length;

          // Read-only mode: different device, or captain refreshed and lost localStorage
          if(readOnlyMode){
            return(
              <div style={{background:"rgba(232,184,75,0.1)",border:"2px solid rgba(232,184,75,0.5)",borderRadius:10,padding:"14px 16px"}}>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
                  <div style={{width:12,height:12,borderRadius:"50%",background:C.gold,flexShrink:0}}/>
                  <div style={{fontWeight:800,fontSize:14,color:C.gold}}>VIEW ONLY</div>
                </div>
                <div style={{fontSize:12,color:"rgba(232,184,75,0.85)",lineHeight:1.6,marginBottom:12}}>
                  This captain link is active on another device. Scores sync here live but can only be entered on the original device.
                </div>
                <div style={{fontSize:11,color:C.muted,marginBottom:12}}>
                  Are you the captain? If you refreshed or switched devices, tap below to reclaim scoring access.
                </div>
                <button onClick={reclaimWriter} disabled={claiming}
                  style={{width:"100%",padding:"12px",background:claiming?"#1a2a1a":C.gold,color:claiming?C.muted:"#0a1a0f",border:"none",borderRadius:10,fontSize:14,fontWeight:800,cursor:claiming?"not-allowed":"pointer",opacity:claiming?0.6:1}}>
                  {claiming?"Reclaiming...":"Reclaim Scoring Access"}
                </button>
              </div>
            );
          }

          // OFFLINE — persistent, readable, tap to reconnect
          if(connStatus==="offline"){
            return(
              <div onClick={()=>{setConnStatus("connecting");startSubscription();}}
                style={{background:"rgba(224,80,80,0.15)",border:"2px solid rgba(224,80,80,0.7)",borderRadius:10,padding:"12px 16px",cursor:"pointer"}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <div style={{width:12,height:12,borderRadius:"50%",background:C.red,flexShrink:0}}/>
                    <div>
                      <div style={{fontWeight:800,fontSize:14,color:C.red}}>Scores not uploading</div>
                      <div style={{fontSize:11,color:"rgba(224,80,80,0.8)",marginTop:2}}>Saved on your phone. Tap to reconnect.</div>
                    </div>
                  </div>
                  <div style={{background:C.red,color:"#fff",fontSize:12,fontWeight:800,padding:"6px 12px",borderRadius:8,flexShrink:0}}>Reconnect</div>
                </div>
              </div>
            );
          }
          // SYNCING — reconnected but pending scores not yet confirmed in DB
          if(connStatus==="syncing"){
            return(
              <div style={{background:"rgba(232,184,75,0.12)",border:"2px solid rgba(232,184,75,0.6)",borderRadius:10,padding:"10px 14px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <div style={{width:12,height:12,borderRadius:"50%",background:C.gold,flexShrink:0}}/>
                  <div>
                    <div style={{fontSize:13,fontWeight:800,color:C.gold}}>Uploading scores...</div>
                    <div style={{fontSize:11,color:"rgba(232,184,75,0.7)",marginTop:2}}>Do not close the app</div>
                  </div>
                </div>
                <div style={{fontSize:11,color:C.gold,opacity:0.7}}>Please wait</div>
              </div>
            );
          }
          // CONNECTING — initial load or manual reconnect
          if(connStatus==="connecting"){
            return(
              <div style={{background:"rgba(232,184,75,0.08)",border:"1px solid rgba(232,184,75,0.3)",borderRadius:10,padding:"10px 14px",display:"flex",alignItems:"center",gap:10}}>
                <div style={{width:10,height:10,borderRadius:"50%",background:C.gold,flexShrink:0}}/>
                <div style={{fontSize:12,color:C.gold,fontWeight:600}}>Connecting...</div>
              </div>
            );
          }
          // ONLINE — confirmed live, scores in DB
          const myScObj=allScores.find(x=>x.i===teamIdx);
          const myTot=myScObj?myScObj.tot:null;
          const myPlayed=myScObj?myScObj.played:0;
          return(
            <div style={{background:"rgba(123,180,80,0.08)",border:"1px solid rgba(123,180,80,0.25)",borderRadius:10,padding:"10px 14px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <div style={{width:10,height:10,borderRadius:"50%",background:saveStatus==="saving"?C.gold:C.green,flexShrink:0}}/>
                <div style={{fontSize:12,color:saveStatus==="saving"?C.gold:C.green,fontWeight:600}}>
                  {saveStatus==="saving"?"Saving...":saveStatus==="saved"?"Saved ✓":"Live"}
                </div>
              </div>
              {myRank&&(
                <div style={{textAlign:"right"}}>
                  <span style={{fontSize:15,fontWeight:800,color:myTot!==null?relColor(myTot):C.muted}}>
                    {myTot!==null?relLabel(myTot):"--"}
                  </span>
                  <span style={{fontSize:11,color:C.muted,marginLeft:6}}>{myRank} of {totalTeams}</span>
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* Tournament summary overlay */}
      {showSummary&&(
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.92)", zIndex:500, overflowY:"auto", fontFamily:"Georgia,serif" }}>
          <div style={{ padding:"50px 16px 40px" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
              <div style={{ fontSize:20, fontWeight:800, color:C.text }}>🏆 {tourney.name}</div>
              <button onClick={()=>setShowSummary(false)} style={{ background:C.dim, border:"none", color:C.muted, width:34, height:34, borderRadius:"50%", fontSize:16, cursor:"pointer" }}>✕</button>
            </div>

            {/* Board tabs */}
            {(()=>{
              const medals=["1st","2nd","3rd"];
              return(<>
                <div style={{display:"flex",gap:0,marginBottom:16,border:"1px solid "+C.border,borderRadius:10,overflow:"hidden"}}>
                  {[["standings","Standings"],["top10","Individuals"],["skins","Skins"],["bets","💵 Bets"],["rules","📋 Rules"],...(ctpEnabled?[["ctp","CTP"]]:[])]
                    .map(([id,lbl])=>(
                    <button key={id} onClick={()=>setBTab(id)} style={{flex:1,padding:"11px",fontSize:12,fontWeight:bTab===id?700:500,background:bTab===id?(id==="ctp"?C.gold:C.green):"transparent",color:bTab===id?"#0a1a0f":C.muted,border:"none",cursor:"pointer"}}>{lbl}</button>
                  ))}
                </div>

                {bTab==="standings"&&(<>
                  <div style={{ display:"flex", padding:"4px 12px", marginBottom:6 }}>
                    <div style={{ flex:1, fontSize:10, color:C.muted, letterSpacing:1.5, textTransform:"uppercase" }}>Team</div>
                    {["F9","B9","TOT"].map(l=><div key={l} style={{ width:44, textAlign:"center", fontSize:10, color:C.muted, letterSpacing:1, textTransform:"uppercase" }}>{l}</div>)}
                  </div>
                  {(tourney.teams||[])
                    .map((t,i)=>{
                      const sc=calcTeamScore(t.scores||{},t.size||4,course.holes,tourney.birdie_bonus!==false,tourney.ball_count_by_par||(tourney.count_balls?{3:tourney.count_balls,4:tourney.count_balls,5:tourney.count_balls}:{3:2,4:2,5:2}),tourney.hole_pars||{});
                      return{...t,i,sc};
                    })
                    .sort((a,b)=>a.sc.totalDiff-b.sc.totalDiff)
                    .map((t,rank)=>{
                      const isMyTeam=t.i===teamIdx;
                      return(
                        <div key={t.i} style={{ background:isMyTeam?"rgba(123,180,80,0.1)":rank===0?"rgba(232,184,75,0.08)":C.card, border:`1px solid ${isMyTeam?C.green+"66":rank===0?C.gold+"44":C.border}`, borderRadius:12, padding:"12px 14px", marginBottom:8, display:"flex", alignItems:"center", gap:10 }}>
                          <div style={{ width:26,height:26,borderRadius:"50%",flexShrink:0,background:rank===0?C.gold:rank===1?"#aaa":rank===2?"#cd7f32":C.dim,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:12,color:rank<3?"#0a1a0f":C.muted }}>{rank+1}</div>
                          <div style={{ flex:1,minWidth:0 }}>
                            <div style={{ display:"flex",alignItems:"center",gap:6 }}>
                              <div style={{ width:10,height:10,borderRadius:"50%",background:t.color,flexShrink:0 }}/>
                              <div style={{ fontWeight:800,fontSize:14,color:isMyTeam?C.green:rank===0?C.gold:C.text }}>{t.name}{isMyTeam?" *":""}</div>
                            </div>
                          </div>
                          {[t.sc.frontDiff,t.sc.backDiff,t.sc.totalDiff].map((diff,idx)=>{
                            const raw=idx===0?t.sc.front:idx===1?t.sc.back:t.sc.total;
                            return<div key={idx} style={{ width:44,textAlign:"center",fontWeight:800,fontSize:15,color:raw===0?C.muted:relColor(diff) }}>{raw===0?"--":relLabel(diff)}</div>;
                          })}
                        </div>
                      );
                    })
                  }
                </>)}

                {bTab==="top10"&&(()=>{
                  const holePars=tourney.hole_pars||{};
                  const frontHoles=course.holes.filter(h=>h.side==="front");
                  const backHoles=course.holes.filter(h=>h.side==="back");
                  function cellColor(d){if(d<=-2)return"#5b9bd5";if(d===-1)return C.green;if(d===0)return C.muted;if(d===1)return C.gold;return C.red;}
                  const players=[];
                  (tourney.teams||[]).forEach((t,ti)=>{
                    for(let pi=0;pi<(t.size||1);pi++){
                      const name=t.players?.[pi]?.trim()?t.players[pi].trim():`Player ${pi+1}`;
                      let total=0,holesPlayed=0;
                      const byHole={};
                      for(const h of course.holes){
                        const s=t.scores?.[pi]?.[h.hole];
                        const effPar=holePars[h.hole]??h.par;
                        if(s!==undefined&&s!==null){
                          const diff=parseInt(s)-effPar;
                          total+=diff;holesPlayed++;
                          byHole[h.hole]={diff,side:h.side};
                        }
                      }
                      if(holesPlayed>0)players.push({name,teamName:t.name||`Team ${ti+1}`,teamColor:t.color,total,holesPlayed,byHole,ti,pi,isMe:ti===teamIdx});
                    }
                  });
                  players.sort((a,b)=>a.total!==b.total?a.total-b.total:b.holesPlayed-a.holesPlayed);
                  return players.slice(0,30).map((p,i)=>{
                    const frontDiff=frontHoles.reduce((s,h)=>p.byHole[h.hole]!==undefined?s+p.byHole[h.hole].diff:s,0);
                    const backDiff=backHoles.reduce((s,h)=>p.byHole[h.hole]!==undefined?s+p.byHole[h.hole].diff:s,0);
                    const hasFront=frontHoles.some(h=>p.byHole[h.hole]!==undefined);
                    const hasBack=backHoles.some(h=>p.byHole[h.hole]!==undefined);
                    return(
                      <div key={`${p.ti}-${p.pi}`} style={{background:p.isMe?"rgba(123,180,80,0.06)":i===0?"rgba(232,184,75,0.06)":C.card,border:`1px solid ${p.isMe?C.green+"44":i===0?C.gold+"44":C.border}`,borderRadius:12,padding:"10px 12px",marginBottom:10}}>
                        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                          <div style={{width:26,textAlign:"center",fontSize:i<3?15:11,fontWeight:800,color:i<3?C.gold:C.muted,flexShrink:0}}>{i<3?medals[i]:i+1}</div>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontWeight:800,fontSize:13,color:p.isMe?C.green:i===0?C.gold:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.name}{p.isMe?" *":""}</div>
                            <div style={{display:"flex",alignItems:"center",gap:5,marginTop:1}}>
                              <div style={{width:7,height:7,borderRadius:"50%",background:p.teamColor}}/>
                              <div style={{fontSize:10,color:C.muted}}>{p.teamName}</div>
                            </div>
                          </div>
                          <div style={{textAlign:"right",flexShrink:0}}>
                            <div style={{fontSize:18,fontWeight:800,color:relColor(p.total)}}>{relLabel(p.total)}</div>
                            <div style={{fontSize:9,color:C.dim}}>thru {p.holesPlayed}</div>
                          </div>
                        </div>
                        <div style={{overflowX:"auto"}}>
                          <div style={{display:"flex",alignItems:"center",gap:2,marginBottom:3,minWidth:280}}>
                            <div style={{width:18,fontSize:7,color:C.muted,flexShrink:0,textAlign:"right",paddingRight:2}}>F</div>
                            {frontHoles.map(h=>{const d=p.byHole[h.hole];return(<div key={h.hole} style={{flex:1,height:20,borderRadius:3,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{fontSize:8,fontWeight:700,color:d!==undefined?cellColor(d.diff):C.dim}}>{d!==undefined?relLabel(d.diff):""}</span></div>);})}
                            <div style={{width:24,height:20,borderRadius:3,background:"rgba(123,180,80,0.08)",border:"1px solid rgba(123,180,80,0.2)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><span style={{fontSize:8,fontWeight:800,color:hasFront?relColor(frontDiff):C.dim}}>{hasFront?relLabel(frontDiff):""}</span></div>
                          </div>
                          <div style={{display:"flex",alignItems:"center",gap:2,minWidth:280}}>
                            <div style={{width:18,fontSize:7,color:C.muted,flexShrink:0,textAlign:"right",paddingRight:2}}>B</div>
                            {backHoles.map(h=>{const d=p.byHole[h.hole];return(<div key={h.hole} style={{flex:1,height:20,borderRadius:3,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{fontSize:8,fontWeight:700,color:d!==undefined?cellColor(d.diff):C.dim}}>{d!==undefined?relLabel(d.diff):""}</span></div>);})}
                            <div style={{width:24,height:20,borderRadius:3,background:"rgba(123,180,80,0.08)",border:"1px solid rgba(123,180,80,0.2)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><span style={{fontSize:8,fontWeight:800,color:hasBack?relColor(backDiff):C.dim}}>{hasBack?relLabel(backDiff):""}</span></div>
                          </div>
                        </div>
                      </div>
                    );
                  });
                })()}
                {bTab==="skins"&&<SkinsTab teams={tourney.teams||[]} course={course} holePars={tourney.hole_pars||{}} skinsEnabled={tourney.skins_enabled===true} bigBoyEnabled={tourney.big_boy_enabled===true} teammatesTie={tourney.teammates_tie===true}/>}
                {bTab==="ctp"&&(
                  <div>
                    <div style={{fontSize:11,color:C.gold,letterSpacing:1.5,textTransform:"uppercase",marginBottom:12,fontWeight:600}}>Closest to the Pin</div>
                    {course.holes.filter(h=>(tourney.hole_pars||{})[h.hole]===3||(!(tourney.hole_pars?.[h.hole])&&h.par===3)).map(h=>{
                      const leader=ctpLeaders[h.hole];
                      return(
                        <div key={h.hole} style={{background:leader?"rgba(232,184,75,0.08)":C.card,border:"1px solid "+(leader?"rgba(232,184,75,0.4)":C.border),borderRadius:12,padding:"14px",marginBottom:10}}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                            <div><div style={{fontWeight:800,fontSize:15}}>Hole {h.hole} - Par {(tourney.hole_pars||{})[h.hole]??h.par}</div></div>
                            {leader?(
                              <div style={{textAlign:"right"}}><div style={{fontSize:20,fontWeight:800,color:C.gold}}>{leader.distance}</div></div>
                            ):(
                              <div style={{fontSize:12,color:C.dim}}>No entry yet</div>
                            )}
                          </div>
                          {leader&&(
                            <div style={{marginTop:8,background:"rgba(232,184,75,0.1)",borderRadius:8,padding:"8px 10px",display:"flex",alignItems:"center",gap:8}}>
                              <div style={{fontSize:18}}>[CTP]</div>
                              <div>
                                <div style={{fontWeight:700,fontSize:14,color:C.gold}}>{leader.name}</div>
                                <div style={{fontSize:11,color:C.muted}}>{leader.teamName}</div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                {/* Captains run their own bets: same setup + remove as the director, on the shared bet list. */}
                {bTab==="bets"&&(
                  <div>
                    <div style={{fontSize:11,color:C.gold,letterSpacing:1.5,textTransform:"uppercase",marginBottom:12,fontWeight:600}}>Side Bets · run your own here</div>
                    <div style={{marginBottom:14}}>
                      <button onClick={()=>setShowBetSetup(v=>!v)} style={{background:"rgba(123,180,80,0.15)",border:"1px solid "+C.green,color:C.green,fontSize:13,cursor:"pointer",padding:"10px 16px",borderRadius:12,fontWeight:700}}>{showBetSetup?"− Close setup":"＋ Set up Bet"}</button>
                    </div>
                    {showBetSetup&&(
                      <div style={{background:C.card,border:"1px solid "+C.border,borderRadius:14,padding:"14px",marginBottom:14}}>
                        <div style={{fontSize:11,color:C.muted,letterSpacing:1.5,textTransform:"uppercase",marginBottom:6,fontWeight:600}}>Player A</div>
                        <select value={betA} onChange={e=>setBetA(e.target.value)} style={{width:"100%",padding:"12px",borderRadius:10,background:C.surface,color:C.text,border:"1px solid "+C.border,fontSize:14,marginBottom:12}}>
                          <option value="">— pick a player —</option>
                          {captainAllPlayers.map(p=><option key={p.team+":"+p.pi} value={p.team+":"+p.pi}>{p.name} ({p.teamName})</option>)}
                        </select>
                        <div style={{fontSize:11,color:C.muted,letterSpacing:1.5,textTransform:"uppercase",marginBottom:6,fontWeight:600}}>Player B</div>
                        <select value={betB} onChange={e=>setBetB(e.target.value)} style={{width:"100%",padding:"12px",borderRadius:10,background:C.surface,color:C.text,border:"1px solid "+C.border,fontSize:14,marginBottom:12}}>
                          <option value="">— pick a player —</option>
                          {captainAllPlayers.map(p=><option key={p.team+":"+p.pi} value={p.team+":"+p.pi}>{p.name} ({p.teamName})</option>)}
                        </select>
                        <div style={{fontSize:11,color:C.muted,letterSpacing:1.5,textTransform:"uppercase",marginBottom:6,fontWeight:600}}>Game</div>
                        <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:12}}>
                          {[["skins","Skins"],["nassau","Nassau"],["nassau-press","Nassau + Auto Press"],["match","Match Play"]].map(([id,lbl])=>(
                            <button key={id} onClick={()=>setBetType(id)} style={{flex:1,padding:"10px 4px",borderRadius:8,background:betType===id?C.green:C.surface,color:betType===id?"#0a1a0f":C.muted,border:"1px solid "+(betType===id?C.green:C.border),cursor:"pointer",fontSize:12,fontWeight:betType===id?700:500,whiteSpace:"nowrap"}}>{lbl}</button>
                          ))}
                        </div>
                        <div style={{fontSize:11,color:C.muted,letterSpacing:1.5,textTransform:"uppercase",marginBottom:6,fontWeight:600}}>{betType==="skins"?"$ per skin":betType==="match"?"$ per hole":"$ per side / total"}</div>
                        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
                          <button onClick={()=>setBetAmount(Math.max(1,betAmount-1))} style={{width:44,height:44,borderRadius:"50%",background:C.dim,border:"1px solid "+C.border,color:C.text,fontSize:22,fontWeight:700,cursor:"pointer"}}>−</button>
                          <div style={{flex:1,textAlign:"center",fontSize:20,fontWeight:800}}>${betAmount}</div>
                          <button onClick={()=>setBetAmount(Math.min(99,betAmount+1))} style={{width:44,height:44,borderRadius:"50%",background:C.dim,border:"1px solid "+C.border,color:C.text,fontSize:22,fontWeight:700,cursor:"pointer"}}>+</button>
                        </div>
                        {betType==="skins"&&(
                          <>
                            <div style={{fontSize:11,color:C.muted,letterSpacing:1.5,textTransform:"uppercase",marginBottom:6,fontWeight:600}}>Tied holes</div>
                            <div style={{display:"flex",gap:6,marginBottom:6}}>
                              <button onClick={()=>setBetCarryOver(true)} style={{flex:1,padding:"10px 4px",borderRadius:8,background:betCarryOver?C.gold:C.surface,color:betCarryOver?"#0a1a0f":C.muted,border:"1px solid "+(betCarryOver?C.gold:C.border),cursor:"pointer",fontSize:12,fontWeight:betCarryOver?700:500}}>Carry over</button>
                              <button onClick={()=>setBetCarryOver(false)} style={{flex:1,padding:"10px 4px",borderRadius:8,background:!betCarryOver?C.gold:C.surface,color:!betCarryOver?"#0a1a0f":C.muted,border:"1px solid "+(!betCarryOver?C.gold:C.border),cursor:"pointer",fontSize:12,fontWeight:!betCarryOver?700:500}}>Don't carry</button>
                            </div>
                            <div style={{fontSize:11,color:C.muted,marginBottom:12}}>{betCarryOver?"A tied hole rolls forward and makes the next hole worth more.":"A tied hole is dead — every hole is worth exactly one skin."}</div>
                          </>
                        )}
                        <div style={{fontSize:11,color:C.muted,letterSpacing:1.5,textTransform:"uppercase",marginBottom:6,fontWeight:600}}>Strokes — belong to the bet, not the tournament</div>
                        <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:8}}>
                          {[["none","No strokes"],["A",(captainBetAName||"Player A")+" gets strokes"],["B",(captainBetBName||"Player B")+" gets strokes"]].map(([id,lbl])=>(
                            <button key={id} onClick={()=>setBetStrokesTo(id)} style={{flex:1,padding:"10px 4px",borderRadius:8,background:betStrokesTo===id?C.gold:C.surface,color:betStrokesTo===id?"#0a1a0f":C.muted,border:"1px solid "+(betStrokesTo===id?C.gold:C.border),cursor:"pointer",fontSize:12,fontWeight:betStrokesTo===id?700:500,whiteSpace:"nowrap"}}>{lbl}</button>
                          ))}
                        </div>
                        {betStrokesTo!=="none"&&(
                          <>
                            <div style={{fontSize:11,color:C.muted,letterSpacing:1.5,textTransform:"uppercase",marginBottom:6,fontWeight:600}}>Strokes (split per side — 2 = 1 front + 1 back)</div>
                            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
                              <button onClick={()=>setBetStrokesCount(Math.max(1,betStrokesCount-1))} style={{width:44,height:44,borderRadius:"50%",background:C.dim,border:"1px solid "+C.border,color:C.text,fontSize:22,fontWeight:700,cursor:"pointer"}}>−</button>
                              <div style={{flex:1,textAlign:"center",fontSize:20,fontWeight:800}}>{betStrokesCount}</div>
                              <button onClick={()=>setBetStrokesCount(Math.min(18,betStrokesCount+1))} style={{width:44,height:44,borderRadius:"50%",background:C.dim,border:"1px solid "+C.border,color:C.text,fontSize:22,fontWeight:700,cursor:"pointer"}}>+</button>
                            </div>
                            <div style={{fontSize:11,color:C.muted,marginBottom:12}}>Strokes fall on the hardest holes of each side.</div>
                          </>
                        )}
                        {betType==="nassau-press"&&(
                          <>
                            <div style={{fontSize:11,color:C.muted,letterSpacing:1.5,textTransform:"uppercase",marginBottom:6,fontWeight:600}}>Auto press triggers when</div>
                            <div style={{display:"flex",gap:6,marginBottom:8}}>
                              {[1,2,3].map(n=>(
                                <button key={n} onClick={()=>setBetPressDown(n)} style={{flex:1,padding:"12px",borderRadius:8,background:betPressDown===n?C.gold:C.surface,color:betPressDown===n?"#0a1a0f":C.muted,border:"1px solid "+(betPressDown===n?C.gold:C.border),cursor:"pointer",fontSize:13,fontWeight:betPressDown===n?700:500}}>{n} down</button>
                              ))}
                            </div>
                            <div style={{fontSize:11,color:C.muted,marginBottom:12}}>Auto presses only — no manual presses on tournament side bets.</div>
                          </>
                        )}
                        <button onClick={saveCaptainBet} disabled={betSaving} style={{width:"100%",padding:"16px",background:betSaving?C.dim:C.green,color:betSaving?C.muted:"#0a1a0f",border:"none",borderRadius:12,fontSize:15,fontWeight:800,cursor:betSaving?"not-allowed":"pointer",opacity:betSaving?0.6:1}}>{betSaving?"Saving...":"Save bet"}</button>
                      </div>
                    )}
                    <SideBetsTab bets={tourney.side_bets||[]} teams={tourney.teams||[]} course={course} courseId={tourney.course_id||"south-toledo"} C={C} canSetup onDelete={deleteCaptainBet}/>
                  </div>
                )}
                {bTab==="rules"&&<RulesTab rules={tourney.director_rules||""} holeNotes={tourney.hole_notes||{}} C={C}/>}
              </>);
            })()}

            <div style={{ height:20 }}/>
            <button onClick={()=>setShowSummary(false)} style={{ width:"100%",padding:"16px",background:C.green,color:"#0a1a0f",border:"none",borderRadius:12,fontSize:15,fontWeight:800,cursor:"pointer" }}>
              ← Back to Scoring
            </button>
          </div>
        </div>
      )}

      {/* Team header */}
      <div style={{ background:C.card, borderBottom:`1px solid ${C.border}`, padding:"12px 16px" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <div style={{ width:12, height:12, borderRadius:"50%", background:team.color }}/>
            <div style={{ fontWeight:800, fontSize:16 }}>{team.name}</div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ display:"flex", gap:14 }}>
              {[["F",sc.frontDiff,sc.front],["B",sc.backDiff,sc.back],["T",sc.totalDiff,sc.total]].map(([l,d,raw])=>(
                <div key={l} style={{ textAlign:"center" }}>
                  <div style={{ fontSize:9, color:C.muted }}>{l}</div>
                  <div style={{ fontSize:14, fontWeight:800, color:raw===0?C.muted:relColor(d) }}>{raw===0?"--":relLabel(d)}</div>
                </div>
              ))}
            </div>
            <button onClick={()=>setTab("roster")} style={{ background:"rgba(123,180,80,0.12)", border:`1px solid ${C.green}33`, color:C.green, fontSize:11, fontWeight:700, padding:"6px 10px", borderRadius:8, cursor:"pointer" }}>
              👥 Roster
            </button>
          </div>
        </div>
      </div>

      <div style={{ padding:"14px 16px" }}>
        {/* Birdie bonus alert */}
        {bonusThisHole>0&&(
          <div style={{ background:"rgba(123,180,80,0.12)", border:`1px solid ${C.green}`, borderRadius:10, padding:"10px 14px", marginBottom:12, textAlign:"center" }}>
            <div style={{ fontSize:13, fontWeight:700, color:C.green }}>🐦 Birdie Bonus −{bonusThisHole} this hole!</div>
          </div>
        )}

        {/* Hole selector - scroll to any hole */}
        <div style={{ display:"flex", overflowX:"auto", gap:6, marginBottom:14, paddingBottom:4 }}>
          {course.holes.map(h=>{
            const scored=Object.values(team.scores||{}).some(ps=>ps?.[h.hole]!==undefined);
            return(
              <button key={h.hole} onClick={async()=>{
                if(saveTimer.current) clearTimeout(saveTimer.current);
                if(pendingTeams.current) await flushSave(pendingTeams.current);
                setCurrentHole(h.hole);
              }} style={{
                flexShrink:0,width:36,height:36,borderRadius:"50%",fontSize:12,fontWeight:700,cursor:"pointer",
                background:h.hole===currentHole?C.gold:scored?"rgba(123,180,80,0.15)":C.dim,
                color:h.hole===currentHole?"#0a1a0f":scored?C.green:C.muted,
                border:`1px solid ${h.hole===currentHole?C.gold:scored?C.green:C.border}`
              }}>{h.hole}</button>
            );
          })}
        </div>

        {/* CTP button — only on holes selected as CTP holes */}
        {ctpEnabled&&ctpHoles.includes(currentHole)&&(()=>{
          const leader=ctpLeaders[currentHole];
          return(
            <button onClick={()=>{setCtpName("");setCtpDist("");setCtpAdvanceAfterSave(false);setCtpPopup(true);}}
              style={{width:"100%",padding:"14px 16px",marginBottom:10,background:leader?"rgba(232,184,75,0.15)":"rgba(232,184,75,0.08)",border:"2px solid rgba(232,184,75,0.5)",borderRadius:12,cursor:"pointer",textAlign:"left",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <svg width="28" height="36" viewBox="0 0 28 36" fill="none" xmlns="http://www.w3.org/2000/svg" style={{flexShrink:0,display:"block"}}><path d="M14 0C6.268 0 0 6.268 0 14c0 9.333 14 22 14 22S28 23.333 28 14C28 6.268 21.732 0 14 0z" fill="#e05050"/><circle cx="14" cy="14" r="5.5" fill="white"/></svg>
                <div>
                  <div style={{fontSize:11,color:C.gold,letterSpacing:1.5,textTransform:"uppercase",fontWeight:700,marginBottom:2}}>Closest to the Pin</div>
                  {leader?(
                    <div style={{fontSize:13,fontWeight:700,color:C.text}}>{leader.name} <span style={{color:C.gold,fontWeight:800}}>{leader.distance}</span></div>
                  ):(
                    <div style={{fontSize:12,color:C.muted}}>No leader yet - tap to claim</div>
                  )}
                </div>
              </div>
              <div style={{fontSize:18,color:C.gold,fontWeight:800,marginLeft:8}}>+</div>
            </button>
          );
        })()}

        {/* Player scores */}
        {Array.from({length:team.size||4},(_,j)=>{
          const score=getPlayerScore(j,currentHole);
          const isBest=best2Set.has(j)&&score!==null;
          const diff=score!==null?score-effPar:null;
          return(
            <div key={j} style={{ background:isBest?"rgba(123,180,80,0.08)":C.card, border:`1px solid ${isBest?C.green:C.border}`, borderRadius:14, padding:"12px 14px", marginBottom:10 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                <div>
                  <span style={{ fontWeight:700, fontSize:15 }}>{team.players?.[j]||"Player "+(j+1)}</span>
                  {isBest&&<span style={{ fontSize:10, color:C.green, fontWeight:700, marginLeft:8 }}>COUNTS</span>}
                </div>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  {diff!==null&&<div style={{ fontSize:14, fontWeight:800, color:relColor(diff) }}>{relLabel(diff)}</div>}
                </div>
              </div>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:8 }}>
                <button onClick={()=>!readOnlyMode&&setPlayerScore(j,currentHole,score!==null?Math.max(1,score-1):effPar-1)}
                  style={{ width:56,height:56,borderRadius:"50%",background:C.dim,border:`1px solid ${C.border}`,color:readOnlyMode?C.dim:C.text,fontSize:30,fontWeight:700,cursor:readOnlyMode?"not-allowed":"pointer",opacity:readOnlyMode?0.4:1 }}>−</button>
                <div style={{ flex:1,textAlign:"center" }}>
                  <div style={{ fontSize:56,fontWeight:800,color:score!==null?C.text:C.muted,lineHeight:1,fontVariantNumeric:"tabular-nums" }}>{score!==null?score:"--"}</div>
                  {score===null&&<div style={{ fontSize:11,color:C.muted,marginTop:4 }}>{readOnlyMode?"view only":"tap + to enter"}</div>}
                </div>
                <button onClick={()=>!readOnlyMode&&setPlayerScore(j,currentHole,score!==null?score+1:effPar)}
                  style={{ width:56,height:56,borderRadius:"50%",background:C.dim,border:`1px solid ${C.border}`,color:readOnlyMode?C.dim:C.text,fontSize:30,fontWeight:700,cursor:readOnlyMode?"not-allowed":"pointer",opacity:readOnlyMode?0.4:1 }}>+</button>
              </div>
            </div>
          );
        })}

        {/* This hole total */}
        {thisHoleScores.length>=1&&(()=>{
          const bbp = tourney.ball_count_by_par||(tourney.count_balls?{3:tourney.count_balls,4:tourney.count_balls,5:tourney.count_balls}:{3:2,4:2,5:2});
          const ballsHere = parseInt(bbp[effPar])||2;
          const raw=thisHoleScores.slice(0,ballsHere).reduce((s,x)=>s+x.s,0)-bonusThisHole;
          const d=raw-(effPar*ballsHere);
          return(
            <div style={{ background:"rgba(123,180,80,0.06)",border:`1px solid rgba(123,180,80,0.2)`,borderRadius:10,padding:"12px 16px",marginBottom:14 }}>
              <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                <div>
                  <div style={{ fontSize:12,color:C.muted }}>{ballsHere} Best Ball this hole</div>
                  {bonusThisHole>0&&<div style={{ fontSize:11,color:C.green }}>incl. birdie bonus −{bonusThisHole}</div>}
                </div>
                <div style={{ textAlign:"right" }}>
                  <div style={{ fontSize:22,fontWeight:800,color:relColor(d) }}>{relLabel(d)}</div>
                  <div style={{ fontSize:11,color:C.muted }}>raw: {raw}</div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Next hole */}
        <button onClick={()=>setShowSummary(true)} style={{
          width:"100%",padding:"14px",background:"rgba(232,184,75,0.12)",
          color:C.gold,border:"1px solid "+C.gold+"44",borderRadius:12,
          fontSize:15,fontWeight:700,cursor:"pointer",marginBottom:10
        }}>📊 Leaderboard</button>

        <button onClick={()=>{setBTab("rules");setShowSummary(true);}} style={{
          width:"100%",padding:"14px",background:"rgba(123,180,80,0.12)",
          color:C.green,border:"1px solid "+C.green+"44",borderRadius:12,
          fontSize:15,fontWeight:700,cursor:"pointer",marginBottom:10
        }}>📋 Rules</button>

        <button onClick={async()=>{
          // Hard flush before advancing — guaranteed write, no debounce
          if(saveTimer.current) clearTimeout(saveTimer.current);
          if(pendingTeams.current){
            setConnStatus("syncing");
            await flushSave(pendingTeams.current);
          }
          // Rebuild subscription if connection dropped mid-hole
          if(connStatus==="offline"||connStatus==="syncing") startSubscription();
          // CTP gate: on a CTP hole not yet answered this session, ask first
          // instead of advancing. Yes opens entry, No advances.
          if(!isLastHole&&ctpEnabled&&ctpHoles.includes(currentHole)&&!ctpAnsweredRef.current.has(currentHole)){
            setCtpPrompt(true);
          } else if(!isLastHole){
            setCurrentHole(h=>h+1);
          }
        }} disabled={isLastHole} style={{
          width:"100%",padding:"18px",background:isLastHole?"#1a2a1a":C.green,
          color:isLastHole?C.muted:"#0a1a0f",border:"none",borderRadius:14,
          fontSize:17,fontWeight:800,cursor:isLastHole?"not-allowed":"pointer",marginBottom:12
        }}>
          {isLastHole?"Round Complete!":"Next - Hole "+(currentHole+1)}
        </button>
      </div>

      {/* ── CAPTAIN SETTINGS OVERLAY ─────────────────────────────────── */}
      {/* ── CTP PROMPT — "Did you get a closest to the pin?" ────────────── */}
      {ctpPrompt&&(()=>{
        const leader=ctpLeaders[currentHole];
        return(
          <div style={{position:"fixed",inset:0,zIndex:600,background:"rgba(0,0,0,0.9)",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
            <div style={{background:C.surface,border:"2px solid "+C.gold,borderRadius:20,padding:24,width:"100%",maxWidth:340,textAlign:"center"}}>
              <div style={{fontSize:20,fontWeight:800,color:C.gold,marginBottom:6}}>📍 Closest to the Pin?</div>
              <div style={{fontSize:13,color:C.muted,marginBottom:6}}>Hole {currentHole} - Par {effPar}</div>
              {leader?(
                <div style={{fontSize:13,color:C.muted,marginBottom:16}}>Current leader: <span style={{fontWeight:700,color:C.text}}>{leader.name}</span> — <span style={{fontWeight:800,color:C.gold}}>{leader.distance}</span><br/>Did anyone beat it?</div>
              ):(
                <div style={{fontSize:13,color:C.muted,marginBottom:16}}>Did anyone get closest to the pin on this hole?</div>
              )}
              <div style={{display:"flex",gap:10}}>
                <button onClick={()=>{ctpAnsweredRef.current.add(currentHole);setCtpPrompt(false);if(!isLastHole)setCurrentHole(h=>h+1);}}
                  style={{flex:1,padding:"14px",background:"transparent",color:C.muted,border:"1px solid "+C.border,borderRadius:12,fontSize:14,fontWeight:600,cursor:"pointer"}}>No — next hole</button>
                <button onClick={()=>{setCtpPrompt(false);setCtpAdvanceAfterSave(true);setCtpName("");setCtpDist("");setCtpPopup(true);}}
                  style={{flex:2,padding:"14px",background:C.gold,color:"#0a1a0f",border:"none",borderRadius:12,fontSize:15,fontWeight:800,cursor:"pointer"}}>Yes — enter it</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── CTP POPUP — simple: player name + distance ──────────────── */}
      {ctpPopup&&(()=>{
        const leader=ctpLeaders[currentHole];
        const canSave=ctpName.trim().length>0&&ctpDist.trim().length>0;

        async function submitCtp(){
          if(!canSave)return;
          const newLeaders={...(tourney.ctp_leaders||{}),[currentHole]:{
            name:ctpName.trim(),
            teamName:team.name,
            distance:ctpDist.trim(),
            hole:currentHole,
          }};
          await sb.from("team_tournaments").update({ctp_leaders:newLeaders,updated_at:new Date().toISOString()}).eq("id",tourney.id);
          setTourney(prev=>({...prev,ctp_leaders:newLeaders}));
          ctpAnsweredRef.current.add(currentHole);
          setCtpPopup(false);setCtpName("");setCtpDist("");
          // Prompt flow: they were heading to the next hole — finish the trip.
          if(ctpAdvanceAfterSave){ setCtpAdvanceAfterSave(false); if(!isLastHole) setCurrentHole(h=>h+1); }
        }

        return(
          <div style={{position:"fixed",inset:0,zIndex:600,background:"rgba(0,0,0,0.9)",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
            <div style={{background:C.surface,border:"2px solid "+C.gold,borderRadius:20,padding:24,width:"100%",maxWidth:340}}>
              <div style={{textAlign:"center",marginBottom:16}}>
                <div style={{fontSize:20,fontWeight:800,color:C.gold,marginBottom:2}}>Closest to the Pin</div>
                <div style={{fontSize:13,color:C.muted}}>Hole {currentHole} - Par {effPar}</div>
              </div>

              {leader&&(
                <div style={{background:"rgba(232,184,75,0.1)",border:"1px solid rgba(232,184,75,0.3)",borderRadius:10,padding:"10px 14px",marginBottom:16,textAlign:"center"}}>
                  <div style={{fontSize:10,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:3}}>Current Leader</div>
                  <div style={{fontSize:22,fontWeight:800,color:C.gold}}>{leader.distance}</div>
                  <div style={{fontSize:12,color:C.muted,marginTop:2}}>{leader.name} - {leader.teamName}</div>
                </div>
              )}

              <div style={{marginBottom:12}}>
                <div style={{fontSize:11,color:C.green,letterSpacing:1.5,textTransform:"uppercase",fontWeight:600,marginBottom:6}}>Player Name</div>
                <input autoFocus value={ctpName} onChange={e=>setCtpName(e.target.value)}
                  placeholder="Who is closest?"
                  style={{width:"100%",padding:"14px",background:C.bg,border:"1px solid "+C.border,borderRadius:10,color:C.text,fontSize:16,outline:"none",boxSizing:"border-box"}}/>
              </div>

              <div style={{marginBottom:20}}>
                <div style={{fontSize:11,color:C.green,letterSpacing:1.5,textTransform:"uppercase",fontWeight:600,marginBottom:6}}>Distance</div>
                <input value={ctpDist} onChange={e=>setCtpDist(e.target.value)}
                  placeholder="e.g. 4 ft 6 in"
                  style={{width:"100%",padding:"14px",background:C.bg,border:"1px solid "+C.border,borderRadius:10,color:C.text,fontSize:16,outline:"none",boxSizing:"border-box"}}/>
              </div>

              {/* Clear button — only when a leader already exists */}
              {leader&&(
                <button onClick={async()=>{
                  const newLeaders={...(tourney.ctp_leaders||{})};
                  delete newLeaders[currentHole];
                  await sb.from("team_tournaments").update({ctp_leaders:newLeaders,updated_at:new Date().toISOString()}).eq("id",tourney.id);
                  setTourney(prev=>({...prev,ctp_leaders:newLeaders}));
                  ctpAnsweredRef.current.delete(currentHole);
                  setCtpAdvanceAfterSave(false);
                  setCtpPopup(false);setCtpName("");setCtpDist("");
                }} style={{width:"100%",padding:"12px",background:"rgba(224,80,80,0.1)",border:"1px solid rgba(224,80,80,0.4)",borderRadius:10,color:C.red,fontSize:13,fontWeight:700,cursor:"pointer",marginBottom:10}}>
                  Remove CTP Entry
                </button>
              )}
              <div style={{display:"flex",gap:10}}>
                <button onClick={()=>{setCtpAdvanceAfterSave(false);setCtpPopup(false);setCtpName("");setCtpDist("");}}
                  style={{flex:1,padding:"14px",background:"transparent",color:C.muted,border:"1px solid "+C.border,borderRadius:12,fontSize:14,fontWeight:600,cursor:"pointer"}}>Cancel</button>
                <button onClick={submitCtp} disabled={!canSave}
                  style={{flex:2,padding:"14px",background:canSave?C.gold:"#1a1a1a",color:canSave?"#0a1a0f":C.dim,border:"none",borderRadius:12,fontSize:15,fontWeight:800,cursor:canSave?"pointer":"not-allowed"}}>
                  Save CTP
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {showCaptainSettings&&(
        <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.92)",zIndex:600,overflowY:"auto",fontFamily:"Georgia,serif" }}>
          <div style={{ padding:"50px 20px 60px",maxWidth:480,margin:"0 auto" }}>
            <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6 }}>
              <div style={{ fontSize:20,fontWeight:800 }}>⚙️ Team Settings</div>
              <button onClick={()=>setShowCaptainSettings(false)} style={{ background:C.dim,border:"none",color:C.muted,width:34,height:34,borderRadius:"50%",fontSize:16,cursor:"pointer" }}>✕</button>
            </div>
            <div style={{ fontSize:12,color:C.muted,marginBottom:20 }}>Changes save automatically and update the leaderboard in real time.</div>

            {/* Ball count — captain can edit global setting */}
            <div style={{ background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"14px 16px",marginBottom:16 }}>
              <div style={{ fontWeight:700,fontSize:14,marginBottom:4 }}>Balls Counted Per Hole</div>
              <div style={{ fontSize:11,color:C.muted,marginBottom:12 }}>Tournament-wide · affects all teams. Changes recalculate instantly.</div>
              {(()=>{
                const bbp = tourney.ball_count_by_par||(tourney.count_balls?{3:tourney.count_balls,4:tourney.count_balls,5:tourney.count_balls}:{3:2,4:2,5:2});
                const update = async(newBbp)=>{
                  setTourney(prev=>({...prev,ball_count_by_par:newBbp}));
                  await sb.from("team_tournaments").update({ball_count_by_par:newBbp,updated_at:new Date().toISOString()}).eq("id",tourney.id);
                };
                return(<>
                  {[3,4,5].map(par=>(
                    <div key={par} style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                      <div style={{width:44,fontSize:12,fontWeight:700,color:C.muted,flexShrink:0}}>Par {par}</div>
                      <div style={{display:"flex",gap:5,flex:1}}>
                        {[1,2,3,4,5].map(n=>(
                          <button key={n} onClick={()=>update({...bbp,[par]:n})} style={{
                            flex:1,padding:"9px 4px",
                            background:parseInt(bbp[par])===n?C.green:C.surface,
                            color:parseInt(bbp[par])===n?"#0a1a0f":C.muted,
                            border:"1px solid "+(parseInt(bbp[par])===n?C.green:C.border),
                            borderRadius:8,fontSize:13,fontWeight:parseInt(bbp[par])===n?800:500,cursor:"pointer"
                          }}>{n}</button>
                        ))}
                      </div>
                    </div>
                  ))}
                  <div style={{borderTop:"1px solid "+C.border,paddingTop:8,marginTop:4}}>
                    <div style={{fontSize:10,color:C.dim,marginBottom:8,textAlign:"center"}}>Quick-set all pars at once</div>
                    <div style={{display:"flex",gap:5}}>
                      {[1,2,3,4,5].map(n=>(
                        <button key={n} onClick={()=>update({3:n,4:n,5:n})} style={{
                          flex:1,padding:"9px 4px",
                          background:parseInt(bbp[3])===n&&parseInt(bbp[4])===n&&parseInt(bbp[5])===n?C.gold:C.surface,
                          color:parseInt(bbp[3])===n&&parseInt(bbp[4])===n&&parseInt(bbp[5])===n?"#0a1a0f":C.muted,
                          border:"1px solid "+(parseInt(bbp[3])===n&&parseInt(bbp[4])===n&&parseInt(bbp[5])===n?C.gold:C.border),
                          borderRadius:8,fontSize:13,fontWeight:600,cursor:"pointer"
                        }}>{n}</button>
                      ))}
                    </div>
                  </div>
                </>);
              })()}
            </div>

            {/* Player names — captain's team only */}
            <div style={{ background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:"14px" }}>
              <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:12 }}>
                <div style={{ width:12,height:12,borderRadius:"50%",background:team.color }}/>
                <div style={{ fontWeight:800,fontSize:16,color:C.text }}>{team.name}</div>
              </div>
              <div style={{ fontSize:11,color:C.muted,marginBottom:8,fontWeight:600 }}>Player Names{tourney.big_boy_enabled?" - tap BB to enroll in Big Boy":""}</div>
              <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
                {Array.from({length:team.size||2},(_,j)=>(
                  <div key={j} style={{display:"flex",alignItems:"center",gap:8}}>
                    <input
                      value={team.players?.[j]||""}
                      onChange={e=>{
                        const updatedTeams=(tourney.teams||[]).map((t,ti)=>{
                          if(ti!==teamIdx)return t;
                          const p=[...(t.players||Array(t.size||1).fill(""))];
                          p[j]=e.target.value;
                          return{...t,players:p};
                        });
                        setTourney(prev=>({...prev,teams:updatedTeams}));
                        scheduleSync(updatedTeams);
                      }}
                      placeholder={"Player "+(j+1)}
                      style={{ flex:1,padding:"11px 12px",background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,color:C.text,fontSize:14,outline:"none" }}/>
                    {tourney.big_boy_enabled&&(
                      <button onClick={()=>{
                        const updatedTeams=(tourney.teams||[]).map((t,ti)=>{
                          if(ti!==teamIdx)return t;
                          const bb=[...(t.bigBoy||Array(t.size||1).fill(false))];
                          bb[j]=!bb[j];
                          return{...t,bigBoy:bb};
                        });
                        setTourney(prev=>({...prev,teams:updatedTeams}));
                        scheduleSync(updatedTeams);
                      }} style={{
                        flexShrink:0,padding:"8px 11px",borderRadius:8,fontSize:11,fontWeight:700,cursor:"pointer",
                        background:team.bigBoy?.[j]?C.gold:"rgba(255,255,255,0.06)",
                        color:team.bigBoy?.[j]?"#0a1a0f":"rgba(255,255,255,0.4)",
                        border:"1px solid "+(team.bigBoy?.[j]?"rgba(232,184,75,0.6)":"rgba(255,255,255,0.15)")
                      }}>BB</button>
                    )}
                  </div>
                ))}
              </div>
              <div style={{ fontSize:11,color:C.dim,marginTop:10,textAlign:"center" }}>
                Only your team's names. Contact the director to change team size or strokes.
              </div>
            </div>

            <button onClick={()=>setShowCaptainSettings(false)} style={{ width:"100%",padding:"16px",background:C.green,color:"#0a1a0f",border:"none",borderRadius:12,fontSize:16,fontWeight:800,cursor:"pointer",marginTop:16 }}>
              ✓ Done — Changes Saved
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
