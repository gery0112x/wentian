
# WenTian Launch Pack v2
- 問天入口（古風帶科技；Style/Voice 切換）
- /api/ask_tian：Serverless 智慧引擎（即時/非即時分流、估價、生命線 L1/L2/L3、Adapter 熱插拔、routing.json 熱更新）
- 裸奔工廠 v0：/api/grey_intel_ingest（去識別→指紋化→情資卡）
- supabase_schema.sql：可審計資料表
- vercel.json：Edge Functions 佈署設定

## Vercel（CLI）
npm i -g vercel
vercel login
vercel link --yes
# 設環境變數（至少設 OPENAI 或 GEMINI 任一組；無金鑰會進「模擬回覆」）
vercel env add OPENAI_API_KEY production
vercel env add OPENAI_MODEL production         # 例如 gpt-4o
vercel env add GEMINI_API_KEY production
vercel env add GEMINI_MODEL production         # 例如 gemini-1.5-flash
vercel env add DEEPSEEK_MODEL production       # 例如 deepseek-chat
# 選一種：ROUTING_CONFIG_URL 或 ROUTING_CONFIG_JSON
vercel env add ROUTING_CONFIG_JSON production
vercel env add DAY_COST_USD production
vercel deploy --prod --yes

## Cloudflare Workers（免 CLI 快速試用）
- 方案：使用 /Workers-PasteKit/ask_tian_workers.js 內容貼到 Workers，建路由 /api/ask_tian
- 將 public/ 與 index.html 放到任意靜態託管（或 Cloudflare Pages），把 cfg.api 指向你的 /api/ask_tian
