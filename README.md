# dash-produtividade

Painel de Produtividade RECON — dashboard interno com dados ao vivo do Pipedrive.

## Stack
- Next.js 14 (App Router) + TypeScript
- Recharts (gráficos)
- Vercel Global Config (antigo Edge Config) para persistir as Metas do Mês

## Variáveis de ambiente necessárias na Vercel
- `PIPEDRIVE_API_TOKEN`
- `PIPEDRIVE_PIPELINE_ID` (opcional, default 38)
- `PIPEDRIVE_TARGET_USER_NAME` (opcional, default "Willian")
- `PIPEDRIVE_OWNER_USER_NAME` (opcional, default "Paulo")
- `PIPEDRIVE_LOOKBACK_DAYS` (opcional, default 30)
- `API4COM_TOKEN`
- `EDGE_CONFIG_ID` — ID do Global Config Store (ex: `ecfg_...`)
- `VERCEL_API_TOKEN` — token de API da Vercel com escopo **Full Account** (necessário pra gravar nas Metas do Mês)
- `GLOBAL_CONFIG` (ou `EDGE_CONFIG`) — string de conexão gerada automaticamente ao linkar o Global Config Store ao projeto

## Desenvolvimento local
```bash
npm install
npm run dev
```

## Deploy
Conectado ao GitHub — qualquer push na branch `main` dispara um deploy automático na Vercel.
