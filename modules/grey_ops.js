
export function cleanse(raw) {
  const masked = raw.replace(/\b(\d{3})[- ]?(\d{3,4})[- ]?(\d{3,4})\b/g, "***-****-****");
  return masked;
}
export function fingerprint(s) {
  let h = 0; for (let i=0;i<s.length;i++){ h = Math.imul(31,h) + s.charCodeAt(i) | 0; }
  return "fp_" + (h>>>0).toString(16);
}
export function toCard(content, kind="Fact", source="") {
  return { id: fingerprint(content+source), kind, content, source_hash: fingerprint(source), tags:[], risk_level: "low", created_at: new Date().toISOString(), ttl: 604800, fingerprint: fingerprint(content) };
}
