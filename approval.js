(() => {
  'use strict';
  // Fragments never go to the hosting server. Remove the token before any network call.
  let token='',generation=0;
  const $=id=>document.getElementById(id),status=$('review-status');let busy=false;
  function receiveToken(){
    token=location.hash.slice(1);history.replaceState(null,'',location.pathname);generation++;busy=false;
    $('review-details').hidden=true;$('review-actions').hidden=true;$('inspect-request').hidden=false;
    const valid=/^[A-Za-z0-9_-]{43}$/.test(token);$('inspect-request').disabled=!valid;
    status.textContent=valid?'링크를 확인할 준비가 되었습니다.':'유효하지 않은 승인 링크입니다. 승인 요청 메일의 링크를 열어 주세요.';
    if(!valid)token='';
  }
  async function send(action){
    if(busy||!token)return;const activeToken=token,activeGeneration=generation;busy=true;document.querySelectorAll('button').forEach(b=>b.disabled=true);
    try{
      const response=await fetch(window.PLANNER_DB.url+'/functions/v1/calendar-access',{method:'POST',headers:{'Content-Type':'application/json',apikey:window.PLANNER_DB.publishableKey},body:JSON.stringify({action,token:activeToken}),credentials:'omit',referrerPolicy:'no-referrer'});
      const result=await response.json();if(activeGeneration!==generation)return;if(!response.ok)throw new Error(result.error||'요청을 확인할 수 없습니다.');
      if(action==='inspect'){$('review-email').textContent=result.email;$('review-date').textContent=new Date(result.issuedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'});$('review-details').hidden=false;$('review-actions').hidden=false;$('inspect-request').hidden=true;status.textContent='아래 계정에 개인 캘린더 이용 권한을 부여할 수 있습니다.';}
      else{token='';$('review-actions').hidden=true;status.textContent=action==='approve'?'승인했습니다. 신청자는 다시 로그인하거나 승인 상태를 확인하면 개인 캘린더를 이용할 수 있습니다.':'이용 요청을 거절했습니다. 이 계정은 개인 데이터에 접근할 수 없습니다.';}
    }catch(error){if(activeGeneration===generation)status.textContent=error.message;}
    finally{if(activeGeneration===generation){busy=false;document.querySelectorAll('button').forEach(b=>b.disabled=!token);}}
  }
  $('inspect-request').addEventListener('click',()=>send('inspect'));
  $('approve-request').addEventListener('click',()=>send('approve'));
  $('reject-request').addEventListener('click',()=>send('reject'));
  window.addEventListener('hashchange',receiveToken);receiveToken();
})();
