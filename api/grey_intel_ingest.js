
export const config = { runtime: 'edge' };
import { cleanse, toCard } from '../modules/grey_ops.js';

function j(s,d){ return new Response(JSON.stringify(d),{status:s,headers:{'content-type':'application/json'}}); }

export default async function handler(req) {
  if (req.method !== 'POST') return j(405,{error:'Method Not Allowed'});
  let p={}; try{ p=await req.json(); } catch {}
  const raw = (p && p.text) || '';
  const kind = p.kind || 'Fact';
  const source = p.source || 'user';
  const cleaned = cleanse(raw);
  const card = toCard(cleaned, kind, source);
  return j(200, { ok:true, card });
}
