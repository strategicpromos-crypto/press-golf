import React, { useState, useEffect, useRef } from "react";
import { sb } from "./supabase.js";
import { COURSES, getStrokeHoles } from "./golf.js";

const C = {
  bg:"#080f0a", surface:"#0e1a10", card:"#121e14",
  border:"rgba(123,180,80,0.18)", green:"#7bb450", gold:"#e8b84b",
  red:"#e05050", text:"#e8f0e9", muted:"#6b7f6d", dim:"#1e2f20",
};

function scoreName(s,par){
  if(s===null)return"";
  const d=s-par;
  if(d<=-2)return"Eagle 🦅";if(d===-1)return"Birdie 🐦";
  if(d===0)return"Par";if(d===1)return"Bogey";if(d===2)return"Double";
  return"+"+d;
}
function scoreColor(s,par){
  if(s===null)return C.muted;
  const d=s-par;if(d<=-1)return C.green;if(d>=1)return C.red;return C.muted;
}

// Calculate net scores (after strokes) for Nassau standing
function calcNassauStanding(allScores, myId, opponentId, opponentStrokes, course){
  // opponentStrokes: positive = opponent gets strokes, negative = I get strokes
  const strokeHoles = getStrokeHoles(course.id || "south-toledo", Math.abs(opponentStrokes));
  let front=0, back=0;
  for(const h of course.holes){
    const mySc  = allScores?.[myId]?.[h.hole];
    const oppSc = allScores?.[opponentId]?.[h.hole];
    if(mySc==null||oppSc==null)continue;
    // Net scores
    const myNet  = opponentStrokes < 0 && strokeHoles.includes(h.hole) ? mySc - 1 : mySc;
    const oppNet = opponentStrokes > 0 && strokeHoles.includes(h.hole) ? oppSc - 1 : oppSc;
    const holeDiff = myNet - oppNet; // negative = I won hole, positive = opp won
    if(h.side==="front") front += holeDiff;
    else                 back  += holeDiff;
  }
  return { front, back, total: front + back };
}

function StandingBadge({ label, value }) {
  const color = value < 0 ? C.green : value > 0 ? C.red : C.muted;
  const text  = value === 0 ? "A/S"
    : value < 0 ? Math.abs(value) + " UP"
    : Math.abs(value) + " DN";
  return (
    <div style={{ textAlign:"center" }}>
      <div style={{ fontSize:9, color:C.muted, letterSpacing:1, textTransform:"uppercase" }}>{label}</div>
      <div style={{ fontSize:15, fontWeight:800, color }}>{text}</div>
    </div>
  );
}

export default function OpponentScoreEntry({ roundId, playerId }) {
  const [round,        setRound]        = useState(null);
  const [allScores,    setAllScores]    = useState({});
  const [myScores,     setMyScores]     = useState({});
  const [currentHole,  setCurrentHole]  = useState(1);
  const [saveStatus,   setSaveStatus]   = useState("");
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState("");
  const [tab,          setTab]          = useState("score"); // score | match
  const [isIOS]        = useState(()=>/iphone|ipad|ipod/i.test(navigator.userAgent));
  const [isInstalled]  = useState(()=>window.matchMedia("(display-mode: standalone)").matches||window.navigator.standalone===true);
  const [installPrompt,setInstallPrompt]= useState(null);
  const [showInstall,  setShowInstall]  = useState(false);
  const saveTimer = useRef(null);
  const realtimeSub = useRef(null);

  useEffect(()=>{
    load();
    const handler=e=>{e.preventDefault();setInstallPrompt(e);if(!isInstalled)setShowInstall(true);};
    window.addEventListener("beforeinstallprompt",handler);
    if(isIOS&&!isInstalled)setShowInstall(true);
    return()=>window.removeEventListener("beforeinstallprompt",handler);
  },[]);

  async function load(){
    setLoading(true);
    const{data,error}=await sb.from("live_rounds").select("*").eq("id",roundId).single();
    if(error||!data){setError("Round not found. Check your link.");setLoading(false);return;}
    setRound(data);
    setAllScores(data.scores||{});
    setMyScores(data.scores?.[playerId]||{});
    setCurrentHole(data.current_hole||1);
    setLoading(false);

    // Real-time subscription — see partner's scores update live
    realtimeSub.current=sb.channel("opp_entry_"+roundId)
      .on("postgres_changes",{event:"UPDATE",schema:"public",table:"live_rounds",filter:"id=eq."+roundId},
        payload=>{
          if(payload.new?.scores){
            setAllScores(payload.new.scores);
          }
        })
      .subscribe();
  }

  useEffect(()=>()=>{
    if(realtimeSub.current){sb.removeChannel(realtimeSub.current);realtimeSub.current=null;}
    if(saveTimer.current)clearTimeout(saveTimer.current);
  },[]);

  function saveScore(hole,val){
    const updated={...myScores,[hole]:val};
    setMyScores(updated);
    setAllScores(prev=>({...prev,[playerId]:updated}));
    setSaveStatus("saving");
    if(saveTimer.current)clearTimeout(saveTimer.current);
    saveTimer.current=setTimeout(async()=>{
      const{data}=await sb.from("live_rounds").select("scores").eq("id",roundId).single();
      const merged={...(data?.scores||{}),[playerId]:updated};
      await sb.from("live_rounds").update({scores:merged,updated_at:new Date().toISOString()}).eq("id",roundId);
      setSaveStatus("saved");
      setTimeout(()=>setSaveStatus(""),2000);
    },800);
  }

  if(loading)return(
    <div style={{fontFamily:"Georgia,serif",minHeight:"100vh",background:C.bg,color:C.text,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:16}}>
      <div style={{width:40,height:40,border:`3px solid ${C.dim}`,borderTop:`3px solid ${C.green}`,borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{color:C.muted}}>Loading round...</div>
    </div>
  );

  if(error)return(
    <div style={{fontFamily:"Georgia,serif",minHeight:"100vh",background:C.bg,color:C.text,display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:48,marginBottom:16}}>⛳</div>
        <div style={{fontSize:18,fontWeight:700,color:C.red,marginBottom:8}}>Oops</div>
        <div style={{fontSize:14,color:C.muted}}>{error}</div>
      </div>
    </div>
  );

  const opp       = round?.opponents?.find(o=>o.playerId===playerId);
  const partner   = round?.opponents?.find(o=>o.playerId!==playerId); // the person who created the round
  const course    = COURSES[round?.course_id||"south-toledo"];
  const holeData  = course?.holes[currentHole-1];
  const myScore   = myScores[currentHole]??null;
  const isLastHole= currentHole===course?.holes?.length;
  if(!opp||!holeData)return null;

  // "me" in allScores = the round creator (you're the opponent)
  const partnerScores = allScores?.["me"]||{};
  const partnerScore  = partnerScores[currentHole]??null;
  const holesPlayed   = Object.keys(myScores).filter(h=>myScores[h]!==null).length;

  // Match standing — from Ken's perspective (negative = Ken is UP)
  // Ken is playerId, partner is "me"
  const oppStrokes = opp.strokes||0; // positive = partner gives strokes to Ken
  const standing = calcNassauStanding(
    {...allScores,[playerId]:myScores},
    playerId, "me", -oppStrokes, course
  );

  // Stroke on this hole
  const strokeHoles = getStrokeHoles(round?.course_id||"south-toledo", Math.abs(oppStrokes));
  const kenGetsStroke  = oppStrokes > 0 && strokeHoles.includes(currentHole);
  const partnerGetsStroke = oppStrokes < 0 && strokeHoles.includes(currentHole);

  return(
    <div style={{fontFamily:"Georgia,serif",minHeight:"100vh",background:C.bg,color:C.text,paddingBottom:100}}>

      {/* Install Banner */}
      {showInstall&&!isInstalled&&(
        <div style={{background:"linear-gradient(135deg,rgba(123,180,80,0.15),rgba(123,180,80,0.08))",borderBottom:`1px solid ${C.green}44`,padding:"12px 20px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}>
            <div style={{flex:1}}>
              <div style={{fontWeight:700,fontSize:13,color:C.green}}>⛳ Add Press to your home screen</div>
              {isIOS?<div style={{fontSize:11,color:C.muted}}>Tap <b style={{color:C.text}}>Share ↑</b> → Add to Home Screen</div>
                    :<div style={{fontSize:11,color:C.muted}}>Works like a native app — free</div>}
            </div>
            {!isIOS&&installPrompt
              ?<button onClick={async()=>{installPrompt.prompt();const r=await installPrompt.userChoice;if(r.outcome==="accepted"){setShowInstall(false);setInstallPrompt(null);}}} style={{background:C.green,border:"none",color:"#0a1a0f",padding:"8px 14px",borderRadius:8,fontSize:12,fontWeight:800,cursor:"pointer"}}>Install</button>
              :<button onClick={()=>setShowInstall(false)} style={{background:"transparent",border:"none",color:C.muted,fontSize:18,cursor:"pointer"}}>✕</button>}
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{background:`linear-gradient(180deg,${C.card} 0%,transparent 100%)`,padding:"44px 16px 12px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <button onClick={()=>currentHole>1?setCurrentHole(h=>h-1):null}
            style={{background:"rgba(123,180,80,0.15)",border:`1px solid ${C.green}`,color:currentHole>1?C.green:C.dim,fontSize:13,cursor:currentHole>1?"pointer":"default",padding:"6px 14px",borderRadius:16,fontWeight:700}}>‹</button>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:11,color:C.muted,letterSpacing:2,textTransform:"uppercase"}}>Hole</div>
            <div style={{fontSize:48,fontWeight:800,lineHeight:1}}>{currentHole}</div>
            <div style={{fontSize:12,color:C.green,fontWeight:600}}>Par {holeData.par} · Hdcp {holeData.hdcp}</div>
            {saveStatus&&<div style={{fontSize:10,color:saveStatus==="saving"?C.gold:C.green,marginTop:2}}>{saveStatus==="saving"?"💾 Saving...":"✓ Saved"}</div>}
          </div>
          <button onClick={()=>setCurrentHole(h=>Math.min(course.holes.length,h+1))}
            style={{background:"rgba(123,180,80,0.15)",border:`1px solid ${C.green}`,color:C.green,fontSize:13,cursor:"pointer",padding:"6px 14px",borderRadius:16,fontWeight:700}}>›</button>
        </div>
        <div style={{display:"flex",gap:2}}>
          {course.holes.map(h=>(
            <div key={h.hole} style={{flex:1,height:4,borderRadius:2,background:myScores[h.hole]!==undefined?C.green:h.hole===currentHole?C.gold:C.dim}}/>
          ))}
        </div>
      </div>

      {/* Match standing bar */}
      <div style={{background:C.card,borderBottom:`1px solid ${C.border}`,padding:"12px 16px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontWeight:800,fontSize:15}}>{opp.name} <span style={{fontSize:11,color:C.muted,fontWeight:400}}>vs</span> {partner?.name||"Partner"}</div>
            <div style={{fontSize:11,color:C.muted}}>{round.course_name} · {holesPlayed} holes entered</div>
          </div>
          <div style={{display:"flex",gap:16}}>
            <StandingBadge label="F9"  value={standing.front}/>
            <StandingBadge label="B9"  value={standing.back}/>
            <StandingBadge label="TOT" value={standing.total}/>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{display:"flex",borderBottom:`1px solid ${C.border}`,background:"rgba(0,0,0,0.2)"}}>
        {[["score","⛳ Score"],["match","📊 Match"]].map(([id,lbl])=>(
          <button key={id} onClick={()=>setTab(id)} style={{flex:1,padding:"12px",fontSize:13,fontWeight:tab===id?700:500,background:"transparent",color:tab===id?C.green:C.muted,border:"none",borderBottom:tab===id?`2px solid ${C.green}`:"2px solid transparent",cursor:"pointer"}}>{lbl}</button>
        ))}
      </div>

      <div style={{padding:"16px"}}>

        {/* ── SCORE TAB ──────────────────────────────────────────────────── */}
        {tab==="score"&&(
          <>
            {/* Hole selector */}
            <div style={{display:"flex",overflowX:"auto",gap:6,marginBottom:16,paddingBottom:4}}>
              {course.holes.map(h=>{
                const entered=myScores[h.hole]!==undefined;
                return(
                  <button key={h.hole} onClick={()=>setCurrentHole(h.hole)} style={{
                    flexShrink:0,width:36,height:36,borderRadius:"50%",fontSize:12,fontWeight:700,cursor:"pointer",
                    background:h.hole===currentHole?C.gold:entered?"rgba(123,180,80,0.15)":C.dim,
                    color:h.hole===currentHole?"#0a1a0f":entered?C.green:C.muted,
                    border:`1px solid ${h.hole===currentHole?C.gold:entered?C.green:C.border}`
                  }}>{h.hole}</button>
                );
              })}
            </div>

            {/* Stroke indicator */}
            {(kenGetsStroke||partnerGetsStroke)&&(
              <div style={{background:"rgba(232,184,75,0.08)",border:`1px solid ${C.gold}44`,borderRadius:10,padding:"8px 14px",marginBottom:12,fontSize:12,color:C.gold,fontWeight:600}}>
                ⭐ {kenGetsStroke?"You get a stroke this hole":`${partner?.name||"Partner"} gets a stroke this hole`}
              </div>
            )}

            {/* My score entry */}
            <div style={{background:C.card,border:`2px solid ${C.green}`,borderRadius:16,padding:"18px",marginBottom:12}}>
              <div style={{fontSize:11,color:C.green,letterSpacing:2,textTransform:"uppercase",marginBottom:12,fontWeight:600}}>Your Score</div>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
                <button onClick={()=>saveScore(currentHole,myScore!==null?Math.max(1,myScore-1):holeData.par-1)}
                  style={{width:60,height:60,borderRadius:"50%",background:C.dim,border:`1px solid ${C.border}`,color:C.text,fontSize:30,fontWeight:700,cursor:"pointer"}}>−</button>
                <div style={{flex:1,textAlign:"center"}}>
                  <div style={{fontSize:64,fontWeight:800,color:myScore!==null?C.text:C.muted,lineHeight:1}}>
                    {myScore!==null?myScore:"—"}
                  </div>
                  {myScore!==null&&<div style={{fontSize:13,fontWeight:700,color:scoreColor(myScore,holeData.par),marginTop:4}}>{scoreName(myScore,holeData.par)}</div>}
                  {myScore===null&&<div style={{fontSize:12,color:C.muted,marginTop:8}}>tap + to enter</div>}
                </div>
                <button onClick={()=>saveScore(currentHole,myScore!==null?myScore+1:holeData.par)}
                  style={{width:60,height:60,borderRadius:"50%",background:C.dim,border:`1px solid ${C.border}`,color:C.text,fontSize:30,fontWeight:700,cursor:"pointer"}}>+</button>
              </div>
            </div>

            {/* Partner score (read only, live) */}
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"12px 16px",marginBottom:16,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontSize:12,color:C.muted}}>{partner?.name||"Partner"}'s score this hole</div>
                {partnerGetsStroke&&<div style={{fontSize:11,color:C.gold}}>⭐ Gets a stroke</div>}
              </div>
              <div style={{fontSize:36,fontWeight:800,color:partnerScore!==null?scoreColor(partnerScore,holeData.par):C.dim}}>
                {partnerScore!==null?partnerScore:"—"}
              </div>
            </div>

            <button onClick={()=>!isLastHole&&myScore!==null&&setCurrentHole(h=>h+1)}
              disabled={isLastHole||myScore===null}
              style={{width:"100%",padding:"18px",background:isLastHole||myScore===null?"#1a2a1a":C.green,color:isLastHole||myScore===null?C.muted:"#0a1a0f",border:"none",borderRadius:14,fontSize:17,fontWeight:800,cursor:isLastHole||myScore===null?"not-allowed":"pointer"}}>
              {isLastHole?"Round Complete! ⛳":myScore===null?"Enter your score first":"Next — Hole "+(currentHole+1)}
            </button>
          </>
        )}

        {/* ── MATCH TAB ──────────────────────────────────────────────────── */}
        {tab==="match"&&(
          <>
            {/* Bet info */}
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"14px 16px",marginBottom:14}}>
              <div style={{fontSize:11,color:C.green,letterSpacing:1.5,textTransform:"uppercase",marginBottom:8,fontWeight:600}}>Bet Details</div>
              <div style={{fontSize:14,color:C.text,fontWeight:600}}>
                {opp.betType==="nassau"?"Nassau":"Nassau + Press"} · ${opp.betAmount}
              </div>
              <div style={{fontSize:12,color:C.muted,marginTop:4}}>
                {opp.strokes===0?"Even":opp.strokes>0?`You get ${Math.abs(opp.strokes)/2} strokes/side`:`You give ${opp.strokes/2} strokes/side`}
              </div>
            </div>

            {/* Hole by hole scorecard */}
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"14px",overflowX:"auto"}}>
              <div style={{fontSize:10,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>Scorecard</div>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:360}}>
                <thead>
                  <tr style={{borderBottom:`1px solid ${C.border}`}}>
                    <th style={{textAlign:"left",padding:"4px 6px",color:C.muted,fontWeight:500}}>Hole</th>
                    {course.holes.map(h=>(
                      <th key={h.hole} style={{padding:"3px",textAlign:"center",color:h.hole===currentHole?C.gold:C.muted,fontWeight:h.hole===currentHole?700:400}}>{h.hole}</th>
                    ))}
                  </tr>
                  <tr>
                    <td style={{padding:"3px 6px",color:C.dim,fontSize:10}}>Par</td>
                    {course.holes.map(h=><td key={h.hole} style={{padding:"3px",textAlign:"center",color:C.dim,fontSize:11}}>{h.par}</td>)}
                  </tr>
                </thead>
                <tbody>
                  <tr style={{borderTop:`1px solid ${C.dim}`}}>
                    <td style={{padding:"4px 6px",fontWeight:700,color:C.green,fontSize:12}}>{opp.name}</td>
                    {course.holes.map(h=>{
                      const s=myScores[h.hole]??null;
                      const stroke=strokeHoles.includes(h.hole)&&opp.strokes>0;
                      return<td key={h.hole} style={{padding:"4px 3px",textAlign:"center",fontWeight:700,color:s!==null?scoreColor(s,h.par):C.dim,position:"relative"}}>
                        {s!==null?s:"—"}
                        {stroke&&s!==null&&<span style={{fontSize:7,color:C.gold,position:"absolute",top:2,right:2}}>●</span>}
                      </td>;
                    })}
                  </tr>
                  <tr style={{borderTop:`1px solid ${C.dim}`}}>
                    <td style={{padding:"4px 6px",fontWeight:700,color:C.muted,fontSize:12}}>{partner?.name||"Partner"}</td>
                    {course.holes.map(h=>{
                      const s=partnerScores[h.hole]??null;
                      const stroke=strokeHoles.includes(h.hole)&&opp.strokes<0;
                      return<td key={h.hole} style={{padding:"4px 3px",textAlign:"center",fontWeight:700,color:s!==null?scoreColor(s,h.par):C.dim,position:"relative"}}>
                        {s!==null?s:"—"}
                        {stroke&&s!==null&&<span style={{fontSize:7,color:C.gold,position:"absolute",top:2,right:2}}>●</span>}
                      </td>;
                    })}
                  </tr>
                </tbody>
              </table>
              <div style={{fontSize:10,color:C.dim,marginTop:8}}>● = stroke hole · scores update in real time</div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
