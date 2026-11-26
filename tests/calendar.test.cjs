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
  assert.ok(list.some(e=>e.id==='month-2027-03-annual-report'&&e.draft&&!e.confirmed));
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
test('월 중 업무를 예상 소요일만큼 평일 달력에 배치한다',()=>{
  const list=C.eventsForYear(D,2026,{}),e=list.find(e=>e.id==='month-2026-11-dividend-review');
  assert.equal(e.date,'2026-11-16');assert.equal(e.endDate,'2026-11-19');assert.equal(e.durationDays,4);assert.equal(e.draft,true);assert.equal(e.confirmed,false);
  assert.ok(C.occursOn(e,'2026-11-18'));assert.ok(!C.occursOn(e,'2026-11-20'));
  assert.equal(list.find(e=>e.id==='month-2026-11-agm-agenda').endDate,'2026-11-25');
});
test('주말을 건너뛰고 기간이 다음 달·다음 해로 이어진다',()=>{
  assert.equal(C.nextWeekday('2026-11-01'),'2026-11-02');
  assert.equal(C.workDates('2026-12-31',3).join(','),'2026-12-31,2027-01-01,2027-01-04');
  const e={id:'custom-test',date:'2026-12-31',durationDays:3,month:'2026-12'};
  assert.equal(C.eventsForMonth([e],'2027-01').length,1);assert.equal(C.eventsForMonth([e],'2027-02').length,0);
  assert.ok(!C.occursOn(e,'2027-01-02'));
});
test('사용자가 저장한 날짜·소요일·완료 상태를 초안보다 우선한다',()=>{
  const id='month-2026-11-dividend-review',config={overrides:{[id]:{date:'2026-11-27',durationDays:3}},done:{[id]:true}};
  const e=C.eventsForYear(D,2026,config).find(e=>e.id===id);
  assert.equal(e.date,'2026-11-27');assert.equal(e.endDate,'2026-12-01');assert.equal(e.durationDays,3);assert.equal(e.draft,false);assert.equal(e.done,true);
  const restored=C.eventsForYear(D,2026,{}).find(e=>e.id===id);assert.equal(restored.date,'2026-11-16');assert.equal(restored.durationDays,4);
});
test('모든 월 중 업무에 독립된 예상 기간이 있고 기존 ID를 유지한다',()=>{
  for(const rule of D.monthRules){assert.ok(D.planning[rule.guide]);assert.ok(D.planning[rule.guide].days>=1);}
  const one=C.eventsForYear(D,2026,{}),two=C.eventsForYear(D,2026,{});
  assert.equal(one.map(e=>e.id+e.date).join(),two.map(e=>e.id+e.date).join());
  assert.equal(new Set(one.map(e=>e.id)).size,one.length);
});
test('주말 포함 일정이 월 경계를 넘으며 지정한 기본 일정만 대체한다',()=>{
  const custom={id:'custom-qa-vote',guide:'evote-open',title:'전자투표',date:'2027-02-27',durationDays:3,includeWeekends:true,dateType:'planned',category:'agm',summary:'운영 기간',replaces:['month-2027-02-evote-setup']};
  const events=C.eventsForYear(D,2027,{custom:[custom]});
  const event=events.find(e=>e.id===custom.id);
  assert.equal(event.endDate,'2027-03-01');
  assert.equal(event.confirmed,false);
  assert.ok(C.occursOn(event,'2027-02-28'));
  assert.ok(C.eventsForMonth(events,'2027-03').includes(event));
  assert.ok(event.steps.length>0);
  assert.ok(!events.some(e=>e.id==='month-2027-02-evote-setup'));
  assert.ok(events.some(e=>e.id==='month-2027-02-agm-board'));
});
