const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const context=vm.createContext({window:{},Intl,Date,Set,Map});
for(const file of ['data.js','calendar.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),context);
const D=context.window.DISCLOSURE_DATA,C=context.window.CalendarCore;
test('공시 자료와 일정 참조가 모두 연결된다',()=>{
  const ids=D.guides.map(g=>g.id);assert.equal(new Set(ids).size,ids.length);
  for(const rule of [...D.monthRules,...D.dateRules,...D.agmRules,...D.earningsRules])assert.ok(ids.includes(rule.guide),rule.guide);
  for(const guide of D.guides){assert.ok(guide.source);assert.ok(D.categories.some(c=>c.id===guide.category));assert.ok(guide.steps.length<=3);}
});
test('윤년과 잘못된 날짜를 구분하고 날짜를 이동한다',()=>{
  assert.ok(C.parseDate('2028-02-29'));assert.equal(C.parseDate('2027-02-29'),null);
  assert.equal(C.parseDate('2026-13-01'),null);assert.equal(C.parseDate('2026-11-31'),null);
  assert.equal(C.shiftDate('2027-01-05',-10),'2026-12-26');assert.equal(C.shiftDate('2028-03-01',-1),'2028-02-29');
});
test('미확정 주총·실적발표일을 임의로 만들지 않는다',()=>{
  const list=C.eventsForYear(D,2027,{});
  assert.equal(list.filter(e=>e.id.startsWith('agm-')||e.id.startsWith('earnings-')).length,0);
  assert.ok(list.some(e=>e.id==='month-2027-03-annual-report'&&!e.date));
  assert.equal(list.filter(e=>e.date).every(e=>!e.confirmed),true);
});
test('주총일에서 공고·전자투표·보고서·후속 업무를 계산한다',()=>{
  const list=C.eventsForYear(D,2027,{settings:{2027:{agm:'2027-03-25'}}});
  const get=id=>list.find(e=>e.id===`agm-2027-${id}`);
  assert.equal(get('agm-notice').date,'2027-02-25');assert.equal(get('annual-report').date,'2027-03-18');
  assert.equal(get('evote-open').date,'2027-03-15');assert.equal(get('final-rehearsal').date,'2027-03-24');
  assert.equal(get('agm-followup').date,'2027-04-01');assert.equal(get('agm-day').confirmed,true);
  assert.equal(list.some(e=>e.id==='month-2027-03-annual-report'),false);
});
test('준비 일정이 연도를 넘더라도 다음 해 설정을 반영한다',()=>{
  const list=C.eventsForYear(D,2026,{settings:{2027:{agm:'2027-01-15'}}});
  assert.equal(list.find(e=>e.id==='agm-2027-agm-notice').date,'2026-12-18');
});
test('실적발표는 발표 연도와 해당 분기를 유지한다',()=>{
  const list=C.eventsForYear(D,2027,{settings:{2027:{earnings:['2027-02-05','','','2027-10-29']}}});
  assert.equal(list.find(e=>e.id==='earnings-2027-0-earnings-notice').date,'2027-01-29');
  assert.match(list.find(e=>e.id==='earnings-2027-0-earnings-release').title,/전년 4분기/);
  assert.equal(list.find(e=>e.id==='earnings-2027-3-earnings-pr').date,'2027-10-27');
});
test('월 중 업무의 날짜 지정·완료 상태·연도 이동을 유지한다',()=>{
  const id='month-2026-11-dividend-review';
  const list=C.eventsForYear(D,2028,{overrides:{[id]:{date:'2028-01-12'}},done:{[id]:true}});
  const event=list.find(e=>e.id===id);assert.equal(event.date,'2028-01-12');assert.equal(event.month,'2028-01');assert.equal(event.done,true);assert.equal(event.confirmed,true);
});
test('업무 구분과 본문 검색이 함께 적용된다',()=>{
  const guide=D.guides.find(g=>g.id==='quarter-report');
  assert.ok(C.matches(guide,'report','XBRL'));assert.ok(!C.matches(guide,'agm','XBRL'));assert.ok(!C.matches(guide,'all','없는검색어'));
});
