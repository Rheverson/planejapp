import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { user_id, title, body } = await req.json()

    if (!user_id || !title || !body) {
      return new Response(JSON.stringify({ error: 'user_id, title e body são obrigatórios' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Buscar apenas o token mais recente do usuário
    const { data: tokens } = await supabase
      .from('push_tokens')
      .select('token, platform')
      .eq('user_id', user_id)
      .order('updated_at', { ascending: false })
      .limit(1)

    if (!tokens || tokens.length === 0) {
      console.log(`Nenhum token para user ${user_id}`)
      return new Response(JSON.stringify({ ok: true, message: 'Sem token registrado' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const token = tokens[0].token
    const FIREBASE_SERVICE_ACCOUNT = JSON.parse(Deno.env.get('FIREBASE_SERVICE_ACCOUNT') || '{}')

    // Gerar JWT para autenticação FCM
    const jwtHeader  = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
    const now        = Math.floor(Date.now() / 1000)
    const jwtPayload = btoa(JSON.stringify({
      iss: FIREBASE_SERVICE_ACCOUNT.client_email,
      sub: FIREBASE_SERVICE_ACCOUNT.client_email,
      aud: 'https://oauth2.googleapis.com/token',
      iat: now, exp: now + 3600,
      scope: 'https://www.googleapis.com/auth/firebase.messaging'
    }))

    const pemContents = FIREBASE_SERVICE_ACCOUNT.private_key
      .replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----/g, '')
      .replace(/\n/g, '')
    const binaryDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0))
    const cryptoKey = await crypto.subtle.importKey(
      'pkcs8', binaryDer.buffer,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false, ['sign']
    )

    const signingInput = `${jwtHeader}.${jwtPayload}`
    const signature    = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(signingInput))
    const jwt          = `${signingInput}.${btoa(String.fromCharCode(...new Uint8Array(signature)))}`

    // Trocar JWT por access token
    const tokenRes  = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
    })
    const { access_token } = await tokenRes.json()
    if (!access_token) throw new Error('Erro ao autenticar com FCM')

    // Enviar notificação FCM
    const fcmRes = await fetch(
      `https://fcm.googleapis.com/v1/projects/${FIREBASE_SERVICE_ACCOUNT.project_id}/messages:send`,
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: {
            token,
            notification: { title, body },
            android: { priority: 'high', notification: { sound: 'default', channel_id: 'default' } }
          }
        })
      }
    )

    const fcmData = await fcmRes.json()
    console.log('FCM response:', JSON.stringify(fcmData))

    if (!fcmRes.ok) throw new Error(`FCM error: ${JSON.stringify(fcmData)}`)

    return new Response(JSON.stringify({ ok: true, fcm: fcmData }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('Erro:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})