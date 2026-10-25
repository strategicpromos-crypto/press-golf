import React from "react";
import { getStrokeHoles, calcAutoPressNassau, calcSkins, courseHasHdcp } from "./golf.js";

// ── TOURNAMENT SIDE BETS ─────────────────────────────────────────────────────
// A side bet is a buddy-game calculation that runs on TOP of tournament
// scores. It is stored on the team_tournaments row as side_bets:
//   { id, a:{team,pi}, b:{team,pi}, betType, betAmount, strokes, pressDown }
//   betType: "skins" | "match" | "nassau" | "nassau-press"
//   betAmount: $ per skin / per hole / per side+total
//   strokes: SIGNED — >0 means player B receives that many, <0 means player A
//     receives. Strokes split per side (getStrokeHoles): 2 = 1 front + 1 back.
//   pressDown: auto-press trigger for nassau-press (default 2).
//
// Rules this module encodes (agreed with the director, Oct 25 2026):
// - Strokes belong to the BET, never to the tournament. A player can be
//   scratch in the event and still get strokes in a side bet.
// - NO manual presses on tournament side bets. A manual press is a call made
//   in person, and side-bet opponents may be in different groups. Nassau
//   presses here are AUTO only, computed from the scores (same rule the
//   buddy-game tracker already uses: manual presses are same-group only).
// - The bet math is the buddy-game math (golf.js) pointed at tournament
//   scorecards. Enter scores once; every bet calculates itself.

function safeInt(v,f=0){const n=parseInt(v,10);return isNaN(n)?f:n;}

function cleanMap(scores){
  const out={};
  for(const k of Object.keys(scores||{})){
    const v=scores[k];
    if(v===undefined||v===null||v==="")continue;
    const n=parseInt(v,10);
    if(!isNaN(n))out[k]=n;
  }
  return out;
}

export function sideBetPlayerName(teams, ref){
  if(!ref)return "?";
  const t=teams?.[ref.team];
  const name=t?.players?.[ref.pi]?.trim();
  return name || ("Player "+((ref.pi||0)+1));
}

function sideBetScores(teams, ref){
  return cleanMap(teams?.[ref.team]?.scores?.[ref.pi] || {});
}

export function sideBetStrokeLabel(bet, aName, bName){
  const n=Math.abs(bet.strokes||0);
  if(n===0)return "No strokes";
  const who=(bet.strokes||0)>0?bName:aName;
  const perSide=Math.floor(n/2), front=perSide+(n%2);
  return who+" gets "+n+" stroke"+(n>1?"s":"")+" ("+front+" front + "+perSide+" back)";
}

// Totals are always from player A's perspective: total > 0 means B owes A.
export function calcSideBet(bet, teams, course, courseId){
  const aName=sideBetPlayerName(teams, bet.a);
  const bName=sideBetPlayerName(teams, bet.b);
  const aScores=sideBetScores(teams, bet.a);
  const bScores=sideBetScores(teams, bet.b);
  const holes=course?.holes||[];
  const strokeHoles=getStrokeHoles(courseId, Math.abs(bet.strokes||0));
  const aStrokeHoles=(bet.strokes||0)<0?strokeHoles:[];
  const bStrokeHoles=(bet.strokes||0)>0?strokeHoles:[];
  let holesPlayed=0;
  for(const h of holes){
    if(aScores[h.hole]!==undefined&&bScores[h.hole]!==undefined)holesPlayed++;
  }

  if(bet.betType==="skins"){
    const r=calcSkins({me:aScores,opp:bScores}, holes, aStrokeHoles, bStrokeHoles, bet.betAmount);
    return {type:"skins",aName,bName,total:r.net,aWon:r.me,bWon:r.opp,carry:r.carries,
      holes:r.holes,holesPlayed,aStrokeHoles,bStrokeHoles};
  }

  if(bet.betType==="match"){
    let upDown=0;
    const perHole=[];
    for(const h of holes){
      const a=safeInt(aScores[h.hole],-1), b=safeInt(bScores[h.hole],-1);
      if(a<0||b<0)continue;
      const aNet=aStrokeHoles.includes(h.hole)?a-1:a;
      const bNet=bStrokeHoles.includes(h.hole)?b-1:b;
      const res=aNet<bNet?"A":aNet>bNet?"B":"tie";
      if(res==="A")upDown++; else if(res==="B")upDown--;
      perHole.push({hole:h.hole,result:res,upDown});
    }
    return {type:"match",aName,bName,total:upDown*(bet.betAmount||0),upDown,
      holes:perHole,holesPlayed,aStrokeHoles,bStrokeHoles};
  }

  // nassau / nassau-press — auto presses only (manualPresses: [])
  const r=calcAutoPressNassau({me:aScores,opp:bScores}, holes, aStrokeHoles, bStrokeHoles,
    bet.betAmount, bet.betType==="nassau-press"?(bet.pressDown||2):99, []);
  return {type:bet.betType,aName,bName,total:r.net,front:r.front,back:r.back,totalBet:r.total,
    holesPlayed,aStrokeHoles,bStrokeHoles};
}

function betTypeLabel(bet){
  if(bet.betType==="skins")return "Skins · $"+bet.betAmount+" / skin";
  if(bet.betType==="match")return "Match Play · $"+bet.betAmount+" / hole";
  if(bet.betType==="nassau")return "Nassau · $"+bet.betAmount+" front / back / total";
  return "Nassau + Auto Press · $"+bet.betAmount+" · press at "+(bet.pressDown||2)+" down";
}

function settleLine(calc){
  if(calc.total>0)return calc.bName+" owes "+calc.aName+" $"+calc.total;
  if(calc.total<0)return calc.aName+" owes "+calc.bName+" $"+(-calc.total);
  return "Even";
}

function diffLabel(diff, aName, bName){
  if(diff>0)return aName+" "+diff+" up";
  if(diff<0)return bName+" "+(-diff)+" up";
  return "Even";
}

function amtColor(amt, C){
  if(amt>0)return C.green;
  if(amt<0)return C.red;
  return C.muted;
}

// Pass onDelete to show Remove buttons (director and captains both run bets);
// spectators omit it (read-only). canSetup swaps the empty-state hint so the
// captain view doesn't tell captains to wait for the director.
export function SideBetsTab({bets, teams, course, courseId, C, onDelete, canSetup}){
  if(!bets||bets.length===0){
    return(
      <div style={{background:C.card,border:"1px solid "+C.border,borderRadius:14,padding:"20px",textAlign:"center"}}>
        <div style={{fontSize:14,color:C.muted}}>No side bets yet.</div>
        <div style={{fontSize:12,color:C.muted,marginTop:6}}>{canSetup?"Tap ＋ Set up Bet above, pick two players, and the bet tracks live from the scores already being entered.":"The director taps ＋ Set up Bet, picks two players, and the bet tracks live from the scores already being entered."}</div>
      </div>
    );
  }
  return(
    <div>
      {bets.map(bet=>{
        const calc=calcSideBet(bet, teams, course, courseId);
        const strokeHoles=(bet.strokes||0)>0?calc.bStrokeHoles:calc.aStrokeHoles;
        return(
          <div key={bet.id} style={{background:C.card,border:"1px solid "+C.border,borderRadius:14,padding:"14px",marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
              <div>
                <div style={{fontWeight:800,fontSize:16}}>{calc.aName} <span style={{color:C.muted,fontWeight:500}}>vs</span> {calc.bName}</div>
                <div style={{fontSize:12,color:C.muted,marginTop:3}}>{betTypeLabel(bet)}</div>
                <div style={{fontSize:12,color:C.muted,marginTop:2}}>
                  {sideBetStrokeLabel(bet, calc.aName, calc.bName)}
                  {strokeHoles.length>0&&<span style={{color:C.gold}}> · holes {strokeHoles.join(", ")}</span>}
                </div>
                {bet.strokes!==0&&!courseHasHdcp(courseId)&&(
                  <div style={{fontSize:12,color:C.gold,marginTop:2}}>⚠ This course has no handicap data — this bet is playing scratch until handicaps are added.</div>
                )}
              </div>
              {onDelete&&(
                <button onClick={()=>{if(window.confirm("Remove this side bet? Scores are not affected."))onDelete(bet.id);}}
                  style={{background:"transparent",border:"1px solid "+C.red,color:C.red,fontSize:11,cursor:"pointer",padding:"6px 10px",borderRadius:8,flexShrink:0}}>✕ Remove</button>
              )}
            </div>

            {calc.holesPlayed===0?(
              <div style={{fontSize:13,color:C.muted,marginTop:12}}>No scores yet — the bet starts counting once both players have a score.</div>
            ):calc.type==="skins"?(
              <>
                <div style={{display:"flex",flexWrap:"wrap",gap:4,marginTop:12}}>
                  {calc.holes.map(h=>(
                    <div key={h.hole} title={"Hole "+h.hole+(h.winner==="carry"?" — tied, $"+h.pot+" carries":" — $"+h.pot)}
                      style={{minWidth:30,textAlign:"center",borderRadius:8,padding:"6px 0 4px",
                        background:h.winner==="me"?"rgba(123,180,80,0.22)":h.winner==="opp"?"rgba(224,80,80,0.16)":C.dim,
                        outline:strokeHoles.includes(h.hole)?"1.5px solid "+C.gold:"none"}}>
                      <div style={{fontSize:10,color:C.muted}}>{h.hole}{strokeHoles.includes(h.hole)?" ★":""}</div>
                      <div style={{fontSize:14,fontWeight:800,color:h.winner==="me"?C.green:h.winner==="opp"?C.red:C.muted}}>
                        {h.winner==="me"?"A":h.winner==="opp"?"B":"–"}
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{fontSize:12,color:C.muted,marginTop:8}}>
                  Skins: {calc.aName} {calc.aWon} – {calc.bName} {calc.bWon}
                  {calc.carry>0&&<span> · ${calc.carry} carrying</span>}
                  <span> · ★ = stroke hole</span>
                </div>
              </>
            ):calc.type==="match"?(
              <>
                <div style={{display:"flex",flexWrap:"wrap",gap:4,marginTop:12}}>
                  {calc.holes.map(h=>(
                    <div key={h.hole} title={"Hole "+h.hole}
                      style={{minWidth:30,textAlign:"center",borderRadius:8,padding:"6px 0 4px",
                        background:h.result==="A"?"rgba(123,180,80,0.22)":h.result==="B"?"rgba(224,80,80,0.16)":C.dim,
                        outline:strokeHoles.includes(h.hole)?"1.5px solid "+C.gold:"none"}}>
                      <div style={{fontSize:10,color:C.muted}}>{h.hole}{strokeHoles.includes(h.hole)?" ★":""}</div>
                      <div style={{fontSize:14,fontWeight:800,color:h.result==="A"?C.green:h.result==="B"?C.red:C.muted}}>
                        {h.result==="A"?"A":h.result==="B"?"B":"–"}
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{fontSize:12,color:C.muted,marginTop:8}}>
                  {calc.upDown>0?calc.aName+" "+calc.upDown+" up":calc.upDown<0?calc.bName+" "+(-calc.upDown)+" up":"All square"}
                  <span> · ★ = stroke hole</span>
                </div>
              </>
            ):(
              <>
                {[["Front",calc.front],["Back",calc.back]].map(([side,s])=>(
                  <div key={side} style={{marginTop:12}}>
                    <div style={{fontSize:11,color:C.muted,letterSpacing:1.5,textTransform:"uppercase",marginBottom:4}}>{side}</div>
                    {s.bets.map((b,i)=>(
                      <div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:13,padding:"4px 0",borderBottom:"1px solid "+C.dim}}>
                        <span style={{color:C.muted}}>{i===0?"Original bet":(b.label||"Press")+(b.startHole?" · from hole "+b.startHole:"")}</span>
                        <span style={{fontWeight:700,color:amtColor(b.amount,C)}}>{diffLabel(b.diff, calc.aName, calc.bName)} · {b.amount===0?"$0":(b.amount>0?"+$":"-$")+Math.abs(b.amount)}</span>
                      </div>
                    ))}
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:13,padding:"4px 0",fontWeight:700}}>
                      <span>{side} total</span>
                      <span style={{color:amtColor(s.total,C)}}>{s.total===0?"$0":(s.total>0?"+$":"-$")+Math.abs(s.total)}</span>
                    </div>
                  </div>
                ))}
                <div style={{display:"flex",justifyContent:"space-between",fontSize:13,padding:"6px 0",fontWeight:700,borderTop:"1px solid "+C.border,marginTop:6}}>
                  <span>Total (18 holes)</span>
                  <span style={{color:amtColor(calc.totalBet,C)}}>{calc.totalBet===0?"$0":(calc.totalBet>0?"+$":"-$")+Math.abs(calc.totalBet)}</span>
                </div>
                {bet.betType==="nassau-press"&&(
                  <div style={{fontSize:12,color:C.muted,marginTop:4}}>Auto presses only — no manual presses on tournament side bets.</div>
                )}
              </>
            )}

            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:C.surface,borderRadius:10,padding:"11px 13px",marginTop:12}}>
              <span style={{fontSize:13,color:C.muted}}>Settle up · {calc.holesPlayed} holes · net for {calc.aName}</span>
              <span style={{fontSize:18,fontWeight:800,color:amtColor(calc.total,C)}}>
                {calc.total===0?"Even":(calc.total>0?"+$"+calc.total:"−$"+(-calc.total))}
              </span>
            </div>
            <div style={{fontSize:12,color:C.muted,marginTop:6}}>{settleLine(calc)}</div>
          </div>
        );
      })}
    </div>
  );
}

export default SideBetsTab;
