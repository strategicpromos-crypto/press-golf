import React, { useState, useEffect, useRef } from "react";
import { COURSES, courseHasHdcp } from "./golf.js";
import { isLibraryCourse } from "./courseStore.js";
import CourseSearch, { CourseDeletePanel } from "./CourseSearch.jsx";
import { sb } from "./supabase.js";
import { calcSkins, SkinsTab } from "./skins.jsx";
import { SideBetsTab } from "./sideBets.jsx";
import { RulesTab } from "./RulesTab.jsx";

// Dark (default) and Day (high-contrast, sunlight-readable) themes.
// The TeamTournament component picks one via `dayMode` and shadows it as
// `C`, so every style reference follows the active theme automatically.
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

const TEAM_COLORS = [
  "#e8b84b","#7bb450","#5b9bd5","#e05050",
  "#b07dd5","#50c8c8","#e88a3a","#c8c850",
  "#d570a0","#70d5a0","#a0a0e8","#e8a070",
];

function safeInt(v,f=0){const n=parseInt(v,10);return isNaN(n)?f:n;}
function relLabel(d){if(d===null||d===undefined)return"--";if(d===0)return"E";return d>0?"+"+d:String(d);}
// NOTE: relColor, BigBtn, GhostBtn, Lbl, NumStepper live INSIDE the
// TeamTournament component (below) so they close over the active theme.

// Build top 10 individual leaderboard from all teams
function calcIndividualLeaderboard(teams, holeData, holePars){
  const players = [];
  teams.forEach((team, teamIdx) => {
    for(let pi = 0; pi < (team.size||1); pi++){
      const name = team.players?.[pi]?.trim()
        ? team.players[pi].trim()
        : `Player ${pi+1}`;
      const teamName = team.name || `Team ${teamIdx+1}`;
      let total = 0, holesPlayed = 0;
      const byHole = {};
      for(const h of holeData){
        const s = team.scores?.[pi]?.[h.hole];
        const effPar = (holePars||{})[h.hole] ?? h.par;
        if(s !== undefined && s !== null){
          const diff = safeInt(s) - effPar;
          total += diff;
          holesPlayed++;
          byHole[h.hole] = { diff, side: h.side };
        }
      }
      players.push({ name, teamName, teamColor: team.color||TEAM_COLORS[teamIdx%TEAM_COLORS.length], total, holesPlayed, byHole, teamIdx, pi });
    }
  });
  return players
    .filter(p => p.holesPlayed > 0)
    .sort((a,b) => a.total !== b.total ? a.total - b.total : b.holesPlayed - a.holesPlayed)
    .slice(0, 30);
}

// Individual scorecard — top 30, full hole-by-hole vs-par
// Theme passed as a prop so it follows day mode.
function Top10Tab({ teams, course, holePars, C }){
  const relColor=(d)=>{if(d===null||d===undefined)return C.muted;if(d<0)return C.green;if(d>0)return C.red;return C.muted;};
  const players = calcIndividualLeaderboard(teams, course.holes, holePars);
  const medals = ["1st","2nd","3rd"];
  const frontHoles = course.holes.filter(h=>h.side==="front");
  const backHoles  = course.holes.filter(h=>h.side==="back");

  if(players.length === 0) return(
    <div style={{textAlign:"center",padding:"40px 20px",color:C.muted}}>
      <div style={{fontSize:32,marginBottom:12}}>⛳</div>
      <div style={{fontSize:14}}>Individual scores will appear here as players enter their scores.</div>
    </div>
  );

  // Cell style for a hole score
  function cellColor(diff){
    if(diff===null||diff===undefined) return C.dim;
    if(diff<=-2) return "#5b9bd5"; // eagle or better — blue
    if(diff===-1) return C.green;  // birdie
    if(diff===0)  return C.muted;  // par
    if(diff===1)  return C.gold;   // bogey
    return C.red;                  // double+
  }

  return(
    <div>
      <div style={{fontSize:11,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:12,textAlign:"center"}}>Individual Scorecard · Top 30</div>
      {players.map((p,i)=>{
        const frontDiff = frontHoles.reduce((s,h)=> p.byHole[h.hole]!==undefined ? s+p.byHole[h.hole].diff : s, 0);
        const backDiff  = backHoles.reduce((s,h)=>  p.byHole[h.hole]!==undefined ? s+p.byHole[h.hole].diff : s, 0);
        const hasFront  = frontHoles.some(h=>p.byHole[h.hole]!==undefined);
        const hasBack   = backHoles.some(h=>p.byHole[h.hole]!==undefined);
        return(
          <div key={`${p.teamIdx}-${p.pi}`} style={{background:i===0?"rgba(232,184,75,0.06)":C.card,border:`1px solid ${i===0?C.gold+"44":C.border}`,borderRadius:12,padding:"10px 12px",marginBottom:10}}>
            {/* Header row — rank, name, team, total */}
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
              <div style={{width:28,textAlign:"center",fontSize:i<3?16:12,fontWeight:800,color:i<3?C.gold:C.muted,flexShrink:0}}>
                {i<3?medals[i]:i+1}
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontWeight:800,fontSize:14,color:i===0?C.gold:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.name}</div>
                <div style={{display:"flex",alignItems:"center",gap:5,marginTop:1}}>
                  <div style={{width:7,height:7,borderRadius:"50%",background:p.teamColor,flexShrink:0}}/>
                  <div style={{fontSize:10,color:C.muted}}>{p.teamName}</div>
                </div>
              </div>
              <div style={{textAlign:"right",flexShrink:0}}>
                <div style={{fontSize:20,fontWeight:800,color:relColor(p.total)}}>{relLabel(p.total)}</div>
                <div style={{fontSize:9,color:C.dim}}>thru {p.holesPlayed}</div>
              </div>
            </div>

            {/* Scorecard rows */}
            <div style={{overflowX:"auto"}}>
              {/* Front 9 */}
              <div style={{display:"flex",alignItems:"center",gap:2,marginBottom:3,minWidth:280}}>
                <div style={{width:20,fontSize:8,color:C.muted,flexShrink:0,textAlign:"right",paddingRight:3}}>F</div>
                {frontHoles.map(h=>{
                  const d = p.byHole[h.hole];
                  return(
                    <div key={h.hole} style={{flex:1,height:22,borderRadius:3,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",display:"flex",alignItems:"center",justifyContent:"center"}}>
                      <span style={{fontSize:9,fontWeight:700,color:d!==undefined?cellColor(d.diff):C.dim}}>
                        {d!==undefined?relLabel(d.diff):""}
                      </span>
                    </div>
                  );
                })}
                <div style={{width:26,height:22,borderRadius:3,background:"rgba(123,180,80,0.08)",border:"1px solid rgba(123,180,80,0.2)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  <span style={{fontSize:9,fontWeight:800,color:hasFront?relColor(frontDiff):C.dim}}>{hasFront?relLabel(frontDiff):""}</span>
                </div>
              </div>
              {/* Back 9 */}
              <div style={{display:"flex",alignItems:"center",gap:2,minWidth:280}}>
                <div style={{width:20,fontSize:8,color:C.muted,flexShrink:0,textAlign:"right",paddingRight:3}}>B</div>
                {backHoles.map(h=>{
                  const d = p.byHole[h.hole];
                  return(
                    <div key={h.hole} style={{flex:1,height:22,borderRadius:3,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",display:"flex",alignItems:"center",justifyContent:"center"}}>
                      <span style={{fontSize:9,fontWeight:700,color:d!==undefined?cellColor(d.diff):C.dim}}>
                        {d!==undefined?relLabel(d.diff):""}
                      </span>
                    </div>
                  );
                })}
                <div style={{width:26,height:22,borderRadius:3,background:"rgba(123,180,80,0.08)",border:"1px solid rgba(123,180,80,0.2)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  <span style={{fontSize:9,fontWeight:800,color:hasBack?relColor(backDiff):C.dim}}>{hasBack?relLabel(backDiff):""}</span>
                </div>
              </div>
            </div>
          </div>
        );
      })}
      <div style={{fontSize:10,color:C.dim,textAlign:"center",marginTop:12}}>Individual scores · not counting balls · updates live</div>
    </div>
  );
}

function calcTeamScore(teamScores,teamSize,holeData,birdieBonus,ballsByPar,holePars){
  // ballsByPar: {3:N, 4:N, 5:N} — balls counted per hole by par value
  // Falls back to legacy single number if a plain int is passed
  const getBalls=(par)=>{
    if(typeof ballsByPar==="object"&&ballsByPar!==null&&!Array.isArray(ballsByPar)){
      return parseInt(ballsByPar[par])||parseInt(ballsByPar[4])||2;
    }
    return parseInt(ballsByPar)||Math.min(teamSize,Math.max(teamSize,1));
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
  return{byHole,front,frontDiff:front-frontPar,back,backDiff:back-backPar,total,totalDiff:total-totalPar,frontPar,backPar,totalPar};
}


export default function TeamTournament({onBack, user, onDelete}){

  // ── Day mode (sunlight-readable theme) — persisted per device ──────────
  const [dayMode, setDayMode] = useState(()=>{
    try{ return localStorage.getItem("press_daymode")==="1"; }catch(e){ return false; }
  });
  const C = dayMode ? LIGHT : DARK; // shadows module themes — all styles follow
  function toggleDayMode(){
    const v=!dayMode; setDayMode(v);
    try{ localStorage.setItem("press_daymode", v?"1":"0"); }catch(e){}
  }

  // Theme-aware helpers (moved inside so they use the active theme)
  function relColor(d){if(d===null||d===undefined)return C.muted;if(d<0)return C.green;if(d>0)return C.red;return C.muted;}
  function BigBtn({children,onClick,color=C.green,disabled=false,style={}}){
    return(<button onClick={onClick} disabled={disabled} style={{width:"100%",padding:"18px",background:disabled?"#1a2a1a":color,color:disabled?C.muted:"#0a1a0f",border:"none",borderRadius:14,fontSize:17,fontWeight:800,cursor:disabled?"not-allowed":"pointer",opacity:disabled?0.5:1,fontFamily:"Georgia,serif",...style}}>{children}</button>);
  }
  function GhostBtn({children,onClick,color=C.green}){
    return(<button onClick={onClick} style={{width:"100%",padding:"14px",background:"transparent",color,border:"1.5px solid "+color,borderRadius:12,fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"Georgia,serif"}}>{children}</button>);
  }
  function Lbl({children}){return<div style={{fontSize:11,color:C.green,letterSpacing:1.5,textTransform:"uppercase",marginBottom:8,fontWeight:600}}>{children}</div>;}
  function NumStepper({value,onChange,min=0,max=99,label}){
    return(
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"4px 0"}}>
        {label&&<div style={{fontSize:13,color:C.muted,flex:1}}>{label}</div>}
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <button onClick={()=>onChange(Math.max(min,value-1))} style={{width:44,height:44,borderRadius:"50%",background:C.dim,border:"1px solid "+C.border,color:C.text,fontSize:22,fontWeight:700,cursor:"pointer"}}>−</button>
          <div style={{width:36,textAlign:"center",fontSize:20,fontWeight:800,color:C.text,fontVariantNumeric:"tabular-nums"}}>{value}</div>
          <button onClick={()=>onChange(Math.min(max,value+1))} style={{width:44,height:44,borderRadius:"50%",background:C.dim,border:"1px solid "+C.border,color:C.text,fontSize:22,fontWeight:700,cursor:"pointer"}}>+</button>
        </div>
      </div>
    );
  }
  const[screen,setScreen]=useState("home");
  const[courseId,setCourseId]=useState("south-toledo");
  const[showCourseSearch,setShowCourseSearch]=useState(false);
  const[deleteCourseId,setDeleteCourseId]=useState(null);
  const[birdieBonus,setBirdieBonus]=useState(true);
  const[ballsByPar,setBallsByPar]=useState({3:2,4:2,5:2}); // balls counted per hole by par
  const[skinsEnabled,setSkinsEnabled]=useState(false);
  const[bigBoyEnabled,setBigBoyEnabled]=useState(false);
  const[teammatesTie,setTeammatesTie]=useState(false); // false=teammates don't cancel skin, true=stricter
  const[ctpEnabled,setCtpEnabled]=useState(false);
  const[ctpHoles,setCtpHoles]=useState([]);          // hole numbers designated as CTP
  // Director CTP reminder (Oct 25, 2026): a plain did-you-forget at Create,
  // for new/forgetful directors — not an auto-add, and it never nags twice
  // for the same setup (dismissed flag below).
  const[ctpReminder,setCtpReminder]=useState(false);
  const[ctpReminderDismissed,setCtpReminderDismissed]=useState(false);
  const[ctpLeaders,setCtpLeaders]=useState({});      // {holeNum: {name,teamName,distance,teamIdx,playerIdx}}
  const[sideBets,setSideBets]=useState([]);          // director side bets (see sideBets.jsx)
  const sideBetsRef=useRef([]);
  const lastSyncedSideBets=useRef(null);
  useEffect(()=>{ sideBetsRef.current=sideBets; },[sideBets]);
  const searchPanelRef=useRef(null);
  useEffect(()=>{ if(showCourseSearch&&searchPanelRef.current){ searchPanelRef.current.scrollIntoView({behavior:"smooth",block:"start"}); } },[showCourseSearch]);
  // ── Side-bet setup form state (director only, on the Bets tab) ───────────
  const[showBetSetup,setShowBetSetup]=useState(false);
  const[betA,setBetA]=useState("");
  const[betB,setBetB]=useState("");
  const[betType,setBetType]=useState("skins");
  const[betAmount,setBetAmount]=useState(5);
  const[betStrokesTo,setBetStrokesTo]=useState("none"); // "none" | "A" | "B"
  const[betStrokesCount,setBetStrokesCount]=useState(2); // split per side: 2 = 1 front + 1 back
  const[betPressDown,setBetPressDown]=useState(2);
  const[ctpPopup,setCtpPopup]=useState(null);        // {holeNum,teamIdx,playerIdx,playerName} — active entry popup
  const[ctpInput,setCtpInput]=useState("");           // distance input
  const[ctpName,setCtpName]=useState("");             // player name for CTP
  const[holePars,setHolePars]=useState({});        // override pars: {4:4} = hole 4 → par 4
  const[directorRules,setDirectorRules]=useState(""); // tournament-wide rules note (Rules page)
  const[holeNotes,setHoleNotes]=useState({});       // per-hole notes: {4:"Everyone plays the Golds"}
  const[noteHole,setNoteHole]=useState(1);           // hole picked in the note editor
  const[noteText,setNoteText]=useState("");          // draft text in the note editor
  const[midParHole,setMidParHole]=useState(1);       // hole picked in the mid-round par control
  const[numTeams,setNumTeams]=useState(8);
  const[activeTeam,setActiveTeam]=useState(0);
  const[currentHole,setCurrentHole]=useState(1);
  const[teams,setTeams]=useState([]);
  const[tourneyId,setTourneyId]=useState(null);
  const[directorCode,setDirectorCode]=useState(null);
  const[savedTourneys,setSavedTourneys]=useState([]);
  const[showHelp,setShowHelp]=useState(false);
  const[loading,setLoading]=useState(false);
  const[saveStatus,setSaveStatus]=useState("");
  const[lbTab,setLbTab]=useState("standings");      // leaderboard tab
  const[showSettings,setShowSettings]=useState(false); // director settings overlay
  const[ctpConfirm,setCtpConfirm]=useState(false);     // mid-round CTP enable confirmation
  const saveTimer=useRef(null);
  const subRef=useRef(null);
  const course=COURSES[courseId];
  // Every named player in the tournament, for the side-bet pickers.
  const allPlayers=teams.flatMap((t,ti)=>(t.players||[]).map((p,pi)=>({team:ti,pi,name:(p||"").trim(),teamName:t.name||("Team "+(ti+1))})).filter(x=>x.name!==""));
  const betAName=allPlayers.find(p=>p.team+":"+p.pi===betA)?.name;
  const betBName=allPlayers.find(p=>p.team+":"+p.pi===betB)?.name;

  useEffect(()=>{ loadSaved(); },[]);

  // ── Sync snapshots — fix for captain scores being clobbered ────────────────
  // lastSyncedTeams / lastSyncedCtp: JSON of teams[] / ctp_leaders as last
  // written to or received from the DB. lastSavedSnap: snapshot of the full
  // row the director last wrote (or last received). The auto-save below only
  // overwrites the team slots the DIRECTOR actually changed since the last
  // sync; slots changed by captains are preserved from a fresh DB read.
  // Comparing snapshots also breaks the old save → realtime-echo → save
  // infinite write loop.
  const lastSyncedTeams=useRef(null);
  const lastSyncedCtp=useRef(null);
  const lastSavedSnap=useRef(null);
  const snap=(v)=>{ try{return JSON.stringify(v??[]);}catch(e){return "[]";} };
  const stateSnap=(s)=>JSON.stringify({
    teams:s?.teams||[], course_id:s?.course_id, birdie_bonus:s?.birdie_bonus,
    ball_count_by_par:s?.ball_count_by_par, hole_pars:s?.hole_pars,
    director_rules:s?.director_rules||"", hole_notes:s?.hole_notes||{},
    skins_enabled:s?.skins_enabled, big_boy_enabled:s?.big_boy_enabled,
    teammates_tie:s?.teammates_tie, ctp_enabled:s?.ctp_enabled,
    ctp_holes:s?.ctp_holes, ctp_leaders:s?.ctp_leaders||{}, side_bets:s?.side_bets||[], current_hole:s?.current_hole,
  });
  const localSnap=()=>stateSnap({
    teams, course_id:courseId, birdie_bonus:birdieBonus, ball_count_by_par:ballsByPar,
    hole_pars:holePars, director_rules:directorRules, hole_notes:holeNotes,
    skins_enabled:skinsEnabled, big_boy_enabled:bigBoyEnabled,
    teammates_tie:teammatesTie, ctp_enabled:ctpEnabled, ctp_holes:ctpHoles,
    ctp_leaders:ctpLeaders, side_bets:sideBets, current_hole:currentHole,
  });

  // ── Real-time: director sees captain scores instantly (always on) ──────────
  // Incoming updates are MERGED, not applied wholesale, so the director's own
  // unsaved edits are never discarded by a captain's update arriving mid-edit.
  // Reconnect actually re-subscribes now (the old path removed the channel and
  // never came back).
  useEffect(()=>{
    if(!tourneyId)return;
    let cancelled=false;
    function subscribe(){
      if(cancelled)return;
      if(subRef.current){sb.removeChannel(subRef.current);subRef.current=null;}
      subRef.current=sb
        .channel("director_"+tourneyId+"_"+Date.now())
        .on("postgres_changes",{event:"UPDATE",schema:"public",table:"team_tournaments",filter:"id=eq."+tourneyId},
          payload=>{
            if(!payload.new)return;
            if(payload.new.teams){
              const incoming=payload.new.teams;
              setTeams(prev=>{
                const wasSynced=JSON.parse(lastSyncedTeams.current||"[]");
                const n=Math.max(incoming.length,prev.length);
                return Array.from({length:n},(_,i)=>{
                  const l=prev[i];
                  if(l===undefined) return incoming[i];
                  if(incoming[i]===undefined) return l;
                  // Director edited this slot locally and hasn't saved yet → keep local
                  return snap(l)!==snap(wasSynced[i]) ? l : incoming[i];
                });
              });
              lastSyncedTeams.current=snap(incoming);
            }
            if(payload.new.ctp_leaders){
              setCtpLeaders(payload.new.ctp_leaders);
              lastSyncedCtp.current=snap(payload.new.ctp_leaders);
            }
            if(payload.new.side_bets!==undefined){
              const incoming=snap(payload.new.side_bets||[]);
              // Director-only data: apply only when the director has no
              // unsaved side-bet edits (local matches last synced). His own
              // save echo is a no-op because it equals the synced value.
              if(snap(sideBetsRef.current)===lastSyncedSideBets.current){
                setSideBets(payload.new.side_bets||[]);
                lastSyncedSideBets.current=incoming;
              }
            }
            lastSavedSnap.current=stateSnap(payload.new);
          })
        .subscribe(status=>{
          if(cancelled)return;
          if(status==="CLOSED"||status==="CHANNEL_ERROR"||status==="TIMED_OUT"){
            setTimeout(()=>subscribe(),3000);
          }
        });
    }
    subscribe();
    return()=>{ cancelled=true; if(subRef.current){sb.removeChannel(subRef.current);subRef.current=null;} };
  },[tourneyId]);

  async function loadSaved(){
    if(!user?.id)return;
    const{data}=await sb.from("team_tournaments")
      .select("id,name,course_id,created_at,updated_at,status,current_hole,teams,director_code,spectator_code")
      .eq("owner_id",user.id)
      .order("updated_at",{ascending:false})
      .limit(10);
    if(data)setSavedTourneys(data);
  }

  // ── Auto-save whenever teams/scores/hole change ────────────────────────────
  // Merge-on-write: reads the fresh row first and only overwrites the team
  // slots the director actually changed. Captain scores are never clobbered.
  // The snapshot guard also skips saves when nothing changed (realtime echo of
  // our own write, or a captain's update) — killing the old infinite loop.
  useEffect(()=>{
    if(!tourneyId||screen==="home"||screen==="saved")return;
    if(lastSavedSnap.current!==null && localSnap()===lastSavedSnap.current){
      setSaveStatus("");
      return;
    }
    // Back up dirty state — if this phone dies before the save lands, the
    // edits are restored on next open (see resumeTourney). The lastSynced
    // refs go along so merge-on-write still protects captains' scores.
    try{
      localStorage.setItem("press_director_pending_"+tourneyId, JSON.stringify({
        savedAt: Date.now(),
        state: localSnap(),
        lastSyncedTeams: lastSyncedTeams.current,
        lastSyncedCtp: lastSyncedCtp.current,
      }));
    }catch(e){}
    if(saveTimer.current)clearTimeout(saveTimer.current);
    setSaveStatus("saving");
    let attempts=0;
    const doSave=async()=>{
      try{
        // Read fresh FIRST so concurrent captain writes survive this save.
        const{data:current,error:readErr}=await sb.from("team_tournaments")
          .select("teams,ctp_leaders").eq("id",tourneyId).single();
        if(readErr) throw readErr;
        const dbTeams=current?.teams||[];
        const wasSynced=JSON.parse(lastSyncedTeams.current||"[]");
        const n=Math.max(dbTeams.length,teams.length);
        const mergedTeams=Array.from({length:n},(_,i)=>{
          const local=teams[i], db=dbTeams[i];
          if(db===undefined) return local;      // brand-new local slot
          if(local===undefined) return db;      // keep DB slot
          // Director touched this slot since last sync → director wins; else keep DB (captain's data)
          return snap(local)!==snap(wasSynced[i]) ? local : db;
        });
        // Same idea for CTP leaders (captains write these directly)
        const dbCtp=current?.ctp_leaders;
        const ctpToWrite=(dbCtp!==undefined && snap(ctpLeaders)===lastSyncedCtp.current) ? dbCtp : ctpLeaders;
        const{error}=await sb.from("team_tournaments").update({
          teams:mergedTeams,
          course_id:courseId,
          birdie_bonus:birdieBonus,
          ball_count_by_par:ballsByPar,
          hole_pars:holePars,
          director_rules:directorRules,
          hole_notes:holeNotes,
          skins_enabled:skinsEnabled,
          big_boy_enabled:bigBoyEnabled,
          teammates_tie:teammatesTie,
          ctp_enabled:ctpEnabled,
          ctp_holes:ctpHoles,
          ctp_leaders:ctpToWrite,
          side_bets:sideBets,
          current_hole:currentHole,
          status:"active", // never downgrade — once scoring starts, always stay "active"
          updated_at:new Date().toISOString(),
        }).eq("id",tourneyId);
        if(error) throw error; // never report "saved" when the write failed
        lastSyncedTeams.current=snap(mergedTeams);
        lastSyncedCtp.current=snap(ctpToWrite);
        lastSavedSnap.current=stateSnap({
          teams:mergedTeams, course_id:courseId, birdie_bonus:birdieBonus,
          ball_count_by_par:ballsByPar, hole_pars:holePars, director_rules:directorRules, hole_notes:holeNotes, skins_enabled:skinsEnabled,
          big_boy_enabled:bigBoyEnabled, teammates_tie:teammatesTie, ctp_enabled:ctpEnabled,
          ctp_holes:ctpHoles, ctp_leaders:ctpToWrite, side_bets:sideBets, current_hole:currentHole,
        });
        lastSyncedSideBets.current=snap(sideBets);
        // Reconcile in case the merge kept DB data we hadn't seen yet
        if(snap(mergedTeams)!==snap(teams)) setTeams(mergedTeams);
        if(snap(ctpToWrite)!==snap(ctpLeaders)) setCtpLeaders(ctpToWrite);
        try{ localStorage.removeItem("press_director_pending_"+tourneyId); }catch(e){} // saved — drop the backup
        setSaveStatus("saved");
        setTimeout(()=>setSaveStatus(""),2000);
        loadSaved();
      }catch(e){
        // Write failed (network/RLS) — retry once, then leave state dirty so the
        // next local change retries. Never report "saved" on failure.
        if(attempts<1){ attempts++; saveTimer.current=setTimeout(doSave,3000); }
        else { setSaveStatus(""); }
      }
    };
    saveTimer.current=setTimeout(doSave,800);
    return()=>clearTimeout(saveTimer.current);
  },[teams,currentHole,courseId,birdieBonus,holePars,ballsByPar,skinsEnabled,bigBoyEnabled,teammatesTie,ctpEnabled,ctpHoles,ctpLeaders,sideBets,tourneyId]);

  // ── Create new tournament in DB ────────────────────────────────────────────
  async function createTourney(builtTeams, ctpOverride){
    if(!user?.id)return null;
    // ctpOverride lets the "Leave it off" reminder path save a clean
    // CTP-off state even before the matching setState calls have flushed.
    const effCtpEnabled=ctpOverride?ctpOverride.enabled:ctpEnabled;
    const effCtpHoles=ctpOverride?ctpOverride.holes:ctpHoles;

    // Generate codes: day+date+unique suffix e.g. WEDS48-ABC
    const now      = new Date();
    const days     = ["SUN","MON","TUES","WEDS","THUR","FRI","SAT"];
    const dayStr   = days[now.getDay()];
    const dateStr  = String(now.getMonth()+1) + String(now.getDate());
    const chars    = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    const suffix   = Array.from({length:3},()=>chars[Math.floor(Math.random()*chars.length)]).join("");
    const publicCode = dayStr + dateStr + "-" + suffix;  // e.g. WEDS48-ABC ← spectators use this
    const secret   = Array.from({length:3},()=>chars[Math.floor(Math.random()*chars.length)]).join("");
    const dirCode  = publicCode + "#" + secret;          // e.g. WEDS48-ABC#XQ7 ← director only

    // Generate a 4-digit PIN for each team captain (sent privately)
    const makePin = () => String(Math.floor(1000 + Math.random() * 9000));
    const teamsWithPins = builtTeams.map(t => ({ ...t, pin: makePin() }));

    const name = COURSES[courseId]?.name + " - " + now.toLocaleDateString("en-US",{month:"short",day:"numeric"});
    const{data}=await sb.from("team_tournaments").insert({
      owner_id:user.id,
      name,
      course_id:courseId,
      birdie_bonus:birdieBonus,
      ball_count_by_par:ballsByPar,
      hole_pars:holePars,
      director_rules:directorRules,
      hole_notes:holeNotes,
      skins_enabled:skinsEnabled,
      big_boy_enabled:bigBoyEnabled,
      teammates_tie:teammatesTie,
      ctp_enabled:effCtpEnabled,
      ctp_holes:effCtpHoles,
      ctp_leaders:{},
      side_bets:[],
      teams:teamsWithPins,
      current_hole:1,
      status:"active",
      director_code:dirCode,       // WEDS48#7XQ — director only
      spectator_code:publicCode,   // WEDS48 — public
    }).select().single();
    if(data){
      setDirectorCode(dirCode);
      setTeams(teamsWithPins);
      lastSyncedTeams.current=snap(teamsWithPins);
      lastSyncedCtp.current=snap({});
      lastSyncedSideBets.current=snap([]);
      lastSavedSnap.current=stateSnap(data);
      await loadSaved();
    }
    return data?.id||null;
  }

  // ── Resume a saved tournament ──────────────────────────────────────────────
  async function resumeTourney(t){
    setLoading(true);
    const{data}=await sb.from("team_tournaments").select("*").eq("id",t.id).single();
    if(data){
      setTourneyId(data.id);
      setCourseId(data.course_id||"south-toledo");
      setBirdieBonus(data.birdie_bonus!==false);
      setBallsByPar(data.ball_count_by_par||(data.count_balls?{3:data.count_balls,4:data.count_balls,5:data.count_balls}:{3:2,4:2,5:2}));
      setHolePars(data.hole_pars||{});
      setDirectorRules(data.director_rules||"");
      setHoleNotes(data.hole_notes||{});
      setNoteHole(1);
      setNoteText((data.hole_notes||{})[1]||"");
      setSkinsEnabled(data.skins_enabled===true);
      setBigBoyEnabled(data.big_boy_enabled===true);
      setTeammatesTie(data.teammates_tie===true);
      setCtpEnabled(data.ctp_enabled===true);
      setCtpHoles(data.ctp_holes||[]);
      setCtpLeaders(data.ctp_leaders||{});
      setSideBets(data.side_bets||[]);
      setTeams(data.teams||[]);
      lastSyncedTeams.current=snap(data.teams||[]);
      lastSyncedCtp.current=snap(data.ctp_leaders||{});
      lastSyncedSideBets.current=snap(data.side_bets||[]);
      lastSavedSnap.current=stateSnap(data);
      setNumTeams((data.teams||[]).length);
      setCurrentHole(data.current_hole||1);
      setActiveTeam(0);
      setDirectorCode(data.director_code||null);
      // Restore the director's own unsaved edits if this phone died before
      // they saved (backup newer than the DB row, and < 7 days old).
      // lastSavedSnap stays as the DB snapshot, so the auto-save effect sees
      // the restored state as dirty and flushes it via merge-on-write —
      // the director's edits win their slots, captains' fresh scores survive.
      try{
        const raw=localStorage.getItem("press_director_pending_"+data.id);
        if(raw){
          const bak=JSON.parse(raw);
          const dbTime=new Date(data.updated_at||0).getTime();
          if(bak&&bak.savedAt>dbTime&&Date.now()-bak.savedAt<7*24*3600*1000){
            const s=JSON.parse(bak.state||"{}");
            if(s.teams) setTeams(s.teams);
            if(s.course_id) setCourseId(s.course_id);
            if(typeof s.birdie_bonus==="boolean") setBirdieBonus(s.birdie_bonus);
            if(s.ball_count_by_par) setBallsByPar(s.ball_count_by_par);
            if(s.hole_pars) setHolePars(s.hole_pars);
            if(typeof s.director_rules==="string") setDirectorRules(s.director_rules);
            if(s.hole_notes) setHoleNotes(s.hole_notes);
            if(typeof s.skins_enabled==="boolean") setSkinsEnabled(s.skins_enabled);
            if(typeof s.big_boy_enabled==="boolean") setBigBoyEnabled(s.big_boy_enabled);
            if(typeof s.teammates_tie==="boolean") setTeammatesTie(s.teammates_tie);
            if(typeof s.ctp_enabled==="boolean") setCtpEnabled(s.ctp_enabled);
            if(s.ctp_holes) setCtpHoles(s.ctp_holes);
            if(s.ctp_leaders) setCtpLeaders(s.ctp_leaders);
            if(s.side_bets) setSideBets(s.side_bets);
            if(s.current_hole) setCurrentHole(s.current_hole);
            setNumTeams((s.teams||[]).length);
            if(bak.lastSyncedTeams) lastSyncedTeams.current=bak.lastSyncedTeams;
            if(bak.lastSyncedCtp) lastSyncedCtp.current=bak.lastSyncedCtp;
          }else{
            localStorage.removeItem("press_director_pending_"+data.id);
          }
        }
      }catch(e){}
      // Go to scoring if: status is active OR any team has scores entered
      // This prevents the setup loop bug where a corrupted status sent director back to setup
      const hasScores=(data.teams||[]).some(t=>Object.keys(t.scores||{}).length>0);
      const goToScoring=data.status==="active"||hasScores;
      // Also fix: if we have scores, repair the DB status right now
      if(hasScores&&data.status!=="active"){
        await sb.from("team_tournaments").update({status:"active",updated_at:new Date().toISOString()}).eq("id",data.id);
      }
      setScreen(goToScoring?"scoring":"setup");
    }
    setLoading(false);
  }

  // ── Delete a saved tournament ──────────────────────────────────────────────
  const[confirmDelete,setConfirmDelete]=useState(null); // id of tourney to delete
  const[deleteInput,setDeleteInput]=useState("");

  async function deleteTourney(id){
    setDeleteInput("");
    setConfirmDelete(id);
  }

  async function confirmDeleteTourney(){
    if(deleteInput.toUpperCase()!=="DELETE")return;
    await sb.from("team_tournaments").delete().eq("id",confirmDelete);
    setSavedTourneys(prev=>prev.filter(t=>t.id!==confirmDelete));
    // Clear ALL active tournament state so home screen updates instantly
    setTourneyId(null);
    setTeams([]);
    lastSyncedTeams.current=null;
    lastSyncedCtp.current=null;
    lastSavedSnap.current=null;
    try{ localStorage.removeItem("press_director_pending_"+confirmDelete); }catch(e){}
    setDirectorCode(null);
    setCurrentHole(1);
    setConfirmDelete(null);
    setDeleteInput("");
    // Tell App.jsx to clear the "Tournament In Progress" banner immediately
    if(onDelete) onDelete();
    setScreen("home");
  }

  function buildTeams(n,existing=[]){
    return Array.from({length:n},(_,i)=>existing[i]||{
      id:i,name:"Team "+(i+1),color:TEAM_COLORS[i%TEAM_COLORS.length],
      size:2,players:["",""],strokesPerSide:0,scores:{}
    });
  }

  function updateTeam(idx,patch){setTeams(prev=>prev.map((t,i)=>i===idx?{...t,...patch}:t));}

  function setPlayerScore(ti,pi,hole,val){
    setTeams(prev=>prev.map((t,i)=>{
      if(i!==ti)return t;
      return{...t,scores:{...t.scores,[pi]:{...(t.scores[pi]||{}),[hole]:val}}};
    }));
  }

  function getPlayerScore(team,pi,hole){
    const v=team.scores?.[pi]?.[hole];
    return(v===undefined||v===null)?null:safeInt(v);
  }

  // ── Side bets: director setup ──────────────────────────────────────────────
  // Strokes live on the bet, never on the tournament. No manual presses here:
  // a manual press is a call made in person, and side-bet opponents may be in
  // different groups — Nassau presses on tournament side bets are auto only.
  function saveBet(){
    if(!betA||!betB){ window.alert("Pick two players first."); return; }
    if(betA===betB){ window.alert("Pick two different players."); return; }
    const parseRef=(v)=>{ const parts=v.split(":"); return {team:parseInt(parts[0],10),pi:parseInt(parts[1],10)}; };
    const count=betStrokesTo==="none"?0:betStrokesCount;
    const strokes=betStrokesTo==="B"?count:betStrokesTo==="A"?-count:0;
    if(strokes!==0&&!courseHasHdcp(courseId)){ window.alert("This course has no handicap data, so strokes can't apply here. Add handicaps first (course picker → Search for a course… → Edit a saved course), or set strokes to No strokes."); return; }
    const bet={ id:"bet_"+Date.now()+"_"+Math.floor(Math.random()*1000),
      a:parseRef(betA), b:parseRef(betB), betType, betAmount,
      strokes, pressDown:betType==="nassau-press"?betPressDown:2 };
    setSideBets(prev=>[...prev, bet]);
    setShowBetSetup(false);
  }

  function getLeaderboard(){
    return teams.map(t=>({...t,sc:calcTeamScore(t.scores,t.size,course.holes,birdieBonus,ballsByPar,holePars)}))
      .sort((a,b)=>a.sc.totalDiff-b.sc.totalDiff);
  }

  const holeData=course?.holes[currentHole-1];
  const isLastHole=currentHole===(course?.holes?.length||18);

  // JOIN (spectator / captain / director via code entry)
  // HOME
  if(screen==="home"){
    // Show in "active" section: status=active OR has any scores (guards against status corruption)
    // "In Progress" = has scores entered OR past hole 1
    // "Saved Setups" = no scores yet AND still on hole 1 (just created, not started)
    const hasAnyScores = t => (t.teams||[]).some(tm=>Object.keys(tm?.scores||{}).length>0);
    const active=(savedTourneys||[]).filter(t=> hasAnyScores(t)||(t.current_hole||1)>1 );
    const setups=(savedTourneys||[]).filter(t=> !hasAnyScores(t)&&(t.current_hole||1)<=1 );
    return(
      <div style={{fontFamily:"Georgia,serif",minHeight:"100vh",background:C.bg,color:C.text,paddingBottom:40,position:"relative"}}>
        <div style={{background:"linear-gradient(180deg,"+C.card+" 0%,transparent 100%)",padding:"50px 24px 24px"}}>
          <button onClick={onBack} style={{background:"rgba(123,180,80,0.15)",border:"1px solid "+C.green,color:C.green,fontSize:13,cursor:"pointer",padding:"8px 16px",borderRadius:20,fontWeight:700,marginBottom:20}}>‹ Back</button>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:48}}>🏆</div>
            <div style={{fontSize:26,fontWeight:800,marginTop:8}}>Team Tournament</div>
            <div style={{fontSize:13,color:C.muted,marginTop:4}}>2 Best Ball · Front / Back / Total</div>
          </div>
        </div>

        <div style={{padding:"0 20px"}}>

          {/* Active (in-progress) tournaments */}
          {active.length>0&&(
            <div style={{marginBottom:20}}>
              <div style={{fontSize:11,color:C.gold,letterSpacing:1.5,textTransform:"uppercase",marginBottom:10,fontWeight:600}}>▶ In Progress</div>
              {active.map(t=>(
                <div key={t.id} style={{background:"rgba(232,184,75,0.08)",border:"1px solid "+C.gold+"44",borderRadius:14,padding:"14px 16px",marginBottom:8}}>
                  {confirmDelete===t.id?(
                    <div>
                      <div style={{fontSize:13,color:C.red,fontWeight:700,marginBottom:8,textAlign:"center"}}>⚠️ Type DELETE to confirm</div>
                      <input autoFocus value={deleteInput} onChange={e=>setDeleteInput(e.target.value)}
                        placeholder="Type DELETE" autoCapitalize="characters"
                        style={{width:"100%",padding:"12px",background:C.bg,border:`2px solid ${deleteInput.toUpperCase()==="DELETE"?"rgba(224,80,80,0.6)":C.border}`,borderRadius:8,color:C.red,fontSize:16,fontWeight:800,outline:"none",textAlign:"center",letterSpacing:3,boxSizing:"border-box",fontFamily:"monospace",marginBottom:10}}
                      />
                      <div style={{display:"flex",gap:8}}>
                        <button onClick={()=>{setConfirmDelete(null);setDeleteInput("");}} style={{flex:2,padding:"12px",background:C.green,color:"#0a1a0f",border:"none",borderRadius:10,fontSize:14,fontWeight:800,cursor:"pointer"}}>Keep It ✓</button>
                        <button onClick={confirmDeleteTourney} disabled={deleteInput.toUpperCase()!=="DELETE"}
                          style={{flex:1,padding:"12px",background:deleteInput.toUpperCase()==="DELETE"?"rgba(224,80,80,0.2)":"transparent",color:deleteInput.toUpperCase()==="DELETE"?C.red:C.dim,border:`1px solid ${deleteInput.toUpperCase()==="DELETE"?"rgba(224,80,80,0.5)":C.border}`,borderRadius:10,fontSize:13,fontWeight:700,cursor:deleteInput.toUpperCase()==="DELETE"?"pointer":"not-allowed"}}>Delete</button>
                      </div>
                    </div>
                  ):(
                    <>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:2}}>
                        <div style={{fontWeight:700,fontSize:15,color:C.gold}}>{t.name||"Tournament"}</div>
                        <button onClick={()=>deleteTourney(t.id)} style={{background:"transparent",border:"none",color:C.muted,fontSize:18,cursor:"pointer",padding:"0 4px"}}>✕</button>
                      </div>
                      <div style={{fontSize:11,color:C.muted,marginBottom:4}}>
                        {COURSES[t.course_id]?.name||t.course_id} · Hole {t.current_hole} · {(t.teams||[]).length} teams
                      </div>
                      {/* Lock notice — active tournament links are permanent */}
                      <div style={{fontSize:10,color:"rgba(232,184,75,0.6)",marginBottom:10}}>
                        🔒 Links locked — captain links are permanent for this tournament
                      </div>
                      <div style={{display:"flex",gap:8}}>
                        <button onClick={()=>resumeTourney(t)} disabled={loading} style={{flex:2,padding:"11px",background:C.gold,color:"#0a1a0f",border:"none",borderRadius:10,fontSize:14,fontWeight:800,cursor:"pointer"}}>
                          {loading?"Loading...":"Resume Round"}
                        </button>
                        <button onClick={async()=>{await resumeTourney(t);setScreen("leaderboard");}} style={{flex:1,padding:"11px",background:"transparent",color:C.gold,border:"1px solid "+C.gold+"44",borderRadius:10,fontSize:13,fontWeight:700,cursor:"pointer"}}>
                          📊 LB
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Saved setups (pre-built, not started — no DB lock yet) */}
          {setups.length>0&&(
            <div style={{marginBottom:20}}>
              <div style={{fontSize:11,color:C.green,letterSpacing:1.5,textTransform:"uppercase",marginBottom:10,fontWeight:600}}>📋 Saved Setups</div>
              {setups.map(t=>(
                <div key={t.id} style={{background:C.card,border:"1px solid "+C.border,borderRadius:14,padding:"14px 16px",marginBottom:8}}>
                  {confirmDelete===t.id?(
                    <div>
                      <div style={{fontSize:13,color:C.red,fontWeight:700,marginBottom:8,textAlign:"center"}}>⚠️ Type DELETE to confirm</div>
                      <input autoFocus value={deleteInput} onChange={e=>setDeleteInput(e.target.value)}
                        placeholder="Type DELETE" autoCapitalize="characters"
                        style={{width:"100%",padding:"12px",background:C.bg,border:`2px solid ${deleteInput.toUpperCase()==="DELETE"?"rgba(224,80,80,0.6)":C.border}`,borderRadius:8,color:C.red,fontSize:16,fontWeight:800,outline:"none",textAlign:"center",letterSpacing:3,boxSizing:"border-box",fontFamily:"monospace",marginBottom:10}}
                      />
                      <div style={{display:"flex",gap:8}}>
                        <button onClick={()=>{setConfirmDelete(null);setDeleteInput("");}} style={{flex:2,padding:"12px",background:C.green,color:"#0a1a0f",border:"none",borderRadius:10,fontSize:14,fontWeight:800,cursor:"pointer"}}>Keep It ✓</button>
                        <button onClick={confirmDeleteTourney} disabled={deleteInput.toUpperCase()!=="DELETE"}
                          style={{flex:1,padding:"12px",background:deleteInput.toUpperCase()==="DELETE"?"rgba(224,80,80,0.2)":"transparent",color:deleteInput.toUpperCase()==="DELETE"?C.red:C.dim,border:`1px solid ${deleteInput.toUpperCase()==="DELETE"?"rgba(224,80,80,0.5)":C.border}`,borderRadius:10,fontSize:13,fontWeight:700,cursor:deleteInput.toUpperCase()==="DELETE"?"pointer":"not-allowed"}}>Delete</button>
                      </div>
                    </div>
                  ):(
                    <>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                        <div style={{fontWeight:700,fontSize:15}}>{t.name||"Tournament Setup"}</div>
                        <button onClick={()=>deleteTourney(t.id)} style={{background:"transparent",border:"none",color:C.muted,fontSize:18,cursor:"pointer",padding:"0 4px"}}>✕</button>
                      </div>
                      <div style={{fontSize:11,color:C.muted,marginBottom:4}}>
                        {COURSES[t.course_id]?.name||t.course_id} · {(t.teams||[]).length} teams · Last edited {new Date(t.updated_at).toLocaleDateString()}
                      </div>
                      <div style={{fontSize:10,color:C.green,marginBottom:10}}>
                        🔗 Links ready — send to captains, then open setup to start
                      </div>
                      <div style={{display:"flex",gap:8}}>
                        <button onClick={()=>resumeTourney(t)} disabled={loading} style={{flex:1,padding:"11px",background:C.green,color:"#0a1a0f",border:"none",borderRadius:10,fontSize:13,fontWeight:800,cursor:"pointer"}}>
                          {loading?"Loading...":"Open Setup & Links"}
                        </button>
                        <button onClick={async()=>{
                          // Resume the setup — goes to setup screen where links are visible
                          await resumeTourney(t);
                          // resumeTourney sets screen to "setup" for status=setup tournaments
                        }} style={{flex:1,padding:"11px",background:"transparent",color:C.green,border:"1px solid "+C.green+"44",borderRadius:10,fontSize:13,fontWeight:700,cursor:"pointer"}}>
                          ✏️ Open Setup
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* New tournament — creates DB entry immediately so links are available on setup screen */}
          <BigBtn onClick={async()=>{
            // Reset all settings first
            const freshTeams = buildTeams(numTeams);
            setTeams(freshTeams);
            setCurrentHole(1);
            setActiveTeam(0);
            setCourseId("south-toledo");
            setBirdieBonus(true);
            setBallsByPar({3:2,4:2,5:2});
            setHolePars({});
            setDirectorRules("");
            setHoleNotes({});
            setNoteHole(1);
            setNoteText("");
            setSkinsEnabled(false);
            setBigBoyEnabled(false);
            setCtpEnabled(false);
            setCtpHoles([]);
            setCtpLeaders({});
            setDirectorCode(null);
            setTourneyId(null);
            lastSyncedTeams.current=null;
            lastSyncedCtp.current=null;
            lastSavedSnap.current=null;
            // Go to setup — DB entry created when director hits Tee It Up (or when they save)
            setScreen("setup");
          }}>+ New Tournament Setup</BigBtn>

          <div style={{height:10}}/>
          <GhostBtn onClick={onBack}>← Back to Press</GhostBtn>
          <div style={{height:8}}/>
          <button onClick={()=>setShowHelp(true)} style={{width:"100%",padding:"12px",background:"transparent",color:C.muted,border:"none",fontSize:13,cursor:"pointer"}}>
            ❓ How does this work?
          </button>
        </div>

        {showHelp&&(
          <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.92)",zIndex:800,overflowY:"auto",padding:"20px"}}>
            <div style={{background:C.surface,borderRadius:20,padding:"24px",border:"1px solid "+C.border,maxWidth:500,margin:"0 auto"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
                <div style={{fontSize:18,fontWeight:800}}>How It Works</div>
                <button onClick={()=>setShowHelp(false)} style={{background:C.dim,border:"none",color:C.muted,width:32,height:32,borderRadius:"50%",fontSize:16,cursor:"pointer"}}>✕</button>
              </div>

              {[
                {icon:"[D]",title:"Director",desc:"Creates the tournament, sets teams and players, sends captain links. Can edit any score at any time."},
                {icon:"[C]",title:"Team Captain",desc:"Gets a direct link texted to their phone. Tap the link to enter scores hole by hole. Can fix any hole anytime."},
                {icon:"[S]",title:"Spectator",desc:"Gets a direct link to watch the live leaderboard. No account needed. Updates in real time."},
              ].map((r,i)=>(
                <div key={i} style={{background:C.card,border:"1px solid "+C.border,borderRadius:12,padding:"14px",marginBottom:10}}>
                  <div style={{fontSize:13,fontWeight:700,marginBottom:4}}>{r.icon} {r.title}</div>
                  <div style={{fontSize:12,color:C.muted,lineHeight:1.6}}>{r.desc}</div>
                </div>
              ))}

              <div style={{fontSize:11,color:C.green,letterSpacing:1.5,textTransform:"uppercase",margin:"16px 0 8px",fontWeight:600}}>How Links Work</div>
              {[
                {label:"Captain link",desc:"Each captain gets their own unique link. Tap it and you go straight into scoring — no login, no code needed."},
                {label:"Spectator link",desc:"Anyone with the spectator link can watch the live leaderboard. Share it in your group chat before teeing off."},
              ].map((r,i)=>(
                <div key={i} style={{background:C.card,border:"1px solid "+C.border,borderRadius:12,padding:"14px",marginBottom:8}}>
                  <div style={{fontSize:12,color:C.green,fontWeight:700,marginBottom:4}}>{r.label}</div>
                  <div style={{fontSize:12,color:C.muted}}>{r.desc}</div>
                </div>
              ))}

              <div style={{fontSize:11,color:C.green,letterSpacing:1.5,textTransform:"uppercase",margin:"16px 0 8px",fontWeight:600}}>Scoring Rules</div>
              {[
                {title:"2 Best Ball",desc:"The 2 lowest scores on your team count every hole. App picks them automatically - marked COUNTS."},
                {title:"Birdie Bonus",desc:"3+ birdies/eagles on a hole = extra strokes off. Each player beyond the top 2 adds their vs-par value."},
                {title:"Front / Back / Total",desc:"Three separate bets. Scores show as -2, E, +3 vs par. Leaderboard ranks by total."},
                {title:"Strokes per side",desc:"Set per team. 3-man team typically gets 2 strokes/side vs a 4-man team."},
              ].map((r,i)=>(
                <div key={i} style={{background:C.card,border:"1px solid "+C.border,borderRadius:12,padding:"14px",marginBottom:8}}>
                  <div style={{fontSize:13,fontWeight:700,marginBottom:4}}>{r.title}</div>
                  <div style={{fontSize:12,color:C.muted,lineHeight:1.6}}>{r.desc}</div>
                </div>
              ))}

              <div style={{height:16}}/>
              <button onClick={()=>setShowHelp(false)} style={{width:"100%",padding:"16px",background:C.green,color:"#0a1a0f",border:"none",borderRadius:12,fontSize:15,fontWeight:800,cursor:"pointer"}}>Got it ✓</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // SETUP
  if(screen==="setup"){
    return(
      <div style={{fontFamily:"Georgia,serif",minHeight:"100vh",background:C.bg,color:C.text,paddingBottom:60}}>
        <div style={{background:"linear-gradient(180deg,"+C.card+" 0%,transparent 100%)",padding:"50px 20px 20px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
            <button onClick={()=>setScreen("home")} style={{background:"rgba(123,180,80,0.15)",border:"1px solid "+C.green,color:C.green,fontSize:13,cursor:"pointer",padding:"8px 16px",borderRadius:20,fontWeight:700}}>‹ Home</button>
            <div style={{fontSize:11,color:saveStatus==="saving"?C.gold:C.green,fontWeight:600}}>
              {saveStatus==="saving"?"Saving...":saveStatus==="saved"?"Saved":""}
            </div>
          </div>
          <div style={{fontSize:22,fontWeight:800,textAlign:"center"}}>Tournament Setup</div>
          <div style={{fontSize:12,color:C.muted,textAlign:"center",marginTop:4}}>Auto-saved · come back anytime</div>
        </div>
        <div style={{padding:"0 20px"}}>

          {/* Course — no dropdown: the selected course is a card on top,
              Search sits right underneath it, front and center, and the
              saved courses are a plain tap list below that. Most golfers
              live in the saved list; nobody has to open a menu to find
              anything. Tapping the already-selected course does nothing,
              so it can't wipe the hole-par overrides below. */}
          <div style={{marginBottom:16}}>
            <Lbl>Course</Lbl>
            <div style={{background:C.card,border:"1px solid "+C.green,borderRadius:10,padding:"14px 16px",marginBottom:10}}>
              <div style={{fontSize:11,color:C.muted,letterSpacing:1.5,textTransform:"uppercase",marginBottom:2}}>Selected</div>
              <div style={{fontSize:17,fontWeight:800}}>{course?course.name+" — Par "+course.par:"Choose a course below"}</div>
              {course?.city ? <div style={{fontSize:12,color:C.muted,marginTop:2}}>{course.city}</div> : null}
            </div>
            <button onClick={()=>setShowCourseSearch(true)}
              style={{width:"100%",padding:"14px",background:C.green,color:"#0a1a0f",border:"none",borderRadius:10,fontWeight:800,fontSize:15,cursor:"pointer",marginBottom:12}}>
              🔍 Search courses
            </button>
            <div style={{fontSize:11,color:C.muted,letterSpacing:1.5,textTransform:"uppercase",marginBottom:6}}>Saved courses</div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {Object.entries(COURSES).map(([id,c])=>{
                const selected=id===courseId;
                return(
                  <div key={id}>
                    <div style={{display:"flex",gap:8}}>
                      <button onClick={()=>{ if(id!==courseId){ setCourseId(id); setHolePars({}); setHoleNotes({}); setNoteText(""); } }}
                        style={{flex:1,textAlign:"left",padding:"12px 14px",background:selected?"rgba(123,180,80,0.15)":C.surface,border:"1px solid "+(selected?C.green:C.border),borderRadius:10,color:C.text,cursor:"pointer"}}>
                        <div style={{fontWeight:selected?800:600,fontSize:15}}>{selected?"✓ ":""}{c.name} — Par {c.par}</div>
                        {c.city ? <div style={{fontSize:12,color:C.muted}}>{c.city}</div> : null}
                      </button>
                      {isLibraryCourse(id) && (
                        <button onClick={()=>setDeleteCourseId(id)} aria-label={"Delete "+c.name}
                          style={{padding:"12px 16px",background:"transparent",border:"1px solid "+C.red,color:C.red,borderRadius:10,fontSize:16,fontWeight:800,cursor:"pointer"}}>
                          ✕
                        </button>
                      )}
                    </div>
                    {deleteCourseId===id && (
                      <CourseDeletePanel course={{id, name:c.name}} C={C}
                        onDone={()=>setDeleteCourseId(null)}
                        onDeleted={(gone)=>{ setDeleteCourseId(null); if(gone===courseId){ const rest=Object.keys(COURSES); setCourseId(rest.length?rest[0]:""); setHolePars({}); setHoleNotes({}); setNoteText(""); } }} />
                    )}
                  </div>
                );
              })}
            </div>
            <div ref={searchPanelRef}>
              {showCourseSearch && <CourseSearch C={C} onClose={()=>setShowCourseSearch(false)} onPick={id=>{ setCourseId(id); setHolePars({}); setHoleNotes({}); setNoteText(""); setShowCourseSearch(false); }} />}
            </div>
          </div>

          {/* Hole Pars — this round only (generalized #4 switch, every hole) */}
          {course&&(
            <div style={{background:C.card,border:"1px solid "+C.border,borderRadius:12,padding:"14px 16px",marginBottom:16}}>
              <div style={{fontWeight:700,fontSize:15,marginBottom:4}}>Hole Pars — this round only</div>
              <div style={{fontSize:11,color:C.muted,marginBottom:12}}>Normally the card's pars. Change any hole for today's conditions — a fallen tree, a temp green, the #4 switch. The course card itself never changes.</div>
              <div style={{fontSize:13,marginBottom:12}}>Playing par: <b>{course.holes.reduce((a,h)=>a+(holePars[h.hole]??h.par),0)}</b> <span style={{color:C.muted}}>(card: {course.par})</span></div>
              {[["Front 9","front"],["Back 9","back"]].map(([lbl,side])=>(
                <div key={side}>
                  <div style={{fontSize:11,color:C.green,letterSpacing:1.5,textTransform:"uppercase",margin:"10px 0 6px",fontWeight:600}}>{lbl}</div>
                  {course.holes.filter(h=>h.side===side).map(h=>{
                    const pp=holePars[h.hole]??h.par, changed=pp!==h.par;
                    return(
                      <div key={h.hole} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 0",borderTop:"1px solid rgba(255,255,255,0.08)"}}>
                        <div style={{minWidth:104}}>
                          <div style={{fontWeight:700,fontSize:13}}>Hole {h.hole}{changed&&<span style={{fontSize:9,fontWeight:800,color:"#0a1a0f",background:C.gold,borderRadius:8,padding:"1px 5px",marginLeft:6}}>CHANGED</span>}</div>
                          <div style={{fontSize:10,color:C.muted}}>Card: Par {h.par} · Hdcp {h.hdcp}</div>
                        </div>
                        <div style={{display:"flex",gap:6,marginLeft:"auto"}}>
                          {[3,4,5].map(p=>(
                            <button key={p} onClick={()=>setHolePars(prev=>({...prev,[h.hole]:p}))}
                              style={{width:40,padding:"9px 0",textAlign:"center",borderRadius:10,fontSize:14,fontWeight:pp===p?800:600,cursor:"pointer",
                                background:pp===p?C.green:"#1a2a1a",color:pp===p?"#0a1a0f":"#ffffff",
                                border:"2px solid "+(pp===p?C.green:"rgba(255,255,255,0.3)")}}>
                              {p}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
              {course.holes.filter(h=>(holePars[h.hole]??h.par)!==h.par).length>0&&(
                <div>
                  <div style={{fontSize:11,color:C.gold,marginTop:10,textAlign:"center"}}>
                    Changed this round: {course.holes.filter(h=>(holePars[h.hole]??h.par)!==h.par).map(h=>`Hole ${h.hole} → Par ${holePars[h.hole]}`).join(" · ")}
                  </div>
                  <button onClick={()=>setHolePars({})} style={{marginTop:8,width:"100%",padding:"10px",borderRadius:10,border:"1px solid rgba(255,255,255,0.3)",background:"transparent",color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer"}}>Reset all to card pars</button>
                </div>
              )}
            </div>
          )}

          {/* Rules & hole notes — director only */}
          {course&&(
            <div style={{background:C.card,border:"1px solid "+C.border,borderRadius:12,padding:"14px 16px",marginBottom:16}}>
              <div style={{fontWeight:700,fontSize:15,marginBottom:4}}>Rules &amp; hole notes</div>
              <div style={{fontSize:11,color:C.muted,marginBottom:12}}>Director only. Rules cover the whole round; a hole note shows right on that hole's scoring screen — and on the Rules page. Captains can read both, never change them.</div>
              <div style={{fontSize:13,fontWeight:700,marginBottom:6}}>Tournament rules</div>
              <textarea value={directorRules} onChange={e=>setDirectorRules(e.target.value)} rows={2} placeholder="e.g. Lift clean and place in the fairways."
                style={{width:"100%",background:"#0a0f0a",border:"1px solid rgba(255,255,255,0.2)",borderRadius:10,color:"#fff",fontSize:14,padding:"10px",fontFamily:"inherit"}}/>
              <div style={{fontSize:13,fontWeight:700,margin:"12px 0 6px"}}>Hole note</div>
              <div style={{display:"flex",gap:8}}>
                <select value={noteHole} onChange={e=>{const hn=parseInt(e.target.value,10); if(noteText.trim()) setHoleNotes(prev=>({...prev,[noteHole]:noteText.trim()})); setNoteHole(hn); setNoteText(holeNotes[hn]||"");}}
                  style={{background:"#0a0f0a",border:"1px solid rgba(255,255,255,0.2)",borderRadius:10,color:"#fff",fontSize:14,padding:"10px"}}>
                  {course.holes.map(h=><option key={h.hole} value={h.hole}>Hole {h.hole}</option>)}
                </select>
                <input value={noteText} onChange={e=>setNoteText(e.target.value)} placeholder="Note for this hole (optional)"
                  style={{flex:1,minWidth:0,background:"#0a0f0a",border:"1px solid rgba(255,255,255,0.2)",borderRadius:10,color:"#fff",fontSize:14,padding:"10px"}}/>
                <button onClick={()=>{
                  if(noteText.trim()) setHoleNotes(prev=>({...prev,[noteHole]:noteText.trim()}));
                  else setHoleNotes(prev=>{const n={...prev};delete n[noteHole];return n;});
                }} style={{padding:"10px 14px",borderRadius:10,border:"none",background:C.green,color:"#0a1a0f",fontSize:13,fontWeight:800,cursor:"pointer",flexShrink:0}}>Save note</button>
              </div>
              {Object.keys(holeNotes).filter(hn=>String(holeNotes[hn]||"").trim()!=="").sort((a,b)=>a-b).map(hn=>(
                <div key={hn} style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,fontSize:13,marginTop:8,background:"rgba(123,180,80,0.08)",borderRadius:8,padding:"8px 10px"}}>
                  <span>Hole {hn} — {holeNotes[hn]}</span>
                  <button onClick={()=>{setHoleNotes(prev=>{const n={...prev};delete n[hn];return n;}); if(parseInt(hn,10)===noteHole) setNoteText("");}} aria-label={"Remove note for hole "+hn}
                    style={{background:"transparent",border:"none",color:C.red,fontSize:16,fontWeight:800,cursor:"pointer",padding:"0 4px",flexShrink:0}}>✕</button>
                </div>
              ))}
            </div>
          )}

          {/* Birdie Bonus */}
          <div style={{background:C.card,border:"1px solid "+C.border,borderRadius:12,padding:"14px 16px",marginBottom:16}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontWeight:700,fontSize:15}}>Birdie Bonus</div>
                <div style={{fontSize:11,color:C.muted,marginTop:3}}>{birdieBonus?"3+ birdies on a hole = extra -1 per additional birdie":"Off for this tournament"}</div>
              </div>
              <button onClick={()=>setBirdieBonus(b=>!b)} style={{width:52,height:28,borderRadius:14,border:"none",cursor:"pointer",background:birdieBonus?C.green:"#333",position:"relative",transition:"background 0.2s",flexShrink:0}}>
                <div style={{position:"absolute",top:4,left:birdieBonus?26:4,width:20,height:20,borderRadius:"50%",background:"#fff",transition:"left 0.2s"}}/>
              </button>
            </div>
          </div>

          {/* Skins */}
          <div style={{background:C.card,border:"1px solid "+C.border,borderRadius:12,padding:"14px 16px",marginBottom:skinsEnabled?8:16}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontWeight:700,fontSize:15}}>💰 Skins Game</div>
                <div style={{fontSize:11,color:C.muted,marginTop:3}}>{skinsEnabled?"Tracking skins - live tab in leaderboard":"Off for this tournament"}</div>
              </div>
              <button onClick={()=>{setSkinsEnabled(b=>!b);if(skinsEnabled)setBigBoyEnabled(false);}} style={{width:52,height:28,borderRadius:14,border:"none",cursor:"pointer",background:skinsEnabled?C.green:"#333",position:"relative",transition:"background 0.2s",flexShrink:0}}>
                <div style={{position:"absolute",top:4,left:skinsEnabled?26:4,width:20,height:20,borderRadius:"50%",background:"#fff",transition:"left 0.2s"}}/>
              </button>
            </div>
          </div>

          {/* Big Boy — only shows when skins on */}
          {skinsEnabled&&(
            <div style={{background:"rgba(232,184,75,0.06)",border:"1px solid rgba(232,184,75,0.25)",borderRadius:12,padding:"14px 16px",marginBottom:16,marginLeft:8}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontWeight:700,fontSize:14,color:C.gold}}>⭐ Big Boy Skins</div>
                  <div style={{fontSize:11,color:C.muted,marginTop:3}}>{bigBoyEnabled?"Opt-in parallel game - BB players only":"Off"}</div>
                </div>
                <button onClick={()=>setBigBoyEnabled(b=>!b)} style={{width:52,height:28,borderRadius:14,border:"none",cursor:"pointer",background:bigBoyEnabled?C.gold:"#333",position:"relative",transition:"background 0.2s",flexShrink:0}}>
                  <div style={{position:"absolute",top:4,left:bigBoyEnabled?26:4,width:20,height:20,borderRadius:"50%",background:"#fff",transition:"left 0.2s"}}/>
                </button>
              </div>
              {bigBoyEnabled&&<div style={{fontSize:11,color:C.gold,marginTop:8,lineHeight:1.5}}>Mark players "BB" on each team's setup below. BB players compete only against other BB players — no teammate exception.</div>}
            </div>
          )}

          {/* Teammate tie rule — only shows when skins on */}
          {skinsEnabled&&(
            <div style={{background:"rgba(224,80,80,0.06)",border:"1px solid rgba(224,80,80,0.2)",borderRadius:12,padding:"14px 16px",marginBottom:16,marginLeft:8}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontWeight:700,fontSize:14,color:C.text}}>Teammate Ties Cancel Skin</div>
                  <div style={{fontSize:11,color:C.muted,marginTop:2}}>{teammatesTie?"Stricter - teammates tie = skin carries":"Default - teammates don't cancel, team wins"}</div>
                </div>
                <button onClick={()=>setTeammatesTie(b=>!b)} style={{width:52,height:28,borderRadius:14,border:"none",cursor:"pointer",background:teammatesTie?C.red:"#333",position:"relative",transition:"background 0.2s",flexShrink:0}}>
                  <div style={{position:"absolute",top:4,left:teammatesTie?26:4,width:20,height:20,borderRadius:"50%",background:"#fff",transition:"left 0.2s"}}/>
                </button>
              </div>
            </div>
          )}

          {/* CTP — Closest to the Pin */}
          <div id="ctp-setup-section" style={{background:C.card,border:"1px solid "+C.border,borderRadius:12,padding:"14px 16px",marginBottom:ctpEnabled?8:16}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontWeight:700,fontSize:15}}>📍 Closest to the Pin</div>
                <div style={{fontSize:11,color:C.muted,marginTop:3}}>{ctpEnabled?"Select which holes are CTP below":"Off for this tournament"}</div>
              </div>
              <button onClick={()=>{setCtpEnabled(b=>!b);if(ctpEnabled)setCtpHoles([]);}} style={{width:52,height:28,borderRadius:14,border:"none",cursor:"pointer",background:ctpEnabled?"#e8b84b":"#333",position:"relative",transition:"background 0.2s",flexShrink:0}}>
                <div style={{position:"absolute",top:4,left:ctpEnabled?26:4,width:20,height:20,borderRadius:"50%",background:"#fff",transition:"left 0.2s"}}/>
              </button>
            </div>
          </div>

          {/* CTP hole selector — shows when CTP enabled */}
          {ctpEnabled&&(
            <div style={{background:"rgba(232,184,75,0.06)",border:"1px solid rgba(232,184,75,0.25)",borderRadius:12,padding:"14px 16px",marginBottom:16,marginLeft:8}}>
              <div style={{fontWeight:700,fontSize:13,color:C.gold,marginBottom:4}}>📍 Select CTP Holes</div>
              <div style={{fontSize:11,color:C.muted,marginBottom:12}}>Tap to mark a hole as Closest to the Pin. Par 3s recommended — use your Press Golf tape measure!</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                {course.holes.map(h=>{
                  const effPar=holePars[h.hole]??h.par;
                  const isSelected=ctpHoles.includes(h.hole);
                  const isPar3=effPar===3;
                  return(
                    <button key={h.hole} onClick={()=>setCtpHoles(prev=>isSelected?prev.filter(x=>x!==h.hole):[...prev,h.hole])}
                      style={{
                        width:52,height:52,borderRadius:10,
                        background:isSelected?C.gold:"rgba(255,255,255,0.06)",
                        color:isSelected?"#0a1a0f":isPar3?C.gold:C.muted,
                        border:"2px solid "+(isSelected?C.gold:isPar3?"rgba(232,184,75,0.4)":"rgba(255,255,255,0.15)"),
                        fontWeight:isSelected?800:600,fontSize:13,cursor:"pointer",
                        display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:1
                      }}>
                      <span style={{fontSize:15,fontWeight:800}}>{h.hole}</span>
                      <span style={{fontSize:8,opacity:0.8}}>P{effPar}</span>
                    </button>
                  );
                })}
              </div>
              {ctpHoles.length>0&&(
                <div style={{marginTop:12,fontSize:12,color:C.gold}}>
                  📍 CTP on holes: {ctpHoles.sort((a,b)=>a-b).join(", ")} · Captains enter distance on scoring screen
                </div>
              )}
            </div>
          )}
          <div style={{background:C.card,border:"1px solid "+C.border,borderRadius:12,padding:"14px 16px",marginBottom:16}}>
            <div style={{fontWeight:700,fontSize:15,marginBottom:2}}>Scores That Count Per Hole</div>
            <div style={{fontSize:11,color:C.muted,marginBottom:12}}>Set per par value. Tap a number to change. Quick-set all at once with the bottom row.</div>
            {[3,4,5].map(par=>(
              <div key={par} style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                <div style={{width:44,fontSize:13,fontWeight:700,color:C.text,flexShrink:0}}>Par {par}</div>
                <div style={{display:"flex",gap:6,flex:1}}>
                  {[1,2,3,4,5].map(n=>(
                    <button key={n} onClick={()=>setBallsByPar(prev=>({...prev,[par]:n}))} style={{
                      flex:1,padding:"12px 4px",
                      background:ballsByPar[par]===n?C.green:"rgba(255,255,255,0.08)",
                      color:ballsByPar[par]===n?"#0a1a0f":"#ffffff",
                      border:"1px solid "+(ballsByPar[par]===n?C.green:"rgba(255,255,255,0.25)"),
                      borderRadius:8,fontSize:15,fontWeight:ballsByPar[par]===n?800:600,cursor:"pointer"
                    }}>{n}</button>
                  ))}
                </div>
              </div>
            ))}
            <div style={{borderTop:"1px solid "+C.border,paddingTop:12,marginTop:6}}>
              <div style={{fontSize:12,color:C.text,fontWeight:600,marginBottom:8,textAlign:"center"}}>Quick-set all pars at once</div>
              <div style={{display:"flex",gap:6}}>
                {[1,2,3,4,5].map(n=>(
                  <button key={n} onClick={()=>setBallsByPar({3:n,4:n,5:n})} style={{
                    flex:1,padding:"12px 4px",
                    background:ballsByPar[3]===n&&ballsByPar[4]===n&&ballsByPar[5]===n?C.gold:"rgba(255,255,255,0.08)",
                    color:ballsByPar[3]===n&&ballsByPar[4]===n&&ballsByPar[5]===n?"#0a1a0f":"#ffffff",
                    border:"1px solid "+(ballsByPar[3]===n&&ballsByPar[4]===n&&ballsByPar[5]===n?C.gold:"rgba(255,255,255,0.25)"),
                    borderRadius:8,fontSize:15,fontWeight:700,cursor:"pointer"
                  }}>{n}</button>
                ))}
              </div>
            </div>
          </div>

          {/* Num teams */}
          <div style={{background:C.card,border:"1px solid "+C.border,borderRadius:12,padding:"14px 16px",marginBottom:16}}>
            <Lbl>Number of Teams</Lbl>
            <NumStepper value={numTeams} min={2} max={20} onChange={n=>{
              setNumTeams(n);
              setTeams(prev=>buildTeams(n,prev));
            }}/>
            <div style={{fontSize:11,color:C.muted,marginTop:8,textAlign:"center"}}>{numTeams} teams</div>
          </div>

          {/* Per-team */}
          {teams.map((team,i)=>(
            <div key={i} style={{background:C.card,border:"1px solid "+C.border,borderRadius:14,padding:"16px",marginBottom:12}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
                <div style={{width:14,height:14,borderRadius:"50%",background:team.color,flexShrink:0}}/>
                <input value={team.name} onChange={e=>updateTeam(i,{name:e.target.value})} placeholder={"Team "+(i+1)}
                  style={{flex:1,padding:"10px",background:C.surface,border:"1px solid "+C.border,borderRadius:8,color:C.text,fontSize:15,outline:"none",fontWeight:700}}/>
              </div>
              <div style={{marginBottom:10}}>
                <NumStepper label={team.size===1?"Players on team (Individual)":"Players on team"} value={team.size} min={1} max={6} onChange={size=>{
                  const players=Array.from({length:size},(_,j)=>team.players[j]||"");
                  updateTeam(i,{size,players});
                }}/>
                {team.size===1&&<div style={{fontSize:11,color:C.gold,marginTop:4,paddingLeft:4}}>⭐ Individual mode — use for skins games or 1v1 matchups</div>}
              </div>
              <div style={{marginBottom:12}}>
                <NumStepper label="Strokes received per side" value={team.strokesPerSide} min={0} max={9} onChange={v=>updateTeam(i,{strokesPerSide:v})}/>
                {team.strokesPerSide>0&&<div style={{fontSize:11,color:C.gold,marginTop:4,paddingLeft:4}}>Starts {team.strokesPerSide*2} under par for the round</div>}
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {Array.from({length:team.size},(_,j)=>(
                  <div key={j} style={{display:"flex",alignItems:"center",gap:8}}>
                    <input value={team.players[j]||""} onChange={e=>{const p=[...team.players];p[j]=e.target.value;updateTeam(i,{players:p});}}
                      placeholder={"Player "+(j+1)} style={{flex:1,padding:"10px",background:C.surface,border:"1px solid "+C.border,borderRadius:8,color:C.text,fontSize:13,outline:"none"}}/>
                    {bigBoyEnabled&&(
                      <button onClick={()=>{const bb=[...(team.bigBoy||Array(team.size).fill(false))];bb[j]=!bb[j];updateTeam(i,{bigBoy:bb});}}
                        style={{flexShrink:0,padding:"10px 14px",borderRadius:10,fontSize:12,fontWeight:800,cursor:"pointer",letterSpacing:0.5,
                          background:(team.bigBoy?.[j])?C.gold:"rgba(232,184,75,0.08)",
                          color:(team.bigBoy?.[j])?"#0a1a0f":C.gold,
                          border:"1.5px solid "+((team.bigBoy?.[j])?C.gold:"rgba(232,184,75,0.45)"),
                          boxShadow:(team.bigBoy?.[j])?"0 2px 10px rgba(232,184,75,0.4)":"none"
                        }}>⭐ BIG BOY</button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Share Panel — link based, no codes, no PINs */}
          {tourneyId&&(()=>{
            const appUrl="https://press-golf.vercel.app";
            const spectatorLink=`${appUrl}?tourney=${tourneyId}&spectate=1`;
            return(
              <div style={{background:"rgba(123,180,80,0.06)",border:"1px solid rgba(123,180,80,0.2)",borderRadius:14,padding:"16px",marginBottom:16}}>
                <div style={{fontSize:11,color:C.green,letterSpacing:1.5,textTransform:"uppercase",marginBottom:8,fontWeight:600}}>🔗 Share Tournament</div>
                <div style={{background:"rgba(232,184,75,0.1)",border:"1px solid rgba(232,184,75,0.3)",borderRadius:10,padding:"10px 12px",marginBottom:12,fontSize:12,color:C.gold,lineHeight:1.5}}>
                  ⚠️ <strong>Send these links ONCE before teeing off.</strong> Each captain link is tied to this tournament ID. If you create a new tournament, these links will stop working.
                </div>

                {/* Spectator link */}
                <div style={{marginBottom:16}}>
                  <div style={{fontSize:13,fontWeight:700,color:C.text,marginBottom:4}}>👀 Spectator Leaderboard</div>
                  <div style={{fontSize:11,color:C.muted,marginBottom:8}}>Anyone with this link can watch the live leaderboard — no account needed</div>
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={()=>window.open(`sms:?&body=${encodeURIComponent("Watch the tournament live!\n"+spectatorLink)}`)}
                      style={{flex:2,padding:"11px",background:C.green,color:"#0a1a0f",border:"none",borderRadius:10,fontSize:13,fontWeight:800,cursor:"pointer"}}>📱 Text Spectators</button>
                    <button onClick={()=>navigator.clipboard?.writeText(spectatorLink)}
                      style={{flex:1,padding:"11px",background:"transparent",color:C.muted,border:"1px solid "+C.border,borderRadius:10,fontSize:12,cursor:"pointer"}}>📋 Copy</button>
                  </div>
                </div>

                {/* Captain links — no PIN, just tap and score */}
                <div style={{fontSize:13,fontWeight:700,color:C.text,marginBottom:4}}>⛳ Team Captains</div>
                <div style={{fontSize:11,color:C.muted,marginBottom:6}}>Each captain gets their own link — tap it and they're straight into scoring.</div>
                <div style={{fontSize:10,color:C.dim,marginBottom:10,fontFamily:"monospace",background:C.surface,padding:"6px 10px",borderRadius:8,wordBreak:"break-all"}}>
                  Tournament ID: {tourneyId?.slice(0,8)}...
                </div>
                {teams.map((team,i)=>{
                  const captainLink=`${appUrl}?tourney=${tourneyId}&team=${i}`;
                  const smsBody=`⛳ You're captain of ${team.name}!\n\nTap to enter scores:\n${captainLink}\n\nScores update live on the leaderboard. — Press Golf`;
                  return(
                    <div key={i} style={{background:C.card,border:`1px solid ${team.color}33`,borderRadius:12,padding:"12px 14px",marginBottom:8}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                        <div style={{width:12,height:12,borderRadius:"50%",background:team.color,flexShrink:0}}/>
                        <div style={{fontWeight:800,fontSize:14,color:C.text}}>{team.name}</div>
                        <div style={{fontSize:11,color:C.muted,marginLeft:"auto"}}>{team.players?.filter(Boolean).join(", ")}</div>
                      </div>
                      <div style={{display:"flex",gap:8}}>
                        <button onClick={()=>window.open(`sms:?&body=${encodeURIComponent(smsBody)}`)}
                          style={{flex:2,padding:"11px",background:C.green,color:"#0a1a0f",border:"none",borderRadius:10,fontSize:13,fontWeight:800,cursor:"pointer"}}>📱 Text Captain</button>
                        <button onClick={()=>navigator.clipboard?.writeText(captainLink)}
                          style={{flex:1,padding:"11px",background:"transparent",color:C.muted,border:"1px solid "+C.border,borderRadius:10,fontSize:12,cursor:"pointer"}}>📋 Copy</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          <div style={{height:8}}/>
          {/* Two-step Tee Off: first create/save the tournament and show links, then go to scoring */}
          {!tourneyId ? (
            <>
            {ctpReminder&&(
              <div style={{background:"rgba(232,184,75,0.08)",border:"1px solid rgba(232,184,75,0.4)",borderRadius:12,padding:"14px 16px",marginBottom:12}}>
                <div style={{fontSize:13,fontWeight:700,color:C.gold,marginBottom:6}}>Did you forget CTP?</div>
                <div style={{fontSize:12,color:C.muted,marginBottom:12,lineHeight:1.5}}>
                  {!ctpEnabled
                    ? "Closest to the Pin is off for this tournament, so captains won't be prompted on any hole."
                    : "CTP is on, but no holes are picked yet, so captains still won't be prompted anywhere."}
                  {" "}Turn it on and pick holes above, or leave it off.
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={()=>{setCtpEnabled(true);setCtpReminder(false);document.getElementById("ctp-setup-section")?.scrollIntoView({behavior:"smooth",block:"start"});}}
                    style={{flex:2,padding:"10px",background:C.gold,color:"#0a1a0f",border:"none",borderRadius:8,fontSize:13,fontWeight:800,cursor:"pointer"}}>Add CTP holes</button>
                  <button onClick={async()=>{
                    const leaveOff = ctpHoles.length===0;
                    setCtpReminderDismissed(true);setCtpReminder(false);
                    if(leaveOff){ setCtpEnabled(false); setCtpHoles([]); }
                    setLoading(true);
                    const id = await createTourney(teams, leaveOff?{enabled:false,holes:[]}:undefined);
                    if(id) setTourneyId(id);
                    setLoading(false);
                  }}
                    style={{flex:1,padding:"10px",background:"transparent",color:C.muted,border:"1px solid "+C.border,borderRadius:8,fontSize:13,fontWeight:600,cursor:"pointer"}}>Leave it off — create anyway</button>
                </div>
              </div>
            )}
            <BigBtn onClick={async()=>{
              // Did-you-forget gate: CTP off, or on with no holes, stops at
              // the reminder above instead of creating. Dismissed = never
              // ask again for this setup.
              if(!ctpReminderDismissed && (!ctpEnabled || ctpHoles.length===0)){
                setCtpReminder(true);
                return;
              }
              setLoading(true);
              // Create the DB entry now — links become available immediately
              const id = await createTourney(teams);
              if(id) setTourneyId(id);
              setLoading(false);
              // Stay on setup screen — director sends links, then taps "Start Scoring"
            }}>
              {loading?"Creating...":"Create Tournament & Get Links"}
            </BigBtn>
            </>
          ) : (
            <>
              <div style={{background:"rgba(123,180,80,0.08)",border:"1px solid rgba(123,180,80,0.3)",borderRadius:10,padding:"10px 14px",marginBottom:10,fontSize:12,color:C.green,textAlign:"center"}}>
                ✓ Tournament created — send links above, then start scoring when everyone is ready
              </div>
              <BigBtn onClick={async()=>{
                setLoading(true);
                // Save latest team edits and flip to active
                await sb.from("team_tournaments").update({
                  teams,course_id:courseId,birdie_bonus:birdieBonus,
                  ball_count_by_par:ballsByPar,hole_pars:holePars,director_rules:directorRules,hole_notes:holeNotes,
                  skins_enabled:skinsEnabled,big_boy_enabled:bigBoyEnabled,
                  ctp_enabled:ctpEnabled,ctp_holes:ctpHoles,ctp_leaders:ctpLeaders,
                  status:"active",current_hole:1,updated_at:new Date().toISOString()
                }).eq("id",tourneyId);
                setLoading(false);
                setCurrentHole(1);setActiveTeam(0);
                setScreen("scoring");
              }} color={C.gold}>
                {loading?"Starting...":"Start Scoring"}
              </BigBtn>
            </>
          )}
        </div>
      </div>
    );
  }

  // SCORING
  if(screen==="scoring"&&holeData){
    const team=teams[activeTeam];
    const sc=calcTeamScore(team.scores,team.size,course.holes,birdieBonus,ballsByPar,holePars);
    const thisHoleScores=Array.from({length:team.size},(_,j)=>({j,s:getPlayerScore(team,j,currentHole)})).filter(x=>x.s!==null).sort((a,b)=>a.s-b.s);
    const effPar = holePars[currentHole] ?? holeData.par;
    const ballsThisHole = (typeof ballsByPar==="object"?parseInt(ballsByPar[effPar])||2:parseInt(ballsByPar)||2);
    const best2Set=new Set(thisHoleScores.slice(0,ballsThisHole).map(x=>x.j));
    const birdieCount=thisHoleScores.filter(x=>x.s<=effPar-1).length;
    const bonusThisHole=birdieBonus&&birdieCount>=3?birdieCount-2:0;

    return(
      <div style={{fontFamily:"Georgia,serif",minHeight:"100vh",background:C.bg,color:C.text,paddingBottom:120}}>
        {/* Header */}
        <div style={{background:"linear-gradient(180deg,"+C.card+" 0%,transparent 100%)",padding:"44px 16px 12px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <button onClick={()=>currentHole>1?setCurrentHole(h=>h-1):setScreen("home")}
              style={{background:"rgba(123,180,80,0.15)",border:"1px solid "+C.green,color:C.green,fontSize:13,cursor:"pointer",padding:"6px 14px",borderRadius:16,fontWeight:700}}>‹</button>
            <div style={{textAlign:"center"}}>
              <div style={{fontSize:11,color:C.muted,letterSpacing:2,textTransform:"uppercase"}}>Hole</div>
              <div style={{fontSize:48,fontWeight:800,lineHeight:1}}>{currentHole}</div>
              <div style={{fontSize:12,color:C.green,fontWeight:600}}>
                Par {effPar}  · Hdcp {holeData.hdcp}
              </div>
              {effPar!==holeData.par&&(
                <div style={{fontSize:12,color:C.gold,fontWeight:700,marginTop:4}}>⛳ Par {effPar} today (card: Par {holeData.par})</div>
              )}
              {holeNotes[currentHole]&&(
                <div style={{fontSize:12,background:"rgba(123,180,80,0.12)",border:"1px solid rgba(123,180,80,0.4)",borderRadius:10,padding:"6px 10px",marginTop:6}}>📋 {holeNotes[currentHole]}</div>
              )}
              {saveStatus&&<div style={{fontSize:10,color:saveStatus==="saving"?C.gold:C.green,marginTop:2}}>{saveStatus==="saving"?"Saving...":"Saved"}</div>}
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:6,alignItems:"flex-end"}}>
              <button onClick={()=>setScreen("home")}
                style={{background:"rgba(123,180,80,0.15)",border:"1px solid "+C.green,color:C.green,fontSize:11,cursor:"pointer",padding:"5px 10px",borderRadius:12,fontWeight:700}}>🏠 Home</button>
              <button onClick={()=>{setLbTab("standings");setScreen("leaderboard");}}
                style={{background:"rgba(232,184,75,0.15)",border:"1px solid "+C.gold,color:C.gold,fontSize:11,cursor:"pointer",padding:"5px 10px",borderRadius:12,fontWeight:700}}>📊 Leaderboard</button>
              <button onClick={()=>{setLbTab("rules");setScreen("leaderboard");}}
                style={{background:"rgba(123,180,80,0.15)",border:"1px solid "+C.green,color:C.green,fontSize:11,cursor:"pointer",padding:"5px 10px",borderRadius:12,fontWeight:700}}>📋 Rules</button>
              <button onClick={()=>setShowSettings(true)}
                style={{background:"rgba(123,180,80,0.15)",border:"1px solid "+C.green,color:C.green,fontSize:13,cursor:"pointer",padding:"8px 14px",borderRadius:12,fontWeight:700}}>⚙️ Settings</button>
              <button onClick={toggleDayMode} title={dayMode?"Switch to dark mode":"Day mode — easier to read in sunlight"}
                style={{background:dayMode?"rgba(35,100,45,0.10)":"rgba(232,184,75,0.10)",border:"1px solid "+(dayMode?C.green:C.gold),color:dayMode?C.green:C.gold,fontSize:13,cursor:"pointer",padding:"8px 12px",borderRadius:12,fontWeight:700}}>{dayMode?"🌙":"☀️"}</button>
            </div>
          </div>
          <div style={{display:"flex",gap:2}}>
            {course.holes.map(h=>(
              <div key={h.hole} style={{flex:1,height:4,borderRadius:2,background:h.hole<currentHole?C.green:h.hole===currentHole?C.gold:C.dim}}/>
            ))}
          </div>
        </div>

        {/* Hole dot selector — tap any hole to jump there */}
        <div style={{display:"flex",overflowX:"auto",gap:6,padding:"10px 12px 6px",borderBottom:"none"}}>
          {course.holes.map(h=>{
            const hasScore=teams.some(t=>Object.values(t.scores||{}).some(ps=>ps?.[h.hole]!==undefined&&ps?.[h.hole]!==null));
            return(
              <button key={h.hole} onClick={()=>setCurrentHole(h.hole)} style={{
                flexShrink:0,width:36,height:36,borderRadius:"50%",fontSize:12,fontWeight:700,cursor:"pointer",
                background:h.hole===currentHole?C.gold:hasScore?"rgba(123,180,80,0.15)":C.dim,
                color:h.hole===currentHole?"#0a1a0f":hasScore?C.green:C.muted,
                border:"1px solid "+(h.hole===currentHole?C.gold:hasScore?C.green:C.border)
              }}>{h.hole}</button>
            );
          })}
        </div>

        {/* CTP button — only on holes selected as CTP holes */}
        {ctpEnabled&&ctpHoles.includes(currentHole)&&(()=>{
          const leader=ctpLeaders[currentHole];
          return(
            <div style={{margin:"0 12px 10px"}}>
              <button onClick={()=>{setCtpName("");setCtpInput("");setCtpPopup(true);}}
                style={{width:"100%",padding:"13px 16px",background:leader?"rgba(232,184,75,0.15)":"rgba(232,184,75,0.08)",border:"2px solid rgba(232,184,75,0.5)",borderRadius:12,cursor:"pointer",textAlign:"left",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
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
            </div>
          );
        })()}

        {/* Team tabs */}
        <div style={{display:"flex",overflowX:"auto",padding:"8px 12px",gap:8,borderBottom:"1px solid "+C.border}}>
          {teams.map((t,i)=>(
            <button key={i} onClick={()=>setActiveTeam(i)} style={{flexShrink:0,padding:"8px 14px",borderRadius:20,fontSize:12,fontWeight:700,cursor:"pointer",background:activeTeam===i?t.color:C.surface,color:activeTeam===i?"#0a1a0f":C.muted,border:"1.5px solid "+(activeTeam===i?t.color:C.border)}}>{t.name}</button>
          ))}
        </div>

        <div style={{padding:"14px 16px"}}>
          {/* Running score */}
          <div style={{background:C.card,border:"1px solid "+C.border,borderRadius:12,padding:"12px 16px",marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <div style={{width:12,height:12,borderRadius:"50%",background:team.color}}/>
                <div style={{fontWeight:800,fontSize:16}}>{team.name}</div>
                {team.strokesPerSide>0&&<div style={{fontSize:10,color:C.gold,background:"rgba(232,184,75,0.1)",padding:"2px 6px",borderRadius:6}}>+{team.strokesPerSide}/side</div>}
              </div>
              <div style={{display:"flex",gap:16}}>
                {[["F9",sc.frontDiff,sc.front],["B9",sc.backDiff,sc.back],["Tot",sc.totalDiff,sc.total]].map(([lbl,diff,raw])=>(
                  <div key={lbl} style={{textAlign:"center"}}>
                    <div style={{fontSize:10,color:C.muted}}>{lbl}</div>
                    <div style={{fontSize:15,fontWeight:800,color:raw===0?C.muted:relColor(diff)}}>{raw===0?"--":relLabel(diff)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Birdie bonus alert */}
          {bonusThisHole>0&&(
            <div style={{background:"rgba(123,180,80,0.12)",border:"1px solid "+C.green,borderRadius:10,padding:"10px 14px",marginBottom:12,textAlign:"center"}}>
              <div style={{fontSize:13,fontWeight:700,color:C.green}}>🐦 {birdieCount} Birdies! Bonus −{bonusThisHole} applied this hole</div>
            </div>
          )}

          {/* Player entries */}
          {Array.from({length:team.size},(_,j)=>{
            const score=getPlayerScore(team,j,currentHole);
            const isBest=best2Set.has(j)&&score!==null;
            const diff=score!==null?score-effPar:null;

            return(
              <div key={j} style={{background:isBest?"rgba(123,180,80,0.08)":C.card,border:"1px solid "+(isBest?C.green:C.border),borderRadius:14,padding:"12px 14px",marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <div>
                    <span style={{fontWeight:700,fontSize:15}}>{team.players[j]||"Player "+(j+1)}</span>
                    {isBest&&<span style={{fontSize:10,color:C.green,fontWeight:700,marginLeft:8}}>✓ COUNTS</span>}

                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    {diff!==null&&<div style={{fontSize:14,fontWeight:800,color:relColor(diff)}}>{relLabel(diff)}{diff<=-1?"  (birdie)":""}</div>}

                  </div>
                </div>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
                  <button onClick={()=>setPlayerScore(activeTeam,j,currentHole,score!==null?Math.max(1,score-1):effPar-1)}
                    style={{width:56,height:56,borderRadius:"50%",background:C.dim,border:"1px solid "+C.border,color:C.text,fontSize:30,fontWeight:700,cursor:"pointer"}}>−</button>
                  <div style={{flex:1,textAlign:"center"}}>
                    <div style={{fontSize:56,fontWeight:800,color:score!==null?C.text:C.muted,lineHeight:1}}>{score!==null?score:"--"}</div>
                    {score===null&&<div style={{fontSize:11,color:C.muted,marginTop:4}}>tap + to enter</div>}
                  </div>
                  <button onClick={()=>setPlayerScore(activeTeam,j,currentHole,score!==null?score+1:effPar)}
                    style={{width:56,height:56,borderRadius:"50%",background:C.dim,border:"1px solid "+C.border,color:C.text,fontSize:30,fontWeight:700,cursor:"pointer"}}>+</button>
                </div>
              </div>
            );
          })}

          {/* This hole total */}
          {thisHoleScores.length>=1&&(()=>{
            const best2scores=thisHoleScores.slice(0,ballsThisHole).map(x=>x.s);
            const raw=best2scores.reduce((s,v)=>s+v,0)-bonusThisHole;
            const d=raw-(effPar*ballsThisHole);
            return(
              <div style={{background:"rgba(123,180,80,0.06)",border:"1px solid rgba(123,180,80,0.2)",borderRadius:10,padding:"12px 16px",marginBottom:14}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <div style={{fontSize:12,color:C.muted}}>{ballsThisHole} Best Ball this hole</div>
                    {bonusThisHole>0&&<div style={{fontSize:11,color:C.green}}>+ birdie bonus −{bonusThisHole}</div>}
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:22,fontWeight:800,color:relColor(d)}}>{relLabel(d)}</div>
                    <div style={{fontSize:11,color:C.muted}}>raw: {raw}</div>
                  </div>
                </div>
              </div>
            );
          })()}

          <BigBtn onClick={()=>isLastHole?setScreen("leaderboard"):setCurrentHole(h=>h+1)} color={isLastHole?C.gold:C.green}>
            {isLastHole?"See Final Results":"Next - Hole "+(currentHole+1)}
          </BigBtn>

          {/* Mini standings */}
          <div style={{marginTop:12,display:"flex",gap:8,flexWrap:"wrap",justifyContent:"center"}}>
            {getLeaderboard().slice(0,5).map((t,rank)=>(
              <div key={t.id||rank} style={{background:C.card,border:"1px solid "+t.color+"44",borderRadius:20,padding:"5px 12px",fontSize:12,display:"flex",alignItems:"center",gap:6}}>
                <span style={{color:C.muted}}>{rank+1}.</span>
                <span style={{fontWeight:700,color:t.color}}>{t.name}</span>
                <span style={{fontWeight:800,color:relColor(t.sc.totalDiff)}}>{t.sc.total?relLabel(t.sc.totalDiff):"--"}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── CTP POPUP — simple: player name + distance ──────────────── */}
        {ctpPopup&&(()=>{
          const leader=ctpLeaders[currentHole];
          const canSave=ctpName.trim().length>0&&ctpInput.trim().length>0;

          async function submitCtp(){
            if(!canSave)return;
            const newLeaders={...ctpLeaders,[currentHole]:{
              name:ctpName.trim(),
              teamName:teams[activeTeam]?.name||"",
              distance:ctpInput.trim(),
              hole:currentHole,
            }};
            setCtpLeaders(newLeaders);
            await sb.from("team_tournaments").update({
              ctp_leaders:newLeaders,
              updated_at:new Date().toISOString()
            }).eq("id",tourneyId);
            setCtpPopup(null);setCtpName("");setCtpInput("");
          }

          async function clearCtp(){
            const newLeaders={...ctpLeaders};
            delete newLeaders[currentHole];
            setCtpLeaders(newLeaders);
            await sb.from("team_tournaments").update({
              ctp_leaders:newLeaders,
              updated_at:new Date().toISOString()
            }).eq("id",tourneyId);
            setCtpPopup(null);setCtpName("");setCtpInput("");
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

                <div style={{marginBottom:16}}>
                  <div style={{fontSize:11,color:C.green,letterSpacing:1.5,textTransform:"uppercase",fontWeight:600,marginBottom:6}}>Distance</div>
                  <input value={ctpInput} onChange={e=>setCtpInput(e.target.value)}
                    placeholder="e.g. 4 ft 6 in"
                    style={{width:"100%",padding:"14px",background:C.bg,border:"1px solid "+C.border,borderRadius:10,color:C.text,fontSize:16,outline:"none",boxSizing:"border-box"}}/>
                </div>

                {leader&&(
                  <button onClick={clearCtp}
                    style={{width:"100%",padding:"12px",background:"rgba(224,80,80,0.1)",border:"1px solid rgba(224,80,80,0.4)",borderRadius:10,color:C.red,fontSize:13,fontWeight:700,cursor:"pointer",marginBottom:10}}>
                    Remove CTP Entry
                  </button>
                )}

                <div style={{display:"flex",gap:10}}>
                  <button onClick={()=>{setCtpPopup(null);setCtpName("");setCtpInput("");}}
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

                {/* ── DIRECTOR SETTINGS OVERLAY ────────────────────────────────── */}
        {showSettings&&(()=>{
          // guard — check any team has fewer players than max balls being counted
          const maxBalls = Math.max(ballsByPar[3]||2, ballsByPar[4]||2, ballsByPar[5]||2);
          const cbWarnings = teams
            .filter(t=>(t.size||1) < maxBalls)
            .map(t=>t.name||"A team");

          return(
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.92)",zIndex:800,overflowY:"auto",fontFamily:"Georgia,serif"}}>
            <div style={{padding:"50px 20px 60px",maxWidth:480,margin:"0 auto"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                <div style={{fontSize:20,fontWeight:800}}>⚙️ Tournament Settings</div>
                <button onClick={()=>setShowSettings(false)} style={{background:C.dim,border:"none",color:C.muted,width:34,height:34,borderRadius:"50%",fontSize:16,cursor:"pointer"}}>✕</button>
              </div>
              <div style={{fontSize:12,color:C.muted,marginBottom:20}}>Changes save automatically and sync to all captains and spectators in real time.</div>

              {/* ── BALL COUNT BY PAR ──────────────────────────────────── */}
              <div style={{background:C.card,border:"1px solid "+C.border,borderRadius:12,padding:"14px 16px",marginBottom:12}}>
                <div style={{fontWeight:700,fontSize:14,marginBottom:4}}>Balls Counted Per Hole</div>
                <div style={{fontSize:11,color:C.muted,marginBottom:12}}>Set per par value. Recalculates all scores instantly.</div>
                {[3,4,5].map(par=>(
                  <div key={par} style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                    <div style={{width:44,fontSize:13,fontWeight:700,color:C.text,flexShrink:0}}>Par {par}</div>
                    <div style={{display:"flex",gap:6,flex:1}}>
                      {[1,2,3,4,5].map(n=>(
                        <button key={n} onClick={()=>setBallsByPar(prev=>({...prev,[par]:n}))} style={{
                          flex:1,padding:"12px 4px",
                          background:ballsByPar[par]===n?C.green:"rgba(255,255,255,0.08)",
                          color:ballsByPar[par]===n?"#0a1a0f":"#ffffff",
                          border:"1px solid "+(ballsByPar[par]===n?C.green:"rgba(255,255,255,0.25)"),
                          borderRadius:8,fontSize:15,fontWeight:ballsByPar[par]===n?800:600,cursor:"pointer"
                        }}>{n}</button>
                      ))}
                    </div>
                  </div>
                ))}
                <div style={{borderTop:"1px solid "+C.border,paddingTop:12,marginTop:6}}>
                  <div style={{fontSize:12,color:C.text,fontWeight:600,marginBottom:8,textAlign:"center"}}>Quick-set all pars at once</div>
                  <div style={{display:"flex",gap:6}}>
                    {[1,2,3,4,5].map(n=>(
                      <button key={n} onClick={()=>setBallsByPar({3:n,4:n,5:n})} style={{
                        flex:1,padding:"12px 4px",
                        background:ballsByPar[3]===n&&ballsByPar[4]===n&&ballsByPar[5]===n?C.gold:"rgba(255,255,255,0.08)",
                        color:ballsByPar[3]===n&&ballsByPar[4]===n&&ballsByPar[5]===n?"#0a1a0f":"#ffffff",
                        border:"1px solid "+(ballsByPar[3]===n&&ballsByPar[4]===n&&ballsByPar[5]===n?C.gold:"rgba(255,255,255,0.25)"),
                        borderRadius:8,fontSize:15,fontWeight:700,cursor:"pointer"
                      }}>{n}</button>
                    ))}
                  </div>
                </div>
                {cbWarnings.length>0&&(
                  <div style={{background:"rgba(224,80,80,0.1)",border:"1px solid rgba(224,80,80,0.3)",borderRadius:8,padding:"10px 12px",fontSize:12,color:C.red,marginTop:10}}>
                    ⚠️ {cbWarnings.join(", ")} {cbWarnings.length===1?"has":"have"} fewer players than balls to count.
                  </div>
                )}
              </div>

              {/* ── BIRDIE BONUS ────────────────────────────────────────── */}
              <div style={{background:C.card,border:"1px solid "+C.border,borderRadius:12,padding:"14px 16px",marginBottom:12}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:14}}>Birdie Bonus</div>
                    <div style={{fontSize:11,color:C.muted,marginTop:2}}>{birdieBonus?"Extra birdies beyond count = bonus strokes off":"Off for this tournament"}</div>
                  </div>
                  <button onClick={()=>setBirdieBonus(b=>!b)} style={{width:52,height:28,borderRadius:14,border:"none",cursor:"pointer",background:birdieBonus?C.green:"#333",position:"relative",flexShrink:0,transition:"background 0.2s"}}>
                    <div style={{position:"absolute",top:4,left:birdieBonus?26:4,width:20,height:20,borderRadius:"50%",background:"#fff",transition:"left 0.2s"}}/>
                  </button>
                </div>
              </div>

              {/* ── SKINS ───────────────────────────────────────────────── */}
              <div style={{background:C.card,border:"1px solid "+C.border,borderRadius:12,padding:"14px 16px",marginBottom:skinsEnabled?8:20}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:14}}>💰 Skins Game</div>
                    <div style={{fontSize:11,color:C.muted,marginTop:2}}>{skinsEnabled?"Live skins tab in leaderboard":"Off"}</div>
                  </div>
                  <button onClick={async()=>{const v=!skinsEnabled;setSkinsEnabled(v);if(!v)setBigBoyEnabled(false);await sb.from("team_tournaments").update({skins_enabled:v,big_boy_enabled:v?bigBoyEnabled:false,updated_at:new Date().toISOString()}).eq("id",tourneyId);}} style={{width:52,height:28,borderRadius:14,border:"none",cursor:"pointer",background:skinsEnabled?C.green:"#333",position:"relative",flexShrink:0,transition:"background 0.2s"}}>
                    <div style={{position:"absolute",top:4,left:skinsEnabled?26:4,width:20,height:20,borderRadius:"50%",background:"#fff",transition:"left 0.2s"}}/>
                  </button>
                </div>
              </div>
              {skinsEnabled&&(
                <div style={{background:"rgba(232,184,75,0.06)",border:"1px solid rgba(232,184,75,0.25)",borderRadius:12,padding:"14px 16px",marginBottom:20,marginLeft:8}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div>
                      <div style={{fontWeight:700,fontSize:13,color:C.gold}}>⭐ Big Boy Skins</div>
                      <div style={{fontSize:11,color:C.muted,marginTop:2}}>{bigBoyEnabled?"Parallel opt-in game - BB vs BB only":"Off"}</div>
                    </div>
                    <button onClick={async()=>{const v=!bigBoyEnabled;setBigBoyEnabled(v);await sb.from("team_tournaments").update({big_boy_enabled:v,updated_at:new Date().toISOString()}).eq("id",tourneyId);}} style={{width:52,height:28,borderRadius:14,border:"none",cursor:"pointer",background:bigBoyEnabled?C.gold:"#333",position:"relative",flexShrink:0,transition:"background 0.2s"}}>
                      <div style={{position:"absolute",top:4,left:bigBoyEnabled?26:4,width:20,height:20,borderRadius:"50%",background:"#fff",transition:"left 0.2s"}}/>
                    </button>
                  </div>
                  {bigBoyEnabled&&(
                    <div style={{marginTop:12,borderTop:"1px solid rgba(232,184,75,0.2)",paddingTop:12}}>
                      <div style={{fontSize:11,color:C.gold,letterSpacing:1,textTransform:"uppercase",fontWeight:700,marginBottom:8}}>Who's in? Tap to mark</div>
                      {teams.map((team,ti)=>(
                        <div key={ti} style={{marginBottom:8}}>
                          <div style={{fontSize:11,color:C.muted,marginBottom:4}}>{team.name||("Team "+(ti+1))}</div>
                          <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                            {Array.from({length:team.size||1},(_,pi)=>{
                              const nm=(team.players?.[pi]||"").trim()||("Player "+(pi+1));
                              const on=team.bigBoy?.[pi]===true;
                              return(
                                <button key={pi} onClick={()=>{const bb=[...(team.bigBoy||Array(team.size||1).fill(false))];bb[pi]=!bb[pi];updateTeam(ti,{bigBoy:bb});}}
                                  style={{padding:"9px 12px",borderRadius:10,fontSize:12,fontWeight:800,cursor:"pointer",letterSpacing:0.5,
                                    background:on?C.gold:"rgba(232,184,75,0.08)",
                                    color:on?"#0a1a0f":C.gold,
                                    border:"1.5px solid "+(on?C.gold:"rgba(232,184,75,0.45)"),
                                    boxShadow:on?"0 2px 10px rgba(232,184,75,0.4)":"none"
                                  }}>{on?"⭐ ":""}{nm}</button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                      <div style={{fontSize:10,color:C.muted,marginTop:4}}>Saves automatically · leaderboard updates live</div>
                    </div>
                  )}
                </div>
              )}
              {skinsEnabled&&(
                <div style={{background:"rgba(224,80,80,0.06)",border:"1px solid rgba(224,80,80,0.2)",borderRadius:12,padding:"14px 16px",marginBottom:20,marginLeft:8}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div>
                      <div style={{fontWeight:700,fontSize:13,color:C.text}}>Teammate Ties Cancel Skin</div>
                      <div style={{fontSize:11,color:C.muted,marginTop:2}}>{teammatesTie?"Stricter - teammates tie = carries":"Default - team wins if no other team ties"}</div>
                    </div>
                    <button onClick={async()=>{const v=!teammatesTie;setTeammatesTie(v);await sb.from("team_tournaments").update({teammates_tie:v,updated_at:new Date().toISOString()}).eq("id",tourneyId);}} style={{width:52,height:28,borderRadius:14,border:"none",cursor:"pointer",background:teammatesTie?C.red:"#333",position:"relative",flexShrink:0,transition:"background 0.2s"}}>
                      <div style={{position:"absolute",top:4,left:teammatesTie?26:4,width:20,height:20,borderRadius:"50%",background:"#fff",transition:"left 0.2s"}}/>
                    </button>
                  </div>
                </div>
              )}

              {/* ── CLOSEST TO THE PIN ─────────────────────────────────── */}
              <div style={{background:C.card,border:"1px solid "+C.border,borderRadius:12,padding:"14px 16px",marginBottom:ctpEnabled?8:12}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:14}}>Closest to the Pin</div>
                    <div style={{fontSize:11,color:C.muted,marginTop:2}}>{ctpEnabled?"CTP button appears on par 3 holes":"Off"}</div>
                  </div>
                  <button onClick={()=>{
                    if(ctpEnabled){
                      // Turning off — clear holes, save immediately
                      setCtpEnabled(false);setCtpHoles([]);
                    } else {
                      // Turning on mid-round — show confirmation first
                      setCtpConfirm(true);
                    }
                  }} style={{width:52,height:28,borderRadius:14,border:"none",cursor:"pointer",background:ctpEnabled?C.gold:"#333",position:"relative",flexShrink:0,transition:"background 0.2s"}}>
                    <div style={{position:"absolute",top:4,left:ctpEnabled?26:4,width:20,height:20,borderRadius:"50%",background:"#fff",transition:"left 0.2s"}}/>
                  </button>
                </div>
              </div>

              {/* CTP confirmation dialog — mid-round enable warning */}
              {ctpConfirm&&(
                <div style={{background:"rgba(232,184,75,0.08)",border:"1px solid rgba(232,184,75,0.4)",borderRadius:12,padding:"14px 16px",marginBottom:12,marginLeft:8}}>
                  <div style={{fontSize:13,fontWeight:700,color:C.gold,marginBottom:6}}>Add CTP mid-round?</div>
                  <div style={{fontSize:12,color:C.muted,marginBottom:12,lineHeight:1.5}}>
                    Are you sure you want to add a CTP game to this tournament? Captains will see a CTP button appear on par 3 holes.
                  </div>
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={()=>setCtpConfirm(false)}
                      style={{flex:1,padding:"10px",background:"transparent",color:C.muted,border:"1px solid "+C.border,borderRadius:8,fontSize:13,fontWeight:600,cursor:"pointer"}}>Cancel</button>
                    <button onClick={()=>{setCtpEnabled(true);setCtpConfirm(false);}}
                      style={{flex:2,padding:"10px",background:C.gold,color:"#0a1a0f",border:"none",borderRadius:8,fontSize:13,fontWeight:800,cursor:"pointer"}}>Yes, Add CTP</button>
                  </div>
                </div>
              )}

              {/* CTP hole selector — shows when enabled */}
              {ctpEnabled&&(
                <div style={{background:"rgba(232,184,75,0.06)",border:"1px solid rgba(232,184,75,0.25)",borderRadius:12,padding:"14px 16px",marginBottom:12,marginLeft:8}}>
                  <div style={{fontWeight:700,fontSize:13,color:C.gold,marginBottom:4}}>Select CTP Holes</div>
                  <div style={{fontSize:11,color:C.muted,marginBottom:12}}>Par 3 holes highlighted. Tap to select — CTP button appears on those holes for all captains.</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:8}}>{
                    course.holes.map(h=>{
                      const effP=holePars[h.hole]??h.par;
                      const isSelected=ctpHoles.includes(h.hole);
                      const isPar3=effP===3;
                      return(
                        <button key={h.hole} onClick={()=>setCtpHoles(prev=>isSelected?prev.filter(x=>x!==h.hole):[...prev,h.hole])}
                          style={{width:48,height:48,borderRadius:10,
                            background:isSelected?C.gold:"rgba(255,255,255,0.06)",
                            color:isSelected?"#0a1a0f":isPar3?C.gold:C.muted,
                            border:"2px solid "+(isSelected?C.gold:isPar3?"rgba(232,184,75,0.4)":"rgba(255,255,255,0.15)"),
                            fontWeight:isSelected?800:600,fontSize:12,cursor:"pointer",
                            display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:1}}>
                          <span style={{fontSize:14,fontWeight:800}}>{h.hole}</span>
                          <span style={{fontSize:8,opacity:0.8}}>P{effP}</span>
                        </button>
                      );
                    })
                  }</div>
                  {ctpHoles.length>0&&(
                    <div style={{marginTop:10,fontSize:12,color:C.gold}}>
                      CTP on holes: {ctpHoles.sort((a,b)=>a-b).join(", ")}
                    </div>
                  )}
                </div>
              )}

              {/* ── HOLE PARS — mid-round (director only) ──────────────── */}
              <div style={{background:C.card,border:"1px solid "+C.border,borderRadius:12,padding:"14px 16px",marginBottom:20}}>
                <div style={{fontWeight:700,fontSize:14,marginBottom:4}}>⛳ Hole Pars — mid-round</div>
                <div style={{fontSize:11,color:C.muted,marginBottom:12}}>Change any hole's par for this round. Scores recalculate instantly. Captains see the change as a note — they can't change it.</div>
                <div style={{display:"flex",gap:8,alignItems:"center"}}>
                  <select value={midParHole} onChange={e=>setMidParHole(parseInt(e.target.value,10))}
                    style={{background:"#0a0f0a",border:"1px solid rgba(255,255,255,0.2)",borderRadius:10,color:"#fff",fontSize:14,padding:"10px"}}>
                    {course.holes.map(h=><option key={h.hole} value={h.hole}>Hole {h.hole}</option>)}
                  </select>
                  <div style={{display:"flex",gap:8,flex:1}}>
                    {[3,4,5].map(p=>{
                      const cardPar=course.holes.find(h=>h.hole===midParHole)?.par;
                      const cur=holePars[midParHole]??cardPar;
                      return(
                        <button key={p} onClick={()=>setHolePars(prev=>({...prev,[midParHole]:p}))}
                          style={{flex:1,padding:"12px",background:cur===p?C.green:"#1a2a1a",color:cur===p?"#0a1a0f":"#ffffff",
                            border:"2px solid "+(cur===p?C.green:"rgba(255,255,255,0.3)"),borderRadius:10,fontSize:15,fontWeight:cur===p?800:600,cursor:"pointer"}}>
                          Par {p}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <button onClick={()=>setHolePars({})} style={{marginTop:10,width:"100%",padding:"10px",borderRadius:10,border:"1px solid rgba(255,255,255,0.3)",background:"transparent",color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer"}}>Reset all to card pars</button>
              </div>

              {/* ── TEAMS ───────────────────────────────────────────────── */}
              <div style={{fontSize:11,color:C.green,letterSpacing:1.5,textTransform:"uppercase",marginBottom:10,fontWeight:600}}>Teams</div>
              {teams.map((team,i)=>{
                const size = team.size||1;
                const spd  = team.strokesPerSide||0;
                const maxBalls = Math.max(ballsByPar[3]||2,ballsByPar[4]||2,ballsByPar[5]||2);
                const sizeWarning = size < maxBalls && size > 1; // only warn if >1 player but still under ball count
                const individualMode = size === 1;
                return(
                  <div key={i} style={{background:C.card,border:"1px solid "+(sizeWarning?C.red+"44":individualMode?C.gold+"33":C.border),borderRadius:14,padding:"14px",marginBottom:12}}>

                    {/* Team name */}
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
                      <div style={{width:12,height:12,borderRadius:"50%",background:team.color,flexShrink:0}}/>
                      <input value={team.name||""} onChange={e=>updateTeam(i,{name:e.target.value})}
                        style={{flex:1,padding:"9px 12px",background:C.surface,border:"1px solid "+C.border,borderRadius:8,color:C.text,fontSize:14,fontWeight:700,outline:"none"}}/>
                    </div>

                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
                      {/* Team size */}
                      <div style={{background:C.surface,borderRadius:10,padding:"10px 12px"}}>
                        <div style={{fontSize:10,color:sizeWarning?C.red:C.muted,fontWeight:600,marginBottom:6,textTransform:"uppercase",letterSpacing:1}}>
                          {sizeWarning?"Warning: ":""}Players
                        </div>
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          <button onClick={()=>updateTeam(i,{size:Math.max(1,size-1)})}
                            style={{width:32,height:32,borderRadius:"50%",background:C.dim,border:"1px solid "+C.border,color:C.text,fontSize:20,fontWeight:700,cursor:"pointer",flexShrink:0}}>−</button>
                          <div style={{flex:1,textAlign:"center",fontWeight:800,fontSize:22,color:sizeWarning?C.red:C.text}}>{size}</div>
                          <button onClick={()=>updateTeam(i,{size:Math.min(6,size+1)})}
                            style={{width:32,height:32,borderRadius:"50%",background:C.dim,border:"1px solid "+C.border,color:C.text,fontSize:20,fontWeight:700,cursor:"pointer",flexShrink:0}}>+</button>
                        </div>
                      </div>

                      {/* Strokes per side */}
                      <div style={{background:C.surface,borderRadius:10,padding:"10px 12px"}}>
                        <div style={{fontSize:10,color:C.muted,fontWeight:600,marginBottom:6,textTransform:"uppercase",letterSpacing:1}}>Strokes/Side</div>
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          <button onClick={()=>updateTeam(i,{strokesPerSide:Math.max(0,spd-1)})}
                            style={{width:32,height:32,borderRadius:"50%",background:C.dim,border:"1px solid "+C.border,color:C.text,fontSize:20,fontWeight:700,cursor:"pointer",flexShrink:0}}>−</button>
                          <div style={{flex:1,textAlign:"center",fontWeight:800,fontSize:22,color:spd>0?C.gold:C.muted}}>{spd}</div>
                          <button onClick={()=>updateTeam(i,{strokesPerSide:Math.min(9,spd+1)})}
                            style={{width:32,height:32,borderRadius:"50%",background:C.dim,border:"1px solid "+C.border,color:C.text,fontSize:20,fontWeight:700,cursor:"pointer",flexShrink:0}}>+</button>
                        </div>
                        {spd>0&&<div style={{fontSize:10,color:C.gold,textAlign:"center",marginTop:4}}>{spd*2} total strokes</div>}
                      </div>
                    </div>

                    {/* Player names */}
                    <div style={{fontSize:11,color:C.muted,marginBottom:6,fontWeight:600}}>Player Names</div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:10}}>
                      {Array.from({length:size},(_,j)=>(
                        <input key={j}
                          value={team.players?.[j]||""}
                          onChange={e=>{const p=[...(team.players||Array(size).fill(""))];p[j]=e.target.value;updateTeam(i,{players:p});}}
                          placeholder={"Player "+(j+1)}
                          style={{padding:"9px 10px",background:C.bg,border:"1px solid "+C.border,borderRadius:8,color:C.text,fontSize:13,outline:"none"}}/>
                      ))}
                    </div>

                    {/* Resend captain link */}
                    {tourneyId&&(
                      <button onClick={()=>{
                        const link=`https://press-golf.vercel.app?tourney=${tourneyId}&team=${i}`;
                        window.open(`sms:?&body=${encodeURIComponent(`⛳ ${team.name||"Team "+(i+1)} — tap to score:\n${link}\n\n— Press Golf`)}`);
                      }} style={{width:"100%",padding:"10px",background:"transparent",color:C.green,border:"1px solid "+C.green+"44",borderRadius:8,fontSize:12,fontWeight:700,cursor:"pointer"}}>
                        📱 Resend Captain Link
                      </button>
                    )}
                  </div>
                );
              })}

              {/* Spectator link */}
              {tourneyId&&(
                <div style={{background:C.card,border:"1px solid "+C.border,borderRadius:12,padding:"14px",marginBottom:16}}>
                  <div style={{fontWeight:700,fontSize:14,marginBottom:8}}>👀 Spectator Leaderboard</div>
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={()=>{
                      const link=`https://press-golf.vercel.app?tourney=${tourneyId}&spectate=1`;
                      window.open(`sms:?&body=${encodeURIComponent(`Watch the tournament live!\n${link}`)}`);
                    }} style={{flex:2,padding:"11px",background:C.green,color:"#0a1a0f",border:"none",borderRadius:10,fontSize:13,fontWeight:800,cursor:"pointer"}}>
                      📱 Text Spectators
                    </button>
                    <button onClick={()=>{
                      const link=`https://press-golf.vercel.app?tourney=${tourneyId}&spectate=1`;
                      navigator.clipboard?.writeText(link);
                    }} style={{flex:1,padding:"11px",background:"transparent",color:C.muted,border:"1px solid "+C.border,borderRadius:10,fontSize:12,cursor:"pointer"}}>
                      📋 Copy
                    </button>
                  </div>
                </div>
              )}

              <button
                onClick={()=>setShowSettings(false)}
                disabled={cbWarnings.length>0}
                style={{width:"100%",padding:"16px",background:cbWarnings.length>0?"#1a2a1a":C.green,color:cbWarnings.length>0?C.muted:"#0a1a0f",border:"none",borderRadius:12,fontSize:16,fontWeight:800,cursor:cbWarnings.length>0?"not-allowed":"pointer"}}>
                {cbWarnings.length>0?"Fix team size before closing":"Done - Changes Saved"}
              </button>
            </div>
          </div>
          );
        })()}
      </div>
    );
  }

  // LEADERBOARD
  if(screen==="leaderboard"){
    const board=getLeaderboard();
    return(
      <div style={{fontFamily:"Georgia,serif",minHeight:"100vh",background:C.bg,color:C.text,paddingBottom:40}}>
        <div style={{background:"linear-gradient(180deg,"+C.card+" 0%,transparent 100%)",padding:"50px 20px 16px"}}>
          <button onClick={()=>setScreen("scoring")} style={{background:"rgba(123,180,80,0.15)",border:"1px solid "+C.green,color:C.green,fontSize:13,cursor:"pointer",padding:"8px 16px",borderRadius:20,fontWeight:700,marginBottom:12,display:"block"}}>‹ Back to Scoring</button>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:26,fontWeight:800}}>🏆 {course.name}</div>
            <div style={{fontSize:12,color:C.muted,marginTop:4}}>
              {ballsByPar[3]===ballsByPar[4]&&ballsByPar[4]===ballsByPar[5]
                ? `${ballsByPar[4]||2} Best Ball`
                : `Par3:${ballsByPar[3]||2} Par4:${ballsByPar[4]||2} Par5:${ballsByPar[5]||2}`
              }{birdieBonus?" - Birdie Bonus":""} - Hole {currentHole}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{display:"flex",borderBottom:"1px solid "+C.border,background:"rgba(0,0,0,0.2)",overflowX:"auto"}}>
          {[["standings","Standings"],["scorecard","Scorecard"],["top10","Individuals"],["skins","Skins"],["bets","💵 Bets"],["rules","📋 Rules"],...(ctpEnabled?[["ctp","CTP"]]:[])]
            .map(([id,lbl])=>(
            <button key={id} onClick={()=>setLbTab(id)} style={{flex:1,padding:"10px 2px",fontSize:11,fontWeight:lbTab===id?700:500,background:"transparent",color:lbTab===id?(id==="ctp"?C.gold:C.green):C.muted,border:"none",borderBottom:lbTab===id?"2px solid "+(id==="ctp"?C.gold:C.green):"2px solid transparent",cursor:"pointer",whiteSpace:"nowrap",flexShrink:0}}>{lbl}</button>
          ))}
        </div>

        <div style={{padding:"16px"}}>
          {lbTab==="standings"&&(
            <>
              <div style={{display:"flex",padding:"4px 14px",marginBottom:4}}>
                <div style={{flex:1,fontSize:10,color:C.muted,letterSpacing:1.5,textTransform:"uppercase"}}>Team</div>
                {["F9","B9","TOT"].map(l=><div key={l} style={{width:44,textAlign:"center",fontSize:10,color:C.muted,letterSpacing:1,textTransform:"uppercase"}}>{l}</div>)}
              </div>
              {board.map((team,rank)=>(
                <div key={team.id||rank} style={{background:rank===0?"rgba(232,184,75,0.08)":C.card,border:"1px solid "+(rank===0?C.gold+"44":C.border),borderRadius:14,padding:"14px",marginBottom:8}}>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <div style={{width:30,height:30,borderRadius:"50%",flexShrink:0,background:rank===0?C.gold:rank===1?"#aaa":rank===2?"#cd7f32":C.dim,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:13,color:rank<3?"#0a1a0f":C.muted}}>{rank+1}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <div style={{width:10,height:10,borderRadius:"50%",background:team.color,flexShrink:0}}/>
                        <div style={{fontWeight:800,fontSize:15,color:rank===0?C.gold:C.text}}>{team.name}</div>
                        {team.strokesPerSide>0&&<div style={{fontSize:9,color:C.gold}}>+{team.strokesPerSide}/side</div>}
                      </div>
                      <div style={{fontSize:11,color:C.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginTop:2}}>{(team.players||[]).filter(Boolean).join(" / ")||"No players"}</div>
                    </div>
                    {[team.sc.frontDiff,team.sc.backDiff,team.sc.totalDiff].map((d,idx)=>(
                      <div key={idx} style={{width:44,textAlign:"center",fontWeight:800,fontSize:16,color:team.sc.total===0?C.muted:relColor(d)}}>{team.sc.total===0?"--":relLabel(d)}</div>
                    ))}
                  </div>
                </div>
              ))}
              <div style={{height:12}}/>
              <GhostBtn onClick={()=>setScreen("home")}>← Back to Home</GhostBtn>
            </>
          )}

          {lbTab==="scorecard"&&(
            <div style={{overflowX:"auto"}}>
              <div style={{fontSize:10,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>Hole by Hole · vs Par</div>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:11,minWidth:500}}>
                <thead>
                  <tr style={{borderBottom:"1px solid "+C.border}}>
                    <th style={{textAlign:"left",padding:"4px 6px",color:C.muted}}>Team</th>
                    {course.holes.filter(h=>h.side==="front").map(h=><th key={h.hole} style={{padding:"3px",textAlign:"center",color:C.muted,fontWeight:500}}>{h.hole}</th>)}
                    <th style={{padding:"3px 5px",textAlign:"center",color:C.green,fontWeight:700}}>F</th>
                    {course.holes.filter(h=>h.side==="back").map(h=><th key={h.hole} style={{padding:"3px",textAlign:"center",color:C.muted,fontWeight:500}}>{h.hole}</th>)}
                    <th style={{padding:"3px 5px",textAlign:"center",color:C.green,fontWeight:700}}>B</th>
                    <th style={{padding:"3px 5px",textAlign:"center",color:C.gold,fontWeight:700}}>T</th>
                  </tr>
                </thead>
                <tbody>
                  {board.map((team,ri)=>{
                    const fH=course.holes.filter(h=>h.side==="front");
                    const bH=course.holes.filter(h=>h.side==="back");
                    return(
                      <tr key={team.id||ri} style={{borderTop:"1px solid "+C.dim}}>
                        <td style={{padding:"4px 6px",fontWeight:700,color:team.color,whiteSpace:"nowrap"}}>{team.name}</td>
                        {fH.map(h=>{const hd=team.sc.byHole[h.hole];return<td key={h.hole} style={{padding:"4px 3px",textAlign:"center",fontWeight:600,color:hd?relColor(hd.diff):C.dim}}>{hd?relLabel(hd.diff):"--"}</td>;})}
                        <td style={{padding:"4px",textAlign:"center",fontWeight:800,color:team.sc.front?relColor(team.sc.frontDiff):C.muted}}>{team.sc.front?relLabel(team.sc.frontDiff):"--"}</td>
                        {bH.map(h=>{const hd=team.sc.byHole[h.hole];return<td key={h.hole} style={{padding:"4px 3px",textAlign:"center",fontWeight:600,color:hd?relColor(hd.diff):C.dim}}>{hd?relLabel(hd.diff):"--"}</td>;})}
                        <td style={{padding:"4px",textAlign:"center",fontWeight:800,color:team.sc.back?relColor(team.sc.backDiff):C.muted}}>{team.sc.back?relLabel(team.sc.backDiff):"--"}</td>
                        <td style={{padding:"4px",textAlign:"center",fontWeight:800,color:team.sc.total?relColor(team.sc.totalDiff):C.muted}}>{team.sc.total?relLabel(team.sc.totalDiff):"--"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {Object.keys(holeNotes).filter(hn=>String(holeNotes[hn]||"").trim()!=="").length>0&&(
                <div style={{background:C.card,border:"1px solid "+C.border,borderRadius:12,padding:"14px 16px",marginTop:14}}>
                  <div style={{fontWeight:700,fontSize:14,marginBottom:8}}>📋 Hole notes</div>
                  {Object.keys(holeNotes).filter(hn=>String(holeNotes[hn]||"").trim()!=="").sort((a,b)=>a-b).map(hn=>(
                    <div key={hn} style={{fontSize:13,lineHeight:1.5,marginBottom:4}}>Hole {hn} — {holeNotes[hn]}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          {lbTab==="top10"&&<Top10Tab teams={teams} course={course} holePars={holePars} C={C}/>}

          {lbTab==="skins"&&<SkinsTab teams={teams} course={course} holePars={holePars} skinsEnabled={skinsEnabled} bigBoyEnabled={bigBoyEnabled} teammatesTie={teammatesTie}/>}

          {lbTab==="bets"&&(
            <div>
              <div style={{fontSize:11,color:C.gold,letterSpacing:1.5,textTransform:"uppercase",marginBottom:12,fontWeight:600}}>Side Bets · set up by the director</div>
              <div style={{marginBottom:14}}>
                <GhostBtn onClick={()=>setShowBetSetup(v=>!v)}>{showBetSetup?"− Close setup":"＋ Set up Bet"}</GhostBtn>
              </div>
              {showBetSetup&&(
                <div style={{background:C.card,border:"1px solid "+C.border,borderRadius:14,padding:"14px",marginBottom:14}}>
                  <Lbl>Player A</Lbl>
                  <select value={betA} onChange={e=>setBetA(e.target.value)} style={{width:"100%",padding:"12px",borderRadius:10,background:C.surface,color:C.text,border:"1px solid "+C.border,fontSize:14,marginBottom:12}}>
                    <option value="">— pick a player —</option>
                    {allPlayers.map(p=><option key={p.team+":"+p.pi} value={p.team+":"+p.pi}>{p.name} ({p.teamName})</option>)}
                  </select>
                  <Lbl>Player B</Lbl>
                  <select value={betB} onChange={e=>setBetB(e.target.value)} style={{width:"100%",padding:"12px",borderRadius:10,background:C.surface,color:C.text,border:"1px solid "+C.border,fontSize:14,marginBottom:12}}>
                    <option value="">— pick a player —</option>
                    {allPlayers.map(p=><option key={p.team+":"+p.pi} value={p.team+":"+p.pi}>{p.name} ({p.teamName})</option>)}
                  </select>
                  <Lbl>Game</Lbl>
                  <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:12}}>
                    {[["skins","Skins"],["nassau","Nassau"],["nassau-press","Nassau + Auto Press"],["match","Match Play"]].map(([id,lbl])=>(
                      <button key={id} onClick={()=>setBetType(id)} style={{flex:1,padding:"10px 4px",borderRadius:8,background:betType===id?C.green:C.surface,color:betType===id?"#0a1a0f":C.muted,border:"1px solid "+(betType===id?C.green:C.border),cursor:"pointer",fontSize:12,fontWeight:betType===id?700:500,whiteSpace:"nowrap"}}>{lbl}</button>
                    ))}
                  </div>
                  <NumStepper value={betAmount} onChange={setBetAmount} min={1} max={99} label={betType==="skins"?"$ per skin":betType==="match"?"$ per hole":"$ per side / total"}/>
                  <Lbl>Strokes — belong to the bet, not the tournament</Lbl>
                  <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:8}}>
                    {[["none","No strokes"],["A",(betAName||"Player A")+" gets strokes"],["B",(betBName||"Player B")+" gets strokes"]].map(([id,lbl])=>(
                      <button key={id} onClick={()=>setBetStrokesTo(id)} style={{flex:1,padding:"10px 4px",borderRadius:8,background:betStrokesTo===id?C.gold:C.surface,color:betStrokesTo===id?"#0a1a0f":C.muted,border:"1px solid "+(betStrokesTo===id?C.gold:C.border),cursor:"pointer",fontSize:12,fontWeight:betStrokesTo===id?700:500,whiteSpace:"nowrap"}}>{lbl}</button>
                    ))}
                  </div>
                  {betStrokesTo!=="none"&&(
                    <>
                      <NumStepper value={betStrokesCount} onChange={setBetStrokesCount} min={1} max={18} label="Strokes (split per side — 2 = 1 front + 1 back)"/>
                      <div style={{fontSize:11,color:C.muted,marginBottom:12}}>Strokes fall on the hardest holes of each side.</div>
                    </>
                  )}
                  {betType==="nassau-press"&&(
                    <>
                      <Lbl>Auto press triggers when</Lbl>
                      <div style={{display:"flex",gap:6,marginBottom:8}}>
                        {[1,2,3].map(n=>(
                          <button key={n} onClick={()=>setBetPressDown(n)} style={{flex:1,padding:"12px",borderRadius:8,background:betPressDown===n?C.gold:C.surface,color:betPressDown===n?"#0a1a0f":C.muted,border:"1px solid "+(betPressDown===n?C.gold:C.border),cursor:"pointer",fontSize:13,fontWeight:betPressDown===n?700:500}}>{n} down</button>
                        ))}
                      </div>
                      <div style={{fontSize:11,color:C.muted,marginBottom:12}}>Auto presses only — no manual presses on tournament side bets.</div>
                    </>
                  )}
                  <BigBtn onClick={saveBet}>Save bet</BigBtn>
                </div>
              )}
              <SideBetsTab bets={sideBets} teams={teams} course={course} courseId={courseId} C={C} onDelete={(id)=>setSideBets(prev=>prev.filter(b=>b.id!==id))}/>
            </div>
          )}

          {lbTab==="rules"&&(<RulesTab rules={directorRules} holeNotes={holeNotes} C={C}/>)}

          {lbTab==="ctp"&&(
            <div>
              <div style={{fontSize:11,color:C.gold,letterSpacing:1.5,textTransform:"uppercase",marginBottom:14,fontWeight:600}}>Closest to the Pin Results</div>
              {course.holes.filter(h=>(holePars[h.hole]??h.par)===3).map(h=>{
                const leader=ctpLeaders[h.hole];
                const effP=holePars[h.hole]??h.par;
                return(
                  <div key={h.hole} style={{background:leader?"rgba(232,184,75,0.08)":C.card,border:"1px solid "+(leader?"rgba(232,184,75,0.4)":C.border),borderRadius:14,padding:"16px",marginBottom:12}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:leader?10:0}}>
                      <div>
                        <div style={{fontWeight:800,fontSize:16}}>Hole {h.hole}</div>
                        <div style={{fontSize:11,color:C.muted}}>Par {effP} - Hdcp {h.hdcp}</div>
                      </div>
                      {leader?(
                        <div style={{textAlign:"right"}}>
                          <div style={{fontSize:24,fontWeight:800,color:C.gold}}>{leader.distance}</div>
                          <div style={{fontSize:10,color:C.muted}}>from the pin</div>
                        </div>
                      ):(
                        <div style={{fontSize:12,color:C.dim}}>No entry yet</div>
                      )}
                    </div>
                    {leader&&(
                      <div style={{background:"rgba(232,184,75,0.12)",borderRadius:10,padding:"10px 12px",display:"flex",alignItems:"center",gap:10}}>
                        <div style={{fontSize:16,color:C.gold,fontWeight:800}}>[CTP]</div>
                        <div>
                          <div style={{fontWeight:800,fontSize:15,color:C.gold}}>{leader.name}</div>
                          <div style={{fontSize:12,color:C.muted}}>{leader.teamName}</div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}
