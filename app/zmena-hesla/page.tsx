"use client";
import { useState, type FormEvent } from "react";
import { LimmitLogo } from "@/lib/logo";

export default function PersonalPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (password !== confirmation) {setError("Hesla se neshodují."); return;}
    if ([...password].length < 12 || new TextEncoder().encode(password).length > 72) {setError("Použijte alespoň 12 znaků a nejvýše 72 bajtů."); return;}
    setBusy(true);
    try {
      const response = await fetch("/api/session/password",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({password,confirmation})});
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      localStorage.removeItem("firemni-ukoly:session");
      setPassword(""); setConfirmation(""); setDone(true);
    } catch (e) {setError(e instanceof Error ? e.message : "Změna hesla selhala.");}
    finally {setBusy(false);}
  }
  return <main className="login-screen"><section className="login-card">
    <div className="flex justify-center mb-6"><LimmitLogo height={48}/></div>
    <h1 className="text-center mb-3">{done ? "Heslo je nastavené" : "Nastavte si vlastní heslo"}</h1>
    {done ? <><p className="mb-6">Dočasné heslo už neplatí. Nyní se přihlaste svým novým heslem.</p><a href="/login" className="block text-center bg-emerald-600 text-white py-3 rounded-lg">Přejít na přihlášení</a></> :
    <><p className="text-sm mb-6">Přihlásili jste se dočasným heslem. Před vstupem do aplikace si zvolte své vlastní heslo, alespoň 12 znaků dlouhé.</p>
    <form onSubmit={submit} className="space-y-4">
      <label className="block">Nové heslo<input className="w-full rounded-lg px-4 py-3 mt-2" type={visible ? "text" : "password"} autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} required minLength={12}/></label>
      <label className="block">Nové heslo znovu<input className="w-full rounded-lg px-4 py-3 mt-2" type={visible ? "text" : "password"} autoComplete="new-password" value={confirmation} onChange={e=>setConfirmation(e.target.value)} required minLength={12}/></label>
      <label className="flex gap-2 items-center text-sm"><input type="checkbox" checked={visible} onChange={e=>setVisible(e.target.checked)}/>Zobrazit hesla</label>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      <button disabled={busy} className="w-full bg-emerald-600 text-white py-3 rounded-lg disabled:opacity-50">{busy ? "Ukládám…" : "Uložit vlastní heslo"}</button>
    </form>
    <button disabled={busy} className="block mx-auto mt-5 text-sm underline" onClick={async()=>{setBusy(true);try {const r=await fetch("/api/session",{method:"DELETE"});if(!r.ok) throw new Error();localStorage.removeItem("firemni-ukoly:session");window.location.replace("/login");}catch{setError("Odhlášení se nezdařilo.");setBusy(false);}}}>Odhlásit se</button></>}
  </section></main>;
}
