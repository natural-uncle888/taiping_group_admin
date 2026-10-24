const panel = document.getElementById('adminPanel');
const dashboard = document.getElementById('dashboard');
const loginBox = document.getElementById('loginBox');
const loginMsg = document.getElementById('loginMsg');
const demoEnter = document.getElementById('demoEnter');
const adminMode = document.getElementById('adminMode');
let currentTab = 'reports';

const esc = (s = '') => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const when = s => {
  if (!s) return '—';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('zh-TW');
};
const statusText = {pending:'待處理', reviewing:'處理中', resolved:'已完成', dismissed:'不處理'};
const statusBadge = s => {
  const status = s || 'pending';
  return `<span class="status ${esc(status)}">${esc(statusText[status] || status || '待處理')}</span>`;
};
const val = (fd, k) => String(fd.get(k) || '').trim();

function safeHttpUrl(raw) {
  try {
    const u = new URL(String(raw || '').trim());
    return ['http:', 'https:'].includes(u.protocol) ? u.href : '';
  } catch (_) { return ''; }
}

// 以 Facebook 個人檔案連結作優先識別；沒有連結時才以正規化名稱作備援。
function realtorIdentityKey(row) {
  const raw = String(row.facebook_url || '').trim();
  if (raw) {
    try {
      const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
      let host = u.hostname.toLowerCase().replace(/^(www|m)\./, '');
      if (host === 'fb.com') host = 'facebook.com';
      if (host === 'facebook.com' || host.endsWith('.facebook.com')) {
        const path = u.pathname.replace(/\/+$/, '').toLowerCase();
        if (path.endsWith('/profile.php') || path === '/profile.php') {
          const id = u.searchParams.get('id');
          if (id) return `url:facebook.com/profile.php?id=${id}`;
        }
        if (path && path !== '/') return `url:facebook.com${path}`;
      }
    } catch (_) { /* fallback to display name */ }
  }
  const name = String(row.target_name || '').normalize('NFKC').trim().toLowerCase().replace(/\s+/g, '');
  return `name:${name}`;
}

if (!TPDB.configured) {
  adminMode.hidden = false;
  adminMode.innerHTML = '🧪 <strong>展示模式：</strong>尚未連接 Supabase。資料只存在這台瀏覽器；正式上線前請完成 README 的 Supabase 設定。';
  demoEnter.hidden = false;
  document.getElementById('loginForm').hidden = true;
}
demoEnter.onclick = () => enterAdmin('展示管理員');

document.getElementById('loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  loginMsg.hidden = true;
  const f = new FormData(e.currentTarget);
  try {
    const {data, error} = await TPDB.client.auth.signInWithPassword({email: val(f, 'email'), password: val(f, 'password')});
    if (error) throw error;
    const ok = await isAdmin(data.user.id);
    if (!ok) {
      await TPDB.client.auth.signOut();
      throw new Error('此帳號沒有管理員權限');
    }
    enterAdmin(data.user.email || '管理員');
  } catch (err) {
    loginMsg.hidden = false;
    loginMsg.className = 'result danger';
    loginMsg.textContent = '登入失敗：' + (err.message || err);
  }
});

async function isAdmin(userId) {
  const {data, error} = await TPDB.client.from('admin_users').select('user_id').eq('user_id', userId).maybeSingle();
  return !error && !!data;
}

async function restore() {
  if (!TPDB.configured) return;
  try {
    const {data, error} = await TPDB.client.auth.getSession();
    if (error) throw error;
    const user = data?.session?.user;
    if (!user) return;
    if (await isAdmin(user.id)) enterAdmin(user.email || '管理員');
    else await TPDB.client.auth.signOut();
  } catch (err) {
    loginMsg.hidden = false;
    loginMsg.className = 'result danger';
    loginMsg.textContent = '確認登入狀態失敗：' + (err.message || err);
  }
}

function enterAdmin(identity) {
  loginBox.hidden = true;
  dashboard.hidden = false;
  document.getElementById('adminIdentity').textContent = identity;
  document.getElementById('dataMode').textContent = TPDB.configured ? '｜Supabase 雲端資料庫' : '｜本機展示資料';
  bindTabs();
  render(currentTab);
  refreshStats();
}

document.getElementById('logoutBtn').onclick = async () => {
  if (TPDB.configured) await TPDB.client.auth.signOut();
  location.reload();
};
function bindTabs() {
  document.querySelectorAll('[data-tab]').forEach(b => {
    b.onclick = () => { currentTab = b.dataset.tab; render(currentTab); };
  });
}

async function refreshStats() {
  try {
    const [r, a, v, re] = await Promise.all([TPDB.reports(), TPDB.appeals(), TPDB.violations(), TPDB.realtorViolations()]);
    const pending = r.filter(x => (x.status || 'pending') === 'pending').length + a.filter(x => (x.status || 'pending') === 'pending').length;
    const realtorCounts = new Map();
    re.forEach(x => {
      const key = realtorIdentityKey(x);
      realtorCounts.set(key, (realtorCounts.get(key) || 0) + 1);
    });
    const repeat = [...realtorCounts.values()].filter(n => n >= 2).length;
    document.getElementById('stats').innerHTML = `<div class="stat"><b>${pending}</b><span>待處理案件</span></div><div class="stat"><b>${v.length}</b><span>一般違規紀錄</span></div><div class="stat"><b>${re.length}</b><span>房仲違規紀錄</span></div><div class="stat danger-stat"><b>${repeat}</b><span>房仲第二次以上</span></div>`;
  } catch (_) {
    document.getElementById('stats').innerHTML = '<p class="muted">統計讀取失敗，請確認資料庫設定與管理員權限。</p>';
  }
}

async function render(type) {
  panel.innerHTML = '<p class="muted">讀取中…</p>';
  try {
    if (type === 'violations') return await violations();
    if (type === 'realtors') return await realtors();
    if (type === 'reports') return await cases('reports');
    if (type === 'appeals') return await cases('appeals');
    if (type === 'templates') return templates();
  } catch (e) {
    panel.innerHTML = `<div class="result danger">讀取失敗：${esc(e.message || e)}</div>`;
  }
}

async function violations() {
  const rows = await TPDB.violations();
  panel.innerHTML = `<div class="panel-head"><h2>🧾 一般違規紀錄</h2></div><div class="toolbar"><input id="searchV" placeholder="搜尋社員名稱、違規類型…"></div><form id="vform" class="form-stack two-col"><label>社員名稱<input name="target_name" maxlength="120" required></label><label>Facebook 連結<input name="facebook_url" type="url" placeholder="https://www.facebook.com/…（選填）"></label><label>違規類型<select name="violation_type"><option>廣告洗版</option><option>人身攻擊／公審</option><option>個資／肉搜</option><option>疑似詐騙</option><option>違法／受管制商品</option><option>其他</option></select></label><label>處分<select name="action"><option>提醒</option><option>禁言 7 天</option><option>禁言 14 天</option><option>禁言 30 天</option><option>移除並封鎖</option></select></label><label class="full">備註<textarea name="note" rows="3" maxlength="3000"></textarea></label><button class="primary full" type="submit">新增紀錄</button><div id="vMsg" class="result" hidden></div></form><div id="vlist" class="record-list"></div>`;
  const draw = (q = '') => {
    const f = rows.filter(x => `${x.target_name} ${x.violation_type} ${x.action} ${x.note || ''}`.toLowerCase().includes(q.toLowerCase()));
    document.getElementById('vlist').innerHTML = f.length ? f.map(x => `<article class="record"><div><h3>${esc(x.target_name)} <span class="badge">${esc(x.action)}</span></h3><p>${esc(x.violation_type)}${x.note ? '｜' + esc(x.note) : ''}<br><small>${when(x.created_at)}</small></p></div><button class="danger-btn" data-del-v="${esc(x.id)}">刪除</button></article>`).join('') : '<p class="muted">尚無紀錄</p>';
    document.querySelectorAll('[data-del-v]').forEach(b => b.onclick = async () => {
      if (!confirm('確定刪除這筆紀錄？')) return;
      try { await TPDB.deleteViolation(b.dataset.delV); await render('violations'); refreshStats(); }
      catch (err) { alert('刪除失敗：' + (err.message || err)); }
    });
  };
  draw();
  document.getElementById('searchV').oninput = e => draw(e.target.value);
  document.getElementById('vform').onsubmit = async e => {
    e.preventDefault();
    const form = e.currentTarget, f = new FormData(form), msg = document.getElementById('vMsg'), btn = form.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = '儲存中…';
    try {
      await TPDB.addViolation({target_name:val(f,'target_name'),facebook_url:val(f,'facebook_url')||null,violation_type:val(f,'violation_type'),action:val(f,'action'),note:val(f,'note')||null});
      await render('violations'); refreshStats();
    } catch (err) {
      msg.hidden = false; msg.className = 'result danger'; msg.textContent = '新增失敗：' + (err.message || err);
      btn.disabled = false; btn.textContent = '新增紀錄';
    }
  };
}

async function realtors() {
  const rows = await TPDB.realtorViolations();
  const counts = new Map();
  rows.forEach(x => {
    const key = realtorIdentityKey(x);
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  panel.innerHTML = `<div class="panel-head"><h2>🏠 房仲／不動產業者違規</h2></div><p class="tiny">請優先填寫 Facebook 個人檔案連結。系統會先依連結累計；未填連結時才依名稱比對。請在採取處分前再次確認是否為同一帳號。</p><form id="rform" class="form-stack two-col"><label>房仲／帳號名稱<input name="target_name" maxlength="120" required></label><label>Facebook 個人檔案連結<input name="facebook_url" type="url" placeholder="https://www.facebook.com/…（強烈建議填寫）"></label><label class="full">違規說明<textarea name="detail" rows="3" maxlength="5000" required></textarea></label><button class="primary full" type="submit">登記一次違規</button><div id="rMsg" class="result" hidden></div></form><div class="record-list">${rows.length ? rows.map(x => {
    const n = counts.get(realtorIdentityKey(x)) || 1;
    const profile = safeHttpUrl(x.facebook_url);
    const profileLink = profile ? `<br><a href="${esc(profile)}" target="_blank" rel="noopener noreferrer">開啟 Facebook 個人檔案 ↗</a>` : '<br><small>未填個人檔案連結（目前以名稱比對）</small>';
    return `<article class="record ${n >= 2 ? 'critical' : ''}"><div><h3>${esc(x.target_name)} <span class="badge">累計 ${n} 次</span></h3><p><strong>${n >= 2 ? '⛔ 第二次以上：依版規移除並封鎖' : '⚠️ 第一次：依版規禁言 30 天'}</strong><br>${esc(x.detail)}${profileLink}<br><small>${when(x.created_at)}</small></p></div><button class="danger-btn" data-del-r="${esc(x.id)}">刪除</button></article>`;
  }).join('') : '<p class="muted">尚無紀錄</p>'}</div>`;

  document.getElementById('rform').onsubmit = async e => {
    e.preventDefault();
    const form = e.currentTarget, f = new FormData(form), msg = document.getElementById('rMsg'), btn = form.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = '儲存中…';
    try {
      await TPDB.addRealtorViolation({target_name:val(f,'target_name'),facebook_url:val(f,'facebook_url')||null,detail:val(f,'detail')});
      await render('realtors'); refreshStats();
    } catch (err) {
      msg.hidden = false; msg.className = 'result danger'; msg.textContent = '新增失敗：' + (err.message || err);
      btn.disabled = false; btn.textContent = '登記一次違規';
    }
  };
  document.querySelectorAll('[data-del-r]').forEach(b => b.onclick = async () => {
    if (!confirm('確定刪除這筆房仲紀錄？')) return;
    try { await TPDB.deleteRealtorViolation(b.dataset.delR); await render('realtors'); refreshStats(); }
    catch (err) { alert('刪除失敗：' + (err.message || err)); }
  });
}

async function cases(kind) {
  const isReport = kind === 'reports';
  const rows = isReport ? await TPDB.reports() : await TPDB.appeals();
  const title = isReport ? '⚠️ 社員檢舉' : '🙋 誤判申訴';
  panel.innerHTML = `<div class="panel-head"><h2>${title}</h2></div><div class="toolbar"><input id="caseSearch" placeholder="搜尋案件編號、姓名、內容…"><select id="caseStatus"><option value="">全部狀態</option><option value="pending">待處理</option><option value="reviewing">處理中</option><option value="resolved">已完成</option><option value="dismissed">不處理</option></select></div><div id="caseList" class="record-list"></div>`;
  const draw = () => {
    const q = document.getElementById('caseSearch').value.toLowerCase(), st = document.getElementById('caseStatus').value;
    const f = rows.filter(x => (!st || (x.status || 'pending') === st) && JSON.stringify(x).toLowerCase().includes(q));
    document.getElementById('caseList').innerHTML = f.length ? f.map(x => caseCard(x, isReport)).join('') : '<p class="muted">目前沒有資料</p>';
    document.querySelectorAll('[data-status]').forEach(s => s.onchange = async () => {
      const id = s.dataset.status.split(':')[1], newStatus = s.value;
      s.disabled = true;
      try {
        const updated = isReport ? await TPDB.updateReport(id, {status:newStatus}) : await TPDB.updateAppeal(id, {status:newStatus});
        const idx = rows.findIndex(x => x.id === id);
        if (idx >= 0) rows[idx] = {...rows[idx], ...(updated || {}), status:newStatus};
        draw(); refreshStats();
      } catch (err) {
        alert('更新狀態失敗：' + (err.message || err));
        s.disabled = false;
      }
    });
  };
  document.getElementById('caseSearch').oninput = draw;
  document.getElementById('caseStatus').onchange = draw;
  draw();
}

function caseCard(x, isReport) {
  const who = isReport ? x.target_name : x.display_name;
  const type = esc(isReport ? (x.category || '') : (x.post_type || ''));
  const body = isReport ? `${type}<br>${esc(x.detail || '')}` : `${type}<br><strong>原文：</strong>${esc(x.post_content || '')}<br><strong>申訴：</strong>${esc(x.reason || '')}`;
  const url = safeHttpUrl(x.facebook_url);
  const link = isReport && url ? `<br><a href="${esc(url)}" target="_blank" rel="noopener noreferrer">開啟 Facebook 連結 ↗</a>` : '';
  const contact = isReport ? x.reporter_contact : x.contact;
  const code = x.case_code ? `<span class="badge">${esc(x.case_code)}</span>` : '';
  return `<article class="record"><div class="grow"><h3>${esc(who || '未命名')} ${code} ${statusBadge(x.status || 'pending')}</h3><p>${body}${link}${contact ? `<br><strong>聯絡：</strong>${esc(contact)}` : ''}<br><small>${when(x.created_at)}</small></p><label class="inline-select">處理狀態 <select data-status="s:${esc(x.id)}"><option value="pending" ${(x.status || 'pending') === 'pending' ? 'selected' : ''}>待處理</option><option value="reviewing" ${x.status === 'reviewing' ? 'selected' : ''}>處理中</option><option value="resolved" ${x.status === 'resolved' ? 'selected' : ''}>已完成</option><option value="dismissed" ${x.status === 'dismissed' ? 'selected' : ''}>不處理</option></select></label></div></article>`;
}

async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (_) { /* use fallback */ }
  try {
    const temp = document.createElement('textarea');
    temp.value = text; temp.setAttribute('readonly', '');
    temp.style.position = 'fixed'; temp.style.left = '-9999px';
    document.body.appendChild(temp); temp.select();
    const ok = document.execCommand('copy'); temp.remove(); return ok;
  } catch (_) { return false; }
}

function templates() {
  const items = [
    ['廣告超發','您的貼文因違反本社團「廣告／商業貼文 24 小時內限 1 篇」規定而未通過或已移除。請於上一則商業貼文發布滿 24 小時後再行刊登，謝謝配合。'],
    ['房仲第一次違規','您的貼文違反本社團房仲／不動產業者規範。依版規第一次違規將禁言 30 天；再次違規將直接移除並封鎖。'],
    ['請勿私訊催審','因社團人數眾多，管理團隊不提供私人訊息查詢發文進度。私訊不會加快審核，也不會因此另外放行貼文；請先查看社團規則與系統提示。'],
    ['公審提醒','可以分享實際經驗，但請勿把社團當成動員公審的平台。請以可查證事實陳述，並避免人身攻擊、肉搜、號召洗負評或公開無關個資。'],
    ['個資提醒','為了說明事件，可以提供必要資訊；與事件無關的個資，請先遮蔽後再發布。']
  ];
  panel.innerHTML = `<div class="panel-head"><h2>💬 管理員快速回覆</h2></div><div class="template-list">${items.map(([t,c],i)=>`<article class="rule"><h3>${esc(t)}</h3><p id="tpl${i}">${esc(c)}</p><button class="secondary copy" data-copy="tpl${i}">複製文字</button></article>`).join('')}</div>`;
  document.querySelectorAll('[data-copy]').forEach(b => b.onclick = async () => {
    const ok = await copyText(document.getElementById(b.dataset.copy).textContent);
    b.textContent = ok ? '已複製 ✓' : '複製失敗，請手動選取';
    setTimeout(() => b.textContent = '複製文字', 1600);
  });
}

restore();
