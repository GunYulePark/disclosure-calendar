const {test}=require('node:test');
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function setup(){
  let fail=false,calls=0,authCallback,status='approved';
  const session={user:{id:'test-user'}};
  const client={auth:{getSession:async()=>({data:{session}}),onAuthStateChange:f=>{authCallback=f;}},from:()=>({select(){return this;},eq(){return this;},order(){return this;},range:async()=>({data:[]})}),rpc:async(name,args)=>{if(name==='disclosure_calendar_access_status')return {data:status};calls++;return fail?{error:{code:'40001'}}:{data:args.changes.map(c=>({kind:c.kind,item_key:c.key,version:c.version+1}))};}};
  const ctx=vm.createContext({window:{PLANNER_DB:{url:'test',publishableKey:'test'},PlannerSupabase:{createClient:()=>client}},setTimeout,structuredClone});
  for(const file of ['calendar.js','storage.js','sync-core.js','cloud.js'])vm.runInContext(fs.readFileSync(file,'utf8'),ctx);
  return {cloud:ctx.window.PlannerCloud,empty:ctx.window.PlannerSyncCore.empty,setFail:v=>{fail=v;},setStatus:v=>{status=v;},get calls(){return calls;}};
}
test('로그인 없이 업무 저장을 허용하지 않는다',async()=>{const s=setup();await assert.rejects(s.cloud.save(s.empty()));assert.equal(s.calls,0);});
test('미승인·거절·정지 계정은 개인 데이터를 불러오지 않는다',async()=>{const s=setup();await s.cloud.init(()=>{});for(const status of ['pending','rejected','suspended']){s.setStatus(status);await assert.rejects(s.cloud.load(),error=>error.code==='ACCESS_'+status.toUpperCase());}});
test('실패 후 재시도할 때 변경을 잃지 않고 성공한 변경은 중복 전송하지 않는다',async()=>{
  const s=setup();await s.cloud.init(()=>{});const next=await s.cloud.load();next.done.test=true;
  s.setFail(true);await assert.rejects(s.cloud.save(next));assert.equal(s.calls,1);
  s.setFail(false);await s.cloud.save(next);assert.equal(s.calls,2);
  await s.cloud.save(next);assert.equal(s.calls,2);
});
