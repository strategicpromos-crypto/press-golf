import React, { useState, useEffect, useRef } from "react";
import { sb } from "./supabase.js";
import { COURSES } from "./golf.js";
import { SkinsTab } from "./skins.jsx";

const C = {
  bg:"#080f0a", surface:"#0e1a10", card:"#121e14",
  border:"rgba(123,180,80,0.18)", green:"#7bb450", gold:"#e8b84b",
  red:"#e05050", text:"#e8f0e9", muted:"#6b7f6d", dim:"#1e2f20",
};

function safeInt(v,f=0){const n=parseInt(v,10);return isNaN(n)?f:n;}
function relLabel(d){if(d===null||d===undefined)return"--";if(d===0)return"E";return d>0?"+"+d:String(d);}
function relColor(d){if(d===null||d===undefined)return C.muted;if(d<0)return C.green;if(d>0)return C.red;return C.muted;}

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
  const [ctpPopup,     setCtpPopup]     = useState(false); // simple open/close
  const [ctpName,      setCtpName]      = useState("");
  const [ctpDist,      setCtpDist]      = useState("");
  const saveTimer   = useRef(null);
  const subRef      = useRef(null);
  const pollTimer   = useRef(null);
  const pendingTeams= useRef(null);  // flush on Next Hole
  const [connStatus, setConnStatus] = useState("connecting"); // connecting|online|offline

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

  function startSubscription(){
    if(subRef.current) sb.removeChannel(subRef.current);
    subRef.current = sb
      .channel("captain_"+tourney.id+"_"+teamIdx+"_"+Date.now())
      .on("postgres_changes",{event:"UPDATE",schema:"public",table:"team_tournaments",filter:"id=eq."+tourney.id},
        payload=>{ if(payload.new) setTourney(prev=>mergeTourneyUpdate(payload.new,prev)); })
      .subscribe(status=>{
        if(status==="SUBSCRIBED") setConnStatus("online");
        else if(status==="CLOSED"||status==="CHANNEL_ERROR"||status==="TIMED_OUT"){
          setConnStatus("offline");
          // Auto-reconnect after 3 seconds
          setTimeout(()=>startSubscription(), 3000);
        }
      });
  }

  // Fix 2: 30-second polling fallback — keeps data fresh even if WS drops
  function startPolling(){
    if(pollTimer.current) clearInterval(pollTimer.current);
    pollTimer.current = setInterval(async()=>{
      try{
        const{data}=await sb.from("team_tournaments").select("*").eq("id",tourney.id).single();
        if(data) setTourney(prev=>mergeTourneyUpdate(data,prev));
        setConnStatus("online");
      }catch(e){ setConnStatus("offline"); }
    }, 30000);
  }

  useEffect(()=>{
    startSubscription();
    startPolling();
    return()=>{
      if(subRef.current) sb.removeChannel(subRef.current);
      if(pollTimer.current) clearInterval(pollTimer.current);
    };
  },[tourney.id, teamIdx]);

  async function flushSave(teamsToSave){
    try{
      const{data:current}=await sb.from("team_tournaments").select("teams").eq("id",tourney.id).single();
      const dbTeams=current?.teams||teamsToSave;
      const safeTeams=dbTeams.map((t,i)=>i===teamIdx?teamsToSave[i]:t);
      await sb.from("team_tournaments").update({teams:safeTeams,updated_at:new Date().toISOString()}).eq("id",tourney.id);
      pendingTeams.current=null;
      setSaveStatus("saved");
      setTimeout(()=>setSaveStatus(""),2000);
    }catch(e){ setConnStatus("offline"); }
  }

  function scheduleSync(updatedTeams) {
    pendingTeams.current = updatedTeams;  // always keep latest for flush
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveStatus("saving");
    saveTimer.current = setTimeout(()=>flushSave(updatedTeams), 800);
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
            <div style={{ fontSize:12, color:C.green, fontWeight:600 }}>Par {effPar}{effPar!==holeData.par?" !!":""} · Hdcp {holeData.hdcp}</div>
          </div>
          <button onClick={()=>setShowCaptainSettings(true)}
            style={{ background:"rgba(123,180,80,0.15)", border:`1px solid ${C.green}`, color:C.green, fontSize:15, cursor:"pointer", padding:"12px 20px", borderRadius:12, fontWeight:700 }}>⚙️ Settings</button>
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

          if(connStatus==="offline"){
            return(
              <div onClick={()=>startSubscription()}
                style={{background:"rgba(224,80,80,0.18)",border:"2px solid rgba(224,80,80,0.6)",borderRadius:10,padding:"12px 16px",cursor:"pointer"}}>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
                  <div style={{width:14,height:14,borderRadius:"50%",background:C.red,flexShrink:0,boxShadow:"0 0 8px "+C.red}}/>
                  <div style={{fontWeight:800,fontSize:14,color:C.red}}>OFFLINE — Scores not syncing</div>
                </div>
                <div style={{fontSize:12,color:"rgba(224,80,80,0.8)",marginBottom:6}}>
                  Your scores are saved locally. Tap this bar to reconnect.
                </div>
                <div style={{fontSize:11,color:C.muted}}>
                  If this persists: close the app, reopen your captain link, and scores will re-appear.
                </div>
              </div>
            );
          }
          if(connStatus==="connecting"){
            return(
              <div style={{background:"rgba(232,184,75,0.1)",border:"1px solid rgba(232,184,75,0.3)",borderRadius:10,padding:"10px 14px",display:"flex",alignItems:"center",gap:10}}>
                <div style={{width:10,height:10,borderRadius:"50%",background:C.gold,flexShrink:0}}/>
                <div style={{fontSize:12,color:C.gold,fontWeight:600}}>Connecting to live leaderboard...</div>
              </div>
            );
          }
          // Online — show score status
          const myScObj=allScores.find(x=>x.i===teamIdx);
          const myTot=myScObj?myScObj.tot:null;
          const myPlayed=myScObj?myScObj.played:0;
          return(
            <div style={{background:"rgba(123,180,80,0.08)",border:"1px solid rgba(123,180,80,0.25)",borderRadius:10,padding:"10px 14px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <div style={{width:10,height:10,borderRadius:"50%",background:saveStatus==="saving"?C.gold:C.green,flexShrink:0,boxShadow:saveStatus==="saving"?"0 0 6px "+C.gold:"0 0 6px "+C.green}}/>
                <div style={{fontSize:12,color:saveStatus==="saving"?C.gold:C.green,fontWeight:600}}>
                  {saveStatus==="saving"?"Saving scores...":saveStatus==="saved"?"Scores saved":"Live - scores syncing"}
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
                  {[["standings","Standings"],["top10","Individuals"],["skins","Skins"],...(ctpEnabled?[["ctp","CTP"]]:[])]
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
                {bTab==="skins"&&<SkinsTab teams={tourney.teams||[]} course={course} holePars={tourney.hole_pars||{}} skinsEnabled={tourney.skins_enabled===true} bigBoyEnabled={tourney.big_boy_enabled===true}/>}
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
              <button key={h.hole} onClick={()=>setCurrentHole(h.hole)} style={{
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
            <button onClick={()=>{setCtpName("");setCtpDist("");setCtpPopup(true);}}
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
                <button onClick={()=>setPlayerScore(j,currentHole,score!==null?Math.max(1,score-1):effPar-1)}
                  style={{ width:56,height:56,borderRadius:"50%",background:C.dim,border:`1px solid ${C.border}`,color:C.text,fontSize:30,fontWeight:700,cursor:"pointer" }}>−</button>
                <div style={{ flex:1,textAlign:"center" }}>
                  <div style={{ fontSize:56,fontWeight:800,color:score!==null?C.text:C.muted,lineHeight:1 }}>{score!==null?score:"--"}</div>
                  {score===null&&<div style={{ fontSize:11,color:C.muted,marginTop:4 }}>tap + to enter</div>}
                </div>
                <button onClick={()=>setPlayerScore(j,currentHole,score!==null?score+1:effPar)}
                  style={{ width:56,height:56,borderRadius:"50%",background:C.dim,border:`1px solid ${C.border}`,color:C.text,fontSize:30,fontWeight:700,cursor:"pointer" }}>+</button>
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

        <button onClick={()=>{
          // Fix 3: flush any pending scores immediately before advancing hole
          if(pendingTeams.current){
            clearTimeout(saveTimer.current);
            flushSave(pendingTeams.current);
          }
          if(!isLastHole) setCurrentHole(h=>h+1);
        }} disabled={isLastHole} style={{
          width:"100%",padding:"18px",background:isLastHole?"#1a2a1a":C.green,
          color:isLastHole?C.muted:"#0a1a0f",border:"none",borderRadius:14,
          fontSize:17,fontWeight:800,cursor:isLastHole?"not-allowed":"pointer",marginBottom:12
        }}>
          {isLastHole?"Round Complete!":"Next - Hole "+(currentHole+1)}
        </button>
      </div>

      {/* ── CAPTAIN SETTINGS OVERLAY ─────────────────────────────────── */}
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
          setCtpPopup(false);setCtpName("");setCtpDist("");
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
                  setCtpPopup(false);setCtpName("");setCtpDist("");
                }} style={{width:"100%",padding:"12px",background:"rgba(224,80,80,0.1)",border:"1px solid rgba(224,80,80,0.4)",borderRadius:10,color:C.red,fontSize:13,fontWeight:700,cursor:"pointer",marginBottom:10}}>
                  Remove CTP Entry
                </button>
              )}
              <div style={{display:"flex",gap:10}}>
                <button onClick={()=>{setCtpPopup(false);setCtpName("");setCtpDist("");}}
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

            {/* South Toledo hole #4 par toggle — captain can also change */}
            {tourney.course_id==="south-toledo"&&(
              <div style={{ background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"14px 16px",marginBottom:16 }}>
                <div style={{ fontWeight:700,fontSize:14,marginBottom:4 }}>⛳ Hole #4 Par Override</div>
                <div style={{ fontSize:11,color:C.muted,marginBottom:12 }}>Change mid-round — scores recalculate instantly for everyone.</div>
                <div style={{ display:"flex",gap:8 }}>
                  {[3,4].map(p=>{
                    const current = (tourney.hole_pars||{})[4]??3;
                    return(
                      <button key={p} onClick={async()=>{
                        const newHolePars={...(tourney.hole_pars||{}),4:p};
                        setTourney(prev=>({...prev,hole_pars:newHolePars}));
                        await sb.from("team_tournaments").update({hole_pars:newHolePars,updated_at:new Date().toISOString()}).eq("id",tourney.id);
                      }} style={{
                        flex:1,padding:"14px",
                        background:current===p?C.green:C.surface,
                        color:current===p?"#0a1a0f":C.text,
                        border:"1px solid "+(current===p?C.green:C.border),
                        borderRadius:10,fontSize:15,fontWeight:current===p?800:500,cursor:"pointer"
                      }}>Par {p}{p===3?" (def)":""}
                      </button>
                    );
                  })}
                </div>
                {((tourney.hole_pars||{})[4]??3)===4&&(
                  <div style={{ fontSize:11,color:C.gold,marginTop:8,textAlign:"center" }}>Playing as par 4 — effective course par 71</div>
                )}
              </div>
            )}

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
