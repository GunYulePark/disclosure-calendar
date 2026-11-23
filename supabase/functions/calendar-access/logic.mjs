export const tokenValid=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{43}$/.test(value);
export const escapeHtml=value=>String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
export async function digestToken(token){
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));
  return [...new Uint8Array(bytes)].map(n=>n.toString(16).padStart(2,'0')).join('');
}
export function randomToken(){
  const bytes=crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
export function approvalMail(email,link){
  return {subject:'[공시 캘린더] 이용 승인 요청',
    text:`이메일 인증을 마친 ${email} 계정이 이용 승인을 요청했습니다.\n\n${link}\n\n페이지에서 신청자를 확인한 뒤 승인 또는 거절하세요. 링크는 24시간 동안 한 번만 사용할 수 있습니다. 링크를 전달하지 마세요.`,
    html:`<h2>공시 캘린더 이용 승인 요청</h2><p>신청 계정: <strong>${escapeHtml(email)}</strong></p><p>이메일 인증을 마친 계정입니다.</p><p><a href="${escapeHtml(link)}">신청 확인 및 승인·거절</a></p><p>24시간 후 만료되며 한 번만 사용할 수 있습니다. 링크를 전달하지 마세요. 메일을 열거나 링크를 조회하는 것만으로 승인되지 않습니다.</p>`};
}
