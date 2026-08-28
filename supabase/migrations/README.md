# Migrations — estado do versionamento

Situação em 28/08/2026, apurada comparando `supabase_migrations.schema_migrations`
(produção) com os arquivos deste diretório.

| | Quantidade |
|---|---|
| Aplicadas em produção | 40 |
| Com arquivo aqui | 13 |
| **Sem arquivo** | **28** |

## O que isso significa na prática

O banco de produção está correto. O que falta é o caminho de volta: hoje
**não é possível recriar o schema do zero a partir deste repositório**. Quem
clonar o projeto e rodar as migrations terá um banco incompleto.

## As 25 anteriores a agosto/2026

Criadas entre abril e maio pelo painel do Supabase, antes de o schema passar
a ser versionado. São elas que criam as tabelas, os cartões de crédito, o
quiz, os códigos promocionais e os cron jobs de notificação:

```
add_notifications_rls_policies      create_credit_cards_system
add_investment_type_to_goals        fix_rls_performance_and_indexes
update_contribution_period_options  add_recurring_group_id
whatsapp_bot_setup                  create_promo_codes
whatsapp_pending_transactions       create_promo_codes_table
notification_schedule_table         add_multiuse_promo_codes
setup_notification_cron             create_kahoot_quiz_tables
setup_daily_notifications_cron      grant_anon_quiz_tables
add_payday_and_streak_to_profiles   create_event_leads_table
setup_smart_notification_crons      normalize_categories_and_budgets
fix_push_tokens_unique_constraint   financial_score_function
unique_recurring_per_date           fix_savings_rate_calculation
remove_realized_date_trigger
```

**Não foram reconstruídas de memória de propósito.** Escrever um arquivo que
apenas se pareça com o que aconteceu é pior do que não ter arquivo nenhum:
daria a impressão de schema reproduzível sem o ser. O caminho correto é um
baseline gerado por `supabase db dump`, que exige Docker.

**Status: PENDENTE — necessita baseline do schema.**

## As 4 de agosto sem arquivo

Aplicadas via MCP durante a auditoria e não salvas na hora. Espelhadas de
forma idempotente em `20260828090000_espelho_migrations_sem_arquivo.sql`,
a partir do estado conferido no banco:

- `cron_jobs_autenticados`
- `migra_recorrencias_legadas`
- `desativa_trigger_recorrencia_antigo`
- `quiz_placar_sem_definer`

## `recorrencia_modelo_unico`

Existe como arquivo aqui, mas não consta em `schema_migrations`. O efeito
dele está no banco (conferido: trigger antigo desativado, 477 transações com
`recurring_group_id`), aplicado sob o nome `migra_recorrencias_legadas` +
`desativa_trigger_recorrencia_antigo`. O arquivo foi mantido como registro
da intenção original.

## Regra daqui para frente

Toda mudança de schema entra por arquivo neste diretório **antes** de ser
aplicada. Aplicar direto pelo painel ou pelo MCP sem salvar o arquivo é o
que produziu esta divergência.
