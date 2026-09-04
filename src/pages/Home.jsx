import { useIsDark } from "@/design/useTheme";
import { mensagemDeErro } from "@/lib/erros";
import React, { useState, useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthContext";
import { useSharedProfile } from "@/lib/SharedProfileContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, TrendingUp, TrendingDown, Wallet, ChevronRight,
  ArrowLeftRight, PiggyBank, BarChart2, Eye, EyeOff
} from "lucide-react";
import { startOfMonth, endOfMonth, isWithinInterval, parseISO, format } from "date-fns";
import { toast } from "sonner";
import { useMonth } from "@/lib/MonthContext";
import { usePrivacy } from "@/lib/PrivacyContext";
import ReferralBanner from "@/components/referral/ReferralBanner";
import ReferralInviteModal from "@/components/referral/ReferralInviteModal";
import TransactionItem from "@/components/transactions/TransactionItem";
import TransactionForm from "@/components/transactions/TransactionForm";
import { usePaywall } from "@/components/planos/usePaywall";
import TransferForm from "@/components/transactions/TransferForm";
import MonthSelector from "@/components/common/MonthSelector";
import EmptyState from "@/components/common/EmptyState";
import FinancialScore from "@/components/financial/FinancialScore";
import CashFlowProjection from "@/components/financial/CashFlowProjection";
import MonthComparison from "@/components/financial/MonthComparison";
import BudgetManager from "@/components/financial/BudgetManager";
import { calcularTotaisDeSaldo, calcularKPIsMes, gerarOcorrenciasRecorrentes } from "@/domain/financas";
import EstadoErro from "@/components/common/EstadoErro";
import { Skeleton, SkeletonKPI, SkeletonLinha, SkeletonKeyframes } from "@/components/common/Skeleton";

const fmt = (v) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

// ── KPI Card ─────────────────────────────────────────────────
// Light: white card + shadow + colored accent on left
// Dark:  tinted card + colored border
function KPICard({ title, value, color, subtitle, subvalor, subrotulo, hidden, to, dark }) {
  const palettes = {
    green:  { val: dark ? "#2ecc8a" : "#059669", bar: dark ? "rgba(46,204,138,0.5)"  : "#10b981", tint: "rgba(46,204,138,0.06)"  },
    red:    { val: dark ? "#e85d5d" : "#dc2626", bar: dark ? "rgba(232,93,93,0.5)"   : "#ef4444", tint: "rgba(232,93,93,0.06)"   },
    blue:   { val: dark ? "#60a5fa" : "#1d4ed8", bar: dark ? "rgba(96,165,250,0.5)"  : "#2563eb", tint: "rgba(37,99,235,0.08)"   },
    violet: { val: dark ? "#a78bfa" : "#6d28d9", bar: dark ? "rgba(167,139,250,0.5)" : "#8b5cf6", tint: "rgba(124,58,237,0.08)"  },
  };
  const c = palettes[color] || palettes.blue;

  const inner = (
    <div style={{
      background: dark ? c.tint : "#ffffff",
      border: dark ? `1px solid ${c.bar.replace('0.5','0.2')}` : "1px solid rgba(17,24,39,0.04)",
      borderRadius: 16,
      padding: "14px 14px 14px 18px",
      position: "relative",
      overflow: "hidden",
      boxShadow: dark ? "none" : "0 1px 2px rgba(17,24,39,0.03), 0 4px 16px rgba(17,24,39,0.04)",
      transition: "transform .15s, box-shadow .2s",
      height: "100%",
    }}>
      {/* Accent bar vertical à esquerda — só modo claro */}
      {!dark && (
        <div style={{
          position: "absolute", left: 0, top: 12, bottom: 12, width: 3,
          background: c.bar, borderRadius: "0 2px 2px 0",
        }} />
      )}

      <p style={{
        fontSize: "0.62rem", fontWeight: 600,
        color: dark ? "#6b7a96" : "#9ca3af",
        textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6,
      }}>
        {title}
      </p>
      <p style={{
        fontFamily: "'Cabinet Grotesk', sans-serif",
        fontSize: "1.35rem", fontWeight: 800,
        color: hidden ? (dark ? "#3a4259" : "#d1d5db") : c.val,
        letterSpacing: "-0.025em", lineHeight: 1.1,
      }}>
        {hidden ? "R$ ••••" : fmt(value)}
      </p>
      {/* Valor secundário: o que já aconteceu, abaixo do previsto.
          Segue o modo privacidade junto com o valor principal. */}
      {subvalor !== undefined && (
        <p style={{ fontSize: "0.66rem", color: dark ? "#6b7a96" : "#9ca3af", marginTop: 5 }}>
          {subrotulo || "realizado"}{" "}
          <span style={{ fontWeight: 700, color: hidden ? (dark ? "#3a4259" : "#d1d5db") : (dark ? "#e8edf5" : "#374151") }}>
            {hidden ? "R$ ••••" : fmt(subvalor)}
          </span>
        </p>
      )}
      {subtitle && (
        <p style={{ fontSize: "0.62rem", color: dark ? "#6b7a96" : "#9ca3af", marginTop: 4 }}>
          {subtitle}
        </p>
      )}
    </div>
  );
  if (to) return <Link to={to} style={{ textDecoration: "none", display: "block", height: "100%" }}>{inner}</Link>;
  return inner;
}

// ── Account Card ─────────────────────────────────────────────
function AccountCard({ account, balance, hidden, dark }) {
  const types = {
    bank:       { emoji: "🏦", lightC: "#1d4ed8", darkC: "#60a5fa", tint: "rgba(37,99,235,0.08)"  },
    digital:    { emoji: "💳", lightC: "#7c3aed", darkC: "#a78bfa", tint: "rgba(124,58,237,0.08)" },
    wallet:     { emoji: "💵", lightC: "#16a34a", darkC: "#2ecc8a", tint: "rgba(22,163,74,0.08)"  },
    investment: { emoji: "📈", lightC: "#d97706", darkC: "#fbbf24", tint: "rgba(217,119,6,0.08)"  },
  };
  const s = types[account.type] || types.bank;
  const valColor = balance < 0 ? (dark ? "#e85d5d" : "#dc2626") : (dark ? s.darkC : s.lightC);

  return (
    <div style={{
      minWidth: 118, flexShrink: 0,
      background: dark ? "#12151c" : "#ffffff",
      border: `1px solid ${dark ? "rgba(255,255,255,0.05)" : "rgba(17,24,39,0.05)"}`,
      borderRadius: 12, padding: "10px 12px",
      boxShadow: dark ? "none" : "0 1px 2px rgba(17,24,39,0.03)",
    }}>
      <div style={{
        width: 26, height: 26, borderRadius: 8,
        background: s.tint,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 12, marginBottom: 6,
      }}>
        {s.emoji}
      </div>
      <p style={{ fontSize: "0.62rem", color: dark ? "#6b7a96" : "#9ca3af", marginBottom: 2 }}>{account.name}</p>
      <p style={{
        fontFamily: "'Cabinet Grotesk', sans-serif",
        fontSize: "0.88rem", fontWeight: 700,
        color: hidden ? (dark ? "#3a4259" : "#d1d5db") : valColor,
      }}>
        {hidden ? "••••" : fmt(balance)}
      </p>
    </div>
  );
}

export default function Home() {
  const dark = useIsDark();
  const { user } = useAuth();
  const { activeOwnerId, isViewingSharedProfile, sharedPermissions } = useSharedProfile();
  const canAdd = !isViewingSharedProfile || sharedPermissions?.add_transactions;
  const { selectedDate, setSelectedDate } = useMonth();
  const { hidden, toggle } = usePrivacy();
  const [showTransactionForm, setShowTransactionForm] = useState(false);
  const paywall = usePaywall();
  const [showTransferForm, setShowTransferForm]       = useState(false);
  const [initialType, setInitialType]                 = useState("expense");
  const queryClient = useQueryClient();
  const [showReferralModal, setShowReferralModal] = useState(false);
  const [showReferralBanner, setShowReferralBanner] = useState(
    () => localStorage.getItem("referral_banner_dismissed") !== "true"
  );

  // Convite de indicação: aparece sozinho a cada 2 horas.
  //
  // Ele abria 3 segundos depois da Home montar, sem olhar para o que o
  // usuário estava fazendo. No celular isso caía em cima de quem tinha
  // acabado de tocar em "Entrada" ou "Saída": o convite (z-index 999)
  // cobria o formulário de transação (z-index 50) e engolia o toque no X
  // e no botão de salvar — o formulário virava uma armadilha.
  //
  // Agora ele espera a tela ficar livre. Como não marca o horário ao
  // adiar, o convite não é perdido: aparece assim que der.
  const algumFormularioAberto = showTransactionForm || showTransferForm;

  useEffect(() => {
    if (isViewingSharedProfile) return;
    if (algumFormularioAberto) return;

    const KEY = "last_referral_shown";
    const last = localStorage.getItem(KEY);
    const agora = Date.now();
    if (last && agora - parseInt(last) <= 2 * 60 * 60 * 1000) return;

    const t = setTimeout(() => {
      // Confere de novo na hora de abrir: o usuário pode ter tocado em
      // "Entrada" durante os 3 segundos de espera.
      setShowTransactionForm((formAberto) => {
        setShowTransferForm((transfAberta) => {
          if (!formAberto && !transfAberta) {
            setShowReferralModal(true);
            localStorage.setItem(KEY, Date.now().toString());
          }
          return transfAberta;
        });
        return formAberto;
      });
    }, 3000);
    return () => clearTimeout(t);
  }, [isViewingSharedProfile, algumFormularioAberto]);

  const { data: accounts = [], isLoading: carregandoContas, isError: erroContas, error: erroContasObj, refetch: recarregarContas, isFetching: buscandoContas } = useQuery({
    queryKey: ["accounts", activeOwnerId],
    queryFn: async () => { const { data, error } = await supabase.from("accounts").select("*").eq("user_id", activeOwnerId).order("name"); if (error) throw error; return data; },
    enabled: !!activeOwnerId,
  });

  const { data: transactions = [], isLoading: carregandoTransacoes, isError: erroTransacoes, error: erroTransacoesObj, refetch: recarregarTransacoes, isFetching: buscandoTransacoes } = useQuery({
    queryKey: ["transactions", activeOwnerId],
    queryFn: async () => { const { data, error } = await supabase.from("transactions").select("*").eq("user_id", activeOwnerId).order("date", { ascending: false }); if (error) throw error; return data; },
    enabled: !!activeOwnerId,
  });

  const createTransactionMutation = useMutation({
    mutationFn: async (newTx) => {
      const base = { ...newTx, user_id: activeOwnerId, amount: parseFloat(newTx.amount) };
      // ✅ Recorrência criada pela Home usa a mesma geração da tela de
      // Transações. Antes, a linha entrava com is_recurring = true e quem
      // expandia a série era um trigger no banco, com outro modelo de dados
      // (recurring_parent_id) que a UI não sabe editar em bloco.
      if (base.is_recurring) {
        const inserts = gerarOcorrenciasRecorrentes(base);
        const { data, error } = await supabase.from("transactions").insert(inserts).select();
        if (error) throw error;
        return data;
      }
      const { data, error } = await supabase.from("transactions").insert([base]).select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["transactions"] }); queryClient.invalidateQueries({ queryKey: ["accounts"] }); setShowTransactionForm(false); toast.success("Transação adicionada!"); },
    onError: (err) => toast.error(mensagemDeErro(err, "salvar a transacao")),
  });

  const createTransferMutation = useMutation({
    mutationFn: async ({ fromAccountId, toAccountId, amount, date, description }) => { const { error } = await supabase.from("transactions").insert([{ description: description || "Transferência", amount: parseFloat(amount), type: "transfer", account_id: fromAccountId, transfer_account_id: toAccountId, date, is_realized: true, user_id: activeOwnerId }]); if (error) throw error; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["transactions"] }); setShowTransferForm(false); toast.success("Transferência realizada!"); },
    onError: (err) => { if (!paywall.tratarErro(err)) toast.error(mensagemDeErro(err)); },
  });

  const monthStart = startOfMonth(selectedDate);
  const monthEnd   = endOfMonth(selectedDate);

  const monthTransactions = useMemo(() =>
    transactions.filter(t => t.type !== "transfer" && isWithinInterval(parseISO(t.date), { start: monthStart, end: monthEnd })),
    [transactions, monthStart, monthEnd]
  );

  // Saldos e KPIs vêm do módulo de domínio — a mesma regra usada em
  // Contas, Metas, Relatórios e no Finn.
  const { saldos: accountBalances, emConta: totalBalance, investido: totalInvested,
          contasComuns: regularAccounts, contasInvestimento: investmentAccounts } =
    useMemo(() => calcularTotaisDeSaldo(accounts, transactions), [accounts, transactions]);

  const kpis = useMemo(
    () => calcularKPIsMes({
      transacoes: transactions,
      contas: accounts,
      dataReferencia: selectedDate,
      saldoEmConta: totalBalance,
    }),
    [transactions, accounts, selectedDate, totalBalance]
  );

  const carregando = carregandoContas || carregandoTransacoes;
  const expenseCount  = monthTransactions.filter(t=>t.type==="expense"&&t.is_realized!==false).length;
  const recentTx = monthTransactions.slice(0, 5);

  // Tokens
  const bg       = dark ? "#060709" : "#f7f8fa";
  const cardBg   = dark ? "#0c0e13" : "#ffffff";
  const cardBrd  = dark ? "rgba(255,255,255,0.07)" : "rgba(17,24,39,0.05)";
  const shadow   = dark ? "none" : "0 1px 2px rgba(17,24,39,0.03), 0 4px 16px rgba(17,24,39,0.04)";
  const text     = dark ? "#e8edf5" : "#0f172a";
  const muted    = dark ? "#6b7a96" : "#64748b";
  const linkCol  = dark ? "#60a5fa" : "#2563eb";
  const subBg    = dark ? "#12151c" : "#f8fafc";

  // Sem os dados não há número honesto para mostrar. Melhor dizer que
  // falhou do que desenhar R$ 0,00 como se fosse o saldo real.
  if (erroContas || erroTransacoes) {
    return (
      <div style={{ minHeight: "100vh", background: bg, padding: "24px 16px", fontFamily: "'Outfit', sans-serif" }}>
        <EstadoErro
          erro={erroContasObj || erroTransacoesObj}
          tentando={buscandoContas || buscandoTransacoes}
          aoTentarDeNovo={() => { recarregarContas(); recarregarTransacoes(); }}
        />
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: bg, paddingBottom: 96, fontFamily: "'Outfit', sans-serif" }}>
      <SkeletonKeyframes />

      {/* ── HEADER ──────────────────────────────────────────── */}
      <div style={{ position: "relative", overflow: "hidden" }}>

        {/* Fundo do header */}
        <div style={{
          position: "absolute", inset: 0,
          background: dark
            ? "linear-gradient(160deg, #06080f 0%, #0a1628 40%, #0d1f3c 100%)"
            : "linear-gradient(165deg, #0f172a 0%, #1e3a8a 50%, #1e40af 100%)",
        }} />

        {/* Orb de luz azul — intensidade menor no claro */}
        <div style={{
          position: "absolute", width: 360, height: 220, borderRadius: "50%",
          background: dark ? "rgba(37,99,235,0.22)" : "rgba(96,165,250,0.18)",
          top: -70, left: "50%", transform: "translateX(-50%)",
          filter: "blur(80px)", pointerEvents: "none",
        }} />

        {/* Orb secundário */}
        <div style={{
          position: "absolute", width: 220, height: 220, borderRadius: "50%",
          background: dark ? "rgba(96,165,250,0.08)" : "rgba(167,139,250,0.12)",
          bottom: -70, right: -50, filter: "blur(60px)", pointerEvents: "none",
        }} />

        <div style={{ position: "relative", padding: "56px 20px 0" }}>
          {isViewingSharedProfile && (
            <div style={{ background: "rgba(255,255,255,0.12)", borderRadius: 8, padding: "5px 12px", marginBottom: 12, fontSize: "0.72rem", color: "rgba(255,255,255,0.85)", display: "inline-block" }}>
              👁 Visualizando perfil compartilhado
            </div>
          )}

          <div style={{ marginBottom: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
              <p style={{ fontSize: "0.62rem", fontWeight: 600, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: "0.12em" }}>
                Saldo em conta
              </p>
              <button onClick={toggle} aria-label={hidden ? "Mostrar valores" : "Ocultar valores"} aria-pressed={hidden} style={{
                background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 6,
                padding: "3px 7px", cursor: "pointer", display: "flex", alignItems: "center",
              }}>
                {hidden ? <EyeOff size={11} color="rgba(255,255,255,0.55)" /> : <Eye size={11} color="rgba(255,255,255,0.55)" />}
              </button>
            </div>

            {carregando ? (
              <Skeleton width={200} height={44} radius={10} dark
                style={{ background: "linear-gradient(90deg, rgba(255,255,255,0.10) 25%, rgba(255,255,255,0.20) 37%, rgba(255,255,255,0.10) 63%)", backgroundSize: "400% 100%" }} />
            ) : (
              <motion.p key={String(hidden)} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                style={{
                  fontFamily: "'Cabinet Grotesk', sans-serif",
                  fontSize: "clamp(2.2rem, 8vw, 3rem)",
                  fontWeight: 900, color: "#ffffff",
                  letterSpacing: "-0.035em", lineHeight: 1,
                }}>
                {hidden ? "R$ ••••••" : fmt(totalBalance)}
              </motion.p>
            )}

            {totalInvested > 0 && (
              <p style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.5)", marginTop: 8, display: "flex", alignItems: "center", gap: 5 }}>
                <PiggyBank size={12} />
                {hidden ? "+ R$ •••••• guardado" : `+ ${fmt(totalInvested)} guardado`}
              </p>
            )}
          </div>

          <div style={{ height: "0.5px", background: "rgba(255,255,255,0.1)", margin: "14px 0 0" }} />

          <div style={{ padding: "8px 0 0" }}>
            <MonthSelector selectedDate={selectedDate} onChange={setSelectedDate} />
          </div>
        </div>

        {/* Botões de ação */}
        {canAdd && (
          <div style={{ display: "flex", gap: 8, padding: "10px 20px 20px" }}>
            {[
              { label: "Entrada",    icon: TrendingUp,     action: () => { setInitialType("income");  setShowTransactionForm(true); } },
              { label: "Saída",      icon: TrendingDown,   action: () => { setInitialType("expense"); setShowTransactionForm(true); } },
              { label: "Transferir", icon: ArrowLeftRight, action: () => setShowTransferForm(true) },
            ].map(btn => (
              <motion.button key={btn.label} whileTap={{ scale: 0.93 }} onClick={btn.action}
                style={{
                  flex: 1, background: "rgba(255,255,255,0.1)",
                  border: "0.5px solid rgba(255,255,255,0.15)",
                  borderRadius: 12, padding: "10px 4px",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                  cursor: "pointer", backdropFilter: "blur(8px)",
                }}>
                <btn.icon size={14} color="rgba(255,255,255,0.9)" />
                <span style={{ fontSize: "0.68rem", fontWeight: 600, color: "rgba(255,255,255,0.9)", fontFamily: "'Cabinet Grotesk', sans-serif" }}>
                  {btn.label}
                </span>
              </motion.button>
            ))}
          </div>
        )}
      </div>

      {/* ── CONTEÚDO ──────────────────────────────────────── */}
      <div style={{ padding: "14px 14px 0", display: "flex", flexDirection: "column", gap: 10 }}>

        {/* KPIs */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {carregando ? (
            <>
              <SkeletonKPI dark={dark} /><SkeletonKPI dark={dark} />
              <SkeletonKPI dark={dark} /><SkeletonKPI dark={dark} />
            </>
          ) : (<>
          <KPICard title="Entradas Previstas" aria-label="Entradas previstas do mês" value={kpis.entradas} color="green" subvalor={kpis.entradasRealizadas} subrotulo="já entrou" hidden={hidden} dark={dark} to={`/Transactions?filter=income&month=${format(selectedDate,"yyyy-MM")}`} />
          <KPICard title="Saídas Previstas" aria-label="Saídas previstas do mês" value={kpis.saidas} color="red" subvalor={kpis.saidasRealizadas} subrotulo="já saiu" hidden={hidden} dark={dark} to={`/Transactions?filter=expense&month=${format(selectedDate,"yyyy-MM")}`} />
          <KPICard title="Resultado Realizado do Mês" aria-label="Resultado realizado do mês" value={kpis.resultadoDoMes} color={kpis.resultadoDoMes>=0?"blue":"red"} subtitle="só o que já aconteceu" hidden={hidden} dark={dark} to={`/Transactions?filter=realized&month=${format(selectedDate,"yyyy-MM")}`} />
          <KPICard title="Projeção Final do Mês" aria-label="Projeção Final do Mês"    value={kpis.projecaoFinal} color={kpis.projecaoFinal>=0?"violet":"red"} subtitle="Mês completo" aria-label="Mês completo" hidden={hidden} dark={dark} to={`/Transactions?filter=planned&month=${format(selectedDate,"yyyy-MM")}`} />
          </>)}
        </div>

        {/* Score financeiro */}
        <FinancialScore userId={activeOwnerId} selectedDate={selectedDate} />

        {/* Projeção */}
        <CashFlowProjection transactions={transactions} accounts={accounts} currentBalance={totalBalance} />

        {/* Comparativo */}
        <MonthComparison transactions={transactions} accounts={accounts} selectedDate={selectedDate} />

        {/* Orçamentos */}
        <BudgetManager transactions={transactions} accounts={accounts} selectedDate={selectedDate} />

        {/* Banner referral */}
        {showReferralBanner && !isViewingSharedProfile && (
          <ReferralBanner onOpen={() => setShowReferralModal(true)}
            onDismiss={() => { setShowReferralBanner(false); localStorage.setItem("referral_banner_dismissed","true"); }} />
        )}

        {/* Relatórios */}
        <motion.div initial={{ opacity:0,y:8 }} animate={{ opacity:1,y:0 }} transition={{ delay:0.1 }}>
          <Link to={"/Reports"} style={{ textDecoration:"none" }}>
            <div style={{
              background: cardBg, border: `1px solid ${cardBrd}`,
              borderRadius: 16, padding: "13px 16px",
              boxShadow: shadow,
              display: "flex", alignItems: "center", gap: 12,
            }}>
              <div style={{
                width: 38, height: 38, borderRadius: 11,
                background: dark ? "rgba(37,99,235,0.12)" : "rgba(37,99,235,0.08)",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}>
                <BarChart2 size={16} color={linkCol} />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontFamily: "'Cabinet Grotesk', sans-serif", fontSize: "0.88rem", fontWeight: 700, color: text, marginBottom: 2 }}>Ver Relatórios</p>
                <p style={{ fontSize: "0.7rem", color: muted }}>
                  {expenseCount > 0 ? `${expenseCount} gastos este mês` : "Análise de gastos e metas"}
                </p>
              </div>
              <ChevronRight size={14} color={muted} />
            </div>
          </Link>
        </motion.div>

        {/* Contas */}
        {accounts.length > 0 && (
          <motion.div initial={{ opacity:0,y:8 }} animate={{ opacity:1,y:0 }} transition={{ delay:0.15 }}
            style={{ background: cardBg, border: `1px solid ${cardBrd}`, borderRadius: 16, padding: "14px 16px", boxShadow: shadow }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom: 12 }}>
              <p style={{ fontFamily:"'Cabinet Grotesk',sans-serif", fontSize:"0.88rem", fontWeight:700, color:text }}>Minhas contas</p>
              <Link to={"/Accounts"} style={{ fontSize:"0.7rem", color:linkCol, fontWeight:600, textDecoration:"none", display:"flex", alignItems:"center", gap:2 }}>
                Ver todas <ChevronRight size={12} />
              </Link>
            </div>
            <div style={{ display:"flex", gap:8, overflowX:"auto", paddingBottom:4 }}>
              {regularAccounts.map(acc => <AccountCard key={acc.id} account={acc} balance={accountBalances[acc.id]||0} hidden={hidden} dark={dark} />)}
            </div>
            {investmentAccounts.length > 0 && (
              <div style={{ marginTop:12 }}>
                <p style={{ fontSize:"0.62rem", fontWeight:600, color:muted, marginBottom:8, display:"flex", alignItems:"center", gap:5 }}>
                  <PiggyBank size={11} /> Guardado / Investimentos
                </p>
                <div style={{ display:"flex", gap:8, overflowX:"auto", paddingBottom:4 }}>
                  {investmentAccounts.map(acc => <AccountCard key={acc.id} account={acc} balance={accountBalances[acc.id]||0} hidden={hidden} dark={dark} />)}
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* Transações recentes */}
        <motion.div initial={{ opacity:0,y:8 }} animate={{ opacity:1,y:0 }} transition={{ delay:0.2 }}
          style={{ background: cardBg, border: `1px solid ${cardBrd}`, borderRadius: 16, padding: "14px 16px", boxShadow: shadow }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
            <p style={{ fontFamily:"'Cabinet Grotesk',sans-serif", fontSize:"0.88rem", fontWeight:700, color:text }}>Transações recentes</p>
            <Link to={"/Transactions"} style={{ fontSize:"0.7rem", color:linkCol, fontWeight:600, textDecoration:"none", display:"flex", alignItems:"center", gap:2 }}>
              Ver todas <ChevronRight size={12} />
            </Link>
          </div>
          {carregando ? (
            <div><SkeletonLinha dark={dark} /><SkeletonLinha dark={dark} /><SkeletonLinha dark={dark} /></div>
          ) : recentTx.length > 0 ? (
            <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
              {recentTx.map((t,i) => <TransactionItem key={t.id} transaction={t} delay={i*0.04} compact />)}
            </div>
          ) : (
            <EmptyState icon={Wallet} title="Nenhuma transação" aria-label="Nenhuma transação" description="Adicione sua primeira entrada ou saída." action="Adicionar" onAction={() => setShowTransactionForm(true)} />
          )}
        </motion.div>
      </div>

      {/* FAB */}
      {canAdd && (
        <motion.button whileTap={{ scale:0.88 }} whileHover={{ scale:1.06 }}
          onClick={() => setShowTransactionForm(true)}
          aria-label="Adicionar transação"
          style={{
            position:"fixed", bottom:88, right:20,
            width:52, height:52,
            background:"linear-gradient(135deg,#1d4ed8,#3730a3)",
            border:"none", borderRadius:"50%", cursor:"pointer",
            display:"flex", alignItems:"center", justifyContent:"center",
            boxShadow:"0 0 28px rgba(29,78,216,0.5), 0 4px 16px rgba(0,0,0,0.3)",
            zIndex:40,
          }}>
          <Plus size={20} color="#fff" />
        </motion.button>
      )}

      <AnimatePresence>
        {paywall.paywall}
        {showTransactionForm && <TransactionForm accounts={accounts} initialType={initialType} onSubmit={d=>createTransactionMutation.mutate(d)} onClose={()=>setShowTransactionForm(false)} />}
      </AnimatePresence>
      <AnimatePresence>
        {showTransferForm && <TransferForm accounts={accounts} onSubmit={d=>createTransferMutation.mutate(d)} onClose={()=>setShowTransferForm(false)} />}
      </AnimatePresence>
      <AnimatePresence>
        {showReferralModal && <ReferralInviteModal onClose={()=>setShowReferralModal(false)} />}
      </AnimatePresence>
    </div>
  );
}