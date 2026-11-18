(() => {
  'use strict';
  const DATA=window.DISCLOSURE_DATA, C=window.CalendarCore, KEY='disclosure-planner-v1';
  const $=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const category=id=>DATA.categories.find(c=>c.id===id)||DATA.categories[4];
  const badge=id=>{const c=category(id);return `<span class="category-badge" style="--category:${c.color};--soft:${c.soft}"><i></i>${esc(c.label)}</span>`;};
  const today=C.todaySeoul(), todayDate=C.parseDate(today);
  const state={year:todayDate.getFullYear(),month:todayDate.getMonth()+1,view:'calendar',category:'all',query:'',selectedDate:null};
  let saved={settings:{},overrides:{},done:{},custom:[]}, selected=null, settingsYear=state.year, toastTimer;
  try {
    const value=JSON.parse(localStorage.getItem(KEY)||'null');
    if(value&&typeof value==='object') saved={settings:value.settings||{},overrides:value.overrides||{},done:value.done||{},custom:Array.isArray(value.custom)?value.custom:[]};
  } catch { /* 저장소를 사용할 수 없어도 기본 캘린더는 표시합니다. */ }
  function toast(message) { $('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),3500); }
  function persist() {try {localStorage.setItem(KEY,JSON.stringify(saved));return true;}catch{toast('브라우저 저장 공간을 사용할 수 없습니다. 변경은 현재 화면에서만 유지됩니다.');return false;}}
  function monthKey(){return `${state.year}-${C.pad(state.month)}`;}
  function events(){return C.eventsForYear(DATA,state.year,saved);}
  function filtered(list){return list.filter(e=>C.matches(e,state.category,state.query));}
  function formatDate(date){const d=C.parseDate(date);return d?`${d.getMonth()+1}월 ${d.getDate()}일 (${['일','월','화','수','목','금','토'][d.getDay()]})`:'';}
  function tag(e){return e.done?'<span class="state-tag complete">완료</span>':e.confirmed?'<span class="state-tag set">지정</span>':'<span class="state-tag">예정</span>';}
  function eventButton(e,kind='task') {
    const c=category(e.category);
    if(kind==='calendar')return `<button class="calendar-event ${e.done?'is-done':''}" style="--category:${c.color};--soft:${c.soft}" data-event="${esc(e.id)}" title="${esc(e.title)} · ${e.done?'완료':e.confirmed?'지정일':'예정일'}"><span class="event-dot"></span><span>${esc(e.title)}</span><small>${e.done?'✓':e.confirmed?'':'예정'}</small></button>`;
    return `<button class="task-row ${e.done?'is-done':''}" data-event="${esc(e.id)}"><span class="task-indicator" style="--category:${c.color}">${e.done?'✓':''}</span><span class="task-body"><strong>${esc(e.title)}</strong><small>${esc(e.date?formatDate(e.date):e.timing)}</small></span>${tag(e)}<span class="row-arrow">›</span></button>`;
  }
  function renderCategories(){
    $('category-nav').innerHTML=`<button data-category="all" class="${state.category==='all'?'active':''}"><span class="category-dot all-dot"></span>전체 업무</button>`+DATA.categories.map(c=>`<button data-category="${c.id}" class="${state.category===c.id?'active':''}"><span class="category-dot" style="background:${c.color}"></span>${c.label}</button>`).join('');
  }
  function renderSummary(monthEvents){
    const done=monthEvents.filter(e=>e.done).length, dated=monthEvents.filter(e=>e.date).length;
    $('summary-row').innerHTML=`<div class="summary-card"><span class="summary-icon green">▦</span><div><span>이달의 전체 업무</span><strong>${monthEvents.length}<small>건</small></strong></div><span class="summary-card-hint">${state.month}월 기준</span></div><div class="summary-card"><span class="summary-icon blue">◷</span><div><span>날짜가 있는 일정</span><strong>${dated}<small>건</small></strong></div><span class="summary-card-hint">예정일 포함</span></div><div class="summary-card"><span class="summary-icon sand">✓</span><div><span>이달의 완료</span><strong>${done}<small>/ ${monthEvents.length}건</small></strong></div><div class="progress-ring" style="--progress:${monthEvents.length?done/monthEvents.length*100:0}%"><span>${monthEvents.length?Math.round(done/monthEvents.length*100):0}%</span></div></div>`;
  }
  function renderCalendar(monthEvents){
    const matched=filtered(monthEvents), monthly=matched.filter(e=>!e.date), dated=matched.filter(e=>e.date);
    $('month-task-count').textContent=monthly.length;
    $('month-tasks-list').innerHTML=monthly.length?monthly.map(e=>eventButton(e)).join(''):'<p class="empty-small">이 조건에 해당하는 월 중 업무가 없습니다.</p>';
    const start=new Date(state.year,state.month-1,1,12);start.setDate(1-start.getDay());
    const cells=[];
    const cellCount=Math.max(35,Math.ceil((new Date(state.year,state.month-1,1).getDay()+new Date(state.year,state.month,0).getDate())/7)*7);
    for(let i=0;i<cellCount;i++){
      const date=new Date(start);date.setDate(start.getDate()+i);
      const key=C.dateKey(date),inMonth=date.getMonth()+1===state.month, isToday=key===today, selectedDay=key===state.selectedDate;
      const dayEvents=inMonth?dated.filter(e=>e.date===key):[];
      cells.push(`<div class="calendar-cell ${inMonth?'':'outside'} ${isToday?'today':''} ${selectedDay?'selected-day':''}"><button class="day-number ${isToday?'today-number':''}" data-date="${key}" aria-label="${formatDate(key)} 일정 보기" ${isToday?'aria-current="date"':''}>${date.getDate()}</button>${dayEvents.slice(0,3).map(e=>eventButton(e,'calendar')).join('')}${dayEvents.length>3?`<button class="more-events" data-date="${key}">+${dayEvents.length-3}건 더 보기</button>`:''}</div>`);
    }
    $('calendar-grid').innerHTML=cells.join('');
    const [title,description,tags]=DATA.focus[state.month-1];
    $('focus-title').textContent=title;$('focus-description').textContent=description;$('focus-tags').innerHTML=tags.map(t=>`<span>${t}</span>`).join('');
    let agenda=dated;
    if(state.selectedDate)agenda=dated.filter(e=>e.date===state.selectedDate);
    $('agenda-title').textContent=state.selectedDate?`${Number(state.selectedDate.slice(5,7))}월 ${Number(state.selectedDate.slice(8))}일 일정`:'이달의 날짜별 일정';
    $('agenda-count').textContent=agenda.length;
    $('agenda-list').innerHTML=(state.selectedDate?'<button class="text-button" id="clear-date">이달 전체 일정 보기</button>':'')+(agenda.length?agenda.map(e=>`<div class="agenda-group"><span class="agenda-date">${formatDate(e.date)}</span>${eventButton(e)}</div>`).join(''):'<div class="empty-agenda"><span>◷</span><p>등록된 날짜 일정이 없습니다.</p><small>월 중 업무를 눌러 날짜를 지정하거나<br>새 일정을 추가해 보세요.</small></div>');
    const cfg=saved.settings[state.year]||{};
    $('agm-prompt').querySelector('strong').textContent=cfg.agm?'주총 기준일이 설정됐어요':'주총 준비, 기준일부터';
    $('agm-prompt').querySelector('small').textContent=cfg.agm?`${cfg.agm.replaceAll('-','.')} · 기준일 수정하기`:'주총일을 입력하면 준비 일정이 생겨요.';
  }
  function renderYear(all){
    $('year-grid').innerHTML=Array.from({length:12},(_,i)=>{
      const month=i+1,list=filtered(all.filter(e=>e.month===`${state.year}-${C.pad(month)}`));
      const counts=DATA.categories.map(c=>({c,count:list.filter(e=>e.category===c.id).length})).filter(v=>v.count);
      return `<button class="year-card ${month===todayDate.getMonth()+1&&state.year===todayDate.getFullYear()?'current-month':''}" data-month="${month}"><div class="year-card-header"><strong>${month}<span>월</span></strong><span>${list.length}건 <b>↗</b></span></div><h3>${DATA.focus[i][0]}</h3><div class="year-category-list">${counts.map(({c,count})=>`<span><i style="background:${c.color}"></i>${c.label}<b>${count}</b></span>`).join('')||'<p class="muted">검색 결과가 없습니다.</p>'}</div></button>`;
    }).join('');
  }
  function renderGuides(){
    const guides=filtered(DATA.guides);
    $('guide-grid').innerHTML=guides.map(g=>`<button class="guide-card" data-guide="${g.id}">${badge(g.category)}<h3>${esc(g.title)}<span>↗</span></h3><p>${esc(g.summary)}</p><small>◷ ${esc(g.timing)}</small></button>`).join('')||'<div class="empty-small">일치하는 업무가 없습니다. 검색어나 업무 구분을 바꿔 보세요.</div>';
  }
  function render(){
    const all=events(),monthEvents=all.filter(e=>e.month===monthKey());
    renderCategories();renderSummary(monthEvents);
    $('month-title').textContent=state.view==='calendar'?`${state.year}년 ${state.month}월`:`${state.year}년`;
    const years=new Set(Array.from({length:7},(_,i)=>todayDate.getFullYear()-2+i));years.add(state.year);
    $('year-select').innerHTML=[...years].sort((a,b)=>a-b).map(y=>`<option value="${y}" ${y===state.year?'selected':''}>${y}년</option>`).join('');
    const viewNames={calendar:'월간 캘린더',year:'연간 한눈에',guide:'업무 가이드'};
    $('breadcrumb-title').textContent=viewNames[state.view];
    $('page-title').textContent={calendar:'공시 일정, 한눈에.',year:'한 해의 흐름을 살펴보세요.',guide:'업무의 다음 순서를 확인하세요.'}[state.view];
    $('page-description').textContent={calendar:'이번 달 해야 할 일을 확인하고, 다음 공시를 준비하세요.',year:'정기보고부터 주총까지, 반복되는 업무를 월별로 정리했어요.',guide:'인수인계 자료에서 필요한 내용만 간단하게 정리했어요.'}[state.view];
    document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===state.view);b.setAttribute('aria-pressed',String(b.dataset.view===state.view));});
    for(const view of ['calendar','year','guide'])$(view+'-view').hidden=state.view!==view;
    $('summary-row').hidden=state.view==='guide';
    $('prev-btn').hidden=$('next-btn').hidden=$('today-btn').hidden=state.view==='guide';
    const isFiltering=state.category!=='all'||state.query.trim();$('filter-note').hidden=!isFiltering;
    if(isFiltering)$('filter-note').innerHTML=`<span>${state.category!=='all'?esc(category(state.category).label)+' · ':''}${state.query?`“${esc(state.query)}” 검색 중`:'업무 필터 적용 중'}</span><button class="text-button" id="clear-filter">필터 초기화 ×</button>`;
    renderCalendar(monthEvents);renderYear(all);renderGuides();
  }
  function showDialog(id){$(id).showModal();}
  function openDetail(id,isGuide=false){
    selected=isGuide?{...DATA.guides.find(g=>g.id===id),isGuide:true}:events().find(e=>e.id===id);
    if(!selected)return;
    const e=selected;$('detail-category').innerHTML=badge(e.category);
    $('detail-content').innerHTML=`<h2>${esc(e.title)}</h2><div class="detail-time">◷ ${esc(e.isGuide?e.timing:e.date?formatDate(e.date)+' · '+e.label:e.timing+' · 날짜 미정')}${e.isGuide?'':tag(e)}</div><p class="detail-summary">${esc(e.summary||'직접 등록한 일정입니다.')}</p>${e.steps?.length?`<section class="detail-section"><h3>해야 할 일</h3><ol class="step-list">${e.steps.map(s=>`<li>${esc(s)}</li>`).join('')}</ol></section>`:''}${e.supplies?.length?`<section class="detail-section"><h3>미리 준비할 것</h3><div class="supply-tags">${e.supplies.map(s=>`<span>${esc(s)}</span>`).join('')}</div></section>`:''}${e.partners?`<p class="detail-partners"><strong>함께 확인</strong>${esc(e.partners)}</p>`:''}${e.note?`<div class="detail-note"><strong>확인 메모</strong><p>${esc(e.note)}</p></div>`:''}${e.isGuide?'':`<section class="date-edit"><label for="detail-date">업무 날짜 지정</label><div><input type="date" id="detail-date" value="${esc(e.date||'')}" aria-label="업무 날짜 지정"><button id="save-event-date" class="button small">적용</button>${e.custom?'':'<button id="reset-event-date" class="text-button">기본값</button>'}</div></section>`}<div class="detail-source">참고 · ${esc(e.source||'직접 추가')}${(e.links||[]).map(([label,url])=>`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`).join('')}</div>${e.custom?'<button id="delete-custom" class="text-button delete-button">이 일정 삭제</button>':''}`;
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
  document.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button)return;
    if(button.hasAttribute('data-close')){button.closest('dialog').close();return;}
    if(button.dataset.view){state.view=button.dataset.view;state.selectedDate=null;location.hash=state.view;render();return;}
    if(button.dataset.category){state.category=button.dataset.category;state.selectedDate=null;render();return;}
    if(button.dataset.event){openDetail(button.dataset.event);return;}
    if(button.dataset.guide){openDetail(button.dataset.guide,true);return;}
    if(button.dataset.month){state.month=Number(button.dataset.month);state.view='calendar';location.hash='calendar';render();return;}
    if(button.dataset.date){const date=C.parseDate(button.dataset.date);state.year=date.getFullYear();state.month=date.getMonth()+1;state.selectedDate=button.dataset.date;render();return;}
    if(button.id==='clear-filter'){state.category='all';state.query='';$('search').value='';render();}
    if(button.id==='clear-date'){state.selectedDate=null;render();}
    if(button.id==='save-event-date'&&selected){
      const date=$('detail-date').value;if(!C.parseDate(date)){toast('올바른 날짜를 입력해 주세요.');return;}
      if(selected.custom){saved.custom.find(e=>e.id===selected.id).date=date;}else saved.overrides[selected.id]={date};
      persist();state.year=Number(date.slice(0,4));state.month=Number(date.slice(5,7));state.selectedDate=null;render();openDetail(selected.id);toast('날짜를 적용했습니다.');
    }
    if(button.id==='reset-event-date'&&selected){delete saved.overrides[selected.id];persist();render();openDetail(selected.id);toast('원래 일정으로 되돌렸습니다.');}
    if(button.id==='delete-custom'&&selected){saved.custom=saved.custom.filter(e=>e.id!==selected.id);delete saved.done[selected.id];persist();$('detail-dialog').close();render();toast('일정을 삭제했습니다.');}
  });
  $('prev-btn').addEventListener('click',()=>navigate(-1));$('next-btn').addEventListener('click',()=>navigate(1));
  $('today-btn').addEventListener('click',()=>{state.year=todayDate.getFullYear();state.month=todayDate.getMonth()+1;state.selectedDate=null;render();});
  $('year-select').addEventListener('change',e=>{state.year=Number(e.target.value);state.selectedDate=null;render();});
  $('search').addEventListener('input',e=>{state.query=e.target.value;render();});
  $('settings-btn').addEventListener('click',openSettings);$('agm-prompt').addEventListener('click',openSettings);
  $('settings-year').addEventListener('change',e=>renderSettingsFields(Number(e.target.value)));
  $('settings-form').addEventListener('submit',e=>{
    e.preventDefault();const cfg={agm:$('agm-date').value,earnings:Array.from({length:4},(_,i)=>$('earnings-'+i).value)};
    saved.settings[settingsYear]=cfg;persist();$('settings-dialog').close();state.year=settingsYear;state.selectedDate=null;render();toast('기준일과 준비 일정을 저장했습니다.');
  });
  $('detail-done').addEventListener('click',()=>{if(!selected||selected.isGuide)return;saved.done[selected.id]=!saved.done[selected.id];persist();render();openDetail(selected.id);toast(saved.done[selected.id]?'완료로 표시했습니다.':'완료 표시를 취소했습니다.');});
  $('add-btn').addEventListener('click',()=>{
    $('add-form').reset();$('new-date').value=state.selectedDate||(monthKey()===today.slice(0,7)?today:monthKey()+'-01');
    $('new-category').innerHTML=DATA.categories.map(c=>`<option value="${c.id}">${c.label}</option>`).join('');
    if(state.category!=='all')$('new-category').value=state.category;
    showDialog('add-dialog');
  });
  $('add-form').addEventListener('submit',e=>{
    e.preventDefault();const date=$('new-date').value,title=$('new-title').value.trim();if(!C.parseDate(date)||!title){toast('업무명과 날짜를 확인해 주세요.');return;}
    saved.custom.push({id:'custom-'+crypto.randomUUID(),title,date,category:$('new-category').value,summary:$('new-note').value.trim()});persist();$('add-dialog').close();state.year=Number(date.slice(0,4));state.month=Number(date.slice(5,7));state.view='calendar';state.selectedDate=null;location.hash='calendar';render();toast('새 일정을 저장했습니다.');
  });
  $('backup-btn').addEventListener('click',()=>{
    const blob=new Blob([JSON.stringify({version:1,exportedAt:today,...saved},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`공시캘린더_내설정_${today}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('내 설정과 완료 상태를 내보냈습니다.');
  });
  document.addEventListener('keydown',e=>{if(e.key==='/'&&!document.querySelector('dialog[open]')&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)){e.preventDefault();$('search').focus();}});
  window.addEventListener('hashchange',()=>{const view=location.hash.slice(1);if(['calendar','year','guide'].includes(view)){state.view=view;render();}});
  window.addEventListener('storage',e=>{if(e.key===KEY){try{const next=JSON.parse(e.newValue);if(next){saved=next;render();}}catch{}}});
  $('today-label').textContent=`오늘 ${today.replaceAll('-','.')} (${['일','월','화','수','목','금','토'][todayDate.getDay()]})`;
  if(['calendar','year','guide'].includes(location.hash.slice(1)))state.view=location.hash.slice(1);
  render();
})();
