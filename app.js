(() => {
  'use strict';
  const DATA=window.DISCLOSURE_DATA, C=window.CalendarCore, KEY='disclosure-planner-v1';
  const icon=window.PlannerUI.icon;
  const $=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const category=id=>DATA.categories.find(c=>c.id===id)||DATA.categories[4];
  const badge=id=>{const c=category(id);return `<span class="category-badge" style="--category:${c.color};--soft:${c.soft}"><i></i>${esc(c.label)}</span>`;};
  const today=C.todaySeoul(), todayDate=C.parseDate(today);
  const state={year:todayDate.getFullYear(),month:todayDate.getMonth()+1,view:'calendar',category:'all',query:'',selectedDate:null,mode:'calendar',sort:'date',descending:false};
  const cloud=window.PlannerCloud, empty=window.PlannerSyncCore.empty;
  let saved=empty(),selected=null,settingsYear=state.year,toastTimer,pendingBackup=null,legacy=null;
  let phase='loading',dirty=false,cloudError='',account=null,loadGeneration=0,authMode='login',mailReady=false,approvalNotifiedFor=null,approvalSending=false;
  try {const value=JSON.parse(localStorage.getItem(KEY)||'null');if(value)legacy=window.PlannerStorage.validateBackup({version:1,...value});}catch{/* Legacy data can still be imported from a backup. */}
  function toast(message) { $('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),4500); }
  function updateStorageStatus(){
    const labels={loading:'DB 불러오는 중',signedOut:'로그인·가입 신청',pending:'이용 승인 대기',denied:'이용 권한 없음',ready:'DB에 저장됨',saving:'DB 저장 중…',error:dirty?'DB 미저장 · 재시도 필요':'DB 연결 확인 필요'};
    document.querySelectorAll('[data-storage-label]').forEach(el=>{el.textContent=labels[phase];});
    $('storage-status').textContent=labels[phase];$('sync-message').textContent=cloudError||({loading:'일정을 불러오고 있습니다.',signedOut:'승인받은 캘린더 계정으로 로그인하세요. 처음이라면 가입을 신청하세요.',pending:'관리자의 이용 승인이 필요합니다. 승인 전에는 개인 일정 DB에 접근할 수 없습니다.',denied:'이 계정은 이용 권한이 없습니다.',ready:'일정·완료 상태·기준일을 DB에서 불러왔습니다.',saving:'변경 내용을 DB로 전송하고 있습니다.'}[phase]||'');
    $('account-email').textContent=account?.email||'';
    $('login-form').hidden=!!account||phase==='loading';$('account-panel').hidden=!account;
    $('sync-retry').hidden=phase!=='error';$('sync-reload').hidden=!account||!dirty||phase==='saving';
    $('sync-refresh').hidden=!account||!['ready','pending'].includes(phase);$('sync-refresh').textContent=phase==='pending'?'승인 상태 다시 확인':'DB 최신 내용 불러오기';$('logout-btn').disabled=dirty||['saving','loading'].includes(phase);
    $('legacy-import').hidden=!legacy||!account;$('legacy-import').disabled=phase!=='ready';
    $('confirm-restore').disabled=phase!=='ready';
    $('login-submit').disabled=phase==='loading'||(authMode==='signup'&&!mailReady);
    $('login-submit').textContent=authMode==='signup'?'가입 신청 및 이메일 인증':'로그인';
    $('login-password').autocomplete=authMode==='signup'?'new-password':'current-password';$('login-password').minLength=authMode==='signup'?12:1;
    $('auth-mode').textContent=authMode==='signup'?'기존 계정으로 로그인':'처음 이용하시나요? 가입 신청';$('auth-mode').hidden=!!account||phase==='loading';
    $('signup-note').hidden=authMode!=='signup';$('mail-setup-note').hidden=mailReady;
    $('request-approval').hidden=phase!=='pending';$('request-approval').disabled=!mailReady||approvalSending;
  }
  function canEdit(){
    if(phase==='ready')return true;
    if(['signedOut','pending','denied'].includes(phase)){updateStorageStatus();if(!document.querySelector('dialog[open]'))showDialog('storage-dialog');toast(phase==='signedOut'?'로그인과 이용 승인이 필요합니다.':'관리자 승인 후 개인 캘린더를 이용할 수 있습니다.');}
    else toast(phase==='saving'?'DB 저장이 끝난 뒤 다시 시도해 주세요.':'저장·백업에서 DB 연결을 확인해 주세요.');
    return false;
  }
  async function persist(){
    const owner=account?.id;
    dirty=true;phase='saving';cloudError='';updateStorageStatus();
    try{await cloud.save(saved);if(account?.id!==owner)return false;dirty=false;phase='ready';toast('DB에 저장했습니다.');return true;}
    catch(error){if(account?.id!==owner)return false;phase='error';cloudError=error.code==='40001'?'다른 기기에서 같은 업무를 변경했습니다. 현재 내용을 백업한 뒤 DB 다시 불러오기를 선택하세요.':'DB에 저장하지 못했습니다. 현재 내용은 이 화면에 남아 있습니다. 연결을 확인하고 재시도하거나 백업하세요.';toast(cloudError);return false;}
    finally{updateStorageStatus();}
  }
  async function loadAccount(user){
    const generation=++loadGeneration;
    pendingBackup=null;$('restore-preview').hidden=true;
    account=user;phase='loading';cloudError='';saved=empty();dirty=false;updateStorageStatus();
    for(const id of ['detail-dialog','add-dialog','settings-dialog'])if($(id).open)$(id).close();
    render();
    if(!user){phase='signedOut';updateStorageStatus();return;}
    try{const next=await cloud.load();if(generation!==loadGeneration)return;saved=next;phase='ready';render();}
    catch(error){if(generation!==loadGeneration)return;if(error.code==='ACCESS_PENDING'){
      phase='pending';if(mailReady&&approvalNotifiedFor!==user.id){approvalNotifiedFor=user.id;approvalSending=true;cloudError='관리자에게 승인 메일을 요청하고 있습니다.';updateStorageStatus();try{await cloud.requestApproval();if(generation===loadGeneration)cloudError='관리자에게 승인 메일을 보냈습니다. 승인 후 아래에서 상태를 다시 확인하세요.';}catch(err){if(generation===loadGeneration)cloudError=err.message;}finally{approvalSending=false;}}
    }else if(['ACCESS_REJECTED','ACCESS_SUSPENDED'].includes(error.code)){phase='denied';cloudError='이 계정의 이용이 거절되었거나 중지되었습니다. 관리자에게 문의하세요.';}
    else{phase='error';cloudError='DB를 불러오지 못했습니다. 연결을 확인하고 다시 시도하세요.';}}
    updateStorageStatus();
  }
  function monthKey(){return `${state.year}-${C.pad(state.month)}`;}
  function events(){return C.eventsForYear(DATA,state.year,saved);}
  function filtered(list){return list.filter(e=>C.matches(e,state.category,state.query));}
  function formatDate(date){const d=C.parseDate(date);return d?`${d.getMonth()+1}월 ${d.getDate()}일 (${['일','월','화','수','목','금','토'][d.getDay()]})`:'';}
  function period(e,compact=false){if(!e.date)return e.timing;const end=e.endDate||e.date;return end===e.date?formatDate(e.date):compact?`${Number(e.date.slice(5,7))}/${Number(e.date.slice(8))}–${Number(end.slice(5,7))}/${Number(end.slice(8))}`:`${formatDate(e.date)} ~ ${formatDate(end)}`;}
  function tag(e){return e.done?'<span class="state-tag complete">완료</span>':e.draft?'<span class="state-tag draft">초안</span>':e.confirmed?'<span class="state-tag set">저장</span>':'<span class="state-tag">예정</span>';}
  function eventButton(e,kind='task',day=null) {
    const c=category(e.category);
    if(kind==='calendar')return `<button class="calendar-event ${e.done?'is-done':''} ${e.draft?'draft-event':''} ${day&&day!==e.date?'continued':''}" style="--category:${c.color};--soft:${c.soft}" data-event="${esc(e.id)}" title="${esc(e.title)} · ${esc(period(e))} · ${e.draft?'초안':e.confirmed?'저장':'예정'} · 예상 ${e.durationDays||1}일"><span class="event-dot"></span><span>${esc(e.title)}</span>${e.done?icon('check'):''}</button>`;
    return `<button class="task-row ${e.done?'is-done':''}" data-event="${esc(e.id)}"><span class="task-indicator" style="--category:${c.color}">${e.done?icon('check'):''}</span><span class="task-body"><strong>${esc(e.title)}</strong><small>${esc(e.date?period(e,true):e.timing)}${e.durationDays>1?` · 예상 ${e.durationDays}일`:''}</small></span>${tag(e)}<span class="row-arrow">${icon('right')}</span></button>`;
  }
  function renderCategories(){
    const list=state.view==='guide'?DATA.guides:state.view==='year'?events().filter(e=>e.month.startsWith(String(state.year))):C.eventsForMonth(events(),monthKey());
    const html=`<button data-category="all" class="${state.category==='all'?'active':''}" aria-pressed="${state.category==='all'}"><span class="category-dot all-dot"></span>전체 업무<span class="nav-count">${list.length}</span></button>`+DATA.categories.map(c=>`<button data-category="${c.id}" class="${state.category===c.id?'active':''}" aria-pressed="${state.category===c.id}"><span class="category-dot" style="background:${c.color}"></span>${c.label}<span class="nav-count">${list.filter(e=>e.category===c.id).length}</span></button>`).join('');
    $('category-nav').innerHTML=html;$('mobile-category-nav').innerHTML=html;
  }
  function renderSummary(monthEvents){
    const done=monthEvents.filter(e=>e.done).length, drafts=monthEvents.filter(e=>e.draft).length;
    const percent=monthEvents.length?Math.round(done/monthEvents.length*100):0;
    $('summary-row').innerHTML=`<div class="summary-metric"><span class="metric-label">${state.view==='year'?'연간':'이달의'} 전체 업무</span><strong>${monthEvents.length}<small>건</small></strong><span class="metric-description">개인 일정 포함</span></div><div class="summary-metric"><span class="metric-label">준비 일정 초안</span><strong>${drafts}<small>건</small></strong><span class="metric-description">예상 소요일 기준</span></div><div class="summary-metric"><span class="metric-label">완료한 업무</span><strong>${done}<small>/ ${monthEvents.length}건</small></strong><div class="metric-progress"><span class="progress-track" role="progressbar" aria-label="업무 완료율" aria-valuenow="${percent}" aria-valuemin="0" aria-valuemax="100"><i style="width:${percent}%"></i></span><span>${percent}%</span></div></div>`;
  }
  function renderTaskTable(list){
    const rows=[...list].sort((a,b)=>{
      const result=state.sort==='title'?a.title.localeCompare(b.title,'ko'):(a.date||a.month+'-99').localeCompare(b.date||b.month+'-99')||a.title.localeCompare(b.title,'ko');
      return state.descending?-result:result;
    });
    $('table-count').textContent=rows.length;
    const sortHeader=(key,label)=>`<th scope="col" ${state.sort===key?`aria-sort="${state.descending?'descending':'ascending'}"`:''}><button data-sort="${key}">${label}${icon('sort')}</button></th>`;
    $('task-table').innerHTML=`<table class="data-table"><caption class="sr-only">${state.year}년 ${state.month}월 업무 목록</caption><thead><tr><th scope="col" class="checkbox-cell"><span class="sr-only">완료</span></th>${sortHeader('title','업무')}${sortHeader('date','일정')}<th scope="col" class="category-column">업무 구분</th><th scope="col">상태</th><th scope="col" class="detail-cell"><span class="sr-only">상세 보기</span></th></tr></thead><tbody>${rows.map(e=>`<tr class="${e.done?'is-done':''}"><td class="checkbox-cell"><button class="completion-control ${e.done?'checked':''}" data-complete="${esc(e.id)}" aria-label="${esc(e.title)} ${e.done?'완료 취소':'완료로 표시'}" aria-pressed="${e.done}">${e.done?icon('check'):''}</button></td><td class="task-name-cell"><button class="table-task-link" data-event="${esc(e.id)}">${esc(e.title)}</button><small class="mobile-category">${esc(category(e.category).label)}</small></td><td class="table-date">${e.date?esc(period(e,true)):'<span class="unscheduled-label">월 중</span>'}</td><td class="category-column">${badge(e.category)}</td><td>${tag(e)}</td><td class="detail-cell"><button class="icon-button ghost" data-event="${esc(e.id)}" aria-label="${esc(e.title)} 상세 보기">${icon('right')}</button></td></tr>`).join('')||'<tr><td colspan="6" class="empty-table">조건에 맞는 업무가 없습니다. 검색어나 업무 구분을 변경해 주세요.</td></tr>'}</tbody></table><div class="table-footer">${rows.length}개 업무 · 제목을 선택하면 업무 안내가 열립니다.</div>`;
  }
  function renderCalendar(monthEvents){
    const matched=filtered(monthEvents), monthly=matched.filter(e=>e.id.startsWith('month-')), dated=matched.filter(e=>e.date);
    $('month-task-count').textContent=monthly.length;
    $('month-tasks-list').innerHTML=monthly.length?monthly.map(e=>eventButton(e)).join(''):'<p class="empty-small">이 조건에 해당하는 월 중 업무가 없습니다.</p>';
    const start=new Date(state.year,state.month-1,1,12);start.setDate(1-start.getDay());
    const cells=[];
    const cellCount=Math.max(35,Math.ceil((new Date(state.year,state.month-1,1).getDay()+new Date(state.year,state.month,0).getDate())/7)*7);
    for(let i=0;i<cellCount;i++){
      const date=new Date(start);date.setDate(start.getDate()+i);
      const key=C.dateKey(date),inMonth=date.getMonth()+1===state.month, isToday=key===today, selectedDay=key===state.selectedDate;
      const dayEvents=inMonth?dated.filter(e=>C.occursOn(e,key)):[];
      cells.push(`<div class="calendar-cell ${inMonth?'':'outside'} ${isToday?'today':''} ${selectedDay?'selected-day':''}"><button class="day-number ${isToday?'today-number':''}" data-date="${key}" aria-label="${formatDate(key)} 일정 보기" ${isToday?'aria-current="date"':''}>${date.getDate()}</button>${dayEvents.slice(0,3).map(e=>eventButton(e,'calendar',key)).join('')}${dayEvents.length>3?`<button class="more-events" data-date="${key}">+${dayEvents.length-3}건 더 보기</button>`:''}</div>`);
    }
    $('calendar-grid').innerHTML=cells.join('');
    $('calendar-surface').hidden=state.mode!=='calendar';$('task-table-panel').hidden=state.mode!=='list';
    document.querySelector('.calendar-layout').classList.toggle('is-list',state.mode==='list');
    document.querySelectorAll('[data-mode]').forEach(b=>{b.classList.toggle('active',b.dataset.mode===state.mode);b.setAttribute('aria-pressed',String(b.dataset.mode===state.mode));});
    renderTaskTable(matched);
    const [title,description,tags]=DATA.focus[state.month-1];
    $('focus-title').textContent=title;$('focus-description').textContent=description;$('focus-tags').innerHTML=tags.map(t=>`<span>${t}</span>`).join('');
    let agenda=dated;
    if(state.selectedDate)agenda=dated.filter(e=>C.occursOn(e,state.selectedDate));
    $('agenda-title').textContent=state.selectedDate?`${Number(state.selectedDate.slice(5,7))}월 ${Number(state.selectedDate.slice(8))}일 일정`:'이달의 날짜별 일정';
    $('agenda-count').textContent=agenda.length;
    $('agenda-list').innerHTML=(state.selectedDate?'<button class="text-button" id="clear-date">이달 전체 일정 보기</button>':'')+(agenda.length?agenda.map(e=>`<div class="agenda-group"><span class="agenda-date">${formatDate(e.date)}</span>${eventButton(e)}</div>`).join(''):'<div class="empty-agenda"><p>등록된 일정이 없습니다.</p><small>업무의 날짜를 지정하거나 일정을 추가하세요.</small></div>');
    const cfg=saved.settings[state.year]||{};
    $('agm-prompt').querySelector('strong').textContent=cfg.agm?'주총 기준일':'주총 기준일 설정';
    $('agm-prompt').querySelector('small').textContent=cfg.agm?`${cfg.agm.replaceAll('-','.')} · 기준일 수정`:'주총일에 맞춰 준비 일정을 표시합니다.';
  }
  function renderYear(all){
    const totals=Array.from({length:12},(_,i)=>filtered(all.filter(e=>e.month===`${state.year}-${C.pad(i+1)}`)).length),max=Math.max(...totals,1);
    $('year-chart').innerHTML=totals.map((total,i)=>`<button class="chart-month ${i+1===todayDate.getMonth()+1&&state.year===todayDate.getFullYear()?'current':''}" data-month="${i+1}" aria-label="${i+1}월 ${total}건 업무 보기"><span class="bar-value">${total}</span><span class="bar-track"><span class="bar-fill" style="height:${total/max*100}%"></span></span><span class="bar-label">${i+1}<span>월</span></span></button>`).join('');
    $('year-grid').innerHTML=Array.from({length:12},(_,i)=>{
      const month=i+1,list=filtered(all.filter(e=>e.month===`${state.year}-${C.pad(month)}`));
      const counts=DATA.categories.map(c=>({c,count:list.filter(e=>e.category===c.id).length})).filter(v=>v.count);
      return `<button class="year-card ${month===todayDate.getMonth()+1&&state.year===todayDate.getFullYear()?'current-month':''}" data-month="${month}"><div class="year-card-header"><strong>${month}<span>월</span></strong><span>${list.length}건 ${icon('right')}</span></div><h3>${DATA.focus[i][0]}</h3><div class="year-category-list">${counts.map(({c,count})=>`<span><i style="background:${c.color}"></i>${c.label}<b>${count}</b></span>`).join('')||'<p class="muted">검색 결과가 없습니다.</p>'}</div></button>`;
    }).join('');
  }
  function renderGuides(){
    const guides=filtered(DATA.guides);
    $('guide-grid').innerHTML=`<table class="data-table guide-table"><caption class="sr-only">업무 가이드 ${guides.length}개</caption><thead><tr><th scope="col">업무 안내 <span class="table-total">${guides.length}</span></th><th scope="col">진행 시점</th><th scope="col" class="category-column">업무 구분</th><th scope="col" class="detail-cell"><span class="sr-only">상세 보기</span></th></tr></thead><tbody>${guides.map(g=>`<tr><td><button class="table-task-link" data-guide="${g.id}">${esc(g.title)}</button><p class="table-summary">${esc(g.summary)}</p><small class="mobile-category">${esc(category(g.category).label)}</small></td><td class="guide-timing">${esc(g.timing)}</td><td class="category-column">${badge(g.category)}</td><td class="detail-cell"><button class="icon-button ghost" data-guide="${g.id}" aria-label="${esc(g.title)} 상세 보기">${icon('right')}</button></td></tr>`).join('')||'<tr><td colspan="4" class="empty-table">일치하는 업무가 없습니다. 검색어나 업무 구분을 바꿔 보세요.</td></tr>'}</tbody></table>`;
  }
  function render(){
    const all=events(),monthEvents=C.eventsForMonth(all,monthKey());
    renderCategories();renderSummary(state.view==='year'?all.filter(e=>e.month.startsWith(String(state.year))):monthEvents);
    $('month-title').textContent=state.view==='calendar'?`${state.year}년 ${state.month}월`:`${state.year}년`;
    const years=new Set(Array.from({length:7},(_,i)=>todayDate.getFullYear()-2+i));years.add(state.year);
    $('year-select').innerHTML=[...years].sort((a,b)=>a-b).map(y=>`<option value="${y}" ${y===state.year?'selected':''}>${y}년</option>`).join('');
    const viewNames={calendar:'월간 일정',year:'연간 계획',guide:'업무 가이드'};
    $('breadcrumb-title').textContent=viewNames[state.view];
    $('page-title').textContent={calendar:'공시 캘린더',year:'연간 업무 계획',guide:'업무 가이드'}[state.view];
    $('page-description').textContent={calendar:'공시 일정과 준비 업무를 한곳에서 관리합니다.',year:'정기보고서부터 주주총회까지, 월별 업무의 흐름을 확인합니다.',guide:'업무별 진행 순서, 준비물과 참고 자료를 확인합니다.'}[state.view];
    document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===state.view);b.setAttribute('aria-pressed',String(b.dataset.view===state.view));});
    for(const view of ['calendar','year','guide'])$(view+'-view').hidden=state.view!==view;
    $('summary-row').hidden=state.view==='guide';
    $('calendar-mode').hidden=state.view!=='calendar';
    document.querySelector('.month-controls').hidden=state.view==='guide';
    document.querySelector('.main-toolbar').classList.toggle('guide-toolbar',state.view==='guide');
    $('prev-btn').hidden=$('next-btn').hidden=$('today-btn').hidden=state.view==='guide';
    const isFiltering=state.category!=='all'||state.query.trim();$('filter-note').hidden=!isFiltering;
    if(isFiltering)$('filter-note').innerHTML=`<span>${state.category!=='all'?esc(category(state.category).label)+' · ':''}${state.query?`“${esc(state.query)}” 검색 중`:'업무 필터 적용 중'}</span><button class="text-button" id="clear-filter">필터 초기화 ×</button>`;
    renderCalendar(monthEvents);renderYear(all);renderGuides();
  }
  function showDialog(id){$(id).showModal();}
  function closeNavigation(){if($('nav-dialog').open)$('nav-dialog').close();}
  function restoreControlFocus(selector,key,value){[...document.querySelectorAll(selector)].find(el=>el.dataset[key]===value)?.focus({preventScroll:true});}
  function openDetail(id,isGuide=false){
    selected=isGuide?{...DATA.guides.find(g=>g.id===id),isGuide:true}:events().find(e=>e.id===id);
    if(!selected)return;
    const e=selected;$('detail-category').innerHTML=badge(e.category);
    $('detail-content').innerHTML=`<h2>${esc(e.title)}</h2><div class="detail-time">◷ ${esc(e.isGuide?e.timing:e.date?period(e)+' · '+e.label:e.timing+' · 날짜 미정')}${e.isGuide?'':tag(e)}</div><p class="detail-summary">${esc(e.summary||'직접 등록한 일정입니다.')}</p>${e.steps?.length?`<section class="detail-section"><h3>해야 할 일</h3><ol class="step-list">${e.steps.map(s=>`<li>${esc(s)}</li>`).join('')}</ol></section>`:''}${e.supplies?.length?`<section class="detail-section"><h3>미리 준비할 것</h3><div class="supply-tags">${e.supplies.map(s=>`<span>${esc(s)}</span>`).join('')}</div></section>`:''}${e.partners?`<p class="detail-partners"><strong>함께 확인</strong>${esc(e.partners)}</p>`:''}${e.note?`<div class="detail-note"><strong>확인 메모</strong><p>${esc(e.note)}</p></div>`:''}${e.isGuide?'':`<section class="date-edit"><h3>일정 조정</h3><div class="date-edit-fields"><label>시작일<input type="date" id="detail-date" value="${esc(e.date||'')}" aria-label="업무 날짜 지정"></label><label>예상 소요일<input type="number" id="detail-days" min="1" max="30" value="${e.durationDays||1}" aria-label="예상 소요일"></label></div><p class="field-hint">${e.draft?'업무 계획용 초안입니다. ':''}시작일 이후 주말을 건너뜁니다. 공휴일·협조 대기는 별도로 조정하세요.</p><div class="date-edit-actions"><button id="save-event-date" class="button small">일정 저장</button>${e.custom?'':'<button id="reset-event-date" class="text-button">기본안 복원</button>'}</div></section>`}<div class="detail-source">참고 · ${esc(e.source||'직접 추가')}${(e.links||[]).map(([label,url])=>`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`).join('')}</div>${e.custom?'<button id="delete-custom" class="text-button delete-button">이 일정 삭제</button>':''}`;
    $('detail-done').hidden=Boolean(e.isGuide);$('detail-done').textContent=e.done?'완료 취소':'완료로 표시';
    if(!$('detail-dialog').open)showDialog('detail-dialog');
  }
  function renderSettingsFields(year){
    settingsYear=year;const cfg=saved.settings[year]||{};$('agm-date').value=cfg.agm||'';
    for(let i=0;i<4;i++)$('earnings-'+i).value=cfg.earnings?.[i]||'';
    for(const el of [$('agm-date'),...Array.from({length:4},(_,i)=>$('earnings-'+i))]){el.min=`${year}-01-01`;el.max=`${year}-12-31`;}
  }
  function openSettings(){
    const years=new Set([state.year-1,state.year,state.year+1,...Object.keys(saved.settings).map(Number)]);
    $('settings-year').innerHTML=[...years].sort((a,b)=>a-b).map(y=>`<option value="${y}" ${y===state.year?'selected':''}>${y}년</option>`).join('');
    renderSettingsFields(state.year);showDialog('settings-dialog');
  }
  function navigate(offset){
    if(state.view==='year')state.year+=offset;
    else {const date=new Date(state.year,state.month-1+offset,1);state.year=date.getFullYear();state.month=date.getMonth()+1;}
    state.selectedDate=null;render();
  }
  document.addEventListener('click',async event=>{
    const button=event.target.closest('button');if(!button)return;
    if(button.hasAttribute('data-close')){button.closest('dialog').close();return;}
    if(button.dataset.view){closeNavigation();state.view=button.dataset.view;state.selectedDate=null;location.hash=state.view;render();return;}
    if(button.dataset.category){const mobile=$('nav-dialog').open;closeNavigation();state.category=button.dataset.category;state.selectedDate=null;render();if(!mobile)restoreControlFocus('#category-nav [data-category]','category',state.category);return;}
    if(button.hasAttribute('data-settings')){closeNavigation();openSettings();return;}
    if(button.hasAttribute('data-storage')){closeNavigation();updateStorageStatus();showDialog('storage-dialog');return;}
    if(button.dataset.mode){state.mode=button.dataset.mode;render();return;}
    if(button.dataset.sort){state.descending=state.sort===button.dataset.sort?!state.descending:false;state.sort=button.dataset.sort;render();restoreControlFocus('[data-sort]','sort',state.sort);return;}
    if(button.dataset.complete){if(!canEdit())return;const id=button.dataset.complete;saved.done[id]=!saved.done[id];render();await persist();restoreControlFocus('[data-complete]','complete',id);return;}
    if(button.dataset.event){openDetail(button.dataset.event);return;}
    if(button.dataset.guide){openDetail(button.dataset.guide,true);return;}
    if(button.dataset.month){state.month=Number(button.dataset.month);state.view='calendar';location.hash='calendar';render();return;}
    if(button.dataset.date){const date=C.parseDate(button.dataset.date);state.year=date.getFullYear();state.month=date.getMonth()+1;state.selectedDate=button.dataset.date;render();restoreControlFocus('[data-date]','date',state.selectedDate);return;}
    if(button.id==='clear-filter'){state.category='all';state.query='';$('search').value='';render();}
    if(button.id==='clear-date'){state.selectedDate=null;render();}
    if(button.id==='save-event-date'&&selected){
      if(!canEdit())return;
      const date=$('detail-date').value,days=Number($('detail-days').value);if(!C.parseDate(date)||!Number.isInteger(days)||days<1||days>30){toast('시작일과 소요일(1~30일)을 확인해 주세요.');return;}
      if(selected.custom){Object.assign(saved.custom.find(e=>e.id===selected.id),{date,durationDays:days});}else saved.overrides[selected.id]={date,durationDays:days};
      state.year=Number(date.slice(0,4));state.month=Number(date.slice(5,7));state.selectedDate=null;render();openDetail(selected.id);await persist();
    }
    if(button.id==='reset-event-date'&&selected){if(!canEdit())return;delete saved.overrides[selected.id];render();openDetail(selected.id);await persist();}
    if(button.id==='delete-custom'&&selected){if(!canEdit())return;saved.custom=saved.custom.filter(e=>e.id!==selected.id);delete saved.done[selected.id];$('detail-dialog').close();render();await persist();}
  });
  $('prev-btn').addEventListener('click',()=>navigate(-1));$('next-btn').addEventListener('click',()=>navigate(1));
  $('today-btn').addEventListener('click',()=>{state.year=todayDate.getFullYear();state.month=todayDate.getMonth()+1;state.selectedDate=null;render();});
  $('year-select').addEventListener('change',e=>{state.year=Number(e.target.value);state.selectedDate=null;render();});
  $('search').addEventListener('input',e=>{state.query=e.target.value;render();});
  $('settings-btn').addEventListener('click',openSettings);$('agm-prompt').addEventListener('click',openSettings);
  $('nav-toggle').addEventListener('click',()=>showDialog('nav-dialog'));
  $('settings-year').addEventListener('change',e=>renderSettingsFields(Number(e.target.value)));
  $('settings-form').addEventListener('submit',async e=>{
    e.preventDefault();if(!canEdit())return;const cfg={agm:$('agm-date').value,earnings:Array.from({length:4},(_,i)=>$('earnings-'+i).value)};
    saved.settings[settingsYear]=cfg;$('settings-dialog').close();state.year=settingsYear;state.selectedDate=null;render();await persist();
  });
  $('detail-done').addEventListener('click',async()=>{if(!selected||selected.isGuide||!canEdit())return;saved.done[selected.id]=!saved.done[selected.id];render();openDetail(selected.id);await persist();});
  $('add-btn').addEventListener('click',()=>{
    if(!canEdit())return;
    $('add-form').reset();$('new-date').value=state.selectedDate||(monthKey()===today.slice(0,7)?today:monthKey()+'-01');
    $('new-category').innerHTML=DATA.categories.map(c=>`<option value="${c.id}">${c.label}</option>`).join('');
    if(state.category!=='all')$('new-category').value=state.category;
    showDialog('add-dialog');
  });
  $('add-form').addEventListener('submit',async e=>{
    e.preventDefault();if(!canEdit())return;const date=$('new-date').value,title=$('new-title').value.trim();if(!C.parseDate(date)||!title){toast('업무명과 날짜를 확인해 주세요.');return;}
    saved.custom.push({id:'custom-'+crypto.randomUUID(),title,date,durationDays:C.duration($('new-days').value),category:$('new-category').value,summary:$('new-note').value.trim()});$('add-dialog').close();state.year=Number(date.slice(0,4));state.month=Number(date.slice(5,7));state.view='calendar';state.selectedDate=null;location.hash='calendar';render();await persist();
  });
  $('backup-btn').addEventListener('click',()=>{
    const blob=new Blob([JSON.stringify({version:1,exportedAt:today,...saved},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`공시캘린더_내설정_${today}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('내 설정과 완료 상태를 내보냈습니다.');
  });
  $('export-backup').addEventListener('click',()=>$('backup-btn').click());
  $('choose-restore').addEventListener('click',()=>$('restore-file').click());
  $('restore-file').addEventListener('change',async e=>{
    pendingBackup=null;$('restore-preview').hidden=true;const file=e.target.files[0];if(!file)return;
    try{if(file.size>2*1024*1024)throw new Error('2MB 이하 백업 파일을 선택해 주세요.');pendingBackup=window.PlannerStorage.validateBackup(JSON.parse(await file.text()));$('restore-summary').textContent=`개인 일정 ${pendingBackup.custom.length}개 · 날짜 변경 ${Object.keys(pendingBackup.overrides).length}개 · 기준일 ${Object.keys(pendingBackup.settings).length}개 연도 · 완료 상태 ${Object.keys(pendingBackup.done).length}개`;$('restore-preview').hidden=false;}
    catch(error){toast(error instanceof SyntaxError?'JSON 백업 파일을 읽을 수 없습니다.':error.message);}finally{e.target.value='';}
  });
  $('confirm-restore').addEventListener('click',async()=>{if(!pendingBackup||!canEdit())return;saved=window.PlannerStorage.merge(saved,pendingBackup);pendingBackup=null;$('restore-preview').hidden=true;render();await persist();});
  $('login-form').addEventListener('submit',async e=>{
    e.preventDefault();phase='loading';cloudError='';updateStorageStatus();
    try{if(authMode==='signup'){
      if(!mailReady)throw new Error('메일 발송 설정을 준비 중입니다.');
      await cloud.signup($('login-email').value.trim(),$('login-password').value);phase='signedOut';cloudError='가입 신청을 접수했습니다. 인증 메일을 확인한 뒤 로그인하면 관리자에게 이용 승인을 요청합니다.';authMode='login';updateStorageStatus();
    }else await cloud.login($('login-email').value.trim(),$('login-password').value);$('login-password').value='';}
    catch{phase='signedOut';cloudError=authMode==='signup'?'가입 신청을 접수하지 못했습니다. 입력 내용과 이메일 발송 설정을 확인하세요.':'로그인하지 못했습니다. 이메일 인증·비밀번호 또는 네트워크 연결을 확인하세요.';updateStorageStatus();}
  });
  $('auth-mode').addEventListener('click',()=>{authMode=authMode==='login'?'signup':'login';$('login-password').value='';cloudError='';updateStorageStatus();});
  $('request-approval').addEventListener('click',async()=>{if(phase!=='pending'||!mailReady||approvalSending)return;approvalSending=true;cloudError='관리자에게 승인 메일을 요청하고 있습니다.';updateStorageStatus();try{await cloud.requestApproval();cloudError='관리자에게 승인 메일을 보냈습니다.';}catch(err){cloudError=err.message;}finally{approvalSending=false;}updateStorageStatus();});
  $('logout-btn').addEventListener('click',async()=>{if(dirty)return;try{await cloud.logout();}catch{toast('로그아웃하지 못했습니다. 연결을 확인해 주세요.');}});
  $('sync-retry').addEventListener('click',async()=>{if(dirty)await persist();else if(account)await loadAccount(account);else{phase='loading';updateStorageStatus();try{await loadAccount(await cloud.init(loadAccount));}catch{phase='error';cloudError='로그인 연결을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.';updateStorageStatus();}}});
  $('sync-refresh').addEventListener('click',()=>loadAccount(cloud.user));
  $('sync-reload').addEventListener('click',()=>{if(confirm('DB에 저장하지 못한 현재 변경을 버리고 최신 DB 내용을 불러올까요?'))loadAccount(cloud.user);});
  $('legacy-import').addEventListener('click',async()=>{if(!legacy||!canEdit())return;saved=window.PlannerStorage.merge(saved,legacy);render();if(await persist()){legacy=null;updateStorageStatus();}});
  document.addEventListener('keydown',e=>{if(e.key==='/'&&!document.querySelector('dialog[open]')&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)){e.preventDefault();$('search').focus();}});
  window.addEventListener('hashchange',()=>{const view=location.hash.slice(1);if(['calendar','year','guide'].includes(view)){state.view=view;render();}});
  window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
  window.addEventListener('focus',()=>{if(account&&phase==='ready'&&!dirty&&!document.querySelector('dialog[open]'))loadAccount(account);});
  $('today-label').textContent=`오늘 ${today.replaceAll('-','.')} (${['일','월','화','수','목','금','토'][todayDate.getDay()]})`;
  $('mobile-view-nav').innerHTML=[['calendar','calendar','월간 일정'],['year','year','연간 계획'],['guide','book','업무 가이드']].map(([view,glyph,label])=>`<button data-view="${view}" class="nav-item">${icon(glyph)}${label}</button>`).join('');
  document.querySelectorAll('[data-icon]').forEach(el=>{el.innerHTML=icon(el.dataset.icon);});
  document.querySelectorAll('.dialog-top .icon-button[data-close]').forEach(el=>{el.innerHTML=icon('close');});
  for(const [id,title] of [['detail-dialog','업무 상세 안내'],['settings-dialog','기준일 설정'],['add-dialog','일정 추가']])$(id).setAttribute('aria-label',title);
  updateStorageStatus();
  if(['calendar','year','guide'].includes(location.hash.slice(1)))state.view=location.hash.slice(1);
  render();
  cloud.mailReadiness().then(result=>{mailReady=!!result.mailReady;updateStorageStatus();}).catch(()=>{}).finally(()=>{
    cloud.init(loadAccount).then(loadAccount).catch(()=>{phase='error';cloudError='로그인 세션을 확인하지 못했습니다. 다시 시도해 주세요.';updateStorageStatus();});
  });
})();
