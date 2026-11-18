const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs');
const ctx=vm.createContext({});
for(const file of ['calendar.js','storage.js','sync-core.js'])vm.runInContext(fs.readFileSync(file,'utf8'),ctx);
const core=ctx.PlannerSyncCore;
const plain=v=>JSON.parse(JSON.stringify(v));
test('독립 항목만 전송하고 다른 기기의 변경을 통째로 덮어쓰지 않는다',()=>{
  const before=core.empty(),after=core.empty();before.done.a=true;after.done={a:true,b:false};
  assert.deepEqual(plain(core.diff(before,after,new Map())),[{kind:'done',key:'b',value:false,version:0}]);
});
test('삭제한 일정은 버전이 있는 tombstone으로 남고 다시 만들 때 최신 버전을 쓴다',()=>{
  const before=core.empty(),after=core.empty();before.overrides.a={date:'2026-11-18'};
  assert.deepEqual(plain(core.diff(before,after,new Map([['overrides:a',4]]))),[{kind:'overrides',key:'a',value:null,version:4}]);
  const decoded=core.decode([{kind:'overrides',item_key:'a',value:null,version:5}]);
  assert.deepEqual(plain(decoded.state),plain(core.empty()));
  assert.equal(core.diff(decoded.state,before,decoded.versions)[0].version,5);
});
test('기존 자료 구조와 false 완료 상태를 DB에서 그대로 복원한다',()=>{
  const result=core.decode([{kind:'done',item_key:'month-2026-11-admin',value:false,version:2}]);
  assert.equal(result.state.done['month-2026-11-admin'],false);
  assert.equal(core.diff(result.state,result.state,result.versions).length,0);
});
test('서버에서 받은 잘못된 데이터를 그대로 화면에 적용하지 않는다',()=>{
  assert.throws(()=>core.decode([{kind:'overrides',item_key:'bad',value:{date:'bad-date'},version:1}]));
});
