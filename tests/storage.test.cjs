const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const context=vm.createContext({window:{},Intl,Date,Set,Map});
for(const file of ['calendar.js','storage.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),context);
const S=context.window.PlannerStorage;
const empty=()=>({version:1,settings:{},overrides:{},done:{},custom:[]});
test('예전 한 날짜 백업과 새 소요일 백업을 함께 읽는다',()=>{
  const raw=empty();raw.overrides['month-2026-11-dividend-review']={date:'2026-11-19'};
  raw.custom=[{id:'custom-test',title:'업무',date:'2026-11-20',category:'report',summary:'메모'}];
  const parsed=S.validateBackup(raw);assert.equal(parsed.custom[0].durationDays,1);assert.equal(parsed.overrides['month-2026-11-dividend-review'].date,'2026-11-19');
  raw.custom[0].durationDays=3;assert.equal(S.validateBackup(raw).custom[0].durationDays,3);
});
test('잘못된 파일·날짜·소요일·위험한 키를 적용하지 않는다',()=>{
  assert.throws(()=>S.validateBackup({version:99}));
  const raw=empty();raw.overrides.bad={date:'2026-02-30'};assert.throws(()=>S.validateBackup(raw));
  raw.overrides.bad={date:'2026-11-20',durationDays:0};assert.throws(()=>S.validateBackup(raw));
  raw.overrides=JSON.parse('{"__proto__":{"date":"2026-11-20"}}');assert.throws(()=>S.validateBackup(raw));
});
test('복원은 기존 다른 일정과 완료 상태를 보존하고 충돌 항목만 갱신한다',()=>{
  const current={settings:{},overrides:{first:{date:'2026-11-20'}},done:{first:true},custom:[{id:'custom-1',title:'기존'},{id:'custom-2',title:'갱신 전'}]};
  const incoming={settings:{},overrides:{second:{date:'2026-11-21'}},done:{second:true},custom:[{id:'custom-2',title:'갱신 후'}]};
  const merged=S.merge(current,incoming);assert.equal(merged.custom.length,2);assert.equal(merged.custom[0].title,'기존');assert.equal(merged.custom[1].title,'갱신 후');assert.equal(merged.done.first,true);assert.equal(merged.overrides.first.date,'2026-11-20');
});
test('일정 파일의 유형과 주말 포함 여부를 보존하고 잘못된 대체 항목을 거부한다',()=>{
  const backup=empty();
  const item={id:'custom-qa',title:'투표',date:'2027-02-27',category:'agm',summary:'운영 기간',durationDays:3,includeWeekends:true,dateType:'planned',guide:'evote-open',replaces:['month-2027-02-evote-setup']};
  backup.custom=[item];
  assert.deepEqual(JSON.parse(JSON.stringify(S.validateBackup(backup).custom[0])),item);
  item.replaces=['custom-other'];assert.throws(()=>S.validateBackup(backup));
  delete item.replaces;item.includeWeekends='false';assert.throws(()=>S.validateBackup(backup));
});
