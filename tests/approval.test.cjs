const {test}=require('node:test');const assert=require('node:assert/strict');
test('승인 토큰은 256bit이고 형식이 제한되며 서버에는 해시만 저장한다',async()=>{
  const {randomToken,digestToken,tokenValid}=await import('../supabase/functions/calendar-access/logic.mjs');
  const token=randomToken();assert.equal(token.length,43);assert.ok(tokenValid(token));
  assert.equal((await digestToken(token)).length,64);assert.notEqual(await digestToken(token),await digestToken(randomToken()));
  for(const bad of ['',null,{},'a'.repeat(42),'a'.repeat(44),'../'+token])assert.equal(tokenValid(bad),false);
});
test('메일 신청자 정보는 HTML로 실행되지 않도록 이스케이프한다',async()=>{
  const {approvalMail}=await import('../supabase/functions/calendar-access/logic.mjs');
  const mail=approvalMail('<script>alert(1)</script>','https://example.invalid/approval.html#token');
  assert.ok(!mail.html.includes('<script>'));assert.ok(mail.html.includes('&lt;script&gt;'));
});
