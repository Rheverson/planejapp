import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

function twilioReply(text: string) {
  return new Response(
    `<?xml version="1.0"?><Response><Message>${text}</Message></Response>`,
    { headers: { 'Content-Type': 'text/xml' } }
  )
}

function extractJSON(text: string): any {
  try { return JSON.parse(text) } catch {}
  const match = text.match(/\{[\s\S]*\}/)
  if (match) { try { return JSON.parse(match[0]) } catch {} }
  return null
}

function todayBrasilia(): string {
  const now = new Date()
  now.setHours(now.getHours() - 3)
  return now.toISOString().split('T')[0]
}

function formatCurrency(value: number): string {
  return `R$ ${Number(value).toFixed(2).replace('.', ',')}`
}

function buildConfirmMessage(p: any): string {
  if (p.intent === 'transfer') {
    return (
      `Confirma a transferência?\n\n` +
      `🔄 *${formatCurrency(p.amount)}*\n` +
      `🏦 De: ${p.from_account}\n` +
      `🏦 Para: ${p.to_account}\n` +
      `📅 ${p.date}\n\n` +
      `Responda *SIM* para confirmar, *NÃO* para cancelar\nOu corrija: "muda para R$300"`
    )
  }
  if (p.intent === 'goal') {
    return (
      `Confirma o aporte na meta?\n\n` +
      `🎯 *${p.goal_name}*\n` +
      `💰 ${formatCurrency(p.amount)}\n` +
      `🏦 ${p.account_name || 'conta da meta'}\n` +
      `📅 ${p.date}\n` +
      `${p.is_realized ? '✅ Realizado' : '📋 Previsto'}\n\n` +
      `Responda *SIM* para confirmar ou *NÃO* para cancelar\nOu corrija algo`
    )
  }
  return (
    `Confirma o lançamento?\n\n` +
    `${p.type === 'expense' ? '💸 Saída' : '💰 Entrada'}: *${formatCurrency(p.amount)}*\n` +
    `📝 ${p.description}\n` +
    `📂 ${p.category}\n` +
    `🏦 ${p.account_name}\n` +
    `📅 ${p.date}\n` +
    `${p.is_realized ? '✅ Realizado' : '📋 Previsto'}\n\n` +
    `Responda *SIM* para confirmar ou *NÃO* para cancelar\nOu corrija: "muda a conta para Flash"`
  )
}

Deno.serve(async (req) => {
  const form = await req.formData()
  const rawPhone = form.get('From')?.toString() ?? ''
  const phone = rawPhone.replace('whatsapp:', '').trim()
  const message = form.get('Body')?.toString().trim() ?? ''
  const msgLower = message.toLowerCase().trim()
  const today = todayBrasilia()

  console.log('PHONE:', phone)
  console.log('MESSAGE:', message)

  // 1. Verificar usuário e limite
  const { data: limitData } = await supabase
    .rpc('check_whatsapp_limit', { p_phone: phone })

  if (!limitData?.length) {
    return twilioReply('❌ Número não cadastrado. Acesse o app Planeje e vincule seu WhatsApp no Perfil.')
  }

  const { user_id, used_this_week, has_limit } = limitData[0]

  if (has_limit) {
    return twilioReply(
      `⛔ Você usou todos os 4 lançamentos desta semana.\n\n` +
      `O limite renova toda segunda-feira. Use o app para lançamentos adicionais. 📱`
    )
  }

  // 2. Buscar contas e metas do usuário
  const [accountsRes, goalsRes] = await Promise.all([
    supabase.from('accounts').select('id, name, type').eq('user_id', user_id),
    supabase.from('goals').select('id, name, type, linked_account_id, investment_type').eq('user_id', user_id).eq('type', 'investment')
  ])
  const userAccounts = accountsRes.data || []
  const userGoals   = goalsRes.data || []
  const accountsList = userAccounts.map((a: any) => a.name).join(', ')
  const goalsList    = userGoals.map((g: any) => g.name).join(', ')

  // 3. Verificar pendente
  const { data: pending } = await supabase
    .from('whatsapp_pending')
    .select('*')
    .eq('phone_number', phone)
    .gte('created_at', new Date(Date.now() - 10 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (pending) {
    // Confirmação — só palavras exatas
    const CONFIRM_WORDS = ['sim', 's', 'yes', 'ok', 'confirmar', 'confirma', '✅']
    const CANCEL_WORDS  = ['não', 'nao', 'n', 'no', 'cancelar', 'cancela', '❌']
    const isConfirm = CONFIRM_WORDS.includes(msgLower)
    const isCancel  = CANCEL_WORDS.includes(msgLower)

    // CANCELAR
    if (isCancel) {
      await supabase.from('whatsapp_pending').delete().eq('id', pending.id)
      return twilioReply('❌ Lançamento cancelado. Me mande um novo quando quiser!')
    }

    // CORREÇÃO — qualquer coisa que não seja confirmação exata vai para o Groq corrigir
    if (!isConfirm) {
      const groqCorrection = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${Deno.env.get('GROQ_API_KEY')}` },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          temperature: 0.1,
          max_tokens: 150,
          messages: [
            {
              role: 'system',
              content: `O usuário quer corrigir um lançamento pendente. Retorne SOMENTE JSON com os campos a alterar.
Campos: amount (number), account_name (string), from_account (string), to_account (string), date (YYYY-MM-DD), category (string), description (string), is_realized (boolean), goal_name (string)
Exemplos: {"account_name":"Flash"} ou {"amount":35.00} ou {"is_realized":false} ou {"date":"2026-04-10"}
Contas disponíveis: ${accountsList}
Data de hoje: ${today}`
            },
            { role: 'user', content: message }
          ]
        })
      })

      const corrData = await groqCorrection.json()
      const corrText = corrData.choices?.[0]?.message?.content ?? ''
      console.log('CORRECTION RAW:', corrText)
      const correction = extractJSON(corrText)

      if (correction && Object.keys(correction).length > 0) {
        const updatedPayload = { ...pending.payload, ...correction }
        await supabase.from('whatsapp_pending').update({ payload: updatedPayload }).eq('id', pending.id)
        return twilioReply(
          `✏️ Corrigido! Confirma agora?\n\n` +
          buildConfirmMessage(updatedPayload)
        )
      }

      // Não entendeu a correção
      return twilioReply(
        `⏳ Não entendi a correção. O lançamento atual:\n\n` +
        buildConfirmMessage(pending.payload)
      )
    }

    // CONFIRMAR
    const p = pending.payload
    let txError = null

    if (p.intent === 'transfer') {
      const fromAcc = userAccounts.find((a: any) => a.name.toLowerCase().includes(p.from_account.toLowerCase()))
      const toAcc   = userAccounts.find((a: any) => a.name.toLowerCase().includes(p.to_account.toLowerCase()))
      if (!fromAcc || !toAcc) {
        return twilioReply(`❌ Conta não encontrada. Suas contas: ${accountsList}`)
      }
      // 1 registro apenas
      const { error } = await supabase.from('transactions').insert({
        user_id,
        type: 'transfer',
        amount: p.amount,
        description: p.description || 'Transferência',
        account_id: fromAcc.id,
        transfer_account_id: toAcc.id,
        date: p.date,
        is_realized: true
      })
      txError = error
    }

    } else if (p.intent === 'goal') {
      const goal = userGoals.find((g: any) => g.name.toLowerCase().includes(p.goal_name.toLowerCase()))
      if (!goal?.linked_account_id) {
        return twilioReply(`❌ Meta "${p.goal_name}" não tem conta vinculada. Configure no app.`)
      }
      const { error } = await supabase.from('transactions').insert({
        user_id, type: 'income', amount: p.amount,
        description: `Aporte: ${goal.name}`, category: 'investimentos',
        account_id: goal.linked_account_id, date: p.date, is_realized: p.is_realized ?? true
      })
      txError = error

    } else {
      const acc = userAccounts.find((a: any) => a.name.toLowerCase().includes((p.account_name || '').toLowerCase()))
      const { error } = await supabase.from('transactions').insert({
        user_id, type: p.type, amount: p.amount,
        description: p.description, category: p.category,
        account_id: acc?.id || null, date: p.date, is_realized: p.is_realized ?? true
      })
      txError = error
    }

    await supabase.from('whatsapp_pending').delete().eq('id', pending.id)

    if (txError) {
      console.log('TX ERROR:', JSON.stringify(txError))
      return twilioReply('❌ Erro ao salvar. Tente novamente.')
    }

    const restantes = 4 - (used_this_week + 1)
    const reply =
      `✅ *Lançado com sucesso!*\n\n` +
      buildConfirmMessage(p).split('\n').slice(0, 6).join('\n') +
      `\n\n📊 Restantes esta semana: *${restantes}/4*`

    await supabase.from('whatsapp_usage').insert({
      user_id, phone_number: phone, action: 'transaction',
      message_in: message, message_out: reply
    })

    return twilioReply(reply)
  }

  // 4. Nova mensagem — interpretar com Groq
  const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${Deno.env.get('GROQ_API_KEY')}` },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      temperature: 0.1,
      max_tokens: 300,
      messages: [
        {
          role: 'system',
          content: `Você é um assistente financeiro. Interprete a mensagem e retorne SOMENTE JSON válido, sem markdown.

INTENTS:
1. Transação: {"intent":"transaction","type":"expense|income","amount":50.00,"description":"...","category":"alimentação|transporte|moradia|saúde|educação|lazer|compras|outros","account_name":"...","date":"${today}","is_realized":true}
2. Transferência: {"intent":"transfer","amount":500.00,"from_account":"nubank","to_account":"caixinhas","date":"${today}","description":"Transferência"}
3. Meta: {"intent":"goal","goal_name":"reserva mensal","amount":400.00,"date":"${today}","is_realized":true}
4. Erro: {"intent":"error","message":"o que faltou"}

REGRAS:
- is_realized true = já aconteceu ("paguei","gastei","recebi") | false = futuro ("vou pagar","semana que vem","pretendo")
- Contas do usuário: ${accountsList}
- Metas do usuário: ${goalsList}
- Vírgula vira ponto: 23,99 → 23.99
- Sem data → use: ${today}
- Mencionar meta → intent "goal"
- "transferi/mandei/passei de X para Y" → intent "transfer"`
        },
        { role: 'user', content: message }
      ]
    })
  })

  const groqData = await groqRes.json()
  const rawText = groqData.choices?.[0]?.message?.content ?? ''
  console.log('GROQ RAW:', rawText)

  const parsed = extractJSON(rawText)
  console.log('PARSED:', JSON.stringify(parsed))

  if (!parsed || parsed.intent === 'error') {
    return twilioReply(
      `🤔 ${parsed?.message || 'Não entendi.'}\n\n` +
      `💡 Exemplos:\n` +
      `• "Gastei R$50 no mercado no Nubank"\n` +
      `• "Recebi R$3000 de salário na Infinity Pay"\n` +
      `• "Transferi R$500 do Nubank para Caixinhas"\n` +
      `• "Guardei R$400 na meta Reserva mensal"\n` +
      `• "Vou pagar R$200 de luz semana que vem no Nubank"`
    )
  }

  // Validar conta obrigatória
  if (parsed.intent === 'transaction' && !parsed.account_name) {
    await supabase.from('whatsapp_pending').delete().eq('phone_number', phone)
    await supabase.from('whatsapp_pending').insert({ phone_number: phone, user_id, payload: parsed })
    return twilioReply(`❓ Em qual conta devo lançar?\n\n${userAccounts.map((a: any) => `• ${a.name}`).join('\n')}`)
  }

  // Validar contas da transferência
  if (parsed.intent === 'transfer') {
    const fromAcc = userAccounts.find((a: any) => a.name.toLowerCase().includes((parsed.from_account || '').toLowerCase()))
    const toAcc   = userAccounts.find((a: any) => a.name.toLowerCase().includes((parsed.to_account || '').toLowerCase()))
    if (!fromAcc || !toAcc) {
      return twilioReply(`❓ Contas não encontradas. Suas contas:\n${userAccounts.map((a: any) => `• ${a.name}`).join('\n')}`)
    }
    parsed.from_account = fromAcc.name
    parsed.to_account   = toAcc.name
  }

  // Validar meta
  if (parsed.intent === 'goal') {
    const goal = userGoals.find((g: any) => g.name.toLowerCase().includes((parsed.goal_name || '').toLowerCase()))
    if (!goal) {
      return twilioReply(`❓ Meta não encontrada. Suas metas:\n${userGoals.map((g: any) => `• ${g.name}`).join('\n')}`)
    }
    parsed.goal_name = goal.name
    const acc = userAccounts.find((a: any) => a.id === goal.linked_account_id)
    parsed.account_name = acc?.name || 'conta da meta'
  }

  // Salvar pendente e pedir confirmação
  await supabase.from('whatsapp_pending').delete().eq('phone_number', phone)
  await supabase.from('whatsapp_pending').insert({ phone_number: phone, user_id, payload: parsed })

  return twilioReply(buildConfirmMessage(parsed))
})