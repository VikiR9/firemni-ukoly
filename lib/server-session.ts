import "server-only";
import { cookies, headers } from "next/headers";
import { getAllUsers, type User } from "./auth";
import { supabase } from "./supabaseClient";
export const COOKIE_NAME = "limmit_session";
export function gatewaySecret() {
 const secret=process.env.ATTENDANCE_GATEWAY_SECRET;
 if(!secret) throw new Error("Přihlášení není nakonfigurované.");
 return secret;
}
export async function sessionToken() { return (await cookies()).get(COOKIE_NAME)?.value ?? ""; }
export async function accountAction(action:string,data:Record<string,unknown>={},token?:string) {
 const {data:result,error}=await supabase.rpc("account_gateway",{p_secret:gatewaySecret(),p_token:token ?? await sessionToken(),p_action:action,p_data:data});
 if(error) throw new Error("Přihlášení nebo správa účtů není nyní dostupná.");
 return result;
}
export async function sessionUser():Promise<User|null> {
 const token=await sessionToken();
 if(!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
 const result=await accountAction("check",{},token);
 return getAllUsers().find(u=>u.username===result?.username) ?? null;
}
export async function sessionIdentity() {
 const token=await sessionToken();
 if(!/^[A-Za-z0-9_-]{43}$/.test(token)) return {user:null,must_change_password:false};
 const result=await accountAction("session",{},token);
 return {user:getAllUsers().find(u=>u.username===result?.username) ?? null,must_change_password:result?.must_change_password===true};
}
export async function requestDevice() {
 const h=await headers();
 return {user_agent:(h.get("user-agent") ?? "").slice(0,1000),ip:process.env.VERCEL ? (h.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown") : "localhost"};
}
