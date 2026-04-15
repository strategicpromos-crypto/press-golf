import React, { useState, useEffect, useRef } from "react";
import { COURSES } from "./golf.js";
import { sb } from "./supabase.js";
import TourneyJoin from "./TourneyJoin.jsx";
import TourneyCaptain from "./TourneyCaptain.jsx";
import TourneySpectator from "./TourneySpectator.jsx";
import { calcSkins, SkinsTab } from "./skins.jsx";

const C = {
  bg:"#080f0a", surface:"#0e1a10", card:"#121e14",
  border:"rgba(123,180,80,0.18)", green:"#7bb450", gold:"#e8b84b",
  red:"#e05050", text:"#e8f0e9", muted:"#6b7f6d", dim:"#1e2f20",
};

const TEAM_COLORS = [
  "#e8b84b","#7bb450","#5b9bd5","#e05050",
  "#b07dd5","#50c8c8","#e88a3a","#c8c850",
  "#d570a0","#70d5a0","#a0a0e8","#e8a070",
];

function safeInt(v,f=0){const n=parseInt(v,10);return isNaN(n)?f:n;}
function relLabel(d){if(d===null||d===undefined)return"—";if(d===0)return"E";return d>0?"+"+d:String(d);}
function relColor(d){if(d===null||d===undefined)return C.muted;if(d<0)return C.green;if(d>0)return C.red;return C.muted;}

// Build top 10 individual leaderboard from all teams
function calcIndividualLeaderboard(teams, holeData){
  const players = [];
  teams.forEach((team, teamIdx) => {
    for(let pi = 0; pi < (team.size||1); pi++){
      const name = team.players?.[pi]?.trim()
        ? team.players[pi].trim()
        : `Player ${pi+1}`;
      const teamName = team.name || `Team ${teamIdx+1}`;
      let total = 0, holesPlayed = 0;
      for(const h of holeData){
        const s = team.scores?.[pi]?.[h.hole];
        if(s !== undefined && s !== null){
          total += safeInt(s) - h.par;
          holesPlayed++;
        }
      }
      players.push({ name, teamName, teamColor: team.color||TEAM_COLORS[teamIdx%TEAM_COLORS.length], total, holesPlayed, teamIdx, pi });
    }
  });
  // Sort by score (lowest = best), then holes played descending
  return players
    .filter(p => p.holesPlayed > 0)
    .sort((a,b) => a.total !== b.total ? a.total - b.total : b.holesPlayed - a.holesPlayed)
    .slice(0, 10);
}

// Top 10 leaderboard UI — reused across director, captain, spectator
function Top10Tab({ teams, course }){
  const players = calcIndividualLeaderboard(teams, course.holes);
  const medals = ["🥇","🥈","🥉"];
  if(players.length === 0) return(
    <div style={{textAlign:"center",padding:"40px 20px",color:C.muted}}>
      <div style={{fontSize:32,marginBottom:12}}>⛳</div>
      <div style={{fontSize:14}}>Individual scores will appear here as players enter their scores.</div>
    </div>
  );
  return(
    <div>
      <div style={{fontSize:11,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:12,textAlign:"center"}}>Individual scores · all players</div>
      {players.map((p,i)=>(
        <div key={`${p.teamIdx}-${p.pi}`} style={{background:i===0?"rgba(232,184,75,0.08)":C.card,border:`1px solid ${i===0?C.gold+"44":C.border}`,borderRadius:12,padding:"12px 14px",marginBottom:8,display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:32,textAlign:"center",fontSize:i<3?20:14,fontWeight:800,color:i<3?C.gold:C.muted,flexShrink:0}}>
            {i<3?medals[i]:i+1}
          </div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontWeight:800,fontSize:15,color:i===0?C.gold:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.name}</div>
            <div style={{display:"flex",alignItems:"center",gap:6,marginTop:2}}>
              <div style={{width:8,height:8,borderRadius:"50%",background:p.teamColor,flexShrink:0}}/>
              <div style={{fontSize:11,color:C.muted}}>{p.teamName}</div>
            </div>
          </div>
          <div style={{textAlign:"right",flexShrink:0}}>
            <div style={{fontSize:22,fontWeight:800,color:relColor(p.total)}}>{relLabel(p.total)}</div>
            <div style={{fontSize:10,color:C.dim}}>thru {p.holesPlayed}</div>
          </div>
        </div>
      ))}
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
        <button onClick={()=>onChange(Math.max(min,value-1))} style={{width:36,height:36,borderRadius:"50%",background:C.dim,border:"1px solid "+C.border,color:C.text,fontSize:20,fontWeight:700,cursor:"pointer"}}>−</button>
        <div style={{width:32,textAlign:"center",fontSize:18,fontWeight:800,color:C.text}}>{value}</div>
        <button onClick={()=>onChange(Math.min(max,value+1))} style={{width:36,height:36,borderRadius:"50%",background:C.dim,border:"1px solid "+C.border,color:C.text,fontSize:20,fontWeight:700,cursor:"pointer"}}>+</button>
      </div>
    </div>
  );
}

export default function TeamTournament({onBack, user, onDelete}){
  const[screen,setScreen]=useState("home");
  const[courseId,setCourseId]=useState("south-toledo");
  const[birdieBonus,setBirdieBonus]=useState(true);
  const[ballsByPar,setBallsByPar]=useState({3:2,4:2,5:2}); // balls counted per hole by par
  const[skinsEnabled,setSkinsEnabled]=useState(false);
  const[bigBoyEnabled,setBigBoyEnabled]=useState(false);
  const[ctpLeaders,setCtpLeaders]=useState({});    // {holeNum:{name,distance}}
  const[ctpPopup,setCtpPopup]=useState(null);        // hole number of open CTP popup
  const[ctpName,setCtpName]=useState('');
  const[ctpDist,setCtpDist]=useState('');
  const[holePars,setHolePars]=useState({});        // override pars: {4:4} = hole 4 → par 4
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
  const[captainTourney,setCaptainTourney]=useState(null);
  const[captainTeamIdx,setCaptainTeamIdx]=useState(0);
  const[spectatorTourney,setSpectatorTourney]=useState(null);
  const[lbTab,setLbTab]=useState("standings");      // leaderboard tab
  const[showSettings,setShowSettings]=useState(false); // director settings overlay
  const[userCourses,setUserCourses]=useState([]);        // custom courses from Supabase
  const[showAddCourse,setShowAddCourse]=useState(false); // show course entry form
  const[newCourseName,setNewCourseName]=useState("");
  const[newCourseCity,setNewCourseCity]=useState("");
  const[newCoursePar,setNewCoursePar]=useState(72);
  const[newCourseHoles,setNewCourseHoles]=useState(
    Array.from({length:18},(_,i)=>({hole:i+1,par:4,hdcp:i+1,yards:400,side:i<9?"front":"back"}))
  );
  const[savingCourse,setSavingCourse]=useState(false);
  const saveTimer=useRef(null);
  const subRef=useRef(null);
  // Helper: get course object from built-in or user courses
  function getCourse(id){
    if(COURSES[id]) return COURSES[id];
    return userCourses.find(c=>c.id===id)||null;
  }
  const course=getCourse(courseId);

  useEffect(()=>{ loadSaved(); loadUserCourses(); },[]);

  async function loadUserCourses(){
    if(!user?.id) return;
    const{data}=await sb.from("user_courses").select("*").eq("owner_id",user.id).order("name");
    if(data) setUserCourses(data);
  }

  // ── Real-time: director sees captain scores instantly ──────────────────────
  useEffect(()=>{
    if(!tourneyId||(screen!=="scoring"&&screen!=="leaderboard"))return;
    subRef.current=sb
      .channel("director_"+tourneyId)
      .on("postgres_changes",{event:"UPDATE",schema:"public",table:"team_tournaments",filter:"id=eq."+tourneyId},
        payload=>{
          if(payload.new?.teams){
            setTeams(payload.new.teams);
          }
          if(payload.new?.ctp_leaders){
            setCtpLeaders(payload.new.ctp_leaders);
          }
        })
      .subscribe();
    return()=>{ if(subRef.current){sb.removeChannel(subRef.current);subRef.current=null;} };
  },[tourneyId,screen]);

  async function loadSaved(){
    if(!user?.id)return;
    const{data}=await sb.from("team_tournaments")
      .select("id,name,course_id,created_at,updated_at,status,current_hole,teams,director_code,spectator_code")
      .eq("owner_id",user.id)
      .order("updated_at",{ascending:false})
      .limit(10);
    if(data)setSavedTourneys(data);
  }

  async function saveUserCourse(){
    if(!newCourseName.trim()) return;
    setSavingCourse(true);
    const id = "custom-" + Date.now();
    const courseData = {
      id,
      owner_id: user.id,
      name: newCourseName.trim(),
      city: newCourseCity.trim(),
      par: newCoursePar,
      holes: newCourseHoles.map(h=>({...h,par:parseInt(h.par)||4,hdcp:parseInt(h.hdcp)||1,yards:parseInt(h.yards)||400})),
    };
    await sb.from("user_courses").insert(courseData);
    await loadUserCourses();
    setCourseId(id);
    setShowAddCourse(false);
    setNewCourseName(""); setNewCourseCity(""); setNewCoursePar(72);
    setNewCourseHoles(Array.from({length:18},(_,i)=>({hole:i+1,par:4,hdcp:i+1,yards:400,side:i<9?"front":"back"})));
    setSavingCourse(false);
  }

  // ── Auto-save whenever teams/scores/hole change ────────────────────────────
  useEffect(()=>{
    if(!tourneyId||screen==="home"||screen==="saved"||screen==="join")return;
    if(saveTimer.current)clearTimeout(saveTimer.current);
    setSaveStatus("saving");
    saveTimer.current=setTimeout(async()=>{
      // Never downgrade status — once scoring starts, always stay "active"
      // Leaderboard screen should not reset status to "setup"
      const newStatus = (screen==="scoring"||screen==="leaderboard") ? "active" : "setup";
      await sb.from("team_tournaments").update({
        teams,
        course_id:courseId,
        birdie_bonus:birdieBonus,
        ball_count_by_par:ballsByPar,
        hole_pars:holePars,
        skins_enabled:skinsEnabled,
        big_boy_enabled:bigBoyEnabled,
        ctp_leaders:ctpLeaders,
        current_hole:currentHole,
        status:newStatus,
        updated_at:new Date().toISOString(),
      }).eq("id",tourneyId);
      setSaveStatus("saved");
      setTimeout(()=>setSaveStatus(""),2000);
      loadSaved();
    },800);
    return()=>clearTimeout(saveTimer.current);
  },[teams,currentHole,courseId,birdieBonus,holePars,ballsByPar,skinsEnabled,bigBoyEnabled,ctpLeaders,tourneyId]);

  // ── Create new tournament in DB ────────────────────────────────────────────
  async function createTourney(builtTeams){
    if(!user?.id)return null;

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

    const name = COURSES[courseId]?.name + " · " + now.toLocaleDateString("en-US",{month:"short",day:"numeric"});
    const{data}=await sb.from("team_tournaments").insert({
      owner_id:user.id,
      name,
      course_id:courseId,
      birdie_bonus:birdieBonus,
      ball_count_by_par:ballsByPar,
      hole_pars:holePars,
      skins_enabled:skinsEnabled,
      big_boy_enabled:bigBoyEnabled,
      ctp_leaders:{},
      teams:teamsWithPins,
      current_hole:1,
      status:"setup",
      director_code:dirCode,       // WEDS48#7XQ — director only
      spectator_code:publicCode,   // WEDS48 — public
    }).select().single();
    if(data){
      setDirectorCode(dirCode);
      setTeams(teamsWithPins);
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
      setSkinsEnabled(data.skins_enabled===true);
      setBigBoyEnabled(data.big_boy_enabled===true);
      setCtpLeaders(data.ctp_leaders||{});
      setTeams(data.teams||[]);
      setNumTeams((data.teams||[]).length);
      setCurrentHole(data.current_hole||1);
      setActiveTeam(0);
      setDirectorCode(data.director_code||null);
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

  function getLeaderboard(){
    return teams.map(t=>({...t,sc:calcTeamScore(t.scores,t.size,course.holes,birdieBonus,ballsByPar,holePars)}))
      .sort((a,b)=>a.sc.totalDiff-b.sc.totalDiff);
  }

  const holeData=course?.holes[currentHole-1];
  const isLastHole=currentHole===(course?.holes?.length||18);

  // JOIN (spectator / captain / director via code entry)
  if(screen==="join"){
    return(
      <TourneyJoin
        code={null}
        teamIdx={null}
        onDirector={()=>setScreen("home")}
        onCaptain={(t,idx)=>{
          setScreen("captainView");
          setCaptainTourney(t);
          setCaptainTeamIdx(idx);
        }}
        onSpectator={(t)=>{
          setScreen("spectatorView");
          setSpectatorTourney(t);
        }}
      />
    );
  }

  if(screen==="captainView"&&captainTourney){
    return <TourneyCaptain tourney={captainTourney} teamIdx={captainTeamIdx} onBack={()=>setScreen("join")}/>;
  }

  if(screen==="spectatorView"&&spectatorTourney){
    return <TourneySpectator tourney={spectatorTourney} onBack={()=>setScreen("join")}/>;
  }

  // HOME
  if(screen==="home"){
    // Show in "active" section: status=active OR has any scores (guards against status corruption)
    const active=(savedTourneys||[]).filter(t=>
      t.status==="active"||(t.teams||[]).some(tm=>Object.keys(tm?.scores||{}).length>0)
    );
    const setups=(savedTourneys||[]).filter(t=>
      t.status==="setup"&&!(t.teams||[]).some(tm=>Object.keys(tm?.scores||{}).length>0)
    );
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
                          {loading?"Loading...":"▶ Resume Round"}
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
                      <div style={{fontSize:10,color:C.muted,marginBottom:10}}>
                        Links generated when you Tee Off
                      </div>
                      <div style={{display:"flex",gap:8}}>
                        <button onClick={()=>resumeTourney(t)} disabled={loading} style={{flex:1,padding:"11px",background:C.green,color:"#0a1a0f",border:"none",borderRadius:10,fontSize:13,fontWeight:800,cursor:"pointer"}}>
                          ✏️ Edit Setup
                        </button>
                        <button onClick={async()=>{
                          // Tee Off on a setup tournament — lock it and go
                          await resumeTourney(t);
                          setCurrentHole(1);setActiveTeam(0);
                          await sb.from("team_tournaments").update({status:"active",current_hole:1,updated_at:new Date().toISOString()}).eq("id",t.id);
                          setScreen("scoring");
                        }} style={{flex:1,padding:"11px",background:"transparent",color:C.green,border:"1px solid "+C.green+"44",borderRadius:10,fontSize:13,fontWeight:700,cursor:"pointer"}}>
                          ⛳ Tee Off
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* New tournament — goes to setup screen, DB entry created only on Tee Off */}
          <BigBtn onClick={()=>{
            // Reset state for a fresh setup — no DB entry created yet
            setTourneyId(null);
            setDirectorCode(null);
            setTeams(buildTeams(numTeams));
            setCurrentHole(1);
            setActiveTeam(0);
            setCourseId("south-toledo");
            setBirdieBonus(true);
            setBallsByPar({3:2,4:2,5:2});
            setHolePars({});
            setSkinsEnabled(false);
            setBigBoyEnabled(false);
            setCtpLeaders({});
            setScreen("setup");
          }}>+ New Tournament Setup</BigBtn>

          <div style={{height:10}}/>
          <GhostBtn onClick={()=>setScreen("join")} color={C.green}>🔑 Join a Tournament</GhostBtn>
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
                {icon:"🎯",title:"Director",desc:"Creates the tournament, sets teams and players, shares codes. Can edit any score."},
                {icon:"⛳",title:"Team Captain",desc:"Gets a private code + PIN. Enters their team's scores hole by hole. Can fix any hole anytime."},
                {icon:"👀",title:"Spectator",desc:"Uses the public code to watch the live leaderboard. No account needed. Pull down to refresh."},
              ].map((r,i)=>(
                <div key={i} style={{background:C.card,border:"1px solid "+C.border,borderRadius:12,padding:"14px",marginBottom:10}}>
                  <div style={{fontSize:13,fontWeight:700,marginBottom:4}}>{r.icon} {r.title}</div>
                  <div style={{fontSize:12,color:C.muted,lineHeight:1.6}}>{r.desc}</div>
                </div>
              ))}

              <div style={{fontSize:11,color:C.green,letterSpacing:1.5,textTransform:"uppercase",margin:"16px 0 8px",fontWeight:600}}>Codes</div>
              {[
                {code:"WEDS48-ABC",label:"Public code",desc:"Announce to everyone. Spectators use this to watch. Unique to your tournament."},
                {code:"WEDS48-ABC-T1",label:"Captain code",desc:"Send privately to Team 1 captain along with their 4-digit PIN."},
              ].map((r,i)=>(
                <div key={i} style={{background:C.card,border:"1px solid "+C.border,borderRadius:12,padding:"14px",marginBottom:8}}>
                  <div style={{fontFamily:"monospace",fontSize:16,fontWeight:800,color:C.gold,marginBottom:4}}>{r.code}</div>
                  <div style={{fontSize:12,color:C.green,fontWeight:600,marginBottom:2}}>{r.label}</div>
                  <div style={{fontSize:12,color:C.muted}}>{r.desc}</div>
                </div>
              ))}

              <div style={{fontSize:11,color:C.green,letterSpacing:1.5,textTransform:"uppercase",margin:"16px 0 8px",fontWeight:600}}>Scoring Rules</div>
              {[
                {title:"2 Best Ball",desc:"The 2 lowest scores on your team count every hole. App picks them automatically — marked with ✓ COUNTS."},
                {title:"Birdie Bonus",desc:"3+ birdies/eagles on a hole = extra strokes off. Each player beyond the top 2 adds their vs-par value. 3 eagles = −2 bonus."},
                {title:"Front / Back / Total",desc:"Three separate bets. Scores show as −2, E, +3 vs par. Leaderboard ranks by total."},
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

  // ADD COURSE FORM
  if(showAddCourse){
    const inp2={width:"100%",padding:"12px",background:C.surface,border:"1px solid "+C.border,borderRadius:8,color:C.text,fontSize:14,outline:"none",boxSizing:"border-box"};
    return(
      <div style={{fontFamily:"Georgia,serif",minHeight:"100vh",background:C.bg,color:C.text,paddingBottom:60}}>
        <div style={{background:"linear-gradient(180deg,"+C.card+" 0%,transparent 100%)",padding:"50px 20px 20px"}}>
          <button onClick={()=>setShowAddCourse(false)} style={{background:"rgba(123,180,80,0.15)",border:"1px solid "+C.green,color:C.green,fontSize:13,cursor:"pointer",padding:"8px 16px",borderRadius:20,fontWeight:700,marginBottom:16}}>‹ Back</button>
          <div style={{fontSize:22,fontWeight:800}}>Add a Course</div>
          <div style={{fontSize:12,color:C.muted,marginTop:4}}>Enter the scorecard details. Pull it up on 18Birdies or the club website.</div>
        </div>
        <div style={{padding:"0 20px"}}>

          {/* Course info */}
          <div style={{background:C.card,border:"1px solid "+C.border,borderRadius:12,padding:"16px",marginBottom:16}}>
            <div style={{fontSize:12,color:C.muted,marginBottom:6}}>Course name</div>
            <input value={newCourseName} onChange={e=>setNewCourseName(e.target.value)}
              placeholder="e.g. Sylvania Country Club" style={{...inp2,marginBottom:12,fontSize:16,fontWeight:700}}/>
            <div style={{fontSize:12,color:C.muted,marginBottom:6}}>City / State</div>
            <input value={newCourseCity} onChange={e=>setNewCourseCity(e.target.value)}
              placeholder="e.g. Sylvania, OH" style={{...inp2,marginBottom:12}}/>
            <div style={{fontSize:12,color:C.muted,marginBottom:6}}>Course par</div>
            <div style={{display:"flex",gap:8}}>
              {[70,71,72,73].map(p=>(
                <button key={p} onClick={()=>setNewCoursePar(p)} style={{flex:1,padding:"12px",borderRadius:8,border:"1px solid "+(newCoursePar===p?C.green:C.border),background:newCoursePar===p?C.green:"transparent",color:newCoursePar===p?"#0a1a0f":C.text,fontWeight:700,cursor:"pointer",fontSize:15}}>{p}</button>
              ))}
            </div>
          </div>

          {/* Hole-by-hole entry */}
          <div style={{fontSize:13,fontWeight:700,color:C.green,letterSpacing:1,textTransform:"uppercase",marginBottom:10}}>Scorecard</div>

          {/* Header */}
          <div style={{display:"grid",gridTemplateColumns:"36px 60px 60px 60px 70px",gap:4,marginBottom:6,padding:"0 4px"}}>
            {["Hole","Par","Hdcp","Yards","Side"].map(h=>(
              <div key={h} style={{fontSize:10,color:C.muted,letterSpacing:1,textTransform:"uppercase",textAlign:"center"}}>{h}</div>
            ))}
          </div>

          {/* Front 9 */}
          <div style={{fontSize:11,color:C.gold,fontWeight:700,letterSpacing:1,marginBottom:6,marginTop:4}}>FRONT 9</div>
          {newCourseHoles.slice(0,9).map((h,i)=>(
            <div key={i} style={{display:"grid",gridTemplateColumns:"36px 60px 60px 60px 70px",gap:4,marginBottom:6,alignItems:"center"}}>
              <div style={{fontWeight:800,fontSize:14,textAlign:"center",color:C.muted}}>{h.hole}</div>
              <select value={h.par} onChange={e=>{const hs=[...newCourseHoles];hs[i]={...hs[i],par:parseInt(e.target.value)};setNewCourseHoles(hs);}}
                style={{...inp2,padding:"8px 4px",textAlign:"center",fontSize:14}}>
                {[3,4,5].map(p=><option key={p} value={p}>{p}</option>)}
              </select>
              <input type="number" value={h.hdcp} onChange={e=>{const hs=[...newCourseHoles];hs[i]={...hs[i],hdcp:e.target.value};setNewCourseHoles(hs);}}
                style={{...inp2,padding:"8px 4px",textAlign:"center",fontSize:14}} min="1" max="18"/>
              <input type="number" value={h.yards} onChange={e=>{const hs=[...newCourseHoles];hs[i]={...hs[i],yards:e.target.value};setNewCourseHoles(hs);}}
                style={{...inp2,padding:"8px 4px",textAlign:"center",fontSize:14}}/>
              <div style={{fontSize:10,color:C.muted,textAlign:"center"}}>front</div>
            </div>
          ))}

          {/* Front totals */}
          <div style={{display:"flex",justifyContent:"space-between",padding:"8px 4px",marginBottom:16,borderTop:"1px solid "+C.border,fontSize:12,color:C.muted}}>
            <span>OUT</span>
            <span>Par {newCourseHoles.slice(0,9).reduce((s,h)=>s+(parseInt(h.par)||0),0)}</span>
            <span>{newCourseHoles.slice(0,9).reduce((s,h)=>s+(parseInt(h.yards)||0),0)} yds</span>
          </div>

          {/* Back 9 */}
          <div style={{fontSize:11,color:C.gold,fontWeight:700,letterSpacing:1,marginBottom:6}}>BACK 9</div>
          {newCourseHoles.slice(9,18).map((h,i)=>(
            <div key={i+9} style={{display:"grid",gridTemplateColumns:"36px 60px 60px 60px 70px",gap:4,marginBottom:6,alignItems:"center"}}>
              <div style={{fontWeight:800,fontSize:14,textAlign:"center",color:C.muted}}>{h.hole}</div>
              <select value={h.par} onChange={e=>{const hs=[...newCourseHoles];hs[i+9]={...hs[i+9],par:parseInt(e.target.value)};setNewCourseHoles(hs);}}
                style={{...inp2,padding:"8px 4px",textAlign:"center",fontSize:14}}>
                {[3,4,5].map(p=><option key={p} value={p}>{p}</option>)}
              </select>
              <input type="number" value={h.hdcp} onChange={e=>{const hs=[...newCourseHoles];hs[i+9]={...hs[i+9],hdcp:e.target.value};setNewCourseHoles(hs);}}
                style={{...inp2,padding:"8px 4px",textAlign:"center",fontSize:14}} min="1" max="18"/>
              <input type="number" value={h.yards} onChange={e=>{const hs=[...newCourseHoles];hs[i+9]={...hs[i+9],yards:e.target.value};setNewCourseHoles(hs);}}
                style={{...inp2,padding:"8px 4px",textAlign:"center",fontSize:14}}/>
              <div style={{fontSize:10,color:C.muted,textAlign:"center"}}>back</div>
            </div>
          ))}

          {/* Back + total */}
          <div style={{display:"flex",justifyContent:"space-between",padding:"8px 4px",borderTop:"1px solid "+C.border,fontSize:12,color:C.muted,marginBottom:4}}>
            <span>IN</span>
            <span>Par {newCourseHoles.slice(9,18).reduce((s,h)=>s+(parseInt(h.par)||0),0)}</span>
            <span>{newCourseHoles.slice(9,18).reduce((s,h)=>s+(parseInt(h.yards)||0),0)} yds</span>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",padding:"8px 4px",fontSize:13,fontWeight:700,color:C.text,marginBottom:24,borderTop:"1px solid "+C.border}}>
            <span>TOTAL</span>
            <span style={{color:C.green}}>Par {newCourseHoles.reduce((s,h)=>s+(parseInt(h.par)||0),0)}</span>
            <span>{newCourseHoles.reduce((s,h)=>s+(parseInt(h.yards)||0),0)} yds</span>
          </div>

          <button onClick={saveUserCourse} disabled={!newCourseName.trim()||savingCourse}
            style={{width:"100%",padding:"18px",background:newCourseName.trim()&&!savingCourse?C.green:"#1a2a1a",color:newCourseName.trim()&&!savingCourse?"#0a1a0f":C.muted,border:"none",borderRadius:12,fontSize:17,fontWeight:800,cursor:newCourseName.trim()&&!savingCourse?"pointer":"not-allowed"}}>
            {savingCourse?"Saving...":"⛳ Save Course"}
          </button>
        </div>
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
              {saveStatus==="saving"?"💾 Saving...":saveStatus==="saved"?"✓ Saved":""}
            </div>
          </div>
          <div style={{fontSize:22,fontWeight:800,textAlign:"center"}}>Tournament Setup</div>
          <div style={{fontSize:12,color:C.muted,textAlign:"center",marginTop:4}}>Auto-saved · come back anytime</div>
        </div>
        <div style={{padding:"0 20px"}}>

          {/* Course */}
          <div style={{marginBottom:16}}>
            <Lbl>Course</Lbl>
            <select value={courseId} onChange={e=>{setCourseId(e.target.value);setHolePars({});}} style={{width:"100%",padding:"14px",background:C.surface,border:"1px solid "+C.border,borderRadius:10,color:C.text,fontSize:15,outline:"none",WebkitAppearance:"none"}}>
              <optgroup label="Built-in Courses">
                {Object.entries(COURSES).map(([id,c])=>(
                  <option key={id} value={id}>{c.name} — Par {c.par}</option>
                ))}
              </optgroup>
              {userCourses.length>0&&(
                <optgroup label="My Courses">
                  {userCourses.map(c=>(
                    <option key={c.id} value={c.id}>{c.name} — Par {c.par}</option>
                  ))}
                </optgroup>
              )}
            </select>
            <button onClick={()=>setShowAddCourse(true)}
              style={{width:"100%",marginTop:8,padding:"11px",background:"transparent",border:"1px dashed rgba(123,180,80,0.4)",borderRadius:10,color:C.green,fontSize:13,fontWeight:700,cursor:"pointer"}}>
              + Add a Course
            </button>
          </div>

          {/* South Toledo hole #4 par toggle */}
          {courseId==="south-toledo"&&(
            <div style={{background:C.card,border:"1px solid "+C.border,borderRadius:12,padding:"14px 16px",marginBottom:16}}>
              <div style={{fontWeight:700,fontSize:15,marginBottom:4}}>South Toledo — Hole #4</div>
              <div style={{fontSize:11,color:C.muted,marginBottom:12}}>Normally par 3. Some groups play it as par 4. Set before teeing off.</div>
              <div style={{display:"flex",gap:8}}>
                {[3,4].map(p=>(
                  <button key={p} onClick={()=>setHolePars(prev=>({...prev,4:p}))}
                    style={{
                      flex:1,padding:"16px",
                      background:(holePars[4]??3)===p?C.green:"#1a2a1a",
                      color:(holePars[4]??3)===p?"#0a1a0f":"#ffffff",
                      border:"2px solid "+((holePars[4]??3)===p?C.green:"rgba(255,255,255,0.3)"),
                      borderRadius:10,fontSize:16,fontWeight:(holePars[4]??3)===p?800:600,cursor:"pointer"
                    }}>
                    Par {p}{p===3?" (default)":""}
                  </button>
                ))}
              </div>
              {(holePars[4]??3)===4&&(
                <div style={{fontSize:11,color:C.gold,marginTop:8,textAlign:"center"}}>
                  ⛳ Hole #4 playing as par 4 — course par becomes 71
                </div>
              )}
            </div>
          )}

          {/* Birdie Bonus */}
          <div style={{background:C.card,border:"1px solid "+C.border,borderRadius:12,padding:"14px 16px",marginBottom:16}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontWeight:700,fontSize:15}}>Birdie Bonus</div>
                <div style={{fontSize:11,color:C.muted,marginTop:3}}>{birdieBonus?"3+ birdies on a hole = extra −1 per additional birdie":"Off for this tournament"}</div>
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
                <div style={{fontSize:11,color:C.muted,marginTop:3}}>{skinsEnabled?"Tracking skins — live tab in leaderboard":"Off for this tournament"}</div>
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
                  <div style={{fontSize:11,color:C.muted,marginTop:3}}>{bigBoyEnabled?"Opt-in parallel game — BB players only":"Off"}</div>
                </div>
                <button onClick={()=>setBigBoyEnabled(b=>!b)} style={{width:52,height:28,borderRadius:14,border:"none",cursor:"pointer",background:bigBoyEnabled?C.gold:"#333",position:"relative",transition:"background 0.2s",flexShrink:0}}>
                  <div style={{position:"absolute",top:4,left:bigBoyEnabled?26:4,width:20,height:20,borderRadius:"50%",background:"#fff",transition:"left 0.2s"}}/>
                </button>
              </div>
              {bigBoyEnabled&&<div style={{fontSize:11,color:C.gold,marginTop:8,lineHeight:1.5}}>Mark players "BB" on each team's setup below. BB players compete only against other BB players — no teammate exception.</div>}
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
                        style={{flexShrink:0,padding:"6px 10px",borderRadius:8,fontSize:11,fontWeight:700,cursor:"pointer",
                          background:(team.bigBoy?.[j])?C.gold:"rgba(255,255,255,0.06)",
                          color:(team.bigBoy?.[j])?"#0a1a0f":"rgba(255,255,255,0.4)",
                          border:"1px solid "+((team.bigBoy?.[j])?"rgba(232,184,75,0.6)":"rgba(255,255,255,0.15)")
                        }}>BB</button>
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
                    <button onClick={()=>window.open(`sms:?&body=${encodeURIComponent("⛳ Watch the tournament live!\n"+spectatorLink)}`)}
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
          <BigBtn onClick={async()=>{
            setLoading(true);
            let id=tourneyId;
            if(!id){
              // First time teeing off — create the DB entry now and lock the ID
              id=await createTourney(teams);
              setTourneyId(id);
            } else {
              // Already exists — just flip status to active (ID never changes)
              await sb.from("team_tournaments").update({
                teams,course_id:courseId,birdie_bonus:birdieBonus,
                ball_count_by_par:ballsByPar,hole_pars:holePars,
                skins_enabled:skinsEnabled,big_boy_enabled:bigBoyEnabled,
                ctp_leaders:ctpLeaders,
                status:"active",current_hole:1,updated_at:new Date().toISOString()
              }).eq("id",id);
            }
            setLoading(false);
            setCurrentHole(1);setActiveTeam(0);
            setScreen("scoring");
          }}>
            {loading?"Creating...":"⛳ Tee It Up!"}
          </BigBtn>
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
                Par {effPar}{effPar!==holeData.par?" ⚡":""}  · Hdcp {holeData.hdcp}
              </div>
              {saveStatus&&<div style={{fontSize:10,color:saveStatus==="saving"?C.gold:C.green,marginTop:2}}>{saveStatus==="saving"?"💾 Saving...":"✓ Saved"}</div>}
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:6,alignItems:"flex-end"}}>
              <button onClick={()=>setScreen("home")}
                style={{background:"rgba(123,180,80,0.15)",border:"1px solid "+C.green,color:C.green,fontSize:11,cursor:"pointer",padding:"5px 10px",borderRadius:12,fontWeight:700}}>🏠 Home</button>
              <button onClick={()=>{setLbTab("standings");setScreen("leaderboard");}}
                style={{background:"rgba(232,184,75,0.15)",border:"1px solid "+C.gold,color:C.gold,fontSize:11,cursor:"pointer",padding:"5px 10px",borderRadius:12,fontWeight:700}}>📊 Leaderboard</button>
              <button onClick={()=>setShowSettings(true)}
                style={{background:"rgba(123,180,80,0.15)",border:"1px solid "+C.green,color:C.green,fontSize:13,cursor:"pointer",padding:"8px 14px",borderRadius:12,fontWeight:700}}>⚙️ Settings</button>
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
                    <div style={{fontSize:15,fontWeight:800,color:raw===0?C.muted:relColor(diff)}}>{raw===0?"—":relLabel(diff)}</div>
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
                  {diff!==null&&<div style={{fontSize:14,fontWeight:800,color:relColor(diff)}}>{relLabel(diff)}{diff<=-1?" 🐦":""}</div>}
                </div>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
                  <button onClick={()=>setPlayerScore(activeTeam,j,currentHole,score!==null?Math.max(1,score-1):effPar-1)}
                    style={{width:56,height:56,borderRadius:"50%",background:C.dim,border:"1px solid "+C.border,color:C.text,fontSize:30,fontWeight:700,cursor:"pointer"}}>−</button>
                  <div style={{flex:1,textAlign:"center"}}>
                    <div style={{fontSize:56,fontWeight:800,color:score!==null?C.text:C.muted,lineHeight:1}}>{score!==null?score:"—"}</div>
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

          {/* CTP button — only on par 3 holes */}
          {effPar===3&&(()=>{
            const leader=ctpLeaders[currentHole];
            return(
              <button onClick={()=>{setCtpName("");setCtpDist("");setCtpPopup(currentHole);}}
                style={{width:"100%",padding:"14px",marginBottom:12,
                  background:leader?"rgba(232,184,75,0.15)":"rgba(232,184,75,0.08)",
                  border:`2px solid ${leader?C.gold:"rgba(232,184,75,0.35)"}`,
                  borderRadius:14,cursor:"pointer",textAlign:"left",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontSize:13,fontWeight:800,color:C.gold}}>📍 Closest to the Pin</div>
                  {leader?(
                    <div style={{fontSize:12,color:C.text,marginTop:2}}>
                      {leader.name} · <span style={{color:C.gold,fontWeight:700}}>{leader.distance}</span>
                    </div>
                  ):(
                    <div style={{fontSize:11,color:C.muted,marginTop:2}}>Tap to enter CTP result</div>
                  )}
                </div>
                <div style={{fontSize:20}}>{leader?"📍":"☐"}</div>
              </button>
            );
          })()}

          <BigBtn onClick={()=>isLastHole?setScreen("leaderboard"):setCurrentHole(h=>h+1)} color={isLastHole?C.gold:C.green}>
            {isLastHole?"See Final Results 🏆":"Next — Hole "+(currentHole+1)}
          </BigBtn>

          {/* Mini standings */}
          <div style={{marginTop:12,display:"flex",gap:8,flexWrap:"wrap",justifyContent:"center"}}>
            {getLeaderboard().slice(0,5).map((t,rank)=>(
              <div key={t.id||rank} style={{background:C.card,border:"1px solid "+t.color+"44",borderRadius:20,padding:"5px 12px",fontSize:12,display:"flex",alignItems:"center",gap:6}}>
                <span style={{color:C.muted}}>{rank+1}.</span>
                <span style={{fontWeight:700,color:t.color}}>{t.name}</span>
                <span style={{fontWeight:800,color:relColor(t.sc.totalDiff)}}>{t.sc.total?relLabel(t.sc.totalDiff):"—"}</span>
              </div>
            ))}
          </div>
        </div>

        {/* CTP POPUP - simple name + distance */}
        {ctpPopup&&(()=>{
          const leader=ctpLeaders[ctpPopup];
          async function saveCtp(){
            if(!ctpName.trim()||!ctpDist.trim())return;
            const newLeaders={...ctpLeaders,[ctpPopup]:{name:ctpName.trim(),distance:ctpDist.trim(),hole:ctpPopup}};
            setCtpLeaders(newLeaders);
            await sb.from("team_tournaments").update({ctp_leaders:newLeaders,updated_at:new Date().toISOString()}).eq("id",tourneyId);
            setCtpPopup(null);setCtpName("");setCtpDist("");
          }
          return(
            <div style={{position:"fixed",inset:0,zIndex:600,background:"rgba(0,0,0,0.92)",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
              <div style={{background:C.surface,border:"2px solid "+C.gold,borderRadius:20,padding:24,width:"100%",maxWidth:340}}>
                <div style={{textAlign:"center",marginBottom:20}}>
                  <div style={{fontSize:32,marginBottom:6}}>📍</div>
                  <div style={{fontSize:20,fontWeight:800,color:C.gold}}>Closest to the Pin</div>
                  <div style={{fontSize:12,color:C.muted,marginTop:4}}>Hole {ctpPopup} · Par 3</div>
                </div>

                {leader&&(
                  <div style={{background:C.card,border:"1px solid rgba(232,184,75,0.3)",borderRadius:12,padding:"10px 14px",marginBottom:16,textAlign:"center"}}>
                    <div style={{fontSize:10,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:4}}>Current Leader</div>
                    <div style={{fontSize:20,fontWeight:800,color:C.gold}}>{leader.distance}</div>
                    <div style={{fontSize:12,color:C.muted,marginTop:2}}>{leader.name}</div>
                  </div>
                )}

                <div style={{display:"flex",flexDirection:"column",gap:12,marginBottom:20}}>
                  <div>
                    <div style={{fontSize:12,color:C.muted,marginBottom:6}}>Player name</div>
                    <input autoFocus value={ctpName} onChange={e=>setCtpName(e.target.value)}
                      placeholder="e.g. Nick"
                      style={{width:"100%",padding:"14px",background:C.bg,border:"1px solid "+C.border,borderRadius:10,color:C.text,fontSize:16,fontWeight:700,outline:"none",boxSizing:"border-box"}}/>
                  </div>
                  <div>
                    <div style={{fontSize:12,color:C.muted,marginBottom:6}}>Distance from pin</div>
                    <input value={ctpDist} onChange={e=>setCtpDist(e.target.value)}
                      placeholder={"e.g. 4'6\""}
                      style={{width:"100%",padding:"14px",background:C.bg,border:"1px solid "+C.border,borderRadius:10,color:C.gold,fontSize:20,fontWeight:800,outline:"none",textAlign:"center",boxSizing:"border-box",fontFamily:"monospace"}}/>
                  </div>
                </div>

                <div style={{display:"flex",gap:10}}>
                  <button onClick={()=>{setCtpPopup(null);setCtpName("");setCtpDist("");}}
                    style={{flex:1,padding:"14px",background:"transparent",color:C.muted,border:"1px solid "+C.border,borderRadius:12,fontSize:14,fontWeight:600,cursor:"pointer"}}>
                    Cancel
                  </button>
                  <button onClick={saveCtp} disabled={!ctpName.trim()||!ctpDist.trim()}
                    style={{flex:2,padding:"14px",background:ctpName.trim()&&ctpDist.trim()?C.gold:"#1a1a1a",color:ctpName.trim()&&ctpDist.trim()?"#0a1a0f":C.dim,border:"none",borderRadius:12,fontSize:15,fontWeight:800,cursor:ctpName.trim()&&ctpDist.trim()?"pointer":"not-allowed"}}>
                    📍 Save CTP
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
                      <div style={{fontSize:11,color:C.muted,marginTop:2}}>{bigBoyEnabled?"Parallel opt-in game — BB vs BB only":"Off"}</div>
                    </div>
                    <button onClick={async()=>{const v=!bigBoyEnabled;setBigBoyEnabled(v);await sb.from("team_tournaments").update({big_boy_enabled:v,updated_at:new Date().toISOString()}).eq("id",tourneyId);}} style={{width:52,height:28,borderRadius:14,border:"none",cursor:"pointer",background:bigBoyEnabled?C.gold:"#333",position:"relative",flexShrink:0,transition:"background 0.2s"}}>
                      <div style={{position:"absolute",top:4,left:bigBoyEnabled?26:4,width:20,height:20,borderRadius:"50%",background:"#fff",transition:"left 0.2s"}}/>
                    </button>
                  </div>
                </div>
              )}

              {/* ── SOUTH TOLEDO HOLE #4 PAR TOGGLE ────────────────────── */}
              {courseId==="south-toledo"&&(
                <div style={{background:C.card,border:"1px solid "+C.border,borderRadius:12,padding:"14px 16px",marginBottom:20}}>
                  <div style={{fontWeight:700,fontSize:14,marginBottom:4}}>⛳ Hole #4 Par Override</div>
                  <div style={{fontSize:11,color:C.muted,marginBottom:12}}>Recalculates all scores instantly when changed mid-round.</div>
                  <div style={{display:"flex",gap:8}}>
                    {[3,4].map(p=>(
                      <button key={p} onClick={()=>setHolePars(prev=>({...prev,4:p}))}
                        style={{
                          flex:1,padding:"16px",
                          background:(holePars[4]??3)===p?C.green:"#1a2a1a",
                          color:(holePars[4]??3)===p?"#0a1a0f":"#ffffff",
                          border:"2px solid "+((holePars[4]??3)===p?C.green:"rgba(255,255,255,0.3)"),
                          borderRadius:10,fontSize:16,fontWeight:(holePars[4]??3)===p?800:600,cursor:"pointer"}}>
                        Par {p}{p===3?" ✓ default":""}
                      </button>
                    ))}
                  </div>
                  {(holePars[4]??3)===4&&(
                    <div style={{fontSize:11,color:C.gold,marginTop:8,textAlign:"center"}}>Playing as par 4 — effective course par 71</div>
                  )}
                </div>
              )}

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
                          {sizeWarning?"⚠️ ":""}Players
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
                      window.open(`sms:?&body=${encodeURIComponent(`⛳ Watch the tournament live!\n${link}`)}`);
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
                {cbWarnings.length>0?"Fix team size before closing ⚠️":"✓ Done — Changes Saved"}
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
              }{birdieBonus?" · Birdie Bonus ✓":""} · Hole {currentHole}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{display:"flex",borderBottom:"1px solid "+C.border,background:"rgba(0,0,0,0.2)",overflowX:"auto"}}>
          {[["standings","🏆 Standings"],["scorecard","📋 Scorecard"],["top10","⭐ Top 10"],["skins","💰 Skins"],["ctp","📍 CTP"]]
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
                      <div style={{fontSize:11,color:C.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginTop:2}}>{(team.players||[]).filter(Boolean).join(" · ")||"No players"}</div>
                    </div>
                    {[team.sc.frontDiff,team.sc.backDiff,team.sc.totalDiff].map((d,idx)=>(
                      <div key={idx} style={{width:44,textAlign:"center",fontWeight:800,fontSize:16,color:team.sc.total===0?C.muted:relColor(d)}}>{team.sc.total===0?"—":relLabel(d)}</div>
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
                        {fH.map(h=>{const hd=team.sc.byHole[h.hole];return<td key={h.hole} style={{padding:"4px 3px",textAlign:"center",fontWeight:600,color:hd?relColor(hd.diff):C.dim}}>{hd?relLabel(hd.diff):"—"}</td>;})}
                        <td style={{padding:"4px",textAlign:"center",fontWeight:800,color:team.sc.front?relColor(team.sc.frontDiff):C.muted}}>{team.sc.front?relLabel(team.sc.frontDiff):"—"}</td>
                        {bH.map(h=>{const hd=team.sc.byHole[h.hole];return<td key={h.hole} style={{padding:"4px 3px",textAlign:"center",fontWeight:600,color:hd?relColor(hd.diff):C.dim}}>{hd?relLabel(hd.diff):"—"}</td>;})}
                        <td style={{padding:"4px",textAlign:"center",fontWeight:800,color:team.sc.back?relColor(team.sc.backDiff):C.muted}}>{team.sc.back?relLabel(team.sc.backDiff):"—"}</td>
                        <td style={{padding:"4px",textAlign:"center",fontWeight:800,color:team.sc.total?relColor(team.sc.totalDiff):C.muted}}>{team.sc.total?relLabel(team.sc.totalDiff):"—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {lbTab==="top10"&&<Top10Tab teams={teams} course={course}/>}

          {lbTab==="skins"&&<SkinsTab teams={teams} course={course} holePars={holePars} skinsEnabled={skinsEnabled} bigBoyEnabled={bigBoyEnabled}/>}

          {lbTab==="ctp"&&(
            <div>
              <div style={{fontSize:11,color:C.gold,letterSpacing:1.5,textTransform:"uppercase",marginBottom:14,fontWeight:600}}>📍 Closest to the Pin</div>
              {course.holes.filter(h=>(holePars[h.hole]??h.par)===3).map(h=>{
                const leader=ctpLeaders[h.hole];
                return(
                  <div key={h.hole} style={{background:leader?"rgba(232,184,75,0.08)":C.card,border:"1px solid "+(leader?"rgba(232,184,75,0.4)":C.border),borderRadius:14,padding:"16px",marginBottom:12}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <div>
                        <div style={{fontWeight:800,fontSize:16}}>Hole {h.hole}</div>
                        <div style={{fontSize:11,color:C.muted}}>Par 3 · Hdcp {h.hdcp} · {h.yards} yds</div>
                      </div>
                      {leader?(
                        <div style={{textAlign:"right"}}>
                          <div style={{fontSize:26,fontWeight:800,color:C.gold}}>{leader.distance}</div>
                          <div style={{fontSize:10,color:C.muted}}>from pin</div>
                        </div>
                      ):(
                        <div style={{fontSize:12,color:C.dim}}>No entry yet</div>
                      )}
                    </div>
                    {leader&&(
                      <div style={{background:"rgba(232,184,75,0.12)",borderRadius:10,padding:"10px 12px",marginTop:10,display:"flex",alignItems:"center",gap:10}}>
                        <div style={{fontSize:22}}>🏆</div>
                        <div style={{fontWeight:800,fontSize:15,color:C.gold}}>{leader.name}</div>
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
