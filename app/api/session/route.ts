import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAllUsers } from "@/lib/auth";
import { COOKIE_NAME, accountAction, requestDevice, sessionIdentity } from "@/lib/server-session";
const noStore={"Cache-Control":"no-store"};
export async function GET() {
 try {return NextResponse.json(await sessionIdentity(),{headers:noStore});}
 catch {return NextResponse.json({error:"Ověření přihlášení není dostupné."},{status:503,headers:noStore});}
}
export async function POST(req:NextRequest) {
 if(req.headers.get("origin")!==req.nextUrl.origin) return NextResponse.json({error:"Neplatný původ požadavku."},{status:403});
 try {
  const {username,password}=await req.json();
  if(typeof username!=="string" || username.length>100 || typeof password!=="string" || Buffer.byteLength(password)>72)
   return NextResponse.json({error:"Neplatné přihlašovací údaje."},{status:401});
  const normalized=username.normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().toUpperCase();
  const token=randomBytes(32).toString("base64url");
  const result=await accountAction("login",{username:normalized,password,...await requestDevice()},token);
  if(result.error) return NextResponse.json({error:result.error},{status:result.status,headers:noStore});
  const user=getAllUsers().find(u=>u.username===result.username);
  const res=NextResponse.json({user,must_change_password:result.must_change_password===true},{headers:noStore});
  res.cookies.set(COOKIE_NAME,token,{httpOnly:true,secure:req.nextUrl.protocol==="https:",sameSite:"lax",path:"/",maxAge:7*86400});
  return res;
 } catch {return NextResponse.json({error:"Přihlášení se nezdařilo. Zkuste to znovu."},{status:503,headers:noStore});}
}
export async function DELETE(req:NextRequest) {
 if(req.headers.get("origin")!==req.nextUrl.origin) return NextResponse.json({error:"Neplatný požadavek."},{status:403});
 try {
  await accountAction("logout");
  const res=NextResponse.json({ok:true},{headers:noStore});
  res.cookies.set(COOKIE_NAME,"",{path:"/",maxAge:0,httpOnly:true,secure:req.nextUrl.protocol==="https:",sameSite:"lax"});
  return res;
 } catch {return NextResponse.json({error:"Odhlášení se nezdařilo. Zkuste to znovu."},{status:503,headers:noStore});}
}
