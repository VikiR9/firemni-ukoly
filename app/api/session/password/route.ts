import { NextRequest, NextResponse } from "next/server";
import { accountAction, COOKIE_NAME } from "@/lib/server-session";

export async function POST(req: NextRequest) {
  const headers = {"Cache-Control":"no-store"};
  if (req.headers.get("origin") !== req.nextUrl.origin) return NextResponse.json({error:"Neplatný požadavek."},{status:403,headers});
  try {
    const {password, confirmation} = await req.json();
    if (typeof password !== "string" || password !== confirmation || [...password].length < 12 || Buffer.byteLength(password) > 72)
      return NextResponse.json({error:"Zadejte dvakrát stejné heslo s alespoň 12 znaky (nejvýše 72 bajtů)."},{status:400,headers});
    const result = await accountAction("initial_password", {password});
    const response = NextResponse.json(result,{status:result.status ?? 200,headers});
    if (result.ok) response.cookies.set(COOKIE_NAME,"",{path:"/",maxAge:0,httpOnly:true,secure:req.nextUrl.protocol==="https:",sameSite:"lax"});
    return response;
  } catch {
    return NextResponse.json({error:"Heslo se nepodařilo změnit. Zkuste to znovu."},{status:503,headers});
  }
}
