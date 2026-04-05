import { useState, useEffect, useCallback } from "react";
import { sb } from "./supabase.js";

const BET_TYPES = ["Skins","Nassau","Wolf","Birdies","Closest to Pin","Long Drive","Greenie","Press","Custom"];

const C = {
  bg:"#080f0a", surface:"#0e1a10", card:"#121e14",
  border:"rgba(123,180,80,0.18)", green:"#7bb450", gold:"#e8b84b",
  red:"#e05050", text:"#e8f0e9", muted:"#6b7f6d", dim:"#1e2f20",
  venmo:"#008CFF", cashapp:"#00D54B",
};

const inp = {
  width:"100%", padding:"14px", background:C.surface,
  border:`1px solid ${C.border}`, borderRadius:10, color:C.text,
  fontSize:16, outline:"none", boxSizing:"border-box", WebkitAppearance:"none",
};

const pill = (active, color=C.green) => ({
  flex:1, padding:"12px 6px", fontSize:12, fontWeight:active?700:500,
  background:active?color:C.surface, color:active?"#0a1a0f":C.muted,
  border:`1px solid ${active?color:C.border}`,
  cursor:"pointer", borderRadius:8, textAlign:"center", transition:"all 0.15s",
});

function Lbl({ children, note }) {
  return (
    <div style={{marginBottom:6}}>
      <span style={{fontSize:11,letterSpacing:1.5,textTransform:"uppercase",color:C.green,fontWeight:600}}>{children}</span>
      {note && <span style={{fontSize:11,color:C.muted,marginLeft:8}}>{note}</span>}
    </div>
  );
}

function Money({ value, size=15 }) {
  const color = value>0?C.green:value<0?C.red:C.muted;
  return <span style={{fontSize:size,fontWeight:700,color,fontVariantNumeric:"tabular-nums"}}>{value>=0?"+":"−"}${Math.abs(value).toFixed(2)}</span>;
}

function Spinner() {
  return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",padding:40}}>
      <div style={{width:32,height:32,border:`3px solid ${C.dim}`,borderTop:`3px solid ${C.green}`,borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

function Toast({ msg, error }) {
  if (!msg) return null;
  return (
    <div style={{position:"fixed",bottom:100,left:"50%",transform:"translateX(-50%)",background:error?C.red:C.green,color:"#fff",padding:"12px 24px",borderRadius:24,fontWeight:700,fontSize:13,zIndex:999,boxShadow:"0 4px 24px rgba(0,0,0,0.6)",whiteSpace:"nowrap",pointerEvents:"none"}}>
      {msg}
    </div>
  );
}

function Sheet({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div style={{position:"fixed",inset:0,zIndex:400}}>
      <div onClick={onClose} style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.75)"}}/>
      <div style={{position:"absolute",bottom:0,left:0,right:0,background:C.surface,borderRadius:"22px 22px 0 0",border:`1px solid ${C.border}`,borderBottom:"none",padding:"0 0 44px",maxHeight:"92vh",overflowY:"auto",boxShadow:"0 -8px 40px rgba(0,0,0,0.7)"}}>
        <div style={{display:"flex",justifyContent:"center",padding:"14px 0 6px"}}>
          <div style={{width:40,height:4,background:C.dim,borderRadius:2}}/>
        </div>
        {title && (
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 20px 16px"}}>
            <div style={{fontWeight:700,fontSize:20,color:C.text}}>{title}</div>
            <button onClick={onClose} style={{background:C.dim,border:"none",color:C.muted,width:32,height:32,borderRadius:"50%",fontSize:16,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
          </div>
        )}
        <div style={{padding:"0 20px"}}>{children}</div>
      </div>
    </div>
  );
}

function BigBtn({ children, onClick, color=C.green, textColor="#0a1a0f", style={}, disabled=false }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{width:"100%",padding:"16px",background:disabled?"#333":color,color:disabled?C.muted:textColor,border:"none",borderRadius:12,fontSize:15,fontWeight:700,cursor:disabled?"not-allowed":"pointer",opacity:disabled?0.6:1,...style}}>
      {children}
    </button>
  );
}

function GhostBtn({ children, onClick, color=C.green, style={} }) {
  return (
    <button onClick={onClick} style={{width:"100%",padding:"14px",background:"transparent",color,border:`1.5px solid ${color}`,borderRadius:12,fontSize:14,fontWeight:600,cursor:"pointer",...style}}>
      {children}
    </button>
  );
}

function SwipeRow({ children, onDelete, accent=C.green }) {
  const [p,setP] = useState(false);
  return (
    <div style={{display:"flex",alignItems:"center",background:C.card,border:`1px solid ${accent}22`,borderRadius:12,marginBottom:10,overflow:"hidden"}}>
      <div style={{display:"flex",alignItems:"center",gap:12,flex:1,padding:"14px"}}>{children}</div>
      <button onClick={onDelete} onTouchStart={()=>setP(true)} onTouchEnd={()=>setP(false)} onMouseDown={()=>setP(true)} onMouseUp={()=>setP(false)}
        style={{flexShrink:0,padding:"14px",background:p?"rgba(224,80,80,0.2)":"transparent",border:"none",color:C.red,fontSize:18,cursor:"pointer",borderLeft:"1px solid rgba(224,80,80,0.12)",transition:"background 0.1s"}}>
        ✕
      </button>
    </div>
  );
}

function SettingsCard({ title, sub, subExtra, children, danger }) {
  return (
    <div style={{background:C.card,border:`1px solid ${danger?"rgba(224,80,80,0.2)":C.border}`,borderRadius:12,padding:"16px",marginBottom:10}}>
      <div style={{fontWeight:600,fontSize:15,marginBottom:4,color:danger?C.red:C.text}}>{title}</div>
      <div style={{fontSize:12,color:C.muted,marginBottom:12}}>{sub}{subExtra}</div>
      {children}
    </div>
  );
}

function Empty({ msg }) {
  return <div style={{textAlign:"center",color:C.dim,padding:"44px 0",fontSize:13}}>⛳ {msg}</div>;
}

// Generate random invite code
function genCode() {
  return Math.random().toString(36).substring(2,8).toUpperCase();
}

// Payment deeplinks
function openVenmo(name, amount) {
  const note = encodeURIComponent(`Press Golf - ${name}`);
  const amt = Math.abs(amount).toFixed(2);
  window.open(`venmo://paycharge?txn=pay&recipients=${encodeURIComponent(name)}&amount=${amt}&note=${note}`, '_blank');
  setTimeout(() => window.open(`https://venmo.com/`, '_blank'), 500);
}

function openCashApp(name, amount) {
  const note = encodeURIComponent(`Press Golf - ${name}`);
  const amt = Math.abs(amount).toFixed(2);
  window.open(`https://cash.app/$${encodeURIComponent(name)}/${amt}`, '_blank');
}

function openZelle(amount) {
  window.open(`https://enroll.zellepay.com/`, '_blank');
}

// ── AUTH ──────────────────────────────────────────────────────────────────────
function AuthScreen({ onAuth }) {
  const [mode,    setMode]    = useState("login");
  const [email,   setEmail]   = useState("");
  const [pass,    setPass]    = useState("");
  const [name,    setName]    = useState("");
  const [loading, setLoading] = useState(false);
  const [err,     setErr]     = useState("");
  const [msg,     setMsg]     = useState("");

  async function handleLogin() {
    setErr(""); setLoading(true);
    const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
    setLoading(false);
    if (error) { setErr(error.message); return; }
    onAuth(data.user);
  }

  async function handleSignup() {
    setErr("");
    if (!name.trim()) { setErr("Enter your name."); return; }
    if (pass.length < 6) { setErr("Password must be 6+ characters."); return; }
    setLoading(true);
    const { error } = await sb.auth.signUp({
      email, password: pass,
      options: { data: { display_name: name.trim() } }
    });
    setLoading(false);
    if (error) { setErr(error.message); return; }
    setMsg("Check your email to confirm, then sign in!");
    setMode("login");
  }

  async function handleReset() {
    if (!email) { setErr("Enter your email first."); return; }
    setLoading(true);
    await sb.auth.resetPasswordForEmail(email);
    setLoading(false);
    setMsg("Password reset email sent!");
  }

  return (
    <div style={{fontFamily:"'Georgia',serif",minHeight:"100vh",background:C.bg,color:C.text,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"24px 24px 60px"}}>
      <div style={{textAlign:"center",marginBottom:36}}>
        <div style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:72,height:72,background:`linear-gradient(135deg,${C.green},#4a8030)`,borderRadius:20,marginBottom:14,boxShadow:`0 4px 24px ${C.green}44`}}>
          <span style={{fontSize:36}}>⛳</span>
        </div>
        <div style={{fontSize:46,fontWeight:800,letterSpacing:-2,color:"#f0f7ec",lineHeight:1}}>Press</div>
        <div style={{fontSize:10,color:C.green,letterSpacing:4,textTransform:"uppercase",marginTop:6}}>Put Me In Your Phone</div>
      </div>

      <div style={{width:"100%",maxWidth:380,background:C.card,border:`1px solid ${C.border}`,borderRadius:20,padding:"28px 24px"}}>
        <div style={{display:"flex",gap:0,marginBottom:24,border:`1px solid ${C.border}`,borderRadius:10,overflow:"hidden"}}>
          {["login","signup"].map(m=>(
            <button key={m} onClick={()=>{setMode(m);setErr("");setMsg("");}} style={{flex:1,padding:"12px",background:mode===m?C.green:"transparent",color:mode===m?"#0a1a0f":C.muted,border:"none",fontSize:13,fontWeight:700,cursor:"pointer",textTransform:"uppercase",letterSpacing:1}}>
              {m==="login"?"Sign In":"Sign Up"}
            </button>
          ))}
        </div>

        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {mode==="signup" && (
            <div><Lbl>Your Name</Lbl><input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Michael" style={inp}/></div>
          )}
          <div><Lbl>Email</Lbl><input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@email.com" style={inp} autoCapitalize="none"/></div>
          <div><Lbl>Password</Lbl><input type="password" value={pass} onChange={e=>setPass(e.target.value)} placeholder={mode==="signup"?"6+ characters":"••••••••"} style={inp}/></div>

          {err && <div style={{background:"rgba(224,80,80,0.1)",border:"1px solid rgba(224,80,80,0.3)",borderRadius:8,padding:"10px 12px",fontSize:13,color:C.red}}>{err}</div>}
          {msg && <div style={{background:"rgba(123,180,80,0.1)",border:"1px solid rgba(123,180,80,0.3)",borderRadius:8,padding:"10px 12px",fontSize:13,color:C.green}}>{msg}</div>}

          <BigBtn onClick={mode==="login"?handleLogin:handleSignup} disabled={loading} style={{marginTop:4}}>
            {loading?"Loading...":(mode==="login"?"Sign In →":"Create Account →")}
          </BigBtn>

          {mode==="login" && (
            <button onClick={handleReset} style={{background:"none",border:"none",color:C.muted,fontSize:12,cursor:"pointer",textAlign:"center",padding:"4px"}}>
              Forgot password?
            </button>
          )}
        </div>
      </div>
      <div style={{marginTop:20,fontSize:11,color:C.dim,textAlign:"center"}}>Your data is private and encrypted.</div>
    </div>
  );
}

// ── ACCEPT INVITE SCREEN ──────────────────────────────────────────────────────
function AcceptInviteScreen({ code, user }) {
  const [status, setStatus] = useState("loading");
  const [invite, setInvite] = useState(null);

  useEffect(() => {
    async function check() {
      const { data } = await sb.from("invites").select("*").eq("code", code).single();
      if (!data) { setStatus("invalid"); return; }
      if (data.accepted) { setStatus("used"); return; }
      if (data.owner_id === user.id) { setStatus("own"); return; }
      setInvite(data);
      setStatus("ready");
    }
    check();
  }, [code, user.id]);

  async function accept() {
    setStatus("accepting");
    await sb.from("invites").update({ accepted: true, invitee_id: user.id }).eq("code", code);
    await sb.from("players").update({ linked_user_id: user.id }).eq("id", invite.player_id);
    setStatus("done");
  }

  return (
    <div style={{fontFamily:"'Georgia',serif",minHeight:"100vh",background:C.bg,color:C.text,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24}}>
      <div style={{fontSize:48,marginBottom:16}}>⛳</div>
      <div style={{fontSize:32,fontWeight:800,color:C.green,marginBottom:8}}>Press</div>
      {status==="loading" && <Spinner/>}
      {status==="invalid" && <div style={{color:C.red,fontSize:16}}>Invalid invite link.</div>}
      {status==="used" && <div style={{color:C.muted,fontSize:16}}>This invite has already been used.</div>}
      {status==="own" && <div style={{color:C.muted,fontSize:16}}>You can't accept your own invite!</div>}
      {status==="ready" && invite && (
        <div style={{textAlign:"center",maxWidth:320}}>
          <div style={{fontSize:18,fontWeight:600,marginBottom:8}}>You've been invited!</div>
          <div style={{color:C.muted,fontSize:14,marginBottom:24}}>
            Accept to share your golf ledger and settle bets together.
          </div>
          <BigBtn onClick={accept}>Accept Invite ✓</BigBtn>
        </div>
      )}
      {status==="accepting" && <Spinner/>}
      {status==="done" && (
        <div style={{textAlign:"center"}}>
          <div style={{fontSize:18,fontWeight:600,color:C.green,marginBottom:8}}>You're linked! ✅</div>
          <div style={{color:C.muted,fontSize:14,marginBottom:24}}>Your golf ledger is now shared.</div>
          <BigBtn onClick={()=>window.location.href="/"}>Open Press</BigBtn>
        </div>
      )}
    </div>
  );
}

// ── ROOT ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [user,    setUser]    = useState(null);
  const [loading, setLoading] = useState(true);

  // Check for invite code in URL
  const urlParams = new URLSearchParams(window.location.search);
  const inviteCode = urlParams.get("invite");

  useEffect(() => {
    sb.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setLoading(false);
    });
    const { data: { subscription } } = sb.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (loading) return (
    <div style={{background:C.bg,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:16}}>
      <div style={{fontSize:46,fontWeight:800,color:C.green,letterSpacing:-2}}>Press</div>
      <Spinner/>
    </div>
  );

  if (!user) return <AuthScreen onAuth={setUser}/>;
  if (inviteCode) return <AcceptInviteScreen code={inviteCode} user={user}/>;
  return <Press user={user} onSignOut={()=>sb.auth.signOut()}/>;
}

// ── PRESS APP ─────────────────────────────────────────────────────────────────
function Press({ user, onSignOut }) {
  const today = new Date().toISOString().slice(0,10);
  const [players,     setPlayers]     = useState([]);
  const [rounds,      setRounds]      = useState([]);
  const [bets,        setBets]        = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [toast,       setToast]       = useState({msg:"",error:false});
  const [view,        setView]        = useState("roster");
  const [pid,         setPid]         = useState(null);
  const [ptab,        setPtab]        = useState("overview");
  const [sheet,       setSheet]       = useState(null);
  const [inviteLink,  setInviteLink]  = useState("");
  const [invitePhone, setInvitePhone] = useState("");

  const [nName,setNName]=useState(""); const [nDir,setNDir]=useState("even"); const [nStr,setNStr]=useState("1");
  const [fDate,setFDate]=useState(today); const [fDir,setFDir]=useState("received"); const [fStr,setFStr]=useState("1"); const [fMoney,setFMoney]=useState(""); const [fNotes,setFNotes]=useState(""); const [fWon,setFWon]=useState(true);
  const [strokeSuggest, setStrokeSuggest] = useState(null);
  const [bDate,setBDate]=useState(today); const [bType,setBType]=useState(BET_TYPES[0]); const [bAmt,setBAmt]=useState(""); const [bNotes,setBNotes]=useState(""); const [bWon,setBWon]=useState(true);
  const [eDir,setEDir]=useState("even"); const [eStr,setEStr]=useState("1");

  function t2(msg,error=false){setToast({msg,error});setTimeout(()=>setToast({msg:"",error:false}),2200);}

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [p,r,b,s] = await Promise.all([
      sb.from("players").select("*").eq("owner_id",user.id).order("created_at"),
      sb.from("rounds").select("*").eq("owner_id",user.id).order("date",{ascending:false}),
      sb.from("bets").select("*").eq("owner_id",user.id).order("date",{ascending:false}),
      sb.from("settlements").select("*").eq("owner_id",user.id).order("date",{ascending:false}),
    ]);
    if(p.data)setPlayers(p.data); if(r.data)setRounds(r.data);
    if(b.data)setBets(b.data);    if(s.data)setSettlements(s.data);
    setLoading(false);
  },[user.id]);

  useEffect(()=>{loadAll();},[loadAll]);

  const player   = players.find(p=>p.id===pid);
  const pRounds  = rounds.filter(r=>r.player_id===pid);
  const pBets    = bets.filter(b=>b.player_id===pid);
  const pSettle  = settlements.filter(s=>s.player_id===pid);
  const pHistory = [...pRounds.map(r=>({...r,kind:"round"})),...pBets.map(b=>({...b,kind:"bet"}))].sort((a,b)=>b.date.localeCompare(a.date));

  const sRound=players.reduce((s,p)=>s+(p.round_money||0),0);
  const sBet  =players.reduce((s,p)=>s+(p.bet_money||0),0);
  const sBank =players.reduce((s,p)=>s+(p.bank||0),0);

  function goProfile(id){setPid(id);setPtab("overview");setView("profile");}
  function goRoster(){setView("roster");setPid(null);}

  // ── Generate Invite Link ──
  async function generateInvite() {
    if (!player) return;
    setSaving(true);
    const code = genCode();
    await sb.from("invites").insert({
      owner_id: user.id,
      player_id: player.id,
      player_name: player.name,
      code,
    });
    const link = `${window.location.origin}?invite=${code}`;
    setInviteLink(link);
    setSaving(false);
    // Copy to clipboard
    try {
      await navigator.clipboard.writeText(link);
      t2("Invite link copied!");
    } catch {
      t2("Invite link generated!");
    }
    setSheet("invite");
  }

  async function addPlayer(){
    const name=nName.trim();
    if(!name){t2("Enter a name.",true);return;}
    if(players.find(p=>p.name.toLowerCase()===name.toLowerCase())){t2("Already exists.",true);return;}
    const st=nDir==="even"?0:nDir==="received"?-Math.abs(Number(nStr)):Math.abs(Number(nStr));
    setSaving(true);
    const{data,error}=await sb.from("players").insert({owner_id:user.id,name,strokes:st,round_money:0,bet_money:0,bank:0}).select().single();
    setSaving(false);
    if(error){t2("Error saving.",true);return;}
    setPlayers(prev=>[...prev,data]);
    setNName("");setNDir("even");setNStr("1");
    setSheet(null);t2(`${name} added!`);
  }

  async function logRound(){
    if(!player)return;
    const st=fDir==="received"?-Math.abs(Number(fStr)):Math.abs(Number(fStr));
    const rawAmt = Math.abs(Number(fMoney)||0);
    const amt = fWon ? rawAmt : -rawAmt;
    setSaving(true);
    const{data:rd,error:re}=await sb.from("rounds").insert({owner_id:user.id,player_id:player.id,player_name:player.name,date:fDate,strokes:st,money:amt,notes:fNotes}).select().single();
    if(re){setSaving(false);t2("Error saving.",true);return;}
    const{data:pd}=await sb.from("players").update({round_money:(player.round_money||0)+amt,bank:(player.bank||0)+amt}).eq("id",player.id).select().single();
    setSaving(false);
    setRounds(prev=>[rd,...prev]);
    if(pd)setPlayers(prev=>prev.map(p=>p.id===pid?pd:p));
    setFDate(today);setFDir("received");setFStr("1");setFMoney("");setFNotes("");setFWon(true);
    setSheet(null);
    t2("Round logged!");

    // Suggest stroke adjustment based on winner
    if(amt!==0){
      const currentStrokes = player.strokes||0;
      const iWon = amt>0;
      // If I won, I get 1 less stroke next round (handicap narrows)
      // If I lost, I get 1 more stroke next round (handicap widens)
      const suggested = iWon ? currentStrokes+1 : currentStrokes-1;
      const currentLabel = currentStrokes===0?"Even":currentStrokes<0?`You receive ${Math.abs(currentStrokes)}`:`You give ${currentStrokes}`;
      const suggestedLabel = suggested===0?"Even":suggested<0?`You receive ${Math.abs(suggested)}`:`You give ${suggested}`;
      setStrokeSuggest({
        current: currentStrokes,
        suggested,
        currentLabel,
        suggestedLabel,
        playerId: player.id,
        playerName: player.name,
        iWon,
      });
    }
  }

  async function applyStrokeChange(){
    if(!strokeSuggest)return;
    await sb.from("players").update({strokes:strokeSuggest.suggested}).eq("id",strokeSuggest.playerId);
    setPlayers(prev=>prev.map(p=>p.id===strokeSuggest.playerId?{...p,strokes:strokeSuggest.suggested}:p));
    setStrokeSuggest(null);
    t2("Strokes updated!");
  }

  async function logBet(){
    if(!player)return;
    const rawAmt = Math.abs(Number(bAmt)||0);
    const amt = bWon ? rawAmt : -rawAmt;
    if(rawAmt===0){t2("Enter an amount.",true);return;}
    setSaving(true);
    const{data:bd,error:be}=await sb.from("bets").insert({owner_id:user.id,player_id:player.id,player_name:player.name,date:bDate,type:bType,amount:amt,notes:bNotes}).select().single();
    if(be){setSaving(false);t2("Error saving.",true);return;}
    const{data:pd}=await sb.from("players").update({bet_money:(player.bet_money||0)+amt,bank:(player.bank||0)+amt}).eq("id",player.id).select().single();
    setSaving(false);
    setBets(prev=>[bd,...prev]);
    if(pd)setPlayers(prev=>prev.map(p=>p.id===pid?pd:p));
    setBDate(today);setBType(BET_TYPES[0]);setBAmt("");setBNotes("");setBWon(true);
    setSheet(null);t2("Side bet logged!");
  }

  async function deleteRound(r){
    await sb.from("rounds").delete().eq("id",r.id);
    const p=players.find(x=>x.id===r.player_id);
    if(p){const{data:pd}=await sb.from("players").update({strokes:(p.strokes||0)-r.strokes,round_money:(p.round_money||0)-r.money,bank:(p.bank||0)-r.money}).eq("id",p.id).select().single();if(pd)setPlayers(prev=>prev.map(x=>x.id===p.id?pd:x));}
    setRounds(prev=>prev.filter(x=>x.id!==r.id));t2("Removed.");
  }

  async function deleteBet(b){
    await sb.from("bets").delete().eq("id",b.id);
    const p=players.find(x=>x.id===b.player_id);
    if(p){const{data:pd}=await sb.from("players").update({bet_money:(p.bet_money||0)-b.amount,bank:(p.bank||0)-b.amount}).eq("id",p.id).select().single();if(pd)setPlayers(prev=>prev.map(x=>x.id===p.id?pd:x));}
    setBets(prev=>prev.filter(x=>x.id!==b.id));t2("Removed.");
  }

  function openEditStrokes(){
    if(!player)return;
    if(player.strokes===0){setEDir("even");setEStr("1");}
    else if(player.strokes<0){setEDir("received");setEStr(String(Math.abs(player.strokes)));}
    else{setEDir("gave");setEStr(String(player.strokes));}
    setSheet("editStrokes");
  }

  async function saveStrokes(){
    const st=eDir==="even"?0:eDir==="received"?-Math.abs(Number(eStr)):Math.abs(Number(eStr));
    setSaving(true);
    const{data:pd}=await sb.from("players").update({strokes:st}).eq("id",pid).select().single();
    setSaving(false);
    if(pd)setPlayers(prev=>prev.map(p=>p.id===pid?pd:p));
    setSheet(null);t2("Strokes updated.");
  }

  async function settleUp(){
    if(!player||player.bank===0){t2("Already even!");setSheet(null);return;}
    setSaving(true);
    await sb.from("settlements").insert({owner_id:user.id,player_id:player.id,player_name:player.name,date:today,amount:player.bank,round_snapshot:player.round_money,bet_snapshot:player.bet_money});
    const{data:pd}=await sb.from("players").update({bank:0,round_money:0,bet_money:0}).eq("id",player.id).select().single();
    setSaving(false);
    const msg=player.bank>0?`Collected $${Math.abs(player.bank).toFixed(2)}!`:`Paid $${Math.abs(player.bank).toFixed(2)}!`;
    if(pd)setPlayers(prev=>prev.map(p=>p.id===pid?pd:p));
    await loadAll();setSheet(null);t2(msg);
  }

  async function removePlayer(){
    setSaving(true);
    await sb.from("players").delete().eq("id",pid);
    setSaving(false);
    setPlayers(prev=>prev.filter(p=>p.id!==pid));
    setRounds(prev=>prev.filter(r=>r.player_id!==pid));
    setBets(prev=>prev.filter(b=>b.player_id!==pid));
    goRoster();t2("Player removed.");
  }

  // ── ROSTER ────────────────────────────────────────────────────────────────
  if(view==="roster") return (
    <div style={{fontFamily:"'Georgia',serif",minHeight:"100vh",background:C.bg,color:C.text,paddingBottom:40}}>
      <div style={{background:`linear-gradient(180deg,${C.card} 0%,transparent 100%)`,padding:"50px 20px 24px",textAlign:"center"}}>
        <div style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:64,height:64,background:`linear-gradient(135deg,${C.green},#4a8030)`,borderRadius:18,marginBottom:14,boxShadow:`0 4px 20px ${C.green}44`}}>
          <span style={{fontSize:32}}>⛳</span>
        </div>
        <div style={{fontSize:42,fontWeight:800,letterSpacing:-2,color:"#f0f7ec",lineHeight:1}}>Press</div>
        <div style={{fontSize:10,color:C.green,letterSpacing:4,textTransform:"uppercase",marginTop:5,marginBottom:4}}>Put Me In Your Phone</div>
        <div style={{fontSize:11,color:C.muted,marginBottom:20}}>
          {user.user_metadata?.display_name||user.email}
          <button onClick={onSignOut} style={{background:"none",border:"none",color:C.dim,fontSize:11,cursor:"pointer",marginLeft:10}}>Sign out</button>
        </div>
        <div style={{display:"flex",background:"rgba(0,0,0,0.35)",border:`1px solid ${C.border}`,borderRadius:14,overflow:"hidden",maxWidth:360,margin:"0 auto"}}>
          {[{l:"Rounds",v:sRound},{l:"Side Bets",v:sBet},{l:"Season Bank",v:sBank}].map((item,i,arr)=>(
            <div key={i} style={{flex:1,textAlign:"center",padding:"13px 4px",borderRight:i<arr.length-1?`1px solid ${C.border}`:"none"}}>
              <Money value={item.v} size={15}/><div style={{fontSize:8,color:C.muted,letterSpacing:1.5,textTransform:"uppercase",marginTop:3}}>{item.l}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{padding:"0 16px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div style={{fontSize:11,letterSpacing:2,color:C.muted,textTransform:"uppercase"}}>Your Opponents</div>
          <button onClick={()=>setSheet("addPlayer")} style={{background:C.green,border:"none",color:"#0a1a0f",padding:"9px 18px",borderRadius:20,fontSize:13,fontWeight:700,cursor:"pointer"}}>+ Add Player</button>
        </div>

        {loading?<Spinner/>:players.length===0?(
          <div style={{textAlign:"center",padding:"60px 20px",color:C.muted}}>
            <div style={{fontSize:48,marginBottom:12}}>⛳</div>
            <div style={{fontSize:16,fontWeight:600,marginBottom:6}}>No opponents yet</div>
            <div style={{fontSize:13}}>Tap "+ Add Player" to get started.</div>
          </div>
        ):[...players].sort((a,b)=>(b.bank||0)-(a.bank||0)).map((p,i)=>{
          const pr=rounds.filter(r=>r.player_id===p.id);
          const pb=bets.filter(b=>b.player_id===p.id);
          const sl=p.strokes===0?"Even":p.strokes<0?`You get ${Math.abs(p.strokes)}`:`You give ${p.strokes}`;
          return (
            <div key={p.id} onClick={()=>goProfile(p.id)} style={{display:"flex",alignItems:"center",gap:14,padding:"16px",marginBottom:10,background:C.card,border:`1px solid ${C.border}`,borderRadius:16,cursor:"pointer",WebkitTapHighlightColor:"transparent"}}>
              <div style={{width:52,height:52,borderRadius:"50%",background:i===0?`linear-gradient(135deg,${C.green},#4a8030)`:C.dim,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:22,color:i===0?"#0a1a0f":C.green,flexShrink:0}}>
                {p.name.charAt(0).toUpperCase()}
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <div style={{fontWeight:700,fontSize:19}}>{p.name}</div>
                  {p.linked_user_id && <span style={{fontSize:10,background:"rgba(123,180,80,0.15)",color:C.green,padding:"2px 8px",borderRadius:10}}>🔗 Linked</span>}
                </div>
                <div style={{fontSize:11,color:C.muted,marginTop:1}}>{sl} · {pr.length}R · {pb.length}B</div>
              </div>
              <div style={{textAlign:"right",flexShrink:0}}>
                <Money value={p.bank||0} size={22}/><div style={{fontSize:9,color:C.muted,letterSpacing:1,textTransform:"uppercase",marginTop:2}}>Bank</div>
              </div>
              <div style={{color:C.dim,fontSize:20}}>›</div>
            </div>
          );
        })}
      </div>

      <Sheet open={sheet==="addPlayer"} onClose={()=>setSheet(null)} title="Add Opponent">
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <div><Lbl>Name</Lbl><input value={nName} onChange={e=>setNName(e.target.value)} placeholder="e.g. KP" style={inp}/></div>
          <div>
            <Lbl note="Starting handicap">Strokes</Lbl>
            <div style={{display:"flex",gap:8,marginBottom:nDir!=="even"?10:0}}>
              {["even","received","gave"].map(d=>(<button key={d} onClick={()=>setNDir(d)} style={pill(nDir===d)}>{d==="even"?"Even":d==="received"?"I Get":"I Give"}</button>))}
            </div>
            {nDir!=="even"&&<input type="number" min="1" value={nStr} onChange={e=>setNStr(e.target.value)} placeholder="# strokes" style={inp}/>}
          </div>
          <BigBtn onClick={addPlayer} disabled={saving}>{saving?"Saving...":"Add Player"}</BigBtn>
          <GhostBtn onClick={()=>setSheet(null)}>Cancel</GhostBtn>
        </div>
      </Sheet>

      <Toast msg={toast.msg} error={toast.error}/>
    </div>
  );

  // ── PROFILE ───────────────────────────────────────────────────────────────
  const PTABS=[{id:"overview",label:"Overview"},{id:"rounds",label:"Rounds"},{id:"bets",label:"Side Bets"},{id:"history",label:"History"},{id:"settings",label:"Settings"}];

  return (
    <div style={{fontFamily:"'Georgia',serif",minHeight:"100vh",background:C.bg,color:C.text,paddingBottom:100}}>
      <div style={{background:`linear-gradient(180deg,${C.card} 0%,transparent 100%)`,padding:"44px 18px 0"}}>
        <button onClick={goRoster} style={{background:"none",border:"none",color:C.green,fontSize:16,cursor:"pointer",padding:"0 0 14px",display:"flex",alignItems:"center",gap:4}}>‹ Back</button>
        <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:18}}>
          <div style={{width:62,height:62,borderRadius:"50%",background:`linear-gradient(135deg,${C.green},#4a8030)`,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:28,color:"#0a1a0f",flexShrink:0}}>
            {player?.name.charAt(0).toUpperCase()}
          </div>
          <div style={{flex:1}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <div style={{fontWeight:700,fontSize:28,lineHeight:1.1}}>{player?.name}</div>
              {player?.linked_user_id && <span style={{fontSize:11,background:"rgba(123,180,80,0.15)",color:C.green,padding:"3px 10px",borderRadius:10}}>🔗 Linked</span>}
            </div>
            <div style={{fontSize:12,color:C.green,marginTop:4}}>{player?.strokes===0?"Even":player?.strokes<0?`You receive ${Math.abs(player.strokes)} stroke(s)`:`You give ${player?.strokes} stroke(s)`}</div>
          </div>
          <div style={{textAlign:"right"}}><Money value={player?.bank??0} size={28}/><div style={{fontSize:9,color:C.muted,letterSpacing:1,textTransform:"uppercase",marginTop:2}}>Bank</div></div>
        </div>
        <div style={{display:"flex",background:"rgba(0,0,0,0.3)",borderRadius:"12px 12px 0 0",overflow:"hidden"}}>
          {[{l:"Round $",v:player?.round_money??0,m:true},{l:"Bet $",v:player?.bet_money??0,m:true},{l:"Rounds",v:pRounds.length,m:false},{l:"Bets",v:pBets.length,m:false}].map((item,i,arr)=>(
            <div key={i} style={{flex:1,textAlign:"center",padding:"12px 4px",borderRight:i<arr.length-1?`1px solid ${C.border}`:"none"}}>
              {item.m?<Money value={item.v} size={14}/>:<div style={{fontSize:18,fontWeight:700,color:C.green}}>{item.v}</div>}
              <div style={{fontSize:8,color:C.muted,letterSpacing:1,textTransform:"uppercase",marginTop:2}}>{item.l}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{display:"flex",overflowX:"auto",WebkitOverflowScrolling:"touch",borderBottom:`1px solid ${C.border}`,background:"rgba(0,0,0,0.2)",scrollbarWidth:"none"}}>
        {PTABS.map(t=>(<button key={t.id} onClick={()=>setPtab(t.id)} style={{flexShrink:0,padding:"13px 20px",fontSize:12,fontWeight:ptab===t.id?700:500,background:"transparent",color:ptab===t.id?C.green:C.muted,border:"none",borderBottom:ptab===t.id?`2px solid ${C.green}`:"2px solid transparent",cursor:"pointer",whiteSpace:"nowrap"}}>{t.label}</button>))}
      </div>

      <div style={{padding:"16px"}}>

        {ptab==="overview"&&(
          <div>
            {/* Action buttons */}
            <div style={{display:"flex",gap:8,marginBottom:18}}>
              <button onClick={()=>setSheet("round")}  style={{flex:1,padding:"15px 6px",background:C.green,color:"#0a1a0f",border:"none",borderRadius:12,fontSize:13,fontWeight:700,cursor:"pointer"}}>🏌️ Round</button>
              <button onClick={()=>setSheet("bet")}    style={{flex:1,padding:"15px 6px",background:C.gold, color:"#0a1a0f",border:"none",borderRadius:12,fontSize:13,fontWeight:700,cursor:"pointer"}}>🎯 Bet</button>
              <button onClick={()=>setSheet("settle")} style={{flex:1,padding:"15px 6px",background:"transparent",color:C.gold,border:`1.5px solid ${C.gold}`,borderRadius:12,fontSize:13,fontWeight:700,cursor:"pointer"}}>🤝 Settle</button>
            </div>

            {/* Invite banner if not linked */}
            {!player?.linked_user_id && (
              <div style={{background:"rgba(123,180,80,0.08)",border:`1px solid ${C.green}44`,borderRadius:12,padding:"14px 16px",marginBottom:14,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontWeight:600,fontSize:14,marginBottom:2}}>Invite {player?.name}</div>
                  <div style={{fontSize:12,color:C.muted}}>Link accounts to share this ledger</div>
                </div>
                <button onClick={generateInvite} disabled={saving} style={{background:C.green,border:"none",color:"#0a1a0f",padding:"8px 16px",borderRadius:20,fontSize:12,fontWeight:700,cursor:"pointer",flexShrink:0}}>
                  {saving?"...":"Send Invite 🔗"}
                </button>
              </div>
            )}

            {/* Bank breakdown */}
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"14px 16px",marginBottom:16}}>
              <div style={{fontSize:10,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>Bank Breakdown</div>
              <div style={{display:"flex",border:`1px solid ${C.border}`,borderRadius:8,overflow:"hidden"}}>
                {[{l:"Round Money",v:player?.round_money??0},{l:"Side Bets",v:player?.bet_money??0},{l:"Total Bank",v:player?.bank??0}].map((item,i,arr)=>(
                  <div key={i} style={{flex:1,textAlign:"center",padding:"12px 6px",background:"rgba(0,0,0,0.2)",borderRight:i<arr.length-1?`1px solid ${C.border}`:"none"}}>
                    <Money value={item.v} size={14}/><div style={{fontSize:8,color:C.muted,letterSpacing:1,textTransform:"uppercase",marginTop:4}}>{item.l}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{fontSize:10,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>Recent Activity</div>
            {loading?<Spinner/>:pHistory.length===0?<div style={{textAlign:"center",color:C.dim,padding:"30px 0",fontSize:13}}>⛳ No activity yet!</div>:pHistory.slice(0,5).map((item,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",background:C.card,borderRadius:10,marginBottom:8,border:`1px solid ${item.kind==="bet"?"rgba(232,184,75,0.15)":C.border}`}}>
                <span style={{fontSize:18}}>{item.kind==="round"?"🏌️":"🎯"}</span>
                <div style={{flex:1}}>
                  <div style={{fontWeight:600,fontSize:13}}>{item.kind==="round"?item.date:item.type}</div>
                  <div style={{fontSize:11,color:C.muted,marginTop:1}}>{item.kind==="round"?(item.notes||item.date):`${item.date}${item.notes?` · ${item.notes}`:""}`}</div>
                </div>
                <Money value={item.kind==="round"?item.money:item.amount} size={15}/>
              </div>
            ))}
            {pHistory.length>5&&<button onClick={()=>setPtab("history")} style={{width:"100%",padding:"13px",background:"transparent",border:`1px solid ${C.border}`,borderRadius:10,color:C.green,fontSize:13,cursor:"pointer",marginTop:6}}>View All ({pHistory.length})</button>}

            {pSettle.length>0&&(
              <div style={{marginTop:18}}>
                <div style={{fontSize:10,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>Settlement History</div>
                {pSettle.map((s,i)=>(<div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 14px",background:C.card,borderRadius:10,marginBottom:8}}><span style={{fontSize:13,color:C.muted}}>🤝 Settled {s.date}</span><Money value={s.amount} size={14}/></div>))}
              </div>
            )}
          </div>
        )}

        {ptab==="rounds"&&(<div><BigBtn onClick={()=>setSheet("round")} style={{marginBottom:14}}>+ Log Round</BigBtn>{loading?<Spinner/>:pRounds.length===0?<Empty msg="No rounds logged yet."/>:pRounds.map(r=>(<SwipeRow key={r.id} onDelete={()=>deleteRound(r)}><div style={{flex:1}}><div style={{fontWeight:600,fontSize:14}}>{r.date}</div>{r.notes&&<div style={{fontSize:12,color:C.muted,marginTop:2,fontStyle:"italic"}}>{r.notes}</div>}<div style={{fontSize:11,color:C.dim,marginTop:3}}>{r.strokes===0?"Even":r.strokes<0?`Got ${Math.abs(r.strokes)} stroke(s)`:`Gave ${r.strokes} stroke(s)`}</div></div><Money value={r.money} size={17}/></SwipeRow>))}</div>)}

        {ptab==="bets"&&(<div><BigBtn onClick={()=>setSheet("bet")} style={{marginBottom:14,background:C.gold}}>+ Log Side Bet</BigBtn>{loading?<Spinner/>:pBets.length===0?<Empty msg="No side bets logged yet."/>:pBets.map(b=>(<SwipeRow key={b.id} onDelete={()=>deleteBet(b)} accent={C.gold}><div style={{flex:1}}><div style={{fontWeight:700,fontSize:15}}>{b.type}</div><div style={{fontSize:12,color:C.muted,marginTop:2}}>{b.date}{b.notes?` · ${b.notes}`:""}</div></div><Money value={b.amount} size={17}/></SwipeRow>))}</div>)}

        {ptab==="history"&&(<div>{loading?<Spinner/>:pHistory.length===0?<Empty msg="No activity yet."/>:pHistory.map((item,i)=>(<SwipeRow key={i} onDelete={()=>item.kind==="round"?deleteRound(item):deleteBet(item)} accent={item.kind==="bet"?C.gold:C.green}><div style={{flex:1}}><div style={{display:"flex",alignItems:"center",gap:8}}><span>{item.kind==="round"?"🏌️":"🎯"}</span><span style={{fontWeight:600,fontSize:14}}>{item.kind==="round"?item.date:item.type}</span><span style={{fontSize:10,color:item.kind==="bet"?C.gold:C.green,background:item.kind==="bet"?"rgba(232,184,75,0.08)":"rgba(123,180,80,0.08)",padding:"2px 7px",borderRadius:8}}>{item.kind==="round"?"Round":"Side Bet"}</span></div><div style={{fontSize:11,color:C.muted,marginTop:2,paddingLeft:26}}>{item.kind==="round"?(item.notes||""):`${item.date}${item.notes?` · ${item.notes}`:""}`}</div></div><Money value={item.kind==="round"?item.money:item.amount} size={16}/></SwipeRow>))}</div>)}

        {ptab==="settings"&&(<div>
          <SettingsCard title="Invite to Press" sub={player?.linked_user_id?"✅ Linked — sharing ledger":"Not linked yet — send an invite"}>
            {!player?.linked_user_id && <BigBtn onClick={generateInvite} disabled={saving}>{saving?"Generating...":"Generate Invite Link 🔗"}</BigBtn>}
          </SettingsCard>
          <SettingsCard title="Stroke Handicap" sub={player?.strokes===0?"Even":player?.strokes<0?`You receive ${Math.abs(player.strokes)}`:`You give ${player?.strokes}`}><GhostBtn onClick={openEditStrokes}>Edit Strokes</GhostBtn></SettingsCard>
          <SettingsCard title="Settle Up" sub="Current bank: " subExtra={<Money value={player?.bank??0} size={13}/>}><GhostBtn onClick={()=>setSheet("settle")} color={C.gold}>🤝 Settle Up with {player?.name}</GhostBtn></SettingsCard>
          <SettingsCard title="Remove Player" sub={`Permanently deletes all data for ${player?.name}.`} danger><GhostBtn onClick={removePlayer} color={C.red}>Remove {player?.name}</GhostBtn></SettingsCard>
        </div>)}
      </div>

      {/* ROUND SHEET */}
      <Sheet open={sheet==="round"} onClose={()=>setSheet(null)} title={`Round vs ${player?.name}`}>
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <div><Lbl>Date</Lbl><input type="date" value={fDate} onChange={e=>setFDate(e.target.value)} style={inp}/></div>
          <div><Lbl>Strokes</Lbl><div style={{display:"flex",gap:8,marginBottom:10}}><button onClick={()=>setFDir("received")} style={pill(fDir==="received")}>I Got</button><button onClick={()=>setFDir("gave")} style={pill(fDir==="gave")}>I Gave</button></div><input type="number" min="0" value={fStr} onChange={e=>setFStr(e.target.value)} style={inp} placeholder="# strokes"/></div>
          <div>
            <Lbl>Result</Lbl>
            <div style={{display:"flex",gap:8,marginBottom:10}}>
              <button onClick={()=>setFWon(true)} style={pill(fWon, C.green)}>🏆 I Won</button>
              <button onClick={()=>setFWon(false)} style={pill(!fWon, C.red)}>I Lost</button>
            </div>
          </div>
          <div><Lbl>Amount ($)</Lbl><input type="number" min="0" value={fMoney} onChange={e=>setFMoney(e.target.value)} style={{...inp, borderColor: fWon?"rgba(123,180,80,0.5)":"rgba(224,80,80,0.5)"}} placeholder="e.g. 20" inputMode="decimal"/></div>
          <div><Lbl>Notes (optional)</Lbl><input type="text" value={fNotes} onChange={e=>setFNotes(e.target.value)} style={inp} placeholder="e.g. Back 9 Nassau"/></div>
          <BigBtn onClick={logRound} disabled={saving}>{saving?"Saving...":"Log Round"}</BigBtn>
          <GhostBtn onClick={()=>setSheet(null)}>Cancel</GhostBtn>
        </div>
      </Sheet>

      {/* BET SHEET */}
      <Sheet open={sheet==="bet"} onClose={()=>setSheet(null)} title={`Side Bet vs ${player?.name}`}>
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <div><Lbl>Date</Lbl><input type="date" value={bDate} onChange={e=>setBDate(e.target.value)} style={inp}/></div>
          <div><Lbl>Bet Type</Lbl><select value={bType} onChange={e=>setBType(e.target.value)} style={{...inp,cursor:"pointer"}}>{BET_TYPES.map(t=><option key={t}>{t}</option>)}</select></div>
          <div>
            <Lbl>Result</Lbl>
            <div style={{display:"flex",gap:8,marginBottom:10}}>
              <button onClick={()=>setBWon(true)} style={pill(bWon, C.green)}>🏆 I Won</button>
              <button onClick={()=>setBWon(false)} style={pill(!bWon, C.red)}>I Lost</button>
            </div>
          </div>
          <div><Lbl>Amount ($)</Lbl><input type="number" min="0" value={bAmt} onChange={e=>setBAmt(e.target.value)} style={{...inp, borderColor: bWon?"rgba(123,180,80,0.5)":"rgba(224,80,80,0.5)"}} placeholder="e.g. 10" inputMode="decimal"/></div>
          <div><Lbl>Notes (optional)</Lbl><input type="text" value={bNotes} onChange={e=>setBNotes(e.target.value)} style={inp} placeholder="e.g. Hole 7 CTP"/></div>
          <BigBtn onClick={logBet} disabled={saving} color={C.gold}>{saving?"Saving...":"Log Side Bet"}</BigBtn>
          <GhostBtn onClick={()=>setSheet(null)}>Cancel</GhostBtn>
        </div>
      </Sheet>

      {/* EDIT STROKES SHEET */}
      <Sheet open={sheet==="editStrokes"} onClose={()=>setSheet(null)} title="Edit Strokes">
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <div><Lbl>Direction</Lbl><div style={{display:"flex",gap:8}}>{["even","received","gave"].map(d=>(<button key={d} onClick={()=>setEDir(d)} style={pill(eDir===d)}>{d==="even"?"Even":d==="received"?"I Get":"I Give"}</button>))}</div></div>
          {eDir!=="even"&&<div><Lbl>Strokes</Lbl><input type="number" min="1" value={eStr} onChange={e=>setEStr(e.target.value)} style={inp}/></div>}
          <BigBtn onClick={saveStrokes} disabled={saving}>{saving?"Saving...":"Save"}</BigBtn>
          <GhostBtn onClick={()=>setSheet(null)}>Cancel</GhostBtn>
        </div>
      </Sheet>

      {/* INVITE SHEET */}
      <Sheet open={sheet==="invite"} onClose={()=>setSheet(null)} title={`Invite ${player?.name}`}>
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <div style={{textAlign:"center",padding:"10px 0"}}>
            <div style={{fontSize:40,marginBottom:10}}>🔗</div>
            <div style={{fontSize:15,fontWeight:600,marginBottom:6}}>Invite {player?.name} to Press</div>
            <div style={{fontSize:12,color:C.muted,marginBottom:4}}>Enter their cell number to text them directly</div>
          </div>

          {/* Phone number input */}
          <div>
            <Lbl>Cell Phone Number</Lbl>
            <input
              type="tel"
              value={invitePhone}
              onChange={e=>setInvitePhone(e.target.value)}
              placeholder="e.g. 4195551234"
              style={inp}
              inputMode="tel"
            />
          </div>

          {/* Text button with phone number */}
          <BigBtn onClick={()=>{
            const phone = invitePhone.replace(/\D/g,"");
            const msg = encodeURIComponent(`Hey ${player?.name}! Join me on Press to track our golf bets, strokes and side bets. Sign up here: ${inviteLink}`);
            window.open(`sms:${phone}?&body=${msg}`);
          }}>
            📱 Text {player?.name} the Invite
          </BigBtn>

          {/* Divider */}
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{flex:1,height:1,background:C.border}}/>
            <span style={{fontSize:11,color:C.muted}}>OR SHARE LINK</span>
            <div style={{flex:1,height:1,background:C.border}}/>
          </div>

          {/* Link display */}
          <div style={{background:C.dim,borderRadius:10,padding:"12px 14px",fontSize:11,color:C.muted,wordBreak:"break-all",border:`1px solid ${C.border}`}}>
            {inviteLink}
          </div>

          <div style={{display:"flex",gap:8}}>
            <button onClick={async()=>{try{await navigator.clipboard.writeText(inviteLink);t2("Copied!");}catch{t2("Copy the link above");}}} style={{flex:1,padding:"12px",background:C.dim,border:`1px solid ${C.border}`,borderRadius:10,color:C.text,fontSize:13,cursor:"pointer",fontWeight:600}}>
              📋 Copy Link
            </button>
            <button onClick={()=>window.open(`mailto:?subject=Join me on Press Golf&body=${encodeURIComponent(`Hey! Join me on Press to track our golf bets: ${inviteLink}`)}`)} style={{flex:1,padding:"12px",background:C.dim,border:`1px solid ${C.border}`,borderRadius:10,color:C.text,fontSize:13,cursor:"pointer",fontWeight:600}}>
              📧 Email
            </button>
          </div>

          <GhostBtn onClick={()=>setSheet(null)}>Done</GhostBtn>
        </div>
      </Sheet>

      {/* SETTLE SHEET */}
      <Sheet open={sheet==="settle"} onClose={()=>setSheet(null)} title="Settle Up">
        {player&&(<div>
          <div style={{textAlign:"center",marginBottom:16}}>
            <div style={{fontSize:48,marginBottom:10}}>🤝</div>
            <div style={{background:"rgba(0,0,0,0.3)",border:`1px solid ${player.bank>0?C.green:player.bank<0?C.red:C.border}`,borderRadius:16,padding:"22px 20px",marginBottom:14}}>
              <div style={{fontSize:11,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>{player.bank>0?`${player.name} owes you`:player.bank<0?`You owe ${player.name}`:"You're even"}</div>
              <Money value={player.bank} size={44}/>
            </div>
            {player.bank!==0&&(<div style={{display:"flex",border:`1px solid ${C.border}`,borderRadius:10,overflow:"hidden",marginBottom:14}}>{[{l:"Rounds",v:player.round_money},{l:"Side Bets",v:player.bet_money}].map((item,i)=>(<div key={i} style={{flex:1,textAlign:"center",padding:"12px",borderRight:i===0?`1px solid ${C.border}`:"none",background:"rgba(0,0,0,0.2)"}}><Money value={item.v} size={15}/><div style={{fontSize:9,color:C.muted,letterSpacing:1,textTransform:"uppercase",marginTop:3}}>{item.l}</div></div>))}</div>)}
          </div>

          {/* Payment buttons */}
          {player.bank!==0&&(
            <div style={{marginBottom:14}}>
              <div style={{fontSize:10,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>Pay With</div>
              <div style={{display:"flex",gap:8,marginBottom:8}}>
                <button onClick={()=>openVenmo(player.name, player.bank)} style={{flex:1,padding:"13px",background:C.venmo,border:"none",borderRadius:10,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer"}}>
                  Venmo
                </button>
                <button onClick={()=>openCashApp(player.name, player.bank)} style={{flex:1,padding:"13px",background:C.cashapp,border:"none",borderRadius:10,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer"}}>
                  Cash App
                </button>
                <button onClick={()=>openZelle(player.bank)} style={{flex:1,padding:"13px",background:"#6D1ED4",border:"none",borderRadius:10,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer"}}>
                  Zelle
                </button>
              </div>
              <div style={{fontSize:11,color:C.muted,textAlign:"center",marginBottom:14}}>After paying, tap "Mark as Settled" to record it</div>
            </div>
          )}

          {player.bank===0?<div style={{color:C.green,fontSize:14,marginBottom:16,textAlign:"center"}}>Already square! ✓</div>:null}
          {player.bank!==0&&<BigBtn onClick={settleUp} disabled={saving} color={player.bank>0?C.green:C.red} textColor="#fff" style={{marginBottom:10}}>{saving?"Saving...":(player.bank>0?"Mark as Collected ✓":"Mark as Paid ✓")}</BigBtn>}
          <GhostBtn onClick={()=>setSheet(null)}>Cancel</GhostBtn>
        </div>)}
      </Sheet>

      {/* STROKE SUGGESTION MODAL */}
      {strokeSuggest && (
        <div style={{position:"fixed",inset:0,zIndex:500,background:"rgba(0,0,0,0.85)",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:20,padding:24,width:"100%",maxWidth:360}}>
            <div style={{textAlign:"center",marginBottom:20}}>
              <div style={{fontSize:40,marginBottom:10}}>{strokeSuggest.iWon?"🏆":"📉"}</div>
              <div style={{fontWeight:700,fontSize:20,marginBottom:6}}>
                {strokeSuggest.iWon?`You beat ${strokeSuggest.playerName}!`:`${strokeSuggest.playerName} won this one.`}
              </div>
              <div style={{fontSize:14,color:C.muted,marginBottom:20}}>
                Adjust strokes for next round?
              </div>

              {/* Before / After */}
              <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:16,marginBottom:20}}>
                <div style={{textAlign:"center"}}>
                  <div style={{fontSize:11,color:C.muted,letterSpacing:1,textTransform:"uppercase",marginBottom:4}}>Now</div>
                  <div style={{fontSize:16,fontWeight:600,color:C.text}}>{strokeSuggest.currentLabel}</div>
                </div>
                <div style={{fontSize:24,color:C.green}}>→</div>
                <div style={{textAlign:"center"}}>
                  <div style={{fontSize:11,color:C.muted,letterSpacing:1,textTransform:"uppercase",marginBottom:4}}>Next Round</div>
                  <div style={{fontSize:16,fontWeight:700,color:C.green}}>{strokeSuggest.suggestedLabel}</div>
                </div>
              </div>
            </div>

            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>setStrokeSuggest(null)} style={{flex:1,padding:"14px",background:"transparent",color:C.muted,border:`1px solid ${C.border}`,borderRadius:12,fontSize:14,fontWeight:600,cursor:"pointer"}}>
                Keep Same
              </button>
              <button onClick={applyStrokeChange} style={{flex:1,padding:"14px",background:C.green,color:"#0a1a0f",border:"none",borderRadius:12,fontSize:14,fontWeight:700,cursor:"pointer"}}>
                Yes, Update ✓
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast msg={toast.msg} error={toast.error}/>
    </div>
  );
}
