/* Backup validation shared by file imports, legacy migration, and DB loads. */
((root)=>{
  const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
  const safeKey=key=>/^[a-zA-Z0-9_-]{1,150}$/.test(key)&&!['__proto__','constructor','prototype'].includes(key);
  function validateBackup(raw){
    if(!object(raw)||raw.version!==1||!object(raw.settings)||!object(raw.overrides)||!object(raw.done)||!Array.isArray(raw.custom))throw new Error('공시 캘린더 백업 파일이 아닙니다.');
    const C=root.CalendarCore,result={settings:{},overrides:{},done:{},custom:[]};
    for(const field of ['settings','overrides','done'])if(Object.keys(raw[field]).length>5000)throw new Error('백업 항목이 너무 많습니다.');
    if(raw.custom.length>2000)throw new Error('추가 일정이 너무 많습니다.');
    for(const [year,cfg] of Object.entries(raw.settings)){
      if(!/^20\d{2}$|^2100$/.test(year)||!object(cfg))throw new Error('기준일 설정을 확인해 주세요.');
      const validDate=value=>!value||(C.parseDate(value)&&value.startsWith(year+'-'));
      if(!validDate(cfg.agm)||!Array.isArray(cfg.earnings)||cfg.earnings.length>4||!cfg.earnings.every(validDate))throw new Error('기준일 형식이 올바르지 않습니다.');
      result.settings[year]={agm:cfg.agm||'',earnings:Array.from({length:4},(_,i)=>cfg.earnings[i]||'')};
    }
    for(const [id,value] of Object.entries(raw.overrides)){
      if(!safeKey(id)||!object(value)||!C.parseDate(value.date))throw new Error('저장된 일정의 날짜가 올바르지 않습니다.');
      if(value.durationDays!==undefined&&(C.duration(value.durationDays)!==Number(value.durationDays)))throw new Error('예상 소요일은 1~30일이어야 합니다.');
      result.overrides[id]={date:value.date,...(value.durationDays!==undefined?{durationDays:C.duration(value.durationDays)}:{})};
    }
    for(const [id,value] of Object.entries(raw.done)){
      if(!safeKey(id)||typeof value!=='boolean')throw new Error('완료 상태가 올바르지 않습니다.');
      result.done[id]=value;
    }
    const ids=new Set(),categories=new Set(['report','earnings','agm','ownership','other']);
    for(const event of raw.custom){
      if(!object(event)||!safeKey(event.id)||!event.id.startsWith('custom-')||ids.has(event.id)||typeof event.title!=='string'||!event.title.trim()||event.title.length>80||!C.parseDate(event.date)||!categories.has(event.category)||typeof event.summary!=='string'||event.summary.length>600)throw new Error('추가 일정의 형식이 올바르지 않습니다.');
      if(event.durationDays!==undefined&&C.duration(event.durationDays)!==Number(event.durationDays))throw new Error('예상 소요일을 확인해 주세요.');
      if(event.dateType!==undefined&&!['planned','deadline','draft'].includes(event.dateType))throw new Error('일정 유형을 확인해 주세요.');
      if(event.includeWeekends!==undefined&&typeof event.includeWeekends!=='boolean')throw new Error('주말 포함 설정을 확인해 주세요.');
      if(event.guide!==undefined&&(typeof event.guide!=='string'||!safeKey(event.guide)))throw new Error('업무 가이드를 확인해 주세요.');
      if(event.replaces!==undefined&&(!Array.isArray(event.replaces)||event.replaces.length>8||event.replaces.some(id=>typeof id!=='string'||!safeKey(id)||!/^(month|agm|date)-\d{4}-/.test(id))))throw new Error('대체할 기본 일정을 확인해 주세요.');
      ids.add(event.id);
      const item={id:event.id,title:event.title,date:event.date,category:event.category,summary:event.summary,durationDays:C.duration(event.durationDays)};
      for(const field of ['dateType','includeWeekends','guide','replaces'])if(event[field]!==undefined)item[field]=event[field];
      result.custom.push(item);
    }
    return result;
  }
  function merge(current,incoming){
    return {settings:{...current.settings,...incoming.settings},overrides:{...current.overrides,...incoming.overrides},done:{...current.done,...incoming.done},custom:[...new Map([...(current.custom||[]),...incoming.custom].map(event=>[event.id,event])).values()]};
  }
  root.PlannerStorage={validateBackup,merge};
})(typeof window==='undefined'?globalThis:window);
