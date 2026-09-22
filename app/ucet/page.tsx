"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import ModuleShell from "@/app/components/ModuleShell";
import PushNotifications from "@/app/components/PushNotifications";
import styles from "./page.module.css";
type Person={username:string;display_name:string;password_changed_at:string};
type Device={id:string;username:string;user_agent:string;ip_address:string;created_at:string;last_seen_at:string;expires_at:string;revoked_at:string|null};
type Accounts={current_session_id:string;can_manage_team:boolean;people:Person[];sessions:Device[]};
const stamp=(date:string)=>new Date(date).toLocaleString("cs-CZ");
function deviceName(ua:string){
 const os=/Windows/i.test(ua)?"Windows":/Android/i.test(ua)?"Android":/iPhone|iPad/i.test(ua)?"iPhone / iPad":/Mac/i.test(ua)?"macOS":/Linux/i.test(ua)?"Linux":"Neznámý systém";
 const browser=/Edg/i.test(ua)?"Edge":/Firefox|FxiOS/i.test(ua)?"Firefox":/Chrome|CriOS/i.test(ua)?"Chrome":/Safari/i.test(ua)?"Safari":"Prohlížeč";
 return browser+" · "+os;
}
export default function AccountPage(){
 const [data,setData]=useState<Accounts|null>(null),[error,setError]=useState(""),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
 const [selected,setSelected]=useState(""),[password,setPassword]=useState(""),[oldPassword,setOldPassword]=useState(""),[show,setShow]=useState(false);
 const [confirmation,setConfirmation]=useState<{action:string;session_id?:string;label:string}|null>(null);
 const refresh=useCallback(async()=>{
  try{
   const res=await fetch("/api/accounts",{cache:"no-store"});const result=await res.json();
   if(res.status===401){window.location.replace("/login?next=/ucet");return;}
   if(!res.ok)throw Error(result.error);
   setData(result);setError("");setSelected(current=>current||result.people[0]?.username||"");
  }catch(e){setError(e instanceof Error?e.message:"Účty se nepodařilo načíst.");}
 },[]);
 useEffect(()=>{void refresh();const timer=setInterval(()=>void refresh(),30000);return()=>clearInterval(timer);},[refresh]);
 async function mutate(action:string,extra:Record<string,unknown>={}){
  setBusy(true);setError("");setMessage("");
  try{
   const res=await fetch("/api/accounts",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,username:selected,...extra})});
   const result=await res.json();if(!res.ok)throw Error(result.error);
   setConfirmation(null);setMessage(action==="password"?"Heslo změněno. Všechna přihlášení tohoto uživatele byla odhlášena.":"Odhlášení je uložené. Otevřená aplikace změnu zjistí nejpozději při další kontrole přihlášení (do 30 sekund).");
   if(action==="password"){setPassword("");setOldPassword("");setShow(false);}
   await refresh();
  }catch(e){setError(e instanceof Error?e.message:"Změna se nezdařila.");}
  finally{setBusy(false);}
 }
 function generate(){const bytes=crypto.getRandomValues(new Uint8Array(18));setPassword(Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join(""));setShow(true);}
 function submit(e:FormEvent){e.preventDefault();setConfirmation({action:"password",label:"Změnit heslo a odhlásit všechna zařízení tohoto uživatele?"});}
 const person=data?.people.find(p=>p.username===selected);
 const sessions=data?.sessions.filter(s=>s.username===selected)??[];
 return <ModuleShell title={data?.can_manage_team?"Zařízení a hesla týmu":"Můj účet a zařízení"} section="Účet · přihlášení" subtitle="Správa přihlášených zařízení a přístupových hesel."
   items={[{ label: "Upozornění", href: "#upozorneni" }, { label: "Přihlášená zařízení", href: "#zarizeni" }, { label: "Změna hesla", href: "#heslo" }]}>
   <main className={styles.page}>
  <PushNotifications />
  {error&&<p className={styles.error} role="alert">{error}</p>}{message&&<p className={styles.success} role="status">{message}</p>}
  {!data?<p>Načítám účty…</p>:<>
   <section className={styles.toolbar}><label>Kolega<select value={selected} disabled={busy} onChange={e=>{setSelected(e.target.value);setPassword("");setOldPassword("");setMessage("");setConfirmation(null);}}>
    {data.people.map(p=><option key={p.username} value={p.username}>{p.display_name}</option>)}</select></label>
    <button disabled={busy} onClick={()=>void refresh()}>Obnovit</button>
    <button disabled={busy||!sessions.some(s=>!s.revoked_at&&new Date(s.expires_at)>new Date())} onClick={()=>setConfirmation({action:"revoke_all",label:"Odhlásit všechna zařízení uživatele "+person?.display_name+"?"})}>Odhlásit všechna zařízení</button>
   </section>
   <section id="zarizeni" className={styles.card}><h2>{person?.display_name} · přihlášená zařízení</h2><p>Poslední aktivita znamená kontakt s aplikací. Nesledujeme jiné stránky, obrazovku ani pohyb myši. Záznamy zobrazujeme za posledních 90 dní.</p>
   <div className={styles.table}><table><thead><tr><th>Prohlížeč / zařízení</th><th>IP při přihlášení</th><th>Přihlášení</th><th>Poslední aktivita</th><th>Stav</th><th>Akce</th></tr></thead><tbody>
   {sessions.map(s=>{const active=!s.revoked_at&&new Date(s.expires_at)>new Date();return <tr key={s.id}><td title={s.user_agent}><strong>{deviceName(s.user_agent)}</strong>{s.id===data.current_session_id&&<small>Toto přihlášení</small>}</td><td>{s.ip_address||"Neznámá"}</td><td>{stamp(s.created_at)}</td><td>{stamp(s.last_seen_at)}</td><td>{s.revoked_at?"Odhlášeno":active?"Platné přihlášení":"Vypršelo"}</td><td>{active&&<button disabled={busy} onClick={()=>setConfirmation({action:"revoke",session_id:s.id,label:"Odhlásit toto zařízení?"})}>Odhlásit</button>}</td></tr>;})}
   {!sessions.length&&<tr><td colSpan={6}>Zatím žádné přihlášení. Zařízení se objeví při použití nového osobního hesla.</td></tr>}
   </tbody></table></div></section>
   <section id="heslo" className={styles.card}><h2>Změnit heslo · {person?.display_name}</h2><p>Naposledy změněno: {person?stamp(person.password_changed_at):"—"}. Změna odhlásí všechna zařízení tohoto uživatele.</p>
   <form onSubmit={submit}><fieldset disabled={busy}>
    {!data.can_manage_team&&<label>Současné heslo<input type="password" autoComplete="current-password" required value={oldPassword} onChange={e=>setOldPassword(e.target.value)}/></label>}
    <label>Nové heslo<input type={show?"text":"password"} autoComplete="new-password" minLength={12} maxLength={72} required value={password} onChange={e=>setPassword(e.target.value)}/></label>
    <label className={styles.check}><input type="checkbox" checked={show} onChange={e=>setShow(e.target.checked)}/>Zobrazit heslo</label>
    <div className={styles.actions}><button type="button" onClick={generate}>Vygenerovat silné heslo</button><button type="button" disabled={!password} onClick={()=>void navigator.clipboard.writeText(password).then(()=>setMessage("Heslo zkopírováno.")).catch(()=>setError("Kopírování není dostupné. Heslo označte a zkopírujte ručně."))}>Kopírovat heslo</button><button className={styles.primary}>Uložit nové heslo</button></div>
    <p>Heslo si zkopírujte před uložením. Později ho nelze zobrazit; lze pouze nastavit nové. Minimálně 12 znaků.</p>
   </fieldset></form></section>
  </>}
  {confirmation&&<div className={styles.overlay}><section role="dialog" aria-modal="true" aria-labelledby="confirm-title" className={styles.dialog}><h2 id="confirm-title">{confirmation.label}</h2><p>{confirmation.action==="password"?"Nové heslo už máte zkopírované? Po změně se uživatel musí znovu přihlásit.":"Neuložené změny na odhlašovaném zařízení mohou být ztraceny."}</p><div className={styles.actions}><button disabled={busy} onClick={()=>setConfirmation(null)}>Zrušit</button><button autoFocus disabled={busy} className={styles.primary} onClick={()=>void mutate(confirmation.action,confirmation.action==="password"?{password,old_password:oldPassword}:{session_id:confirmation.session_id})}>{busy?"Ukládám…":"Potvrdit"}</button></div></section></div>}
 </main></ModuleShell>;
}
