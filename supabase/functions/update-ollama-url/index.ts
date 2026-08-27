import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    const { value } = await req.json()
    if (!value) throw new Error("URL nao informada")

    const SUPABASE_PROJECT_ID = "pomnecjcvpqegyeklims"
    const ACCESS_TOKEN = Deno.env.get("MGMT_ACCESS_TOKEN")!

    if (!ACCESS_TOKEN) throw new Error("MGMT_ACCESS_TOKEN nao configurado")

    const res = await fetch(
      `https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_ID}/secrets`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify([{ name: "OLLAMA_URL", value }])
      }
    )

    if (!res.ok) {
      const err = await res.text()
      throw new Error("Erro ao atualizar secret: " + err)
    }

    console.log("OLLAMA_URL atualizado:", value)

    return new Response(
      JSON.stringify({ ok: true, url: value }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )

  } catch (err: any) {
    console.error("Erro:", err.message)
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})