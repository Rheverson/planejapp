# Migrations

Antes da auditoria de 26/08/2026 o schema **não era versionado**: as 25 tabelas,
19 funções, as policies, os índices e os 10 cron jobs existiam apenas dentro do
projeto do Supabase. Não havia como revisar uma mudança de banco em PR,
reproduzir o ambiente nem voltar atrás.

A partir daqui, toda alteração de banco entra como arquivo neste diretório.

## Como aplicar

```bash
npx supabase db push
```

## Baseline do schema — pendente

Falta gerar o snapshot do que já existia antes destas migrations:

```bash
npx supabase db dump --linked -f supabase/migrations/00000000000000_baseline_schema.sql --schema public
```

Esse comando precisa do **Docker Desktop rodando**. Sem a baseline, um banco
novo criado do zero não reproduz o projeto — as migrations abaixo assumem que
as tabelas já existem.

## O que já está versionado

| Arquivo | Conteúdo |
|---------|----------|
| `20260826120000_rls_hardening.sql` | Remove leitura pública de `profiles`, `event_leads` e `public_users`; cria `validate_promo_code`; bloqueia DELETE anônimo no quiz |
| `20260826121000_definer_functions_authz.sql` | Autorização nas funções `SECURITY DEFINER`; cria `pode_acessar_perfil()` |
| `20260826122000_revoke_anon_from_definer_functions.sql` | Revoga `EXECUTE` nominalmente do papel `anon` |
| `20260826123000_lock_remaining_public_functions.sql` | Fecha o `=X` (PUBLIC) e as 5 funções que não eram `SECURITY DEFINER` |
| `20260827100000_lock_promo_codes.sql` | Fecha a tabela de códigos promocionais |
| `20260827101000_internal_config_cron_token.sql` | Token compartilhado que autentica os cron jobs |
| `20260827102000_recorrencia_modelo_unico.sql` | Unifica os dois modelos de recorrência e desliga o trigger antigo |
| `20260827103000_indices_e_integridade.sql` | 13 índices de FK, `CHECK (amount > 0)`, FK em `transfer_account_id` |
| `20260827104000_consolida_policies_compartilhamento.sql` | Consolida policies e corrige as permissões de editar/excluir compartilhadas |
