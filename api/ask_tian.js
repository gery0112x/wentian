
export const config = { runtime: 'edge' };

function j(status, data) {
  return new Response(JSON.stringify(data), { status, headers: {'content-type':'application/json; charset=utf-8','cache-control':'no-store'} });
}

function parseTime(hhmm) {
  const [h,m] = hhmm.split(':').map(n=>parseInt(n,10));
  return {h, m};
}

async function loadRouting() {
  try {
    if (process.env.ROUTING_CONFIG_JSON) return JSON.parse(process.env.ROUTING_CONFIG_JSON);
  } catch {}
  try {
    const url = process.env.ROUTING_CONFIG_URL;
    if (url) {
      const r = await fetch(url, { cache: 'no-store' });
      if (r.ok) return await r.json();
    }
  } catch {}
  return {
    day_quota_usd: 0.2,
    lifeline: { L1: 0.8, L2: 0.9, L3: 0.95 },
    models: {
      deepseek: { price_in: 0.05, price_out: 0.10, role:'backbone', enabled:true },
      gemini: { price_in: 0.10, price_out: 0.10, role:'multimodal', enabled:true },
      gpt4o: { price_in: 5.00, price_out: 15.00, role:'decider', enabled:true }
    },
    weights: { default: { deepseek: 0.6, gemini: 0.25, gpt4o: 0.15 } },
    limits: { gpt4o_out: 1200 },
    policy: { immediate_latency_s: 2.0, offline_window_localtime: {start:'22:00', end:'07:00'}, force_summary_on_L2:true, force_backbone_on_L3:true }
  };
}

function estimateCost(tokensIn, tokensOut, model, routing) {
  const m = routing.models[model] || {};
  const pi = m.price_in ?? 0, po = m.price_out ?? 0;
  return (tokensIn/1000)*pi + (tokensOut/1000)*po;
}

function nowInWindow(start, end, tzOffsetMin=0) {
  const now = new Date(Date.now() + tzOffsetMin*60000);
  const s = parseTime(start), e = parseTime(end);
  const cur = now.getHours()*60 + now.getMinutes();
  const S = s.h*60 + s.m, E = e.h*60 + e.m;
  if (S <= E) return (cur >= S && cur <= E);
  return (cur >= S || cur <= E);
}

function lifelineLevel(dayCost, dayQuota, routing) {
  const x = dayQuota > 0 ? (dayCost/dayQuota) : 0;
  const {L1, L2, L3} = routing.lifeline || {L1:0.8,L2:0.9,L3:0.95};
  if (x >= L3) return "L3";
  if (x >= L2) return "L2";
  if (x >= L1) return "L1";
  return "OK";
}

function chooseModel(intent, priority, routing, level) {
  const w = routing.weights?.default || {};
  let pool = Object.keys(w).filter(k => routing.models[k]?.enabled);
  if (level === "L3") return "deepseek";
  if (level === "L2") return "gemini";
  pool.sort((a,b)=> (w[b]||0)-(w[a]||0));
  return pool[0] || "deepseek";
}

async function callUpstream({model, messages, max_tokens}) {
  const key = (model === 'gemini') ? process.env.GEMINI_API_KEY : process.env.OPENAI_API_KEY;
  const baseUrl = (model === 'gemini')
    ? (process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com')
    : (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1');
  const useModel = (model === 'deepseek')
    ? (process.env.DEEPSEEK_MODEL || 'deepseek-chat')
    : (model === 'gemini')
      ? (process.env.GEMINI_MODEL || 'gemini-1.5-flash')
      : (process.env.OPENAI_MODEL || 'gpt-4o');

  if (!key && model !== 'deepseek') {
    return { ok:true, model:'mock', content:'[無金鑰：模擬回覆。請設定 API Key 後再試。]' };
  }

  if (model === 'gemini') {
    const url = `${baseUrl}/v1beta/models/${useModel}:generateContent?key=${encodeURIComponent(key)}`;
    const r = await fetch(url, { method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: messages.map(m=>m.content).join("\n") }]}], generationConfig:{ maxOutputTokens: max_tokens || 800 } })
    });
    if (!r.ok) return { ok:false, status:r.status, detail: await r.text().catch(()=> '') };
    const data = await r.json();
    const text = data?.candidates?.[0]?.content?.parts?.map(p=>p.text).join("") ?? "";
    return { ok:true, model: useModel, content: text };
  }

  const r = await fetch(`${baseUrl}/chat/completions`, {
    method:'POST', headers:{ 'content-type':'application/json', 'authorization': `Bearer ${key}`},
    body: JSON.stringify({ model: useModel, messages, max_tokens: max_tokens || 800, temperature: 0.2 })
  });
  if (!r.ok) return { ok:false, status:r.status, detail: await r.text().catch(()=> '') };
  const data = await r.json();
  const text = data?.choices?.[0]?.message?.content ?? "";
  return { ok:true, model: useModel, content: text };
}

export default async function handler(req) {
  if (req.method === 'GET') return j(200, { ok:true, name:'ask_tian', message:'WenTian alive' });
  if (req.method !== 'POST') return j(405, { error:'Method Not Allowed' });

  let p = {}; try { p = await req.json(); } catch {}
  const intent = p.intent || '';
  const priority = p.priority || 'high';
  const tzOffsetMin = parseInt(p.tzOffsetMin || '480', 10);
  const tokensIn = Math.max(8, Math.floor((intent.length||20)/3));
  const tokensOut = 400;

  const routing = await loadRouting();
  const dayQuota = routing.day_quota_usd || 0.2;
  const dayCost = parseFloat(process.env.DAY_COST_USD || '0');
  const level = lifelineLevel(dayCost, dayQuota, routing);

  const window = routing.policy?.offline_window_localtime || {start:'22:00', end:'07:00'};
  const inOffPeak = nowInWindow(window.start, window.end, tzOffsetMin);
  const isImmediate = (priority === 'high') || (!inOffPeak);

  if (!isImmediate) {
    return j(202, { ok:true, queued:true, reason:'off-peak batch', level, estimate_usd: estimateCost(tokensIn, tokensOut, 'deepseek', routing) });
  }

  const modelKey = chooseModel(intent, priority, routing, level);
  const est = estimateCost(tokensIn, tokensOut, modelKey, routing);
  const max_tokens = (modelKey === 'gpt4o') ? Math.min(tokensOut, routing.limits?.gpt4o_out || 1200) : tokensOut;

  const sys = (p.voice === '掌門令')
    ? "你是冷靜斷語的決策助手，回答要短、條列化、少婉轉，不用Emoji。"
    : "你是務實的助手，回答清楚、條列化。";

  const messages = [
    { role:'system', content: sys },
    { role:'user', content: intent }
  ];

  const upstream = await callUpstream({ model: modelKey, messages, max_tokens });
  if (!upstream.ok) return j(502, { error:'upstream_error', level, model: modelKey, estimate_usd: est, detail: upstream.detail });

  return j(200, { ok:true, level, route: modelKey, estimate_usd: est, answer: upstream.content });
}
