(() => {
  const cfg = window.TP_CONFIG || {};
  const configured = Boolean(
    cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY &&
    !cfg.SUPABASE_URL.includes('YOUR_') &&
    !cfg.SUPABASE_ANON_KEY.includes('YOUR_')
  );
  const client = configured ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;

  const localGet = (key) => JSON.parse(localStorage.getItem(key) || '[]');
  const localSet = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const caseCode = (prefix, id = uid()) => `${prefix}-${String(id).replace(/-/g, '').slice(0, 8).toUpperCase()}`;

  async function add(table, localKey, payload) {
    if (configured) {
      const { data, error } = await client.from(table).insert(payload).select().single();
      if (error) throw error;
      return data;
    }
    const rows = localGet(localKey);
    const row = { id: uid(), created_at: new Date().toISOString(), status: 'pending', ...payload };
    rows.unshift(row); localSet(localKey, rows); return row;
  }

  async function addPublicReport(payload, honeypot = '') {
    if (String(honeypot || '').trim()) throw new Error('無法送出，請重新整理頁面後再試。');
    if (configured) {
      const { data, error } = await client.rpc('submit_public_report', {
        p_category: payload.category,
        p_target_name: payload.target_name,
        p_facebook_url: payload.facebook_url || null,
        p_detail: payload.detail,
        p_reporter_contact: payload.reporter_contact || null,
        p_honeypot: ''
      });
      if (error) throw error;
      return { case_code: data };
    }
    const rows = localGet('tp_reports_v2');
    const row = { id: uid(), case_code: caseCode('RPT'), created_at: new Date().toISOString(), status: 'pending', ...payload };
    rows.unshift(row); localSet('tp_reports_v2', rows); return row;
  }

  async function addPublicAppeal(payload, honeypot = '') {
    if (String(honeypot || '').trim()) throw new Error('無法送出，請重新整理頁面後再試。');
    if (configured) {
      const { data, error } = await client.rpc('submit_public_appeal', {
        p_display_name: payload.display_name,
        p_post_type: payload.post_type,
        p_post_content: payload.post_content,
        p_reason: payload.reason,
        p_contact: payload.contact || null,
        p_honeypot: ''
      });
      if (error) throw error;
      return { case_code: data };
    }
    const rows = localGet('tp_appeals_v2');
    const row = { id: uid(), case_code: caseCode('APL'), created_at: new Date().toISOString(), status: 'pending', ...payload };
    rows.unshift(row); localSet('tp_appeals_v2', rows); return row;
  }

  async function list(table, localKey, order = 'created_at') {
    if (configured) {
      const { data, error } = await client.from(table).select('*').order(order, { ascending: false });
      if (error) throw error;
      return data || [];
    }
    return localGet(localKey);
  }

  async function update(table, localKey, id, patch) {
    if (configured) {
      const { data, error } = await client.from(table).update(patch).eq('id', id).select().single();
      if (error) throw error;
      return data;
    }
    const rows = localGet(localKey).map(x => x.id === id ? { ...x, ...patch } : x);
    localSet(localKey, rows); return rows.find(x => x.id === id);
  }

  async function remove(table, localKey, id) {
    if (configured) {
      const { error } = await client.from(table).delete().eq('id', id);
      if (error) throw error;
      return;
    }
    localSet(localKey, localGet(localKey).filter(x => x.id !== id));
  }

  window.TPDB = {
    configured,
    client,
    addReport: addPublicReport,
    addAppeal: addPublicAppeal,
    addViolation: (p) => add('violations', 'tp_violations_v2', p),
    addRealtorViolation: (p) => add('realtor_violations', 'tp_realtors_v2', p),
    reports: () => list('reports', 'tp_reports_v2'),
    appeals: () => list('appeals', 'tp_appeals_v2'),
    violations: () => list('violations', 'tp_violations_v2'),
    realtorViolations: () => list('realtor_violations', 'tp_realtors_v2'),
    updateReport: (id,p) => update('reports','tp_reports_v2',id,p),
    updateAppeal: (id,p) => update('appeals','tp_appeals_v2',id,p),
    deleteViolation: (id) => remove('violations','tp_violations_v2',id),
    deleteRealtorViolation: (id) => remove('realtor_violations','tp_realtors_v2',id)
  };
})();
