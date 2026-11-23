import { createClient } from 'npm:@supabase/supabase-js@2.119.0';
import nodemailer from 'npm:nodemailer@10.6.1';
import {randomToken,digestToken,tokenValid,approvalMail} from './logic.mjs';

const SITE='https://gunyulepark.github.io';
const headers={'Access-Control-Allow-Origin':SITE,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Cache-Control':'no-store','Content-Type':'application/json','X-Content-Type-Options':'nosniff'};
const reply=(status:number,value:unknown)=>new Response(JSON.stringify(value),{status,headers});
const service=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
const smtpReady=()=>!!Deno.env.get('GMAIL_SMTP_USER')&&!!Deno.env.get('GMAIL_SMTP_APP_PASSWORD');
let authSafety:{at:number,enabled:boolean}={at:0,enabled:false};
async function confirmationsEnabled(){
 if(Date.now()-authSafety.at<30000)return authSafety.enabled;
 try{const response=await fetch(Deno.env.get('SUPABASE_URL')+'/auth/v1/settings',{headers:{apikey:Deno.env.get('SUPABASE_ANON_KEY')!}});const settings=await response.json();authSafety={at:Date.now(),enabled:response.ok&&settings.mailer_autoconfirm===false};}
 catch{authSafety={at:Date.now(),enabled:false};}
 return authSafety.enabled;
}

// No passwords, authorization headers, request bodies or approval tokens are logged.
Deno.serve(async req=>{
 if(req.headers.get('origin')&&req.headers.get('origin')!==SITE)return reply(403,{error:'Origin not allowed'});
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return reply(405,{error:'POST required'});
 if(Number(req.headers.get('content-length')||0)>2048)return reply(413,{error:'Request too large'});
 try{
  const text=await req.text();if(text.length>2048)return reply(413,{error:'Request too large'});
  const body=JSON.parse(text);
  if(body.action==='readiness')return reply(200,{mailReady:smtpReady()&&await confirmationsEnabled()});
  if(body.action==='request'){
   const bearer=req.headers.get('authorization')||'';
   if(!bearer.startsWith('Bearer '))return reply(401,{error:'Login required'});
   const {data:{user},error:authError}=await service.auth.getUser(bearer.slice(7));
   if(authError||!user||!user.email_confirmed_at||user.is_anonymous)return reply(401,{error:'Verified email required'});
   if(!smtpReady()||!await confirmationsEnabled())return reply(503,{error:'메일 발송 설정을 준비 중입니다. 관리자가 Gmail 서버 인증과 가입 이메일 인증을 설정해야 합니다.'});
   const {data:config,error:configError}=await service.rpc('disclosure_calendar_server_config');
   if(configError||!config?.adminEmail||!config?.siteUrl)return reply(503,{error:'Mail routing unavailable'});
   const token=randomToken(),hash=await digestToken(token);
   const {data:applicant,error:issueError}=await service.rpc('disclosure_calendar_issue_approval',{target_user:user.id,digest:hash,verified_email:user.email});
   if(issueError)return reply(issueError.code==='P0001'?429:403,{error:issueError.code==='P0001'?'요청이 많거나 재요청 대기 중입니다. 잠시 후 다시 시도해 주세요. 같은 계정은 15분 간격으로 요청할 수 있습니다.':'현재 계정은 승인 요청을 보낼 수 없습니다.'});
   const transport=nodemailer.createTransport({host:'smtp.gmail.com',port:465,secure:true,
    auth:{user:Deno.env.get('GMAIL_SMTP_USER'),pass:Deno.env.get('GMAIL_SMTP_APP_PASSWORD')},
    tls:{rejectUnauthorized:true,minVersion:'TLSv1.2'},connectionTimeout:15000,socketTimeout:20000,logger:false,debug:false});
   try{
    const link=config.siteUrl+'approval.html#'+token;
    await transport.sendMail({from:{name:'공시 캘린더',address:Deno.env.get('GMAIL_SMTP_USER')!},to:config.adminEmail,...approvalMail(applicant.email,link)});
   }catch{
    await service.rpc('disclosure_calendar_mark_mail',{target_user:user.id,digest:hash,delivered:false});
    return reply(502,{error:'메일을 보내지 못했습니다. 관리자가 Gmail 서버 인증을 확인해야 합니다. 15분 뒤 재시도하세요.'});
   }finally{transport.close();}
   const {error:markError}=await service.rpc('disclosure_calendar_mark_mail',{target_user:user.id,digest:hash,delivered:true});
   if(markError)return reply(503,{error:'메일 상태를 확인하지 못했습니다. 15분 뒤 새 승인 메일을 요청하세요.'});
   return reply(200,{sent:true});
  }
  // This route authenticates using a 256-bit, single-use secret delivered only to the administrator.
  // JWT gateway verification is off because no account JWT exists on the mail review page.
  if(['inspect','approve','reject'].includes(body.action)){
   if(!tokenValid(body.token))return reply(403,{error:'유효하지 않거나 만료된 승인 링크입니다.'});
   const digest=await digestToken(body.token);
   const {data:pending,error:pendingError}=await service.rpc('disclosure_calendar_review_approval',{digest,decision:null});
   if(pendingError)return reply(403,{error:'유효하지 않거나 만료된 승인 링크입니다.'});
   const {data:{user:applicant},error:applicantError}=await service.auth.admin.getUserById(pending.userId);
   if(applicantError||!applicant?.email_confirmed_at||applicant.is_anonymous||applicant.email!==pending.email)return reply(403,{error:'신청 계정의 이메일 인증 상태가 변경되었습니다.'});
   const {data,error}=body.action==='inspect'?{data:pending,error:null}:await service.rpc('disclosure_calendar_review_approval',{digest,decision:body.action});
   if(error)return reply(403,{error:'유효하지 않거나 만료된 승인 링크입니다. 이미 처리한 링크는 다시 사용할 수 없습니다.'});
   return reply(200,{email:data.email,issuedAt:data.issuedAt,decision:data.decision});
  }
  return reply(400,{error:'Unsupported action'});
 }catch{return reply(400,{error:'요청을 처리하지 못했습니다.'});}
});
