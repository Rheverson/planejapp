import React, { useState, useMemo, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthContext";
import { useSharedProfile } from "@/lib/SharedProfileContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, TrendingUp, SlidersHorizontal, X, Search, Calendar, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { startOfMonth, endOfMonth, isWithinInterval, parseISO, isAfter, isBefore, isEqual } from "date-fns";
import { toast } from "sonner";
import { useSearchParams } from "react-router-dom";
import { useMonth } from "@/lib/MonthContext";
import RealizarPrevisaoModal from "@/components/transactions/RealizarPrevisaoModal";
import TransactionItem from "@/components/transactions/TransactionItem";
import TransactionForm from "@/components/transactions/TransactionForm";
import MonthSelector from "@/components/common/MonthSelector";
import EmptyState from "@/components/common/EmptyState";
import RecurringEditModal from "@/components/transactions/RecurringEditModal";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const CATEGORIES = [
  "alimentação","moradia","transporte","saúde","educação",
  "lazer","compras","salário","freelance","investimentos","outros",
];

const fmt = (v) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

function useIsDark() {
  const [dark, setDark] = useState(() => localStorage.getItem("darkMode") === "true");
  useEffect(() => {
    const h = (e) => setDark(e.detail);
    window.addEventListener("darkModeChange", h);
    return () => window.removeEventListener("darkModeChange", h);
  }, []);
  return dark;
}

export default function Transactions() {
  const dark = useIsDark();
  const { user } = useAuth();
  const { activeOwnerId, isViewingSharedProfile, sharedPermissions } = useSharedProfile();
  const canAdd    = !isViewingSharedProfile || sharedPermissions?.add_transactions;
  const canDelete = !isViewingSharedProfile || sharedPermissions?.delete_transactions;
  const queryClient = useQueryClient();
  const { selectedDate, setSelectedDate } = useMonth();
  const [searchParams] = useSearchParams();

  const [filter, setFilter]                     = useState(searchParams.get("filter") || "all");
  const [showForm, setShowForm]                 = useState(false);
  const [editTransaction, setEditTransaction]   = useState(null);
  const [searchQuery, setSearchQuery]           = useState("");
  const [searchFocused, setSearchFocused]       = useState(false);
  const [deleteId, setDeleteId]                 = useState(null);
  const [realizarPrevisao, setRealizarPrevisao] = useState(null);
  const [recurringModal, setRecurringModal] = useState(null); // { type: "edit"|"delete", transaction }
  const [showAdvanced, setShowAdvanced]         = useState(false);
  const [showSort, setShowSort]                 = useState(false);
  const [sortBy, setSortBy]                     = useState("date");
  const [sortDir, setSortDir]                   = useState("desc");
  const [advFilters, setAdvFilters]             = useState({
    categories: [], accountIds: [], minAmount: "", maxAmount: "", dateFrom: "", dateTo: "",
  });

  const hasAdvFilters =
    advFilters.categories.length > 0 || advFilters.accountIds.length > 0 ||
    advFilters.minAmount !== "" || advFilters.maxAmount !== "" ||
    advFilters.dateFrom !== "" || advFilters.dateTo !== "";

  const clearAdvFilters = () =>
    setAdvFilters({ categories: [], accountIds: [], minAmount: "", maxAmount: "", dateFrom: "", dateTo: "" });

  const toggleCategory = (cat) =>
    setAdvFilters(prev => ({
      ...prev,
      categories: prev.categories.includes(cat)
        ? prev.categories.filter(c => c !== cat)
        : [...prev.categories, cat],
    }));

  const toggleAccount = (id) =>
    setAdvFilters(prev => ({
      ...prev,
      accountIds: prev.accountIds.includes(id)
        ? prev.accountIds.filter(a => a !== id)
        : [...prev.accountIds, id],
    }));

  useEffect(() => {
    const monthParam = searchParams.get("month");
    if (monthParam) setSelectedDate(new Date(monthParam + "-02"));
    const filterParam = searchParams.get("filter");
    if (filterParam) setFilter(filterParam);
  }, []);

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts", activeOwnerId],
    queryFn: async () => {
      const { data, error } = await supabase.from("accounts").select("*").eq("user_id", activeOwnerId);
      if (error) throw error; return data;
    },
    enabled: !!activeOwnerId,
  });

  const { data: creditCards = [] } = useQuery({
    queryKey: ["credit_cards", activeOwnerId],
    queryFn: async () => {
      const { data, error } = await supabase.from("credit_cards").select("*").eq("user_id", activeOwnerId).eq("is_active", true);
      if (error) throw error; return data;
    },
    enabled: !!activeOwnerId,
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ["transactions", activeOwnerId],
    queryFn: async () => {
      const { data, error } = await supabase.from("transactions").select("*").eq("user_id", activeOwnerId).order("date", { ascending: false });
      if (error) throw error; return data;
    },
    enabled: !!activeOwnerId,
  });

  const createMutation = useMutation({
    mutationFn: async (data) => {
      if (data.is_recurring) {
        // Gera um group_id único para toda a série
        const groupId = crypto.randomUUID();
        const baseDate = new Date(data.date + "T00:00:00");
        const endDate = data.recurring_end_date ? new Date(data.recurring_end_date + "T00:00:00") : null;
        const inserts = [];
        let current = new Date(baseDate);
        let count = 0;
        const maxOccurrences = 24; // máximo 24 meses

        while (count < maxOccurrences) {
          if (endDate && current > endDate) break;
          const dateStr = current.toISOString().split("T")[0];
          inserts.push({
            ...data,
            user_id: activeOwnerId,
            date: dateStr,
            is_realized: false,
            is_recurring: false, // instâncias individuais não são recorrentes
            recurring_group_id: groupId,
            recurring_end_date: null,
            recurring_frequency: null,
            recurring_day: null,
          });
          // Avança para próxima ocorrência
          if (data.recurring_frequency === "monthly") {
            current.setMonth(current.getMonth() + 1);
          } else if (data.recurring_frequency === "weekly") {
            current.setDate(current.getDate() + 7);
          } else if (data.recurring_frequency === "yearly") {
            current.setFullYear(current.getFullYear() + 1);
          }
          count++;
          if (!endDate && count >= 12) break; // sem data fim = 12 meses
        }
        const { error } = await supabase.from("transactions").insert(inserts);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("transactions").insert([{ ...data, user_id: activeOwnerId }]);
        if (error) throw error;
      }
    },
    onSuccess: (_, data) => {
      queryClient.invalidateQueries({ queryKey: ["transactions", activeOwnerId] });
      setShowForm(false);
      toast.success(data?.is_recurring ? "Recorrência criada!" : "Transação criada!");
    },
    onError: (err) => toast.error("Erro: " + err.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data, scope, transaction }) => {
      if (!scope || scope === "only") {
        // Apenas este — mantém no grupo mas atualiza só este
        const { error } = await supabase.from("transactions").update(data).eq("id", id);
        if (error) throw error;
      } else if (scope === "future" && transaction?.recurring_group_id) {
        // Este e os seguintes — preserva as datas individuais (exclui date do update)
        const { date: _d, ...dataWithoutDate } = data;
        const { error } = await supabase.from("transactions").update(dataWithoutDate)
          .eq("recurring_group_id", transaction.recurring_group_id)
          .gte("date", transaction.date);
        if (error) throw error;
      } else if (scope === "all" && transaction?.recurring_group_id) {
        // Todos — preserva as datas individuais (exclui date do update)
        const { date: _d, ...dataWithoutDate } = data;
        const { error } = await supabase.from("transactions").update(dataWithoutDate)
          .eq("recurring_group_id", transaction.recurring_group_id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("transactions").update(data).eq("id", id);
        if (error) throw error;
      }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["transactions", activeOwnerId] }); setEditTransaction(null); setShowForm(false); setRecurringModal(null); toast.success("Atualizado!"); },
    onError: (err) => toast.error("Erro: " + err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ id, scope, transaction }) => {
      if (!scope || scope === "only") {
        // Apenas este
        const { error } = await supabase.from("transactions").delete().eq("id", id);
        if (error) throw error;
      } else if (scope === "future" && transaction?.recurring_group_id) {
        // Este e os seguintes
        const { error } = await supabase.from("transactions").delete()
          .eq("recurring_group_id", transaction.recurring_group_id)
          .gte("date", transaction.date);
        if (error) throw error;
      } else if (scope === "all" && transaction?.recurring_group_id) {
        // Todos
        const { error } = await supabase.from("transactions").delete()
          .eq("recurring_group_id", transaction.recurring_group_id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("transactions").delete().eq("id", id);
        if (error) throw error;
      }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["transactions", activeOwnerId] }); setDeleteId(null); setRecurringModal(null); toast.success("Excluído!"); },
    onError: (err) => toast.error("Erro: " + err.message),
  });

  // ✅ realizarMutation corrigido — usa dataRealizacao do modal
  const realizarMutation = useMutation({
    mutationFn: async ({ transaction, valorRealizado, dataRealizacao }) => {
      const restante = Number(transaction.amount) - valorRealizado;

      // Atualiza a transação original com o valor pago e a data real
      const { error: errUpdate } = await supabase.from("transactions").update({
        is_realized: true,
        amount: valorRealizado,
        date: dataRealizacao, // ← data de hoje (ou editada pelo usuário)
      }).eq("id", transaction.id);
      if (errUpdate) throw errUpdate;

      // Se pagamento parcial, cria nova previsão com o restante na data original
      if (restante > 0.01) {
        const { error: errInsert } = await supabase.from("transactions").insert([{
          description: transaction.description,
          amount: restante,
          type: transaction.type,
          category: transaction.category,
          account_id: transaction.account_id,
          date: transaction.date, // ← mantém a data prevista original
          is_realized: false,
          notes: transaction.notes,
          user_id: activeOwnerId,
        }]);
        if (errInsert) throw errInsert;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions", activeOwnerId] });
      setRealizarPrevisao(null);
      toast.success("Realização registrada!");
    },
    onError: (err) => toast.error("Erro: " + (err.message || JSON.stringify(err))),
  });

  const duplicarMutation = useMutation({
    mutationFn: async ({ transaction, meses }) => {
      const dia = transaction.date.split("-")[2];
      const inserts = meses.map((mes) => ({
        description: transaction.description, amount: Number(transaction.amount), type: transaction.type,
        category: transaction.category, account_id: transaction.account_id,
        date: `${mes}-${dia}`, is_realized: false, notes: transaction.notes, user_id: activeOwnerId,
      }));
      const { error } = await supabase.from("transactions").insert(inserts);
      if (error) throw error;
    },
    onSuccess: (_, { meses }) => { queryClient.invalidateQueries({ queryKey: ["transactions", activeOwnerId] }); toast.success(`Duplicado em ${meses.length} ${meses.length === 1 ? "mês" : "meses"}!`); },
    onError: (err) => toast.error("Erro: " + err.message),
  });

  const handleEdit = (t) => {
    if (t.recurring_group_id) {
      setRecurringModal({ type: "edit", transaction: t });
    } else {
      setEditTransaction(t); setShowForm(true);
    }
  };

  const handleDelete = (id) => {
    const t = transactions.find(tx => tx.id === id);
    if (t?.recurring_group_id) {
      setRecurringModal({ type: "delete", transaction: t });
    } else {
      deleteMutation.mutate({ id });
    }
  };

  const handleRecurringSelect = (scope) => {
    const { type, transaction } = recurringModal;
    if (type === "edit") {
      setEditTransaction(transaction);
      setShowForm(true);
      // Salva o scope para usar no submit
      recurringScopeRef.current = scope;
    } else {
      deleteMutation.mutate({ id: transaction.id, scope, transaction });
    }
    if (type === "edit") setRecurringModal(null);
  };

  const recurringScopeRef = useRef(null); // useRef evita problema de closure com useState

  const handleSubmit = (data) => {
    if (editTransaction) {
      updateMutation.mutate({ id: editTransaction.id, data, scope: recurringScopeRef.current, transaction: editTransaction });
      recurringScopeRef.current = null;
    } else {
      createMutation.mutate(data);
    }
  };

  const monthStart = startOfMonth(selectedDate);
  const monthEnd   = endOfMonth(selectedDate);

  const accountMap = useMemo(() => {
    const m = {};
    accounts.forEach(a => { m[a.id] = a; });
    return m;
  }, [accounts]);

  const filteredTransactions = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return transactions
      .filter(t => isWithinInterval(parseISO(t.date), { start: monthStart, end: monthEnd }))
      .filter(t => {
        if (filter === "income")   return t.type === "income";
        if (filter === "expense")  return t.type === "expense";
        if (filter === "transfer") return t.type === "transfer";
        if (filter === "realized") return t.is_realized !== false;
        if (filter === "planned")  return t.is_realized === false;
        if (filter === "cards")    return !!t.credit_card_id; // só transações de cartão
        return true;
      })
      .filter(t => {
        if (!q) return true;
        const accName = accountMap[t.account_id]?.name?.toLowerCase() || "";
        const amtStr  = fmt(Number(t.amount)).toLowerCase();
        const amtNum  = String(t.amount);
        return (
          t.description?.toLowerCase().includes(q) ||
          t.category?.toLowerCase().includes(q) ||
          t.notes?.toLowerCase().includes(q) ||
          accName.includes(q) ||
          amtStr.includes(q) ||
          amtNum.includes(q)
        );
      })
      .filter(t => advFilters.categories.length === 0 || advFilters.categories.includes(t.category?.toLowerCase()))
      .filter(t => advFilters.accountIds.length === 0 || advFilters.accountIds.includes(t.account_id))
      .filter(t => advFilters.minAmount === "" || Number(t.amount) >= parseFloat(advFilters.minAmount))
      .filter(t => advFilters.maxAmount === "" || Number(t.amount) <= parseFloat(advFilters.maxAmount))
      .filter(t => {
        if (!advFilters.dateFrom && !advFilters.dateTo) return true;
        const d = parseISO(t.date);
        if (advFilters.dateFrom && advFilters.dateTo) {
          const from = parseISO(advFilters.dateFrom);
          const to   = parseISO(advFilters.dateTo);
          return (isAfter(d, from) || isEqual(d, from)) && (isBefore(d, to) || isEqual(d, to));
        }
        if (advFilters.dateFrom) return isAfter(d, parseISO(advFilters.dateFrom)) || isEqual(d, parseISO(advFilters.dateFrom));
        if (advFilters.dateTo)   return isBefore(d, parseISO(advFilters.dateTo))  || isEqual(d, parseISO(advFilters.dateTo));
        return true;
      });
  }, [transactions, monthStart, monthEnd, filter, searchQuery, advFilters, accountMap]);

  // Aplica ordenação
  const sortedTransactions = useMemo(() => {
    return [...filteredTransactions].sort((a, b) => {
      let valA, valB;
      if (sortBy === "date")        { valA = a.date; valB = b.date; }
      else if (sortBy === "amount") { valA = Number(a.amount); valB = Number(b.amount); }
      else if (sortBy === "description") { valA = a.description?.toLowerCase(); valB = b.description?.toLowerCase(); }
      else if (sortBy === "category")    { valA = a.category?.toLowerCase(); valB = b.category?.toLowerCase(); }
      else { valA = a.date; valB = b.date; }
      if (valA < valB) return sortDir === "asc" ? -1 : 1;
      if (valA > valB) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [filteredTransactions, sortBy, sortDir]);

  const summary = useMemo(() => {
    const invIds = new Set(accounts.filter(a => a.type === "investment").map(a => a.id));
    const tx = filteredTransactions.filter(t => !invIds.has(t.account_id));
    const income  = tx.filter(t => t.type === "income").reduce((s,t) => s + Number(t.amount), 0);
    const expense = tx.filter(t => t.type === "expense").reduce((s,t) => s + Number(t.amount), 0);
    return { income, expense, balance: income - expense };
  }, [filteredTransactions, accounts]);

  const FILTERS = [
    { value: "all",      label: "Todos"          },
    { value: "cards",    label: "💳 Faturas"     },
    { value: "realized", label: "Realizados"     },
    { value: "planned",  label: "Previstos"      },
    { value: "income",   label: "Entradas"       },
    { value: "expense",  label: "Saídas"         },
    { value: "transfer", label: "Transferências" },
  ];

  const bg       = dark ? "#060709" : "#f1f4f9";
  const cardBg   = dark ? "#0c0e13" : "#ffffff";
  const cardBrd  = dark ? "rgba(255,255,255,0.07)" : "rgba(17,24,39,0.05)";
  const text     = dark ? "#e8edf5" : "#0f172a";
  const muted    = dark ? "#6b7a96" : "#64748b";
  const linkCol  = dark ? "#60a5fa" : "#1d4ed8";
  const inputBg  = dark ? "#12151c" : "#f8fafc";
  const inputBrd = dark ? "rgba(255,255,255,0.08)" : "rgba(17,24,39,0.1)";



  return (
    <div style={{ minHeight: "100vh", background: bg, paddingBottom: 96, fontFamily: "'Outfit',sans-serif" }}>

      {/* ══ HEADER ══════════════════════════════════════════════ */}
      <div style={{
        position: "sticky", top: 0, zIndex: 20,
        isolation: "isolate", overflow: "hidden",
        borderRadius: "0 0 28px 28px",
        boxShadow: dark ? "0 8px 32px rgba(0,0,0,0.5)" : "0 8px 32px rgba(29,78,216,0.2)",
        background: dark
          ? `radial-gradient(ellipse 70% 60% at 50% -10%, rgba(37,99,235,0.35) 0%, transparent 70%),
             radial-gradient(ellipse 40% 40% at 90% 110%, rgba(124,58,237,0.2) 0%, transparent 70%),
             linear-gradient(160deg, #06080f 0%, #0a1425 40%, #0d1e3a 100%)`
          : `radial-gradient(ellipse 70% 60% at 50% -10%, rgba(96,165,250,0.4) 0%, transparent 70%),
             radial-gradient(ellipse 40% 40% at 90% 110%, rgba(167,139,250,0.25) 0%, transparent 70%),
             linear-gradient(165deg, #1d4ed8 0%, #1e3a8a 55%, #312e81 100%)`,
      }}>
        <div style={{ padding: "52px 20px 0" }}>
          {isViewingSharedProfile && (
            <div style={{ background: "rgba(255,255,255,0.12)", borderRadius: 8, padding: "4px 12px", marginBottom: 10, fontSize: "0.72rem", color: "rgba(255,255,255,0.85)", display: "inline-block", fontWeight: 500 }}>
              👁 Visualizando perfil compartilhado
            </div>
          )}

          <p style={{ fontFamily: "'Cabinet Grotesk',sans-serif", fontWeight: 900, fontSize: "clamp(1.5rem,5vw,1.8rem)", color: "#ffffff", letterSpacing: "-0.03em", marginBottom: 8 }}>
            Transações
          </p>

          <MonthSelector selectedDate={selectedDate} onChange={setSelectedDate} />

          {/* Resumo 3 colunas */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1px 1fr 1px 1fr", background: "rgba(255,255,255,0.1)", borderRadius: 14, margin: "10px 0 0", overflow: "hidden" }}>
            {[
              { label: "Entradas", value: summary.income,  color: "#2ecc8a" },
              { label: "Saídas",   value: summary.expense, color: "#e85d5d" },
              { label: "Saldo",    value: summary.balance, color: summary.balance >= 0 ? "#ffffff" : "#e85d5d" },
            ].flatMap((item, i) => [
              i > 0 ? <div key={`sep-${i}`} style={{ background: "rgba(255,255,255,0.15)" }} /> : null,
              <div key={item.label} style={{ padding: "9px 6px", textAlign: "center" }}>
                <p style={{ fontSize: "0.56rem", fontWeight: 600, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 2 }}>{item.label}</p>
                <p style={{ fontFamily: "'Cabinet Grotesk',sans-serif", fontWeight: 800, fontSize: "0.85rem", color: item.color, letterSpacing: "-0.02em" }}>{fmt(item.value)}</p>
              </div>
            ]).filter(Boolean)}
          </div>

          {/* Busca */}
          <div style={{ display: "flex", gap: 8, margin: "10px 0 0" }}>
            <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.12)", border: `1px solid ${searchFocused ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.15)"}`, borderRadius: 12, padding: "0 12px", height: 38, transition: "border-color .2s" }}>
              <Search size={13} color="rgba(255,255,255,0.5)" />
              <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onFocus={() => setSearchFocused(true)} onBlur={() => setSearchFocused(false)}
                placeholder="Título, categoria, valor, conta..."
                style={{ flex: 1, background: "none", border: "none", outline: "none", color: "#ffffff", fontSize: "0.82rem", fontFamily: "'Outfit',sans-serif" }}
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.5)", display: "flex" }}>
                  <X size={13} />
                </button>
              )}
            </div>
            <button onClick={() => setShowAdvanced(!showAdvanced)}
              style={{ width: 38, height: 38, borderRadius: 12, flexShrink: 0, background: showAdvanced || hasAdvFilters ? "#ffffff" : "rgba(255,255,255,0.12)", border: `1px solid ${showAdvanced || hasAdvFilters ? "transparent" : "rgba(255,255,255,0.15)"}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", position: "relative", transition: "all .2s" }}>
              <SlidersHorizontal size={15} color={showAdvanced || hasAdvFilters ? "#1d4ed8" : "rgba(255,255,255,0.9)"} />
              {hasAdvFilters && <div style={{ position: "absolute", top: -4, right: -4, width: 10, height: 10, background: "#f59e0b", borderRadius: "50%", border: "2px solid #1e3a8a" }} />}
            </button>
          </div>

          {/* Pills filtro */}
          <div style={{ display: "flex", gap: 6, padding: "8px 0 14px", overflowX: "auto", alignItems: "center" }}>
            {FILTERS.map(({ value, label }) => (
              <button key={value} onClick={() => setFilter(value)}
                style={{ flexShrink: 0, padding: "4px 13px", borderRadius: 999, fontSize: "0.73rem", fontWeight: 600, fontFamily: "'Outfit',sans-serif", background: filter === value ? "#ffffff" : "rgba(255,255,255,0.13)", color: filter === value ? "#1d4ed8" : "rgba(255,255,255,0.9)", border: filter === value ? "none" : "0.5px solid rgba(255,255,255,0.18)", cursor: "pointer", transition: "all .2s" }}>
                {label}
              </button>
            ))}
            {/* Botão sort — discreto, no final das pills */}
            <button onClick={() => setShowSort(true)}
              style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 999, fontSize: "0.73rem", fontWeight: 600, fontFamily: "'Outfit',sans-serif", background: (sortBy !== "date" || sortDir !== "desc") ? "#ffffff" : "rgba(255,255,255,0.13)", color: (sortBy !== "date" || sortDir !== "desc") ? "#1d4ed8" : "rgba(255,255,255,0.9)", border: (sortBy !== "date" || sortDir !== "desc") ? "none" : "0.5px solid rgba(255,255,255,0.18)", cursor: "pointer", transition: "all .2s" }}>
              <ArrowUpDown size={11} />
              {sortBy === "date" ? "Ordenar" : sortBy === "amount" ? "Valor" : sortBy === "category" ? "Categoria" : "Descrição"}
            </button>
          </div>
        </div>
      </div>

      {/* ══ FILTROS AVANÇADOS ═══════════════════════════════════ */}
      <AnimatePresence>
        {showAdvanced && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
            style={{ overflow: "hidden", background: cardBg, borderBottom: `1px solid ${cardBrd}` }}>
            <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <p style={{ fontFamily: "'Cabinet Grotesk',sans-serif", fontSize: "0.88rem", fontWeight: 700, color: text }}>Filtros avançados</p>
                {hasAdvFilters && (
                  <button onClick={clearAdvFilters} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "0.72rem", color: "#e85d5d", fontWeight: 600, background: "none", border: "none", cursor: "pointer" }}>
                    <X size={12} /> Limpar tudo
                  </button>
                )}
              </div>

              <div>
                <p style={{ fontSize: "0.63rem", fontWeight: 600, color: muted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}>
                  <Calendar size={11} /> Período
                </p>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input type="date" value={advFilters.dateFrom} onChange={e => setAdvFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
                    style={{ flex: 1, height: 36, padding: "0 10px", borderRadius: 10, border: `1px solid ${inputBrd}`, background: inputBg, color: text, fontSize: "0.8rem", outline: "none" }} />
                  <span style={{ fontSize: "0.7rem", color: muted, flexShrink: 0 }}>até</span>
                  <input type="date" value={advFilters.dateTo} onChange={e => setAdvFilters(prev => ({ ...prev, dateTo: e.target.value }))}
                    style={{ flex: 1, height: 36, padding: "0 10px", borderRadius: 10, border: `1px solid ${inputBrd}`, background: inputBg, color: text, fontSize: "0.8rem", outline: "none" }} />
                </div>
              </div>

              <div>
                <p style={{ fontSize: "0.63rem", fontWeight: 600, color: muted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Valor (R$)</p>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input type="number" placeholder="Mínimo" value={advFilters.minAmount} onChange={e => setAdvFilters(prev => ({ ...prev, minAmount: e.target.value }))}
                    style={{ flex: 1, height: 36, padding: "0 12px", borderRadius: 10, border: `1px solid ${inputBrd}`, background: inputBg, color: text, fontSize: "0.82rem", outline: "none" }} />
                  <span style={{ fontSize: "0.7rem", color: muted, flexShrink: 0 }}>até</span>
                  <input type="number" placeholder="Máximo" value={advFilters.maxAmount} onChange={e => setAdvFilters(prev => ({ ...prev, maxAmount: e.target.value }))}
                    style={{ flex: 1, height: 36, padding: "0 12px", borderRadius: 10, border: `1px solid ${inputBrd}`, background: inputBg, color: text, fontSize: "0.82rem", outline: "none" }} />
                </div>
              </div>

              <div>
                <p style={{ fontSize: "0.63rem", fontWeight: 600, color: muted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Categoria</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {CATEGORIES.map(cat => (
                    <button key={cat} onClick={() => toggleCategory(cat)}
                      style={{ padding: "4px 11px", borderRadius: 999, fontSize: "0.7rem", fontWeight: 600, background: advFilters.categories.includes(cat) ? "#1d4ed8" : (dark ? "#12151c" : "#f1f4f9"), color: advFilters.categories.includes(cat) ? "#ffffff" : muted, border: advFilters.categories.includes(cat) ? "none" : `1px solid ${cardBrd}`, cursor: "pointer", textTransform: "capitalize", transition: "all .15s" }}>
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {accounts.length > 0 && (
                <div>
                  <p style={{ fontSize: "0.63rem", fontWeight: 600, color: muted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Conta</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {accounts.map(acc => (
                      <button key={acc.id} onClick={() => toggleAccount(acc.id)}
                        style={{ padding: "4px 11px", borderRadius: 999, fontSize: "0.7rem", fontWeight: 600, background: advFilters.accountIds.includes(acc.id) ? "#1d4ed8" : (dark ? "#12151c" : "#f1f4f9"), color: advFilters.accountIds.includes(acc.id) ? "#ffffff" : muted, border: advFilters.accountIds.includes(acc.id) ? "none" : `1px solid ${cardBrd}`, cursor: "pointer", transition: "all .15s" }}>
                        {acc.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ background: dark ? "rgba(37,99,235,0.1)" : "rgba(29,78,216,0.06)", border: `1px solid ${dark ? "rgba(37,99,235,0.2)" : "rgba(29,78,216,0.12)"}`, borderRadius: 10, padding: "7px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <p style={{ fontSize: "0.73rem", color: linkCol, fontWeight: 600 }}>
                  {filteredTransactions.length} transação(ões) encontrada(s)
                </p>
                {(searchQuery || hasAdvFilters) && (
                  <p style={{ fontSize: "0.65rem", color: muted }}>{fmt(summary.balance)} líquido</p>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══ LISTA ═══════════════════════════════════════════════ */}
      <div style={{ padding: "14px 14px 0" }}>
        {filteredTransactions.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {sortedTransactions.map((transaction) => (
              <motion.div key={transaction.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}>
                <TransactionItem
                  transaction={transaction}
                  accounts={accounts}
                  creditCards={creditCards}
                  onRegistrar={(t) => setRealizarPrevisao(t)}
                  onDuplicar={(t, meses) => duplicarMutation.mutate({ transaction: t, meses })}
                  onEdit={canAdd ? handleEdit : null}
                  onDelete={canDelete ? handleDelete : null}
                />
              </motion.div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={TrendingUp}
            title="Nenhuma transação"
            description={searchQuery || hasAdvFilters ? "Tente ajustar os filtros." : "Período sem dados."}
            action={canAdd && !searchQuery && !hasAdvFilters ? "Adicionar" : undefined}
            onAction={() => canAdd && setShowForm(true)}
          />
        )}
      </div>

      {/* FAB */}
      {canAdd && (
        <motion.button whileTap={{ scale: 0.88 }} whileHover={{ scale: 1.06 }}
          onClick={() => { setEditTransaction(null); setShowForm(true); }}
          style={{ position: "fixed", bottom: 88, right: 20, width: 52, height: 52, background: "linear-gradient(135deg,#1d4ed8,#3730a3)", border: "none", borderRadius: "50%", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 24px rgba(29,78,216,0.5),0 4px 14px rgba(0,0,0,0.25)", zIndex: 40 }}>
          <Plus size={21} color="#fff" />
        </motion.button>
      )}

      <AnimatePresence>
        {showForm && (
          <TransactionForm accounts={accounts} onSubmit={handleSubmit}
            onClose={() => { setShowForm(false); setEditTransaction(null); }}
            initialType={editTransaction?.type || "expense"} initialData={editTransaction} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {realizarPrevisao && (
          <RealizarPrevisaoModal
            transaction={realizarPrevisao}
            onConfirm={(dados) => realizarMutation.mutate(dados)}
            onClose={() => setRealizarPrevisao(null)}
          />
        )}
      </AnimatePresence>

      {/* ══ SORT BOTTOM SHEET ═══════════════════════════════ */}
      <AnimatePresence>
        {showSort && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)", zIndex: 60, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
            onClick={() => setShowSort(false)}>
            <motion.div initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              onClick={e => e.stopPropagation()}
              style={{ background: dark ? "#0c0e13" : "#ffffff", border: `0.5px solid ${dark ? "rgba(255,255,255,0.08)" : "rgba(17,24,39,0.08)"}`, borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480, boxShadow: "0 -8px 40px rgba(0,0,0,0.2)", overflow: "hidden" }}>

              {/* Header */}
              <div style={{ padding: "16px 20px 12px", borderBottom: `0.5px solid ${dark ? "rgba(255,255,255,0.06)" : "rgba(17,24,39,0.06)"}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <h2 style={{ fontFamily: "'Cabinet Grotesk', sans-serif", fontWeight: 800, fontSize: "0.95rem", color: dark ? "#e8edf5" : "#0f172a", margin: 0 }}>
                  Ordenar por
                </h2>
                <button onClick={() => setShowSort(false)} style={{ width: 28, height: 28, borderRadius: 8, border: "none", background: dark ? "rgba(255,255,255,0.06)" : "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                  <X size={14} color={dark ? "#6b7a96" : "#64748b"} />
                </button>
              </div>

              {/* Direção ASC / DESC */}
              <div style={{ display: "flex", gap: 8, padding: "12px 20px", borderBottom: `0.5px solid ${dark ? "rgba(255,255,255,0.06)" : "rgba(17,24,39,0.06)"}` }}>
                {[
                  { key: "desc", Icon: ArrowDown, label: "Decrescente" },
                  { key: "asc",  Icon: ArrowUp,   label: "Crescente"  },
                ].map(({ key, Icon, label }) => (
                  <button key={key} onClick={() => setSortDir(key)}
                    style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, height: 38, borderRadius: 10, border: `1.5px solid ${sortDir === key ? "#1d4ed8" : (dark ? "rgba(255,255,255,0.08)" : "#e2e8f0")}`, background: sortDir === key ? "rgba(29,78,216,0.1)" : "transparent", color: sortDir === key ? "#60a5fa" : (dark ? "#6b7a96" : "#64748b"), fontSize: "0.78rem", fontWeight: 700, fontFamily: "'Outfit',sans-serif", cursor: "pointer", transition: "all .15s" }}>
                    <Icon size={13} />{label}
                  </button>
                ))}
              </div>

              {/* Campos */}
              <div style={{ padding: "8px 0 12px" }}>
                {[
                  { key: "date",        emoji: "📅", label: "Data" },
                  { key: "amount",      emoji: "💰", label: "Valor" },
                  { key: "category",    emoji: "🏷️", label: "Categoria" },
                  { key: "description", emoji: "📝", label: "Descrição" },
                ].map(({ key, emoji, label }) => (
                  <button key={key} onClick={() => { setSortBy(key); setShowSort(false); }}
                    style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", border: "none", background: sortBy === key ? (dark ? "rgba(29,78,216,0.08)" : "rgba(29,78,216,0.04)") : "transparent", cursor: "pointer" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: "1rem" }}>{emoji}</span>
                      <span style={{ fontFamily: "'Cabinet Grotesk', sans-serif", fontWeight: sortBy === key ? 700 : 500, fontSize: "0.88rem", color: sortBy === key ? "#60a5fa" : (dark ? "#e8edf5" : "#0f172a") }}>{label}</span>
                    </div>
                    {sortBy === key && <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#60a5fa" }} />}
                  </button>
                ))}
              </div>

              <div style={{ padding: "0 20px 28px" }}>
                <button onClick={() => { setSortBy("date"); setSortDir("desc"); setShowSort(false); }}
                  style={{ width: "100%", height: 40, borderRadius: 10, border: `1px solid ${dark ? "rgba(255,255,255,0.08)" : "#e2e8f0"}`, background: "transparent", color: dark ? "#6b7a96" : "#64748b", fontFamily: "'Cabinet Grotesk',sans-serif", fontWeight: 600, fontSize: "0.82rem", cursor: "pointer" }}>
                  Restaurar padrão
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {recurringModal && (
          <RecurringEditModal
            mode={recurringModal.type}
            transaction={recurringModal.transaction}
            transactions={transactions}
            onSelect={handleRecurringSelect}
            onClose={() => setRecurringModal(null)}
          />
        )}
      </AnimatePresence>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir transação?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteMutation.mutate(deleteId)} style={{ background: "#dc2626", color: "#ffffff", border: "none" }}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}