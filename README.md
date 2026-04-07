# PlanejeApp

Aplicativo de finanças pessoais com suporte a múltiplos perfis, metas, investimentos e chat com IA financeira.

## Stack

- React 18 + Vite
- Supabase (auth + banco de dados)
- Capacitor (Android)
- Stripe (pagamentos)

## Configuração local

1. Clone o repositório
2. Instale as dependências: `npm install`
3. Crie um arquivo `.env` na raiz com as variáveis:

```
VITE_SUPABASE_URL=sua_url_supabase
VITE_SUPABASE_ANON_KEY=sua_chave_anonima_supabase
VITE_STRIPE_PUBLISHABLE_KEY=sua_chave_publica_stripe
```

4. Execute: `npm run dev`

## Build Android

```bash
npm run build
npx cap sync android
npx cap open android
```
