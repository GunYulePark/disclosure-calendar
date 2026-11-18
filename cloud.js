/* Business data lives in Postgres. Only the SDK login session persists locally. */
(() => {
  const core=window.PlannerSyncCore;
  const client=window.PlannerSupabase.createClient(window.PLANNER_DB.url,window.PLANNER_DB.publishableKey,{
    auth:{storageKey:'disclosure-calendar-auth',persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}
  });
  let user=null,baseline=core.empty(),versions=new Map();
  async function load(){
    const rows=[],owner=user?.id;if(!owner)throw new Error('로그인이 필요합니다.');
    for(let start=0;;start+=1000){
      const {data,error}=await client.from('disclosure_calendar_entries').select('kind,item_key,value,version').eq('user_id',owner).order('kind').order('item_key').range(start,start+999);
      if(error)throw error;
      rows.push(...data);if(data.length<1000)break;
    }
    if(user?.id!==owner)throw new Error('로그인 계정이 변경되었습니다.');
    const decoded=core.decode(rows);baseline=decoded.state;versions=decoded.versions;
    return structuredClone(baseline);
  }
  async function save(next){
    if(!user)throw new Error('로그인이 필요합니다.');
    const owner=user.id;
    const changes=core.diff(baseline,next,versions);
    if(changes.length){
      const {data,error}=await client.rpc('disclosure_calendar_apply',{changes});
      if(error)throw error;
      if(user?.id!==owner)throw new Error('로그인 계정이 변경되었습니다.');
      for(const row of data)versions.set(core.encode(row.kind,row.item_key),Number(row.version));
      baseline=structuredClone(next);
    }
    return structuredClone(baseline);
  }
  window.PlannerCloud={load,save,client,get user(){return user;},
    async init(onAuth){
      const {data,error}=await client.auth.getSession();if(error)throw error;
      user=data.session?.user||null;
      client.auth.onAuthStateChange((event,session)=>{
        const next=session?.user||null;
        if(next?.id!==user?.id){user=next;setTimeout(()=>onAuth(user),0);}
      });
      return user;
    },
    async login(email,password){const {error}=await client.auth.signInWithPassword({email,password});if(error)throw error;},
    async logout(){const {error}=await client.auth.signOut({scope:'local'});if(error)throw error;}
  };
})();
