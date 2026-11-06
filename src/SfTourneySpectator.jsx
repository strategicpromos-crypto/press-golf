// PG-NETSKINS-2026-10-29
// CAPTAIN-DARKTABS-2026-10-28 (SfTourneySpectator — fixes white second tab row)
// SFMATCH-2026-10-28 (SfTourneySpectator — includes tab stack, stacked team-points scorecard)
// ── STABLEFORD CLONE of TourneySpectator.jsx ─────────────────────────────
// Same spectator shell (live subscription, tabs) with Stableford scoring.
// Reads ONLY sf_tournaments.
import React, { useState, useEffect, useRef } from "react";
import { sb } from "./supabase.js";
import { COURSES } from "./golf.js";
import { SfSkinsTab } from "./sfSkins.jsx";
import { SfIndividualList } from "./SfIndividualList.jsx";
import { sfConfigOrDefaults, sfIsField, sfHolePoints, sfTeamPoints, sfIndividualPoints } from "./stableford.js";
import { SideBetsTab } from "./sideBets.jsx";
// PG-RYDER-SPECTATOR-2026-11-04: Ryder Cup view for spectators (Stableford, read-only). Reads sf_config.ryder set by the director — no setup, no editing here. Live via the spectator subscription, which already re-delivers the full tournament row on every update.
// Stroke modes, per match: "difference" (default, GHIN match play: lowest HDCP in the match = scratch, others get HDCP - lowest, 1 per hole on hardest holes; a 1-stroke difference = 1 stroke on the #1 handicap hole only) or "full" (each player gets full course HDCP strokes, 1 per hole on hardest holes; a pro's negative HDCP gives back on easiest holes).
function ryderParseRef(v){ const parts=String(v).split(":"); return {team:parseInt(parts[0],10),pi:parseInt(parts[1],10)}; }
function ryderPlayer(teams,ref){ const r=ryderParseRef(ref); const tm=teams[r.team]; if(!tm) return null; const nm=(tm.players?.[r.pi]||"").trim(); if(!nm) return null; const hd=tm.hdcp?.[r.pi]; return {ref,name:nm,hdcp:(hd===null||hd===undefined||hd==="")?null:Number(hd),team:tm}; }
function ryderStrokeOnHole(strokes, rank, n){
  if(!strokes) return 0;
  if(strokes>0){ const full=Math.floor(strokes/18), rem=strokes%18; return full+(rem>0&&rank<=rem?1:0); }
  const plus=-strokes, full=Math.floor(plus/18), rem=plus%18; return -(full+(rem>0&&rank>n-rem?1:0));
}
function ryderMatchCalc(match, teams, course){
  const holes=[...(course?.holes||[])].sort((a,b)=>((a.hdcp??99)-(b.hdcp??99)));
  const rankOf={}; holes.forEach((h,i)=>{ rankOf[h.hole]=i+1; });
  const sidePlayers=(keys)=>(keys||[]).map(k=>ryderPlayer(teams,k)).filter(Boolean);
  const A=sidePlayers(match.a), B=sidePlayers(match.b);
  if(A.length===0||B.length===0) return {status:"Pick players for both sides", aPts:0, bPts:0, aUp:0, thru:0, missing:true, strokes:[]};
  if(A.some(x=>x.hdcp===null)||B.some(x=>x.hdcp===null)) return {status:"HDCP missing - enter HDCPs for these players first", aPts:0, bPts:0, aUp:0, thru:0, missing:true, strokes:[]};
  const all=[...A,...B];
  const low=Math.min(...all.map(x=>x.hdcp));
  const strokesFor=(x)=> match.mode==="full" ? x.hdcp : (x.hdcp-low);
  const n=holes.length||18;
  let aUp=0, thru=0, decided=false;
  for(const h of (course?.holes||[])){
    const netSide=(side)=>{ let best=null; for(const x of side){ const pi=parseInt(x.ref.split(":")[1],10); const g=x.team.scores?.[pi]?.[h.hole]; if(g===undefined||g===null) continue; const net=Number(g)-ryderStrokeOnHole(strokesFor(x), rankOf[h.hole]||99, n); if(best===null||net<best) best=net; } return best; };
    const na=netSide(A), nb=netSide(B);
    if(na===null||nb===null) continue;
    thru++;
    if(na<nb) aUp++; else if(nb<na) aUp--;
    if(Math.abs(aUp) > (18-thru)) { decided=true; break; }
  }
  let status, aPts=0, bPts=0;
  if(decided||thru>=18){
    if(aUp>0){ status="Final - "+(match.teamA||"Side A")+" wins"; aPts=1; }
    else if(aUp<0){ status="Final - "+(match.teamB||"Side B")+" wins"; bPts=1; }
    else { status="Final - Halved"; aPts=0.5; bPts=0.5; }
    if(decided && thru<18) status+=" ("+Math.abs(aUp)+" & "+(18-thru)+")";
  } else {
    status = aUp>0 ? (match.teamA||"Side A")+" "+aUp+" up thru "+thru : aUp<0 ? (match.teamB||"Side B")+" "+(-aUp)+" up thru "+thru : (thru===0 ? "Not started" : "All square thru "+thru);
  }
  return {status, aPts, bPts, aUp, thru, missing:false, strokes:A.map(x=>({name:x.name,hdcp:x.hdcp,strokes:strokesFor(x)})).concat(B.map(x=>({name:x.name,hdcp:x.hdcp,strokes:strokesFor(x)})))};
}

import { RulesTab } from "./RulesTab.jsx";

const C = {
  bg:"#080f0a", surface:"#0e1a10", card:"#121e14",
  border:"rgba(123,180,80,0.18)", green:"#7bb450", gold:"#e8b84b",
  red:"#e05050", text:"#e8f0e9", muted:"#6b7f6d", dim:"#1e2f20",
};

const TEAM_COLORS=["#e8b84b","#7bb450","#5b9bd5","#e05050","#b07dd5","#50c8c8","#e88a3a","#c8c850","#d570a0","#70d5a0","#a0a0e8","#e8a070"];

function safeInt(v,f=0){const n=parseInt(v,10);return isNaN(n)?f:n;}
function relLabel(d){if(d===null||d===undefined)return"—";if(d===0)return"E";return d>0?"+"+d:String(d);}
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
    if(birdieBonus){const eb=scores.slice(balls).filter(s=>s<=hpar(h)-1);if(eb.length>0)raw-=eb.reduce((sum,s)=>sum+(hpar(h)-s),0);}
    byHole[h.hole]={raw,diff:raw-(hpar(h)*balls),scored:true};
    if(h.side==="front"){front+=raw;frontPar+=hpar(h)*balls;}
    else{back+=raw;backPar+=hpar(h)*balls;}
    total+=raw;
  }
  const totalPar=frontPar+backPar;
  return{byHole,front,frontDiff:front-frontPar,back,backDiff:back-backPar,total,totalDiff:total-totalPar};
}

export default function SfTourneySpectator({ tourney: initialTourney, onBack }) {
  const [tourney,   setTourney]   = useState(initialTourney);
  const [liveLabel, setLiveLabel] = useState("● Live");
  const [tab,       setTab]       = useState("board");
  const subRef = useRef(null);

  const course      = COURSES[tourney?.course_id || "south-toledo"];
  const birdieBonus = tourney?.birdie_bonus !== false;
  const ballsByPar  = tourney?.ball_count_by_par||(tourney?.count_balls?{3:tourney.count_balls,4:tourney.count_balls,5:tourney.count_balls}:{3:2,4:2,5:2});
  const sfCfg = sfConfigOrDefaults(tourney);

  useEffect(()=>{
    // Real-time subscription — updates instantly when director or captains enter scores
    subRef.current = sb
      .channel("spectator_"+tourney.id)
      .on("postgres_changes",{event:"UPDATE",schema:"public",table:"sf_tournaments",filter:"id=eq."+tourney.id},
        payload => {
          if(payload.new) {
            setTourney(payload.new);
            setLiveLabel("● Updated just now");
            setTimeout(()=>setLiveLabel("● Live"),3000);
          }
        })
      .subscribe();
    return()=>{ if(subRef.current) sb.removeChannel(subRef.current); };
  },[tourney.id]);

  const board = (tourney?.teams || []).map((t,i) => ({
    ...t,
    color: t.color || TEAM_COLORS[i%TEAM_COLORS.length],
    sf: sfTeamPoints(t, course.holes, tourney.hole_pars||{}, ballsByPar, sfCfg)
  })).sort((a,b) => b.sf.total - a.sf.total);

  const holesPlayed = course.holes.filter(h =>
    board.some(t => Object.values(t.scores||{}).some(ps => ps?.[h.hole]!==undefined && ps?.[h.hole]!==null))
  ).length;

  return (
    <div style={{ fontFamily:"Georgia,serif", minHeight:"100vh", background:C.bg, color:C.text }}>

      {/* Header */}
      <div style={{ background:`linear-gradient(180deg,${C.card} 0%,transparent 100%)`, padding:"50px 20px 16px" }}>
        {onBack && <button onClick={onBack} style={{ background:"rgba(123,180,80,0.15)", border:`1px solid ${C.green}`, color:C.green, fontSize:13, cursor:"pointer", padding:"8px 16px", borderRadius:20, fontWeight:700, marginBottom:16, display:"block" }}>‹ Back</button>}
        <div style={{ textAlign:"center" }}>
          <div style={{ fontSize:24, fontWeight:800 }}>🏆 {tourney.name}</div>
          <div style={{ fontSize:13, color:C.muted, marginTop:4 }}>{course.name} · {holesPlayed} holes played</div>
          <div style={{ fontSize:11, color:C.green, marginTop:4 }}>{liveLabel}</div>
        </div>
      </div>

      {/* Tabs — PG-SFMATCH-2026-10-28 + PG-CAPTAIN-DARKTABS-2026-10-28: stacked, captain-style segmented rows, same as Outing */}
      <div style={{ padding:"0 16px 4px", display:"flex", flexDirection:"column", gap:8 }}>
        <div style={{ display:"flex", gap:0, border:`1px solid ${C.border}`, borderRadius:10, overflow:"hidden", background:"#121e14" }}>
          {[["board","🏆 Standings"],["scorecard","📋 Scorecard"],["individual","⭐ Individuals"]]
            .map(([id,lbl])=>(
            <button key={id} onClick={()=>setTab(id)} style={{ flex:1, padding:"11px", fontSize:12, fontWeight:tab===id?700:500, background:tab===id?C.green:"#121e14", color:tab===id?"#0a1a0f":C.muted, border:"none", cursor:"pointer" }}>{lbl}</button>
          ))}
        </div>
        <div style={{ display:"flex", gap:0, border:`1px solid ${C.border}`, borderRadius:10, overflow:"hidden", background:"#121e14" }}>
          {[["skins","💰 Skins"],["bets","💵 Bets"],["ryder","Ryder Cup"],["rules","📋 Rules"],
            ...(tourney.ctp_enabled&&(tourney.ctp_holes||[]).length>0?[["ctp","📍 CTP"]]:[])]
            .map(([id,lbl])=>(
            <button key={id} onClick={()=>setTab(id)} style={{ flex:1, padding:"11px", fontSize:12, fontWeight:tab===id?700:500, background:tab===id?(id==="ctp"?C.gold:C.green):"#121e14", color:tab===id?"#0a1a0f":C.muted, border:"none", cursor:"pointer" }}>{lbl}</button>
          ))}
        </div>
      </div>

      <div style={{ padding:"16px" }}>

        {tab==="board"&&(
          <>
            {/* Column headers */}
            <div style={{ display:"flex", padding:"4px 14px", marginBottom:6 }}>
              <div style={{ flex:1, fontSize:10, color:C.muted, letterSpacing:1.5, textTransform:"uppercase" }}>Team</div>
              {["F9","B9","TOT"].map(l=><div key={l} style={{ width:44, textAlign:"center", fontSize:10, color:C.muted, letterSpacing:1, textTransform:"uppercase" }}>{l}</div>)}
            </div>

            {sfIsField(tourney.teams||[])?(
              <SfIndividualList teams={tourney.teams||[]} course={course} holePars={tourney.hole_pars||{}} sfCfg={sfCfg} C={C}/>
            ):board.map((team,rank)=>(
              <div key={team.id??rank} style={{ background:rank===0?"rgba(232,184,75,0.08)":C.card, border:`1px solid ${rank===0?C.gold+"44":C.border}`, borderRadius:14, padding:"14px", marginBottom:8 }}>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <div style={{ width:30,height:30,borderRadius:"50%",flexShrink:0,background:rank===0?C.gold:rank===1?"#aaa":rank===2?"#cd7f32":C.dim,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:13,color:rank<3?"#0a1a0f":C.muted }}>{rank+1}</div>
                  <div style={{ flex:1,minWidth:0 }}>
                    <div style={{ display:"flex",alignItems:"center",gap:6 }}>
                      <div style={{ width:10,height:10,borderRadius:"50%",background:team.color,flexShrink:0 }}/>
                      <div style={{ fontWeight:800,fontSize:15,color:rank===0?C.gold:C.text }}>{team.name}</div>
                    </div>
                    <div style={{ fontSize:11,color:C.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginTop:2 }}>
                      {team.players?.filter(Boolean).join(" · ")||"—"}
                    </div>
                  </div>
                  {[team.sf.front,team.sf.back,team.sf.total].map((pts,i)=>(
                    <div key={i} style={{ width:44,textAlign:"center",fontWeight:800,fontSize:16,color:pts===0?C.muted:C.green }}>{pts}</div>
                  ))}
                </div>
              </div>
            ))}

          </>
        )}

        {tab==="scorecard"&&(
          <div>
            <div style={{ fontSize:10, color:C.muted, letterSpacing:2, textTransform:"uppercase", marginBottom:10 }}>Hole by Hole · Stableford points</div>
            {sfIsField(tourney.teams||[])?(
              <SfIndividualList teams={tourney.teams||[]} course={course} holePars={tourney.hole_pars||{}} sfCfg={sfCfg} C={C}/>
            ):board.map((team,ri)=>{
              const fH=course.holes.filter(h=>h.side==="front");
              const bH=course.holes.filter(h=>h.side==="back");
              const scored=(h)=>Object.values(team.scores||{}).some(ps=>ps?.[h.hole]!==undefined&&ps?.[h.hole]!==null);
              return(
                <div key={team.id??ri} style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:12, padding:"10px 12px", marginBottom:10 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
                    <div style={{ width:10, height:10, borderRadius:"50%", background:team.color, flexShrink:0 }}/>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:800, fontSize:15, color:C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{team.name}</div>
                      <div style={{ fontSize:11, color:C.muted, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", marginTop:2 }}>{team.players?.filter(Boolean).join(" / ")||"No players"}</div>
                    </div>
                    <div style={{ textAlign:"right", flexShrink:0 }}>
                      <div style={{ fontSize:20, fontWeight:800, color:C.green }}>{team.sf.total} pts</div>
                      <div style={{ fontSize:9, color:C.dim }}>total</div>
                    </div>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:2, marginBottom:3 }}>
                    <div style={{ width:20, fontSize:8, color:C.muted, flexShrink:0, textAlign:"right", paddingRight:3 }}>F</div>
                    {fH.map(h=>(
                      <div key={h.hole} style={{ flex:1, height:22, borderRadius:3, background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", display:"flex", alignItems:"center", justifyContent:"center" }}>
                        <span style={{ fontSize:9, fontWeight:700, color:scored(h)?C.text:C.dim }}>{scored(h)?team.sf.byHole[h.hole]:""}</span>
                      </div>
                    ))}
                    <div style={{ width:26, height:22, borderRadius:3, background:"rgba(123,180,80,0.08)", border:"1px solid rgba(123,180,80,0.2)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                      <span style={{ fontSize:9, fontWeight:800, color:C.green }}>{team.sf.front}</span>
                    </div>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:2 }}>
                    <div style={{ width:20, fontSize:8, color:C.muted, flexShrink:0, textAlign:"right", paddingRight:3 }}>B</div>
                    {bH.map(h=>(
                      <div key={h.hole} style={{ flex:1, height:22, borderRadius:3, background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", display:"flex", alignItems:"center", justifyContent:"center" }}>
                        <span style={{ fontSize:9, fontWeight:700, color:scored(h)?C.text:C.dim }}>{scored(h)?team.sf.byHole[h.hole]:""}</span>
                      </div>
                    ))}
                    <div style={{ width:26, height:22, borderRadius:3, background:"rgba(123,180,80,0.08)", border:"1px solid rgba(123,180,80,0.2)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                      <span style={{ fontSize:9, fontWeight:800, color:C.green }}>{team.sf.back}</span>
                    </div>
                  </div>
                </div>
              );
            })}
            {Object.keys(tourney.hole_notes||{}).filter(hn=>String(tourney.hole_notes[hn]||"").trim()!=="").length>0&&(
              <div style={{background:C.card,border:"1px solid "+C.border,borderRadius:12,padding:"14px 16px",marginTop:14}}>
                <div style={{fontWeight:700,fontSize:14,marginBottom:8}}>📋 Hole notes</div>
                {Object.keys(tourney.hole_notes).filter(hn=>String(tourney.hole_notes[hn]||"").trim()!=="").sort((a,b)=>a-b).map(hn=>(
                  <div key={hn} style={{fontSize:13,lineHeight:1.5,marginBottom:4}}>Hole {hn} — {tourney.hole_notes[hn]}</div>
                ))}
              </div>
            )}
          </div>
        )}
        {tab==="individual"&&<SfIndividualList teams={tourney.teams||[]} course={course} holePars={tourney.hole_pars||{}} sfCfg={sfCfg} C={C}/>}
        {tab==="skins"&&<SfSkinsTab teams={tourney.teams||[]} course={course} holePars={tourney.hole_pars||{}} skinsEnabled={tourney.skins_enabled===true} bigBoyEnabled={tourney.big_boy_enabled===true} netEnabled={tourney.net_skins_enabled===true} teammatesTie={tourney.teammates_tie===true} valueFn={sfCfg.skinsBasis==="points"?((team,pi,h)=>sfHolePoints(team.scores?.[pi]?.[h.hole],team.hdcp?.[pi]??12,h,course.holes,tourney.hole_pars?.[h.hole]??h.par,sfCfg.points,sfCfg.counting)):null} highWins={sfCfg.skinsBasis==="points"} pointsMode={sfCfg.skinsBasis==="points"}/>} 

        {tab==="bets"&&<SideBetsTab bets={tourney.side_bets||[]} teams={tourney.teams||[]} course={course} courseId={tourney.course_id||"south-toledo"} C={C}/>}


        {tab==="ryder"&&(()=>{
          const ryder=(tourney.sf_config||{}).ryder||{};
          const matches=ryder.matches||[];
          const teamA=ryder.teamA||"Red", teamB=ryder.teamB||"Blue";
          const teams=tourney.teams||[];
          const calcs=matches.map(m=>ryderMatchCalc({...m,teamA,teamB}, teams, course));
          const aTotal=calcs.reduce((s,c)=>s+c.aPts,0), bTotal=calcs.reduce((s,c)=>s+c.bPts,0);
          const playerLabel=(k)=>{ const parts=String(k).split(":"); const tm=teams[parseInt(parts[0],10)]; const nm=tm?.players?.[parseInt(parts[1],10)]||""; return nm?nm+" ("+(tm?.name||"")+")":k; };
          return(<div>
            <div style={{fontSize:11,color:C.gold,letterSpacing:1.5,textTransform:"uppercase",marginBottom:12,fontWeight:600}}>Ryder Cup · Live</div>
            <div style={{display:"flex",gap:12,marginBottom:14}}>
              <div style={{flex:1,background:C.card,border:"1px solid "+C.border,borderRadius:14,padding:"14px",textAlign:"center"}}><div style={{fontSize:12,color:C.muted}}>{teamA}</div><div style={{fontSize:32,fontWeight:800}}>{aTotal}</div></div>
              <div style={{flex:1,background:C.card,border:"1px solid "+C.border,borderRadius:14,padding:"14px",textAlign:"center"}}><div style={{fontSize:12,color:C.muted}}>{teamB}</div><div style={{fontSize:32,fontWeight:800}}>{bTotal}</div></div>
            </div>
            <div style={{fontSize:12,color:C.muted,marginBottom:14}}>1 point per match, 0.5 for a halved match. Updates live as scores are entered. Read-only — setup is on the director's tab.</div>
            {matches.length===0&&<div style={{fontSize:13,color:C.muted}}>No Ryder Cup matches set up yet for this tournament.</div>}
            {matches.map((m,mi)=>{ const c=calcs[mi]; return(<div key={m.id} style={{background:C.card,border:"1px solid "+C.border,borderRadius:14,padding:"14px",marginBottom:12}}>
              <div style={{fontWeight:800,fontSize:15,marginBottom:6}}>Match {mi+1} · {m.mode==="full"?"Full HDCP":"Difference"}</div>
              <div style={{fontSize:13,marginBottom:4}}><b>{teamA}:</b> {m.a.map(playerLabel).join(" & ")}</div>
              <div style={{fontSize:13,marginBottom:8}}><b>{teamB}:</b> {m.b.map(playerLabel).join(" & ")}</div>
              <div style={{fontSize:12,color:C.muted,marginBottom:8}}>{c.strokes?c.strokes.map(s=>s.name+" HDCP "+s.hdcp+" → "+s.strokes+" stroke"+(Math.abs(s.strokes)===1?"":"s")).join(" · "):""}</div>
              <div style={{fontWeight:800,fontSize:15,color:c.aPts===1||c.bPts===1?C.gold:C.text}}>{c.status} {c.aPts||c.bPts?`· ${teamA} ${c.aPts} — ${teamB} ${c.bPts}`:""}</div>
            </div>); })}
          </div>);
        })()}

        {tab==="rules"&&<RulesTab rules={tourney.director_rules||""} holeNotes={tourney.hole_notes||{}} C={C}/>}

        {tab==="ctp"&&(()=>{
          const ctpHoles=(tourney.ctp_holes||[]).sort((a,b)=>a-b);
          const ctpLeaders=tourney.ctp_leaders||{};
          return(
            <div>
              <div style={{fontSize:11,color:C.gold,letterSpacing:1.5,textTransform:"uppercase",marginBottom:14,fontWeight:600}}>📍 Closest to the Pin — Live</div>
              {ctpHoles.map(holeNum=>{
                const leader=ctpLeaders[holeNum];
                const h=course.holes.find(x=>x.hole===holeNum);
                const effPar=(tourney.hole_pars||{})[holeNum]??h?.par??3;
                return(
                  <div key={holeNum} style={{background:leader?"rgba(232,184,75,0.08)":C.card,border:"2px solid "+(leader?"rgba(232,184,75,0.5)":C.border),borderRadius:16,padding:"16px",marginBottom:12}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:leader?12:0}}>
                      <div>
                        <div style={{fontWeight:800,fontSize:18}}>Hole {holeNum}</div>
                        <div style={{fontSize:11,color:C.muted,marginTop:2}}>Par {effPar} · Hdcp {h?.hdcp} · Use Press Golf tape measure 📏</div>
                      </div>
                      {leader?(
                        <div style={{textAlign:"right"}}>
                          <div style={{fontSize:28,fontWeight:800,color:C.gold,lineHeight:1}}>{leader.distance}</div>
                          <div style={{fontSize:10,color:C.muted,marginTop:2}}>from the pin</div>
                        </div>
                      ):(
                        <div style={{fontSize:12,color:C.dim,marginTop:4}}>Waiting...</div>
                      )}
                    </div>
                    {leader&&(
                      <div style={{background:"rgba(232,184,75,0.12)",borderRadius:12,padding:"12px 14px",display:"flex",alignItems:"center",gap:12}}>
                        <div style={{fontSize:28}}>🏆</div>
                        <div>
                          <div style={{fontWeight:800,fontSize:17,color:C.gold}}>{leader.name}</div>
                          <div style={{fontSize:13,color:C.muted}}>{leader.teamName}</div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              <div style={{textAlign:"center",fontSize:11,color:C.dim,marginTop:16,lineHeight:1.6}}>
                📏 Measure with your Press Golf tape measure<br/>
                Leaders update live as groups finish each hole
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
