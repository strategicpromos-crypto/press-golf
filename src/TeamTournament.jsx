import React, { useState, useEffect, useRef } from "react";
import { COURSES } from "./golf.js";
import { sb } from "./supabase.js";

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

function calcTeamScore(teamScores,teamSize,holeData,birdieBonus){
  const byHole={};
  let front=0,back=0,total=0;
  const frontPar2=holeData.filter(h=>h.side==="front").reduce((s,h)=>s+h.par*2,0);
  const backPar2=holeData.filter(h=>h.side==="back").reduce((s,h)=>s+h.par*2,0);
  const totalPar2=frontPar2+backPar2;
  for(const h of holeData){
    const scores=[];
    for(let p=0;p<teamSize;p++){const s=teamScores?.[p]?.[h.hole];if(s!==undefined&&s!==null)scores.push(safeInt(s));}
    if(scores.length===0){byHole[h.hole]=null;continue;}
    scores.sort((a,b)=>a-b);
    const best2=scores.slice(0,2);
    let raw=best2.reduce((s,v)=>s+v,0);
    let bonusApplied=0;
    if(birdieBonus){
      // Players beyond the top 2 who made birdie or better
      // Each contributes their actual vs-par score as a bonus (e.g. eagle = -2, birdie = -1)
      const extraBirdies=scores.slice(2).filter(s=>s<=h.par-1);
      if(extraBirdies.length>0){
        // bonus = sum of (par - score) for each extra birdie/eagle player
        bonusApplied=extraBirdies.reduce((sum,s)=>sum+(h.par-s),0);
        raw-=bonusApplied;
      }
    }
    const diff=raw-(h.par*2);
    byHole[h.hole]={raw,diff,bonusApplied,scored:true};
    if(h.side==="front")front+=raw;else back+=raw;
    total+=raw;
  }
  return{byHole,front,frontDiff:front-frontPar2,back,backDiff:back-backPar2,total,totalDiff:total-totalPar2,frontPar2,backPar2,totalPar2};
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

export default function TeamTournament({onBack, user}){
  const[screen,setScreen]=useState("home");
  const[courseId,setCourseId]=useState("south-toledo");
  const[birdieBonus,setBirdieBonus]=useState(true);
  const[numTeams,setNumTeams]=useState(8);
  const[activeTeam,setActiveTeam]=useState(0);
  const[currentHole,setCurrentHole]=useState(1);
  const[teams,setTeams]=useState([]);
  const[tourneyId,setTourneyId]=useState(null);
  const[directorCode,setDirectorCode]=useState(null); // stored directly, not via savedTourneys lookup
  const[savedTourneys,setSavedTourneys]=useState([]);
  const[showHelp,setShowHelp]=useState(false);
  const[saveStatus,setSaveStatus]=useState("");
  const saveTimer=useRef(null);
  const course=COURSES[courseId];

  useEffect(()=>{ loadSaved(); },[]);

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
  useEffect(()=>{
    if(!tourneyId||screen==="home"||screen==="saved")return;
    if(saveTimer.current)clearTimeout(saveTimer.current);
    setSaveStatus("saving");
    saveTimer.current=setTimeout(async()=>{
      await sb.from("team_tournaments").update({
        teams,
        course_id:courseId,
        birdie_bonus:birdieBonus,
        current_hole:currentHole,
        status:screen==="scoring"?"active":"setup",
        updated_at:new Date().toISOString(),
      }).eq("id",tourneyId);
      setSaveStatus("saved");
      setTimeout(()=>setSaveStatus(""),2000);
      loadSaved();
    },800);
    return()=>clearTimeout(saveTimer.current);
  },[teams,currentHole,courseId,birdieBonus,screen,tourneyId]);

  // ── Create new tournament in DB ────────────────────────────────────────────
  async function createTourney(builtTeams){
    if(!user?.id)return null;
    const chars="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const makeCode=()=>Array.from({length:6},()=>chars[Math.floor(Math.random()*chars.length)]).join("");
    const dirCode=makeCode();
    const name=COURSES[courseId]?.name+" · "+new Date().toLocaleDateString("en-US",{month:"short",day:"numeric"});
    const{data}=await sb.from("team_tournaments").insert({
      owner_id:user.id,
      name,
      course_id:courseId,
      birdie_bonus:birdieBonus,
      teams:builtTeams,
      current_hole:1,
      status:"setup",
      director_code:dirCode,
      spectator_code:"S"+dirCode,
    }).select().single();
    if(data){
      setDirectorCode(dirCode); // set immediately so share panel shows right away
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
      setTeams(data.teams||[]);
      setNumTeams((data.teams||[]).length);
      setCurrentHole(data.current_hole||1);
      setActiveTeam(0);
      setDirectorCode(data.director_code||null); // restore share code
      setScreen(data.status==="active"?"scoring":"setup");
    }
    setLoading(false);
  }

  // ── Delete a saved tournament ──────────────────────────────────────────────
  async function deleteTourney(id){
    await sb.from("team_tournaments").delete().eq("id",id);
    setSavedTourneys(prev=>prev.filter(t=>t.id!==id));
    if(tourneyId===id){setTourneyId(null);setTeams([]);}
  }

  function buildTeams(n,existing=[]){
    return Array.from({length:n},(_,i)=>existing[i]||{
      id:i,name:"Team "+(i+1),color:TEAM_COLORS[i%TEAM_COLORS.length],
      size:4,players:["","","",""],strokesPerSide:0,scores:{}
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
    return teams.map(t=>({...t,sc:calcTeamScore(t.scores,t.size,course.holes,birdieBonus)}))
      .sort((a,b)=>a.sc.totalDiff-b.sc.totalDiff);
  }

  const holeData=course?.holes[currentHole-1];
  const isLastHole=currentHole===(course?.holes?.length||18);

  // HOME
  if(screen==="home"){
    const active=savedTourneys.filter(t=>t.status==="active");
    const setups=savedTourneys.filter(t=>t.status==="setup");
    return(
      <div style={{fontFamily:"Georgia,serif",minHeight:"100vh",background:C.bg,color:C.text,paddingBottom:40}}>
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
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                    <div style={{fontWeight:700,fontSize:15,color:C.gold}}>{t.name||"Tournament"}</div>
                    <button onClick={()=>deleteTourney(t.id)} style={{background:"transparent",border:"none",color:C.muted,fontSize:18,cursor:"pointer",padding:"0 4px"}}>✕</button>
                  </div>
                  <div style={{fontSize:11,color:C.muted,marginBottom:10}}>
                    {COURSES[t.course_id]?.name||t.course_id} · Hole {t.current_hole} · {(t.teams||[]).length} teams
                  </div>
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={()=>resumeTourney(t)} disabled={loading} style={{flex:2,padding:"11px",background:C.gold,color:"#0a1a0f",border:"none",borderRadius:10,fontSize:14,fontWeight:800,cursor:"pointer"}}>
                      {loading?"Loading...":"▶ Resume Round"}
                    </button>
                    <button onClick={async()=>{await resumeTourney(t);setScreen("leaderboard");}} style={{flex:1,padding:"11px",background:"transparent",color:C.gold,border:"1px solid "+C.gold+"44",borderRadius:10,fontSize:13,fontWeight:700,cursor:"pointer"}}>
                      📊 Board
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Saved setups (pre-built, not started) */}
          {setups.length>0&&(
            <div style={{marginBottom:20}}>
              <div style={{fontSize:11,color:C.green,letterSpacing:1.5,textTransform:"uppercase",marginBottom:10,fontWeight:600}}>📋 Saved Setups</div>
              {setups.map(t=>(
                <div key={t.id} style={{background:C.card,border:"1px solid "+C.border,borderRadius:14,padding:"14px 16px",marginBottom:8}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                    <div style={{fontWeight:700,fontSize:15}}>{t.name||"Tournament Setup"}</div>
                    <button onClick={()=>deleteTourney(t.id)} style={{background:"transparent",border:"none",color:C.muted,fontSize:18,cursor:"pointer",padding:"0 4px"}}>✕</button>
                  </div>
                  <div style={{fontSize:11,color:C.muted,marginBottom:10}}>
                    {COURSES[t.course_id]?.name||t.course_id} · {(t.teams||[]).length} teams · Last edited {new Date(t.updated_at).toLocaleDateString()}
                  </div>
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={()=>resumeTourney(t)} disabled={loading} style={{flex:1,padding:"11px",background:C.green,color:"#0a1a0f",border:"none",borderRadius:10,fontSize:13,fontWeight:800,cursor:"pointer"}}>
                      ✏️ Edit Setup
                    </button>
                    <button onClick={async()=>{
                      await resumeTourney(t);
                      setCurrentHole(1);setActiveTeam(0);
                      setScreen("scoring");
                    }} style={{flex:1,padding:"11px",background:"transparent",color:C.green,border:"1px solid "+C.green+"44",borderRadius:10,fontSize:13,fontWeight:700,cursor:"pointer"}}>
                      ⛳ Tee Off
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* New tournament */}
          <BigBtn onClick={async()=>{
            const builtTeams=buildTeams(numTeams);
            setTeams(builtTeams);
            setCurrentHole(1);setActiveTeam(0);
            const id=await createTourney(builtTeams);
            setTourneyId(id);
            setScreen("setup");
          }}>+ New Tournament Setup</BigBtn>

          <div style={{height:10}}/>
          <GhostBtn onClick={onBack}>← Back to Press</GhostBtn>
          <div style={{height:8}}/>
          <button onClick={()=>setShowHelp(true)} style={{width:"100%",padding:"12px",background:"transparent",color:C.muted,border:"none",fontSize:13,cursor:"pointer"}}>
            ❓ How does this work?
          </button>
        </div>

        {/* Help overlay */}
        {showHelp&&(
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:600,overflowY:"auto"}}>
            <div style={{background:C.surface,margin:"20px",borderRadius:20,padding:"24px",border:"1px solid "+C.border}}>
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
                {code:"WEDS48",label:"Public code",desc:"Announce to everyone. Spectators use this to watch."},
                {code:"WEDS48-T1",label:"Captain code",desc:"Send privately to Team 1 captain along with their 4-digit PIN."},
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
            <select value={courseId} onChange={e=>setCourseId(e.target.value)} style={{width:"100%",padding:"14px",background:C.surface,border:"1px solid "+C.border,borderRadius:10,color:C.text,fontSize:15,outline:"none",WebkitAppearance:"none"}}>
              {Object.entries(COURSES).map(([id,c])=>(
                <option key={id} value={id}>{c.name} — Par {c.par}</option>
              ))}
            </select>
          </div>

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
                <NumStepper label="Players on team" value={team.size} min={2} max={6} onChange={size=>{
                  const players=Array.from({length:size},(_,j)=>team.players[j]||"");
                  updateTeam(i,{size,players});
                }}/>
              </div>
              <div style={{marginBottom:12}}>
                <NumStepper label="Strokes received per side" value={team.strokesPerSide} min={0} max={9} onChange={v=>updateTeam(i,{strokesPerSide:v})}/>
                {team.strokesPerSide>0&&<div style={{fontSize:11,color:C.gold,marginTop:4,paddingLeft:4}}>Starts {team.strokesPerSide*2} under par for the round</div>}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                {Array.from({length:team.size},(_,j)=>(
                  <input key={j} value={team.players[j]||""} onChange={e=>{const p=[...team.players];p[j]=e.target.value;updateTeam(i,{players:p});}}
                    placeholder={"Player "+(j+1)} style={{padding:"10px",background:C.surface,border:"1px solid "+C.border,borderRadius:8,color:C.text,fontSize:13,outline:"none"}}/>
                ))}
              </div>
            </div>
          ))}

          {/* Share Codes Panel */}
          {tourneyId&&directorCode&&(()=>{
            const appUrl="https://press-golf.vercel.app";
            const spectatorLink=`${appUrl}?tourney=S${directorCode}`;
            return(
              <div style={{background:"rgba(123,180,80,0.06)",border:"1px solid rgba(123,180,80,0.2)",borderRadius:14,padding:"16px",marginBottom:16}}>
                <div style={{fontSize:11,color:C.green,letterSpacing:1.5,textTransform:"uppercase",marginBottom:12,fontWeight:600}}>🔗 Share Tournament</div>
                <div style={{marginBottom:12}}>
                  <div style={{fontSize:11,color:C.muted,marginBottom:4}}>Your director code (keep private)</div>
                  <div style={{background:C.card,border:"1px solid "+C.border,borderRadius:8,padding:"10px 14px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div style={{fontSize:22,fontWeight:800,letterSpacing:4,color:C.gold}}>{directorCode}</div>
                    <button onClick={()=>navigator.clipboard?.writeText(directorCode)} style={{background:"transparent",border:"none",color:C.muted,fontSize:12,cursor:"pointer"}}>Copy</button>
                  </div>
                </div>
                <div style={{marginBottom:12}}>
                  <div style={{fontSize:11,color:C.muted,marginBottom:4}}>Spectator link — share with anyone to watch live</div>
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={()=>navigator.clipboard?.writeText(spectatorLink)} style={{flex:1,padding:"10px",background:C.card,border:"1px solid "+C.border,borderRadius:8,color:C.text,fontSize:11,cursor:"pointer",fontWeight:600}}>📋 Copy Link</button>
                    <button onClick={()=>window.open(`sms:?&body=${encodeURIComponent("Watch live: "+spectatorLink)}`)} style={{flex:1,padding:"10px",background:C.card,border:"1px solid "+C.border,borderRadius:8,color:C.text,fontSize:11,cursor:"pointer",fontWeight:600}}>📱 Text It</button>
                  </div>
                </div>
                <div style={{fontSize:11,color:C.muted,marginBottom:8}}>Team captain codes — text or read aloud to each captain</div>
                {teams.map((team,i)=>{
                  const captainCode=`${directorCode}-T${i+1}`;
                  const captainLink=`${appUrl}?tourney=${directorCode}&team=${i}`;
                  return(
                    <div key={i} style={{background:C.card,border:`1px solid ${team.color}33`,borderRadius:10,padding:"10px 12px",marginBottom:8}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                        <div style={{width:10,height:10,borderRadius:"50%",background:team.color,flexShrink:0}}/>
                        <div style={{fontWeight:700,fontSize:13,color:C.text,flex:1}}>{team.name}</div>
                        <div style={{fontSize:16,fontWeight:800,letterSpacing:2,color:team.color}}>{captainCode}</div>
                      </div>
                      <div style={{display:"flex",gap:6}}>
                        <button onClick={()=>navigator.clipboard?.writeText(captainCode)} style={{flex:1,padding:"7px",background:C.surface,border:"1px solid "+C.border,borderRadius:6,color:C.muted,fontSize:11,cursor:"pointer"}}>📋 Copy Code</button>
                        <button onClick={()=>navigator.clipboard?.writeText(captainLink)} style={{flex:1,padding:"7px",background:C.surface,border:"1px solid "+C.border,borderRadius:6,color:C.muted,fontSize:11,cursor:"pointer"}}>🔗 Copy Link</button>
                        <button onClick={()=>window.open(`sms:?&body=${encodeURIComponent(team.name+" captain code: "+captainCode+"\nOr tap: "+captainLink)}`)} style={{flex:1,padding:"7px",background:C.surface,border:"1px solid "+C.border,borderRadius:6,color:C.muted,fontSize:11,cursor:"pointer"}}>📱 Text</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          <div style={{height:8}}/>
          <BigBtn onClick={async()=>{
            setCurrentHole(1);setActiveTeam(0);
            if(tourneyId){await sb.from("team_tournaments").update({status:"active",current_hole:1}).eq("id",tourneyId);}
            setScreen("scoring");
          }}>Tee It Up! ⛳</BigBtn>
        </div>
      </div>
    );
  }

  // SCORING
  if(screen==="scoring"&&holeData){
    const team=teams[activeTeam];
    const sc=calcTeamScore(team.scores,team.size,course.holes,birdieBonus);
    const thisHoleScores=Array.from({length:team.size},(_,j)=>({j,s:getPlayerScore(team,j,currentHole)})).filter(x=>x.s!==null).sort((a,b)=>a.s-b.s);
    const best2Set=new Set(thisHoleScores.slice(0,2).map(x=>x.j));
    const birdieCount=thisHoleScores.filter(x=>x.s<=holeData.par-1).length;
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
              <div style={{fontSize:12,color:C.green,fontWeight:600}}>Par {holeData.par} · Hdcp {holeData.hdcp}</div>
              {saveStatus&&<div style={{fontSize:10,color:saveStatus==="saving"?C.gold:C.green,marginTop:2}}>{saveStatus==="saving"?"💾 Saving...":"✓ Saved"}</div>}
            </div>
            <button onClick={()=>setScreen("leaderboard")}
              style={{background:"rgba(232,184,75,0.15)",border:"1px solid "+C.gold,color:C.gold,fontSize:11,cursor:"pointer",padding:"6px 12px",borderRadius:12,fontWeight:700}}>📊 Board</button>
          </div>
          <div style={{display:"flex",gap:2}}>
            {course.holes.map(h=>(
              <div key={h.hole} style={{flex:1,height:4,borderRadius:2,background:h.hole<currentHole?C.green:h.hole===currentHole?C.gold:C.dim}}/>
            ))}
          </div>
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
            const diff=score!==null?score-holeData.par:null;
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
                  <button onClick={()=>setPlayerScore(activeTeam,j,currentHole,score!==null?Math.max(1,score-1):holeData.par-1)}
                    style={{width:56,height:56,borderRadius:"50%",background:C.dim,border:"1px solid "+C.border,color:C.text,fontSize:30,fontWeight:700,cursor:"pointer"}}>−</button>
                  <div style={{flex:1,textAlign:"center"}}>
                    <div style={{fontSize:56,fontWeight:800,color:score!==null?C.text:C.muted,lineHeight:1}}>{score!==null?score:"—"}</div>
                    {score===null&&<div style={{fontSize:11,color:C.muted,marginTop:4}}>tap + to enter</div>}
                  </div>
                  <button onClick={()=>setPlayerScore(activeTeam,j,currentHole,score!==null?score+1:holeData.par)}
                    style={{width:56,height:56,borderRadius:"50%",background:C.dim,border:"1px solid "+C.border,color:C.text,fontSize:30,fontWeight:700,cursor:"pointer"}}>+</button>
                </div>
              </div>
            );
          })}

          {/* This hole total */}
          {thisHoleScores.length>=1&&(()=>{
            const best2scores=thisHoleScores.slice(0,2).map(x=>x.s);
            const raw=best2scores.reduce((s,v)=>s+v,0)-bonusThisHole;
            const d=raw-(holeData.par*2);
            return(
              <div style={{background:"rgba(123,180,80,0.06)",border:"1px solid rgba(123,180,80,0.2)",borderRadius:10,padding:"12px 16px",marginBottom:14}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <div style={{fontSize:12,color:C.muted}}>2 Best Ball this hole</div>
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
            {isLastHole?"See Final Results 🏆":"Next — Hole "+(currentHole+1)}
          </BigBtn>

          {/* Mini standings */}
          <div style={{marginTop:12,display:"flex",gap:8,flexWrap:"wrap",justifyContent:"center"}}>
            {getLeaderboard().slice(0,5).map((t,rank)=>(
              <div key={t.id} style={{background:C.card,border:"1px solid "+t.color+"44",borderRadius:20,padding:"5px 12px",fontSize:12,display:"flex",alignItems:"center",gap:6}}>
                <span style={{color:C.muted}}>{rank+1}.</span>
                <span style={{fontWeight:700,color:t.color}}>{t.name}</span>
                <span style={{fontWeight:800,color:relColor(t.sc.totalDiff)}}>{t.sc.total?relLabel(t.sc.totalDiff):"—"}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // LEADERBOARD
  if(screen==="leaderboard"){
    const board=getLeaderboard();
    return(
      <div style={{fontFamily:"Georgia,serif",minHeight:"100vh",background:C.bg,color:C.text,paddingBottom:40}}>
        <div style={{background:"linear-gradient(180deg,"+C.card+" 0%,transparent 100%)",padding:"50px 20px 20px",textAlign:"center"}}>
          <button onClick={()=>setScreen("scoring")} style={{background:"rgba(123,180,80,0.15)",border:"1px solid "+C.green,color:C.green,fontSize:13,cursor:"pointer",padding:"8px 16px",borderRadius:20,fontWeight:700,marginBottom:16,display:"block"}}>‹ Back to Scoring</button>
          <div style={{fontSize:28,fontWeight:800}}>🏆 Leaderboard</div>
          <div style={{fontSize:13,color:C.muted,marginTop:4}}>{course.name} · 2 Best Ball{birdieBonus?" · Birdie Bonus ✓":""}</div>
        </div>
        <div style={{padding:"0 16px"}}>
          <div style={{display:"flex",padding:"4px 14px",marginBottom:4}}>
            <div style={{flex:1,fontSize:10,color:C.muted,letterSpacing:1.5,textTransform:"uppercase"}}>Team</div>
            {["F9","B9","TOT"].map(l=><div key={l} style={{width:44,textAlign:"center",fontSize:10,color:C.muted,letterSpacing:1,textTransform:"uppercase"}}>{l}</div>)}
          </div>
          {board.map((team,rank)=>(
            <div key={team.id} style={{background:rank===0?"rgba(232,184,75,0.08)":C.card,border:"1px solid "+(rank===0?C.gold+"44":C.border),borderRadius:14,padding:"14px",marginBottom:8}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <div style={{width:30,height:30,borderRadius:"50%",flexShrink:0,background:rank===0?C.gold:rank===1?"#aaa":rank===2?"#cd7f32":C.dim,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:13,color:rank<3?"#0a1a0f":C.muted}}>{rank+1}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <div style={{width:10,height:10,borderRadius:"50%",background:team.color,flexShrink:0}}/>
                    <div style={{fontWeight:800,fontSize:15,color:rank===0?C.gold:C.text}}>{team.name}</div>
                    {team.strokesPerSide>0&&<div style={{fontSize:9,color:C.gold}}>+{team.strokesPerSide}/side</div>}
                  </div>
                  <div style={{fontSize:11,color:C.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginTop:2}}>{team.players.filter(Boolean).join(" · ")||"No players"}</div>
                </div>
                {[team.sc.frontDiff,team.sc.backDiff,team.sc.totalDiff].map((d,idx)=>(
                  <div key={idx} style={{width:44,textAlign:"center",fontWeight:800,fontSize:16,color:team.sc.total===0?C.muted:relColor(d)}}>{team.sc.total===0?"—":relLabel(d)}</div>
                ))}
              </div>
            </div>
          ))}

          {/* Scorecard */}
          <div style={{background:C.card,border:"1px solid "+C.border,borderRadius:14,padding:"14px",marginTop:8,overflowX:"auto"}}>
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
                {board.map(team=>{
                  const fH=course.holes.filter(h=>h.side==="front");
                  const bH=course.holes.filter(h=>h.side==="back");
                  return(
                    <tr key={team.id} style={{borderTop:"1px solid "+C.dim}}>
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

          <div style={{height:20}}/>
          <BigBtn onClick={()=>setScreen("scoring")} color={C.green}>← Back to Scoring</BigBtn>
          <div style={{height:10}}/>
          <GhostBtn onClick={onBack}>Exit Tournament</GhostBtn>
        </div>
      </div>
    );
  }

  return null;
}
