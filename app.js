const rules = [
  ['1｜友善交流，禁止攻擊與挑釁','不同意見可以討論，但禁止人身攻擊、謾罵、挑釁、歧視、惡意影射、霸凌或刻意引戰。'],
  ['2｜廣告／商業貼文：24 小時內限 1 篇','每個帳號 24 小時內限 1 篇廣告／商業貼文。不同商品、服務或活動仍合併計算；請勿刪文重發、換圖或換文案規避限制。'],
  ['3｜太平在地店家與外區商業貼文','太平區內實體店家可分享商品、服務及優惠；外區店家、網路賣家或駐點賣家須與太平居民具實際相關性，管理團隊保留審核與刪文權。'],
  ['4｜買賣與服務資訊公開透明','商業貼文應提供基本商品／服務內容、價格或收費方式、交易方式及必要資訊；禁止刻意隱瞞重要資訊或以模糊內容誘導私訊。'],
  ['5｜⚠️ 房仲／不動產業者加重管理','房仲、不動產仲介、代銷等業者第一次違規禁言 30 天；第二次違規直接移除並封鎖。屋主本人自售／自租不適用此加重處分，但仍須遵守其他版規。'],
  ['6｜一般違規處理','一般違規視情況禁言 7～30 天；重複違規、惡意洗版、嚴重人身攻擊、惡意規避規則或重大違規，得加重處理、移除或封鎖。'],
  ['7｜禁止違法、受管制及高風險商品交易','禁止違法、來源不明或依法禁止／限制網路交易之商品與服務，包括菸品、酒類、藥品、受限制醫療器材、違禁品、仿冒／盜版及非法金融等。'],
  ['8｜⚠️ 詐騙、假帳號與可疑交易','寧可先阻止可疑交易，也不要等社員受騙後才處理。假投資、假徵才、不明貸款、釣魚連結、冒用身分、可疑匯款等內容可先行攔截；確認詐騙得直接移除並封鎖。'],
  ['9｜爆料、消費糾紛與公審貼文','可以分享經驗，但不要把社團當成動員公審的平台。請以自身實際經歷與可查證事實為主；禁止造謠、肉搜、人身攻擊或號召洗負評／騷擾。'],
  ['10｜個資、失物／寵物協尋與交通事件','為了說明事件，可以提供必要資訊；與事件無關的個資，請先遮蔽。協尋、車禍、監視器與車牌等資訊應以釐清事件為目的，不得用於肉搜、公審或報復。']
];

document.querySelectorAll('[data-open]').forEach(btn=>btn.addEventListener('click',()=>openPanel(btn.dataset.open)));
document.querySelectorAll('[data-close]').forEach(btn=>btn.addEventListener('click',()=>btn.closest('.panel').classList.remove('active')));
function openPanel(id){document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));const p=document.getElementById(id);p.classList.add('active');p.scrollIntoView({behavior:'smooth',block:'start'});}

document.getElementById('rulesList').innerHTML=rules.map(([t,d])=>`<article class="rule"><h3>${t}</h3><p>${d}</p></article>`).join('');

const mode = document.getElementById('modeBanner');
if(!TPDB.configured){mode.hidden=false;mode.innerHTML='🧪 <strong>展示模式：</strong>尚未連接 Supabase，檢舉與申訴只會儲存在目前瀏覽器。完成 config.js 設定後會自動切換正式資料庫。';}

document.getElementById('checkerForm').addEventListener('submit',e=>{
  e.preventDefault(); const f=new FormData(e.currentTarget); const type=f.get('type');
  const out=document.getElementById('checkerResult'); let cls='ok', title='✅ 初步看起來可以發布', lines=[];
  if((type==='ad'||type==='realestate'||type==='owner') && f.get('ad24')){cls='danger';title='⛔ 建議先不要發布';lines.push('你勾選了「24 小時內已發過廣告」，可能違反一天一篇規定。');}
  if(type==='realestate'){cls=cls==='danger'?'danger':'warn';lines.push('房仲／不動產業者適用加重管理：第一次違規 30 天、第二次移除並封鎖。');}
  if(type==='owner'){lines.push('屋主本人自售／自租不適用房仲加重處分，但仍須遵守廣告一天一篇與其他版規。');}
  if(f.get('personal')){cls=cls==='danger'?'danger':'warn';lines.push('文章含個資，請先遮蔽與事件無關的電話、住址、證件與私人對話。');}
  if(f.get('accuse')){cls=cls==='danger'?'danger':'warn';lines.push('重大指控字眼可能造成爭議；請改以可查證事實與自身經歷陳述。');}
  if(f.get('suspicious')){cls='danger';title='⚠️ 高風險內容，建議不要直接發布';lines.push('投資、貸款、先匯款、QR Code、不明連結、帳戶或驗證碼等屬高風險內容，可能遭系統攔截。');}
  if(!lines.length)lines.push('仍請確認內容沒有違法商品、詐騙、高風險交易或其他違規事項。');
  out.className='result '+cls; out.hidden=false; out.innerHTML=`<strong>${title}</strong><br>${lines.join('<br>')}`;
});

function formObject(form){
 const o={};
 for(const [k,v] of new FormData(form).entries()){
   if(k==='website') continue;
   o[k]=typeof v==='string'?v.trim():v;
 }
 return o;
}
function escapeHTML(value){return String(value??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
function caseCode(prefix,row){return row?.case_code || `${prefix}-${String(row?.id||Date.now()).replace(/-/g,'').slice(0,8).toUpperCase()}`;}
async function submitForm({formId,resultId,save,prefix,label}){
 const form=document.getElementById(formId), out=document.getElementById(resultId);
 const startedAt=Date.now();
 form.addEventListener('submit',async e=>{
   e.preventDefault();
   const btn=form.querySelector('button[type="submit"]');
   if(btn.disabled)return;
   const honeypot=form.querySelector('[name="website"]')?.value||'';
   if(Date.now()-startedAt<1200){
     out.hidden=false;out.className='result danger';out.textContent='請稍候片刻再送出，謝謝。';return;
   }
   const cooldownKey=`tp_submit_cooldown_${formId}`;
   const last=Number(sessionStorage.getItem(cooldownKey)||0);
   if(Date.now()-last<10000){
     out.hidden=false;out.className='result danger';out.textContent='送出太頻繁，請稍後再試。';return;
   }
   btn.disabled=true;btn.textContent='送出中…';
   try{
     const row=await save(formObject(form),honeypot);
     const code=caseCode(prefix,row);
     sessionStorage.setItem(cooldownKey,String(Date.now()));
     out.hidden=false;out.className='result ok';
     out.innerHTML=`✅ <strong>${label}已送出</strong><br>案件編號：<strong>${escapeHTML(code)}</strong><br><span class="tiny">請保留此編號。這個版本尚未提供線上查詢案件進度的功能。</span>`;
     form.reset();
   }catch(err){
     out.hidden=false;out.className='result danger';
     out.textContent=`⛔ 送出失敗：${String(err?.message||err||'未知錯誤')}`;
   }finally{
     btn.disabled=false;btn.textContent=label==='檢舉'?'送出檢舉':'送出申訴';
   }
 });
}
submitForm({formId:'reportForm',resultId:'reportResult',save:(p,h)=>TPDB.addReport(p,h),prefix:'RPT',label:'檢舉'});
submitForm({formId:'appealForm',resultId:'appealResult',save:(p,h)=>TPDB.addAppeal(p,h),prefix:'APL',label:'申訴'});
