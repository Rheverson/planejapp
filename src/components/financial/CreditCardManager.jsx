import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CreditCard, Plus, X, ChevronRight, Calendar, AlertCircle, CheckCircle, Clock, Wallet } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthContext";
import { useSharedProfile } from "@/lib/SharedProfileContext";
import { toast } from "sonner";
import { format, parseISO, startOfMonth, endOfMonth, addMonths } from "date-fns";
import { ptBR } from "date-fns/locale";

function useIsDark() {
  const [dark, setDark] = useState(() =>
    localStorage.getItem("darkMode") === "true" ||
    document.documentElement.classList.contains("dark")
  );
  useEffect(() => {
    const obs = new MutationObserver(() => setDark(document.documentElement.classList.contains("dark")));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    const h = (e) => setDark(e.detail);
    window.addEventListener("darkModeChange", h);
    return () => { obs.disconnect(); window.removeEventListener("darkModeChange", h); };
  }, []);
  return dark;
}

const fmt = (v) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

// Calcula mês da fatura baseado na data e dia de fechamento
function getInvoiceMonth(date, closingDay) {
  const d = typeof date === "string" ? parseISO(date) : date;
  // Se a compra foi DEPOIS do dia de fechamento, vai para a fatura do próximo mês
  if (d.getDate() > closingDay) {
    const next = addMonths(d, 1);
    return format(next, "yyyy-MM");
  }
  return format(d, "yyyy-MM");
}

// ── Card de fatura ────────────────────────────────────────────
function InvoiceCard({ card, invoiceMonth, transactions, dark, onPay }) {
  const cardTx = transactions.filter(t =>
    t.credit_card_id === card.id &&
    t.invoice_month === invoiceMonth
  );

  const total = cardTx.reduce((s, t) => s + Number(t.amount), 0);
  const monthLabel = format(parseISO(invoiceMonth + "-01"), "MMMM yyyy", { locale: ptBR });

  // Status da fatura
  const today = new Date();
  const [year, month] = invoiceMonth.split("-").map(Number);
  const closingDate = new Date(year, month - 1, card.closing_day);
  const dueDate = new Date(year, month - 1, card.due_day);
  if (card.due_day <= card.closing_day) dueDate.setMonth(dueDate.getMonth() + 1);

  const isClosed = today > closingDate;
  const isOverdue = today > dueDate;
  const daysUntilDue = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));

  const statusColor = isOverdue ? "#ef4444" : isClosed ? "#f59e0b" : "#10b981";
  const statusLabel = isOverdue ? "Vencida" : isClosed ? "Fechada" : "Aberta";
  const StatusIcon = isOverdue ? AlertCircle : isClosed ? Clock : CheckCircle;

  const bg    = dark ? "#0c0e13" : "#ffffff";
  const brd   = dark ? "rgba(255,255,255,0.07)" : "rgba(17,24,39,0.06)";
  const text  = dark ? "#e8edf5" : "#0f172a";
  const muted = dark ? "#6b7a96" : "#64748b";
  const subBg = dark ? "#12151c" : "#f8fafc";

  return (
    <div style={{ background: bg, border: `1px solid ${brd}`, borderRadius: 14, overflow: "hidden", boxShadow: dark ? "none" : "0 1px 4px rgba(17,24,39,0.04)" }}>
      {/* Header do card */}
      <div style={{ padding: "12px 16px", borderBottom: `0.5px solid ${brd}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: card.color + "20", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <CreditCard size={16} color={card.color} />
          </div>
          <div>
            <p style={{ fontFamily: "'Cabinet Grotesk', sans-serif", fontWeight: 700, fontSize: "0.85rem", color: text }}>{card.name}</p>
            <p style={{ fontSize: "0.65rem", color: muted, textTransform: "capitalize" }}>{monthLabel}</p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "0.65rem", fontWeight: 700, padding: "3px 8px", borderRadius: 999, background: statusColor + "18", color: statusColor }}>
            <StatusIcon size={10} /> {statusLabel}
          </span>
        </div>
      </div>

      {/* Total */}
      <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <p style={{ fontSize: "0.62rem", color: muted, marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.08em" }}>Total da fatura</p>
          <p style={{ fontFamily: "'Cabinet Grotesk', sans-serif", fontWeight: 800, fontSize: "1.3rem", color: total > 0 ? "#dc2626" : text, letterSpacing: "-0.02em" }}>
            {fmt(total)}
          </p>
          <p style={{ fontSize: "0.65rem", color: muted, marginTop: 3 }}>
            {cardTx.length} lançamento{cardTx.length !== 1 ? "s" : ""} · Vence dia {card.due_day}
            {!isClosed && daysUntilDue > 0 && <span style={{ color: daysUntilDue <= 5 ? "#f59e0b" : muted }}> ({daysUntilDue}d)</span>}
          </p>
        </div>
        {isClosed && total > 0 && (
          <button onClick={() => onPay(card, total, invoiceMonth, dueDate)}
            style={{
              padding: "8px 14px", borderRadius: 10, border: "none",
              background: "linear-gradient(135deg,#1d4ed8,#3730a3)",
              color: "#fff", fontFamily: "'Cabinet Grotesk', sans-serif",
              fontWeight: 700, fontSize: "0.78rem", cursor: "pointer",
              boxShadow: "0 0 14px rgba(29,78,216,0.3)",
            }}>
            Pagar
          </button>
        )}
      </div>

      {/* Lançamentos */}
      {cardTx.length > 0 && (
        <div style={{ borderTop: `0.5px solid ${brd}` }}>
          {cardTx.slice(0, 5).map(t => (
            <div key={t.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 16px", borderBottom: `0.5px solid ${brd}` }}>
              <div>
                <p style={{ fontSize: "0.78rem", color: text, fontWeight: 500 }}>{t.description}</p>
                <p style={{ fontSize: "0.62rem", color: muted }}>{format(parseISO(t.date), "dd/MM")}</p>
              </div>
              <p style={{ fontSize: "0.82rem", fontWeight: 700, color: "#dc2626" }}>{fmt(t.amount)}</p>
            </div>
          ))}
          {cardTx.length > 5 && (
            <div style={{ padding: "8px 16px", textAlign: "center" }}>
              <p style={{ fontSize: "0.7rem", color: muted }}>+{cardTx.length - 5} lançamentos</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Modal cadastro de cartão ──────────────────────────────────
function CreditCardForm({ onClose, onSave, accounts, dark, initialData }) {
  const [name, setName]         = useState(initialData?.name || "");
  const [brand, setBrand]       = useState(initialData?.brand || "mastercard");
  const [color, setColor]       = useState(initialData?.color || "#8b5cf6");
  const [limit, setLimit]       = useState(initialData?.limit_amount || "");
  const [closingDay, setClosingDay] = useState(initialData?.closing_day || 15);
  const [dueDay, setDueDay]     = useState(initialData?.due_day || 20);
  const [accountId, setAccountId] = useState(initialData?.account_id || "");
  const [mode, setMode]         = useState(initialData?.expense_date_mode || "purchase_date");

  const bg    = dark ? "#0c0e13" : "#ffffff";
  const sep   = dark ? "rgba(255,255,255,0.06)" : "rgba(17,24,39,0.06)";
  const text  = dark ? "#e8edf5" : "#0f172a";
  const muted = dark ? "#6b7a96" : "#64748b";
  const inputBg  = dark ? "#12151c" : "#f8fafc";
  const inputBrd = dark ? "rgba(255,255,255,0.1)" : "rgba(17,24,39,0.1)";

  const inputStyle = { width: "100%", height: 42, padding: "0 12px", background: inputBg, border: `1px solid ${inputBrd}`, borderRadius: 12, color: text, fontSize: "0.85rem", fontFamily: "'Outfit',sans-serif", outline: "none", boxSizing: "border-box" };
  const labelStyle = { fontSize: "0.65rem", fontWeight: 600, color: muted, textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 5 };

  const COLORS = ["#8b5cf6","#ec4899","#1d4ed8","#059669","#dc2626","#f59e0b","#0891b2","#374151"];
  const days = Array.from({length:31},(_,i)=>i+1);

  return (
    <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
      style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",backdropFilter:"blur(4px)",zIndex:60,display:"flex",alignItems:"flex-end",justifyContent:"center"}}
      onClick={onClose}>
      <motion.div initial={{y:80,opacity:0}} animate={{y:0,opacity:1}} exit={{y:80,opacity:0}}
        transition={{type:"spring",stiffness:300,damping:30}}
        onClick={e=>e.stopPropagation()}
        style={{background:bg,border:`0.5px solid ${sep}`,borderRadius:"20px 20px 0 0",width:"100%",maxWidth:480,maxHeight:"92vh",display:"flex",flexDirection:"column",boxShadow:"0 -8px 40px rgba(0,0,0,0.2)"}}>

        {/* Header */}
        <div style={{padding:"16px 20px 12px",borderBottom:`0.5px solid ${sep}`,display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:34,height:34,borderRadius:10,background:color+"20",display:"flex",alignItems:"center",justifyContent:"center"}}>
              <CreditCard size={16} color={color} />
            </div>
            <h2 style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:"1rem",color:text,margin:0}}>
              {initialData ? "Editar Cartão" : "Novo Cartão"}
            </h2>
          </div>
          <button onClick={onClose} style={{width:30,height:30,borderRadius:8,border:"none",background:dark?"rgba(255,255,255,0.06)":"#f1f5f9",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>
            <X size={15} color={muted} />
          </button>
        </div>

        {/* Form */}
        <div style={{flex:1,overflowY:"auto",padding:"16px 20px 24px",display:"flex",flexDirection:"column",gap:14}}>

          {/* Nome */}
          <div>
            <label style={labelStyle}>Nome do cartão</label>
            <input value={name} onChange={e=>setName(e.target.value)} placeholder="Ex: Nubank Rheve" style={inputStyle} />
          </div>

          {/* Cor */}
          <div>
            <label style={labelStyle}>Cor</label>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              {COLORS.map(c=>(
                <button key={c} onClick={()=>setColor(c)}
                  style={{width:32,height:32,borderRadius:8,background:c,border:color===c?"3px solid #fff":"3px solid transparent",cursor:"pointer",boxShadow:color===c?`0 0 0 2px ${c}`:"none",transition:"all .15s"}} />
              ))}
            </div>
          </div>

          {/* Limite */}
          <div>
            <label style={labelStyle}>Limite <span style={{fontWeight:400,color:muted}}>(opcional)</span></label>
            <div style={{position:"relative"}}>
              <span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",fontSize:"0.82rem",color:muted,fontWeight:600}}>R$</span>
              <input type="number" step="0.01" value={limit} onChange={e=>setLimit(e.target.value)} placeholder="0,00"
                style={{...inputStyle,paddingLeft:38}} />
            </div>
          </div>

          {/* Fechamento e Vencimento */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div>
              <label style={labelStyle}>Dia de fechamento</label>
              <select value={closingDay} onChange={e=>setClosingDay(Number(e.target.value))}
                style={{...inputStyle,appearance:"none",cursor:"pointer"}}>
                {days.map(d=><option key={d} value={d}>Dia {d}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Dia de vencimento</label>
              <select value={dueDay} onChange={e=>setDueDay(Number(e.target.value))}
                style={{...inputStyle,appearance:"none",cursor:"pointer"}}>
                {days.map(d=><option key={d} value={d}>Dia {d}</option>)}
              </select>
            </div>
          </div>

          {/* Conta para pagamento */}
          <div>
            <label style={labelStyle}>Conta para pagamento da fatura</label>
            <select value={accountId} onChange={e=>setAccountId(e.target.value)}
              style={{...inputStyle,appearance:"none",cursor:"pointer"}}>
              <option value="">Selecione uma conta...</option>
              {accounts.filter(a=>a.type!=="investment").map(a=>(
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>

          {/* Modo de data */}
          <div>
            <label style={labelStyle}>Registrar despesa na...</label>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {[
                {val:"purchase_date", label:"Data da compra", desc:"Aparece no mês em que você comprou"},
                {val:"closing_date",  label:"Fechamento da fatura", desc:"Aparece no mês do vencimento"},
              ].map(({val,label,desc})=>(
                <button key={val} onClick={()=>setMode(val)}
                  style={{padding:"11px 14px",borderRadius:12,border:`1.5px solid ${mode===val?"#1d4ed8":(dark?"rgba(255,255,255,0.08)":"#e2e8f0")}`,background:mode===val?(dark?"rgba(29,78,216,0.1)":"rgba(29,78,216,0.05)"):(dark?"rgba(255,255,255,0.02)":"#fafafa"),cursor:"pointer",textAlign:"left"}}>
                  <p style={{fontWeight:700,fontSize:"0.82rem",color:mode===val?"#1d4ed8":text,marginBottom:2}}>{label}</p>
                  <p style={{fontSize:"0.68rem",color:muted}}>{desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Submit */}
          <button onClick={()=>onSave({name,brand,color,limit_amount:limit?parseFloat(limit):null,closing_day:closingDay,due_day:dueDay,account_id:accountId||null,expense_date_mode:mode})}
            disabled={!name}
            style={{width:"100%",height:46,borderRadius:12,border:"none",background:name?"linear-gradient(135deg,#1d4ed8,#3730a3)":"rgba(255,255,255,0.06)",color:name?"#fff":muted,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:"0.92rem",cursor:name?"pointer":"not-allowed",boxShadow:name?"0 0 20px rgba(29,78,216,0.3)":"none",transition:"all .2s"}}>
            {initialData ? "Salvar alterações" : "Adicionar cartão"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Componente principal ──────────────────────────────────────
export default function CreditCardManager({ selectedDate }) {
  const dark = useIsDark();
  const { user } = useAuth();
  const { activeOwnerId } = useSharedProfile();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editCard, setEditCard] = useState(null);
  const currentMonth = format(selectedDate, "yyyy-MM");

  const bg    = dark ? "#0c0e13" : "#ffffff";
  const brd   = dark ? "rgba(255,255,255,0.07)" : "rgba(17,24,39,0.06)";
  const text  = dark ? "#e8edf5" : "#0f172a";
  const muted = dark ? "#6b7a96" : "#64748b";

  const { data: cards = [] } = useQuery({
    queryKey: ["credit_cards", activeOwnerId],
    queryFn: async () => {
      const { data, error } = await supabase.from("credit_cards").select("*").eq("user_id", activeOwnerId).eq("is_active", true).order("created_at");
      if (error) throw error; return data;
    },
    enabled: !!activeOwnerId,
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts", activeOwnerId],
    queryFn: async () => { const { data, error } = await supabase.from("accounts").select("*").eq("user_id", activeOwnerId); if (error) throw error; return data; },
    enabled: !!activeOwnerId,
  });

  // Transações com cartão do mês selecionado
  const { data: cardTransactions = [] } = useQuery({
    queryKey: ["card_transactions", activeOwnerId, currentMonth],
    queryFn: async () => {
      const { data, error } = await supabase.from("transactions").select("*")
        .eq("user_id", activeOwnerId)
        .not("credit_card_id", "is", null)
        .eq("invoice_month", currentMonth);
      if (error) throw error; return data;
    },
    enabled: !!activeOwnerId,
  });

  const saveMutation = useMutation({
    mutationFn: async (formData) => {
      if (editCard) {
        const { error } = await supabase.from("credit_cards").update(formData).eq("id", editCard.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("credit_cards").insert([{ ...formData, user_id: activeOwnerId }]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["credit_cards"] });
      setShowForm(false); setEditCard(null);
      toast.success(editCard ? "Cartão atualizado!" : "Cartão adicionado!");
    },
    onError: (err) => toast.error("Erro: " + err.message),
  });

  const [payingInvoice, setPayingInvoice] = useState(null); // { card, total, invoiceMonth, dueDate }

  const payInvoiceMutation = useMutation({
    mutationFn: async ({ card, total, invoiceMonth }) => {
      // 1. Cria transação de débito na conta vinculada ao cartão
      if (!card.account_id) throw new Error("Cartão sem conta vinculada para pagamento.");
      const { error: txError } = await supabase.from("transactions").insert([{
        user_id: activeOwnerId,
        description: `Pagamento fatura ${card.name} ${invoiceMonth}`,
        amount: total,
        type: "expense",
        category: "faturas",
        account_id: card.account_id,
        date: format(new Date(), "yyyy-MM-dd"),
        is_realized: true,
        notes: `Fatura ${invoiceMonth}`,
      }]);
      if (txError) throw txError;

      // 2. Marca todas as transações da fatura como pagas
      const { error: updateError } = await supabase.from("transactions")
        .update({ is_realized: true })
        .eq("user_id", activeOwnerId)
        .eq("credit_card_id", card.id)
        .eq("invoice_month", invoiceMonth);
      if (updateError) throw updateError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["card_transactions"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      setPayingInvoice(null);
      toast.success("Fatura paga! Saldo debitado da conta.");
    },
    onError: (err) => toast.error("Erro ao pagar fatura: " + err.message),
  });

  const handlePay = (card, total, invoiceMonth, dueDate) => {
    setPayingInvoice({ card, total, invoiceMonth, dueDate });
  };

  if (cards.length === 0 && !showForm) {
    return (
      <>
        <div style={{ background: bg, border: `1px solid ${brd}`, borderRadius: 14, padding: "20px 16px", textAlign: "center", boxShadow: dark ? "none" : "0 1px 4px rgba(17,24,39,0.04)" }}>
          <CreditCard size={32} color={dark ? "rgba(255,255,255,0.1)" : "#e2e8f0"} style={{ margin: "0 auto 10px", display: "block" }} />
          <p style={{ fontFamily: "'Cabinet Grotesk',sans-serif", fontWeight: 700, fontSize: "0.88rem", color: text, marginBottom: 4 }}>Nenhum cartão cadastrado</p>
          <p style={{ fontSize: "0.72rem", color: muted, marginBottom: 14 }}>Adicione seus cartões para acompanhar faturas</p>
          <button onClick={() => setShowForm(true)}
            style={{ padding: "9px 20px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#1d4ed8,#3730a3)", color: "#fff", fontFamily: "'Cabinet Grotesk',sans-serif", fontWeight: 700, fontSize: "0.82rem", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, boxShadow: "0 0 16px rgba(29,78,216,0.3)" }}>
            <Plus size={14} /> Adicionar cartão
          </button>
        </div>
        <AnimatePresence>
          {showForm && <CreditCardForm dark={dark} accounts={accounts} onClose={() => setShowForm(false)} onSave={(d) => saveMutation.mutate(d)} />}
        </AnimatePresence>
      </>
    );
  }

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <p style={{ fontFamily: "'Cabinet Grotesk',sans-serif", fontWeight: 700, fontSize: "0.88rem", color: text, display: "flex", alignItems: "center", gap: 6 }}>
            <CreditCard size={15} color={muted} /> Faturas
          </p>
          <button onClick={() => { setEditCard(null); setShowForm(true); }}
            style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "0.72rem", fontWeight: 700, color: "#2563eb", background: dark ? "rgba(37,99,235,0.12)" : "rgba(37,99,235,0.08)", border: "none", borderRadius: 999, padding: "5px 10px", cursor: "pointer", fontFamily: "'Cabinet Grotesk',sans-serif" }}>
            <Plus size={12} /> Novo cartão
          </button>
        </div>

        {/* Cards de fatura */}
        {cards.map(card => (
          <div key={card.id}>
            <InvoiceCard card={card} invoiceMonth={currentMonth} transactions={cardTransactions} dark={dark} onPay={handlePay} />
            {/* Botão editar cartão */}
            <button onClick={() => { setEditCard(card); setShowForm(true); }}
              style={{ width: "100%", padding: "5px", fontSize: "0.65rem", color: muted, background: "none", border: "none", cursor: "pointer", textAlign: "right", marginTop: 2 }}>
              ✏️ Editar configurações do cartão
            </button>
          </div>
        ))}
      </div>

      {/* Modal confirmação de pagamento */}
      <AnimatePresence>
        {payingInvoice && (
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
            style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",backdropFilter:"blur(4px)",zIndex:70,display:"flex",alignItems:"flex-end",justifyContent:"center"}}
            onClick={()=>setPayingInvoice(null)}>
            <motion.div initial={{y:60,opacity:0}} animate={{y:0,opacity:1}} exit={{y:60,opacity:0}}
              transition={{type:"spring",stiffness:300,damping:30}}
              onClick={e=>e.stopPropagation()}
              style={{background:dark?"#0c0e13":"#ffffff",border:`0.5px solid ${dark?"rgba(255,255,255,0.08)":"rgba(17,24,39,0.08)"}`,borderRadius:"20px 20px 0 0",width:"100%",maxWidth:480,padding:"20px 20px 32px",boxShadow:"0 -8px 40px rgba(0,0,0,0.2)"}}>
              <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16}}>
                <div style={{width:40,height:40,borderRadius:12,background:payingInvoice.card.color+"20",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  <CreditCard size={20} color={payingInvoice.card.color} />
                </div>
                <div>
                  <p style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:"1rem",color:dark?"#e8edf5":"#0f172a",margin:0}}>Pagar fatura</p>
                  <p style={{fontSize:"0.72rem",color:dark?"#6b7a96":"#64748b",margin:0}}>{payingInvoice.card.name} · {payingInvoice.invoiceMonth}</p>
                </div>
              </div>

              <div style={{background:dark?"#12151c":"#f8fafc",borderRadius:12,padding:"14px 16px",marginBottom:16}}>
                <p style={{fontSize:"0.65rem",color:dark?"#6b7a96":"#9ca3af",marginBottom:4,textTransform:"uppercase",letterSpacing:"0.08em"}}>Total a pagar</p>
                <p style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:"1.6rem",color:"#dc2626",letterSpacing:"-0.02em",margin:0}}>
                  {new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(payingInvoice.total)}
                </p>
                <p style={{fontSize:"0.7rem",color:dark?"#6b7a96":"#64748b",marginTop:4}}>
                  Será debitado de: <strong>{accounts.find(a=>a.id===payingInvoice.card.account_id)?.name || "conta vinculada"}</strong>
                </p>
              </div>

              <div style={{display:"flex",gap:10}}>
                <button onClick={()=>setPayingInvoice(null)}
                  style={{flex:1,height:44,borderRadius:12,border:`1px solid ${dark?"rgba(255,255,255,0.1)":"#e2e8f0"}`,background:"transparent",color:dark?"#6b7a96":"#64748b",fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,fontSize:"0.88rem",cursor:"pointer"}}>
                  Cancelar
                </button>
                <button onClick={()=>payInvoiceMutation.mutate(payingInvoice)}
                  disabled={payInvoiceMutation.isPending}
                  style={{flex:2,height:44,borderRadius:12,border:"none",background:"linear-gradient(135deg,#1d4ed8,#3730a3)",color:"#fff",fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:"0.88rem",cursor:"pointer",boxShadow:"0 0 20px rgba(29,78,216,0.3)",opacity:payInvoiceMutation.isPending?0.6:1}}>
                  {payInvoiceMutation.isPending ? "Pagando..." : "✓ Confirmar pagamento"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showForm && (
          <CreditCardForm dark={dark} accounts={accounts} initialData={editCard}
            onClose={() => { setShowForm(false); setEditCard(null); }}
            onSave={(d) => saveMutation.mutate(d)} />
        )}
      </AnimatePresence>
    </>
  );
}