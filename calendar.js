(function (root) {
  'use strict';
  const pad = n => String(n).padStart(2, '0');
  function dateKey(date) { return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`; }
  function parseDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [y,m,d] = value.split('-').map(Number);
    const date = new Date(y,m-1,d,12);
    return y >= 2000 && y <= 2100 && dateKey(date) === value ? date : null;
  }
  function shiftDate(value, offset) {
    const date = parseDate(value);
    if (!date) return null;
    date.setDate(date.getDate()+offset);
    return dateKey(date);
  }
  function todaySeoul() {
    const parts = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const value = type => parts.find(p=>p.type===type).value;
    return `${value('year')}-${value('month')}-${value('day')}`;
  }
  function duration(value) {return Number.isInteger(Number(value))&&Number(value)>=1&&Number(value)<=30?Number(value):1;}
  function nextWeekday(value) {
    const date=parseDate(value);if(!date)return null;
    while([0,6].includes(date.getDay()))date.setDate(date.getDate()+1);
    return dateKey(date);
  }
  function workDates(start,days=1,includeWeekends=false) {
    const date=parseDate(start);if(!date)return [];
    const dates=[dateKey(date)];
    while(dates.length<duration(days)){date.setDate(date.getDate()+1);if(includeWeekends||![0,6].includes(date.getDay()))dates.push(dateKey(date));}
    return dates;
  }
  function eventDates(event){return workDates(event.date,event.durationDays,event.includeWeekends);}
  function occursOn(event,key){return eventDates(event).includes(key);}
  function eventsForMonth(events,month){return events.filter(e=>e.date?eventDates(e).some(date=>date.startsWith(month)):e.month===month);}
  function eventsForYear(data, year, saved={}) {
    const settings=saved.settings||{}, overrides=saved.overrides||{}, done=saved.done||{};
    const years = new Set([year-1,year,year+1]);
    Object.keys(settings).forEach(key=>{ if (/^\d{4}$/.test(key)) years.add(Number(key)); });
    Object.keys(overrides).forEach(key=>{ const match=key.match(/^(?:month|date|agm|earnings)-(\d{4})-/); if(match) years.add(Number(match[1])); });
    const guides = new Map(data.guides.map(g=>[g.id,g]));
    const events=[];
    const custom=(saved.custom||[]).filter(event=>parseDate(event.date));
    const replaced=new Set(custom.flatMap(event=>event.replaces||[]));
    function add(event) {
      if(replaced.has(event.id))return;
      const guide=guides.get(event.guide);
      const originalDate=event.date||null;
      event.durationDays=duration(event.durationDays);
      const originalDurationDays=event.durationDays;
      const override=overrides[event.id];
      if(override && parseDate(override.date)) {
        event.date=override.date; event.month=event.date.slice(0,7); event.label='직접 저장한 일정'; event.confirmed=true;event.draft=false;
      }
      if(override?.durationDays!==undefined)event.durationDays=duration(override.durationDays);
      event.endDate=workDates(event.date,event.durationDays).at(-1)||null;
      events.push({...guide,...event,originalDate,originalDurationDays,done:Boolean(done[event.id])});
    }
    for(const y of years) {
      const cfg=settings[y]||{};
      for(const rule of data.monthRules) for(const month of rule.months) {
        if(rule.unlessAgm && parseDate(cfg.agm)) continue;
        const plan=data.planning?.[rule.guide];
        const date=plan?nextWeekday(`${y}-${pad(month)}-${pad(plan.day)}`):null;
        add({id:`month-${y}-${pad(month)}-${rule.guide}`,guide:rule.guide,date,month:`${y}-${pad(month)}`,durationDays:plan?.days||1,label:plan?'준비 일정 초안':'월 중 진행',draft:Boolean(plan),confirmed:false});
      }
      for(const rule of data.dateRules) add({id:`date-${y}-${rule.month}-${rule.guide}`,guide:rule.guide,date:`${y}-${pad(rule.month)}-${pad(rule.day)}`,month:`${y}-${pad(rule.month)}`,title:rule.title,label:rule.label,confirmed:false});
      if(parseDate(cfg.agm)) for(const rule of data.agmRules) {
        const date=shiftDate(cfg.agm,rule.offset);
        add({id:`agm-${y}-${rule.guide}`,guide:rule.guide,date,month:date.slice(0,7),label:rule.label,confirmed:Boolean(rule.confirmed),anchor:cfg.agm});
      }
      (cfg.earnings||[]).forEach((anchor,index)=>{
        if(!parseDate(anchor))return;
        const quarter=['전년 4분기','1분기','2분기','3분기'][index];
        for(const rule of data.earningsRules) {
          const date=shiftDate(anchor,rule.offset), guide=guides.get(rule.guide);
          add({id:`earnings-${y}-${index}-${rule.guide}`,guide:rule.guide,title:`${quarter} ${guide.title}`,date,month:date.slice(0,7),label:rule.label,confirmed:Boolean(rule.confirmed),anchor});
        }
      });
    }
    for(const event of custom){
      const guide=guides.get(event.guide);
      const label={planned:'예정안',deadline:'계획상 마감',draft:'날짜 초안'}[event.dateType]||'직접 추가';
      events.push({...guide,...event,month:event.date.slice(0,7),originalDate:event.date,durationDays:duration(event.durationDays),
        endDate:eventDates(event).at(-1),confirmed:!event.dateType,draft:event.dateType==='draft',label,
        done:Boolean(done[event.id]),custom:true,steps:guide?.steps||[],supplies:guide?.supplies||[],source:guide?.source||'직접 추가한 일정'});
    }
    return events.sort((a,b)=>(a.date||a.month+'-99').localeCompare(b.date||b.month+'-99')||a.title.localeCompare(b.title,'ko'));
  }
  function matches(event,category,query) {
    return (category==='all'||event.category===category) && (!query||[event.title,event.summary,event.timing,...event.steps||[],...event.supplies||[]].join(' ').toLocaleLowerCase('ko').includes(query.trim().toLocaleLowerCase('ko')));
  }
  root.CalendarCore={pad,dateKey,parseDate,shiftDate,todaySeoul,duration,nextWeekday,workDates,occursOn,eventsForMonth,eventsForYear,matches};
})(typeof window==='undefined'?globalThis:window);
