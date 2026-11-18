/* Per-item optimistic concurrency: an old tab cannot replace a whole calendar. */
((root)=>{
  const empty=()=>({settings:{},overrides:{},done:{},custom:[]});
  const encode=(kind,key)=>kind+':'+key;
  function items(state){
    const result=new Map();
    for(const kind of ['settings','overrides','done'])for(const [key,value] of Object.entries(state[kind]))result.set(encode(kind,key),{kind,key,value});
    for(const event of state.custom)result.set(encode('custom',event.id),{kind:'custom',key:event.id,value:event});
    return result;
  }
  function diff(before,after,versions){
    const old=items(before),next=items(after),changes=[];
    for(const key of new Set([...old.keys(),...next.keys()])){
      const a=old.get(key),b=next.get(key);
      if(JSON.stringify(a?.value)!==JSON.stringify(b?.value))changes.push({...b||a,value:b?.value??null,version:versions.get(key)||0});
    }
    return changes;
  }
  function decode(rows){
    const state=empty(),versions=new Map();
    for(const row of rows){
      versions.set(encode(row.kind,row.item_key),Number(row.version));
      if(row.value===null)continue;
      if(row.kind==='custom')state.custom.push(row.value);
      else if(['settings','overrides','done'].includes(row.kind))state[row.kind][row.item_key]=row.value;
    }
    return {state:root.PlannerStorage.validateBackup({version:1,...state}),versions};
  }
  root.PlannerSyncCore={empty,encode,items,diff,decode};
})(typeof window==='undefined'?globalThis:window);
