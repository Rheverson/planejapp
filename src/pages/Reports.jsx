// src/pages/Reports.jsx
import React, { useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthContext";
import { useSharedProfile } from "@/lib/SharedProfileContext";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  startOfMonth, endOfMonth, subMonths, format,
  isWithinInterval, parseISO, isBefore, differenceInDays
} from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line
} from "recharts";
import { TrendingUp, TrendingDown, Target, Wallet, ChevronLeft, ChevronRight, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { useMonth } from "@/lib/MonthContext";

// ── Paleta de cores por categoria ───────────────────────────
const CATEGORY_COLORS = {
  alimentação: "#f97316",
  moradia:     "#3b82f6",
  transporte:  "#8b5cf6",
  saúde:       "#10b981",
  educação:    "#06b6d4",
  lazer:       "#f59e0b",
  compras:     "#ec4899",
  outros:      "#6b7280",
  salário:     "#22c55e",
  freelance:   "#a3e635",
  comissão:    "#fbbf24",
  investimentos:"#34d399",
  presente:    "#f472b6",
};
const DEFAULT_COLOR = "#94a3b8";
const getColor = (cat) => CATEGORY_COLORS[cat?.toLowerCase()] || DEFAULT_COLOR;

const fmt = (v) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
const fmtShort = (v) => {
  if (Math.abs(v) >= 1000) return `R$${(v / 1000).toFixed(1)}k`;
  return `R$${v.toFixed(0)}`;
};

// ── Seção com título ─────────────────────────────────────────
function Section({ title, children, className = "" }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden ${className}`}
    >
      <div className="px-4 pt-4 pb-2">
        <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">{title}</h3>
      </div>
      {children}
    </motion.div>
  );
}

// ── Gráfico de rosca customizado ─────────────────────────────
function DonutChart({ data, total }) {
  const [active, setActive] = useState(null);

  if (!data.length) return (
    <div className="flex items-center justify-center h-48 text-gray-300 text-sm">Sem dados</div>
  );

  return (
    <div className="flex items-center gap-4 px-4 pb-4">
      {/* Rosca */}
      <div className="relative flex-shrink-0" style={{ width: 140, height: 140 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%" cy="50%"
              innerRadius={42} outerRadius={62}
              paddingAngle={2}
              dataKey="value"
              onMouseEnter={(_, i) => setActive(i)}
              onMouseLeave={() => setActive(null)}
            >
              {data.map((entry, i) => (
                <Cell
                  key={entry.name}
                  fill={entry.color}
                  opacity={active === null || active === i ? 1 : 0.4}
                  stroke="none"
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        {/* Centro */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          {active !== null ? (
            <>
              <span className="text-xs font-bold text-gray-900 dark:text-white leading-tight text-center px-1">
                {data[active]?.name}
              </span>
              <span className="text-xs text-gray-500">
                {data[active]?.percent}%
              </span>
            </>
          ) : (
            <>
              <span className="text-xs text-gray-400">Total</span>
              <span className="text-xs font-bold text-gray-900 dark:text-white">{fmtShort(total)}</span>
            </>
          )}
        </div>
      </div>

      {/* Legenda */}
      <div className="flex-1 space-y-1.5 min-w-0">
        {data.slice(0, 6).map((item, i) => (
          <div
            key={item.name}
            className={`flex items-center gap-2 cursor-pointer transition-opacity ${
              active === null || active === i ? "opacity-100" : "opacity-40"
            }`}
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive(null)}
          >
            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
            <span className="text-xs text-gray-600 dark:text-gray-300 truncate capitalize flex-1">{item.name}</span>
            <span className="text-xs font-semibold text-gray-900 dark:text-white flex-shrink-0">{item.percent}%</span>
          </div>
        ))}
        {data.length > 6 && (
          <p className="text-xs text-gray-400 pl-4">+{data.length - 6} outras</p>
        )}
      </div>
    </div>
  );
}

// ── Card de KPI ──────────────────────────────────────────────
function KpiCard({ label, value, sub, color, Icon, delay = 0 }) {
  const colors = {
    green:  { bg: "bg-emerald-50 dark:bg-emerald-950", text: "text-emerald-600 dark:text-emerald-400", icon: "bg-emerald-100 dark:bg-emerald-900" },
    red:    { bg: "bg-red-50 dark:bg-red-950",         text: "text-red-600 dark:text-red-400",         icon: "bg-red-100 dark:bg-red-900" },
    blue:   { bg: "bg-blue-50 dark:bg-blue-950",       text: "text-blue-600 dark:text-blue-400",       icon: "bg-blue-100 dark:bg-blue-900" },
    purple: { bg: "bg-purple-50 dark:bg-purple-950",   text: "text-purple-600 dark:text-purple-400",   icon: "bg-purple-100 dark:bg-purple-900" },
  };
  const c = colors[color] || colors.blue;
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}
      className={`${c.bg} rounded-2xl p-4`}
    >
      <div className={`w-8 h-8 ${c.icon} rounded-xl flex items-center justify-center mb-2`}>
        <Icon className={`w-4 h-4 ${c.text}`} />
      </div>
      <p className={`text-lg font-bold ${c.text} leading-tight`}>{value}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{label}</p>
      {sub && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{sub}</p>}
    </motion.div>
  );
}

// ── Barra de progresso de meta ───────────────────────────────
function GoalBar({ goal }) {
  const pct = Math.min((goal.current / goal.target_amount) * 100, 100);
  const over = goal.current > goal.target_amount;
  const isExpense = goal.type === "expense";
  const barColor = isExpense
    ? pct >= 100 ? "#ef4444" : pct >= 80 ? "#f97316" : "#3b82f6"
    : pct >= 100 ? "#22c55e" : "#3b82f6";

  return (
    <div className="px-4 py-3 border-b border-gray-50 dark:border-gray-700 last:border-0">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: barColor }} />
          <span className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{goal.name}</span>
          {goal.category && (
            <span className="text-xs text-gray-400 capitalize hidden sm:block">· {goal.category}</span>
          )}
        </div>
        <span className="text-xs font-bold text-gray-700 dark:text-gray-300 flex-shrink-0 ml-2">
          {pct.toFixed(0)}%
        </span>
      </div>
      <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1.5 mb-1">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="h-1.5 rounded-full"
          style={{ backgroundColor: barColor }}
        />
      </div>
      <div className="flex justify-between">
        <span className="text-xs text-gray-400">{fmt(goal.current)}</span>
        <span className="text-xs text-gray-400">meta: {fmt(goal.target_amount)}</span>
      </div>
    </div>
  );
}

// ── Tooltip customizado para BarChart ────────────────────────
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-gray-700 dark:text-gray-300 mb-1">{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name === "income" ? "Entradas" : "Saídas"}: {fmt(p.value)}
        </p>
      ))}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ════════════════════════════════════════════════════════════
export default function Reports() {
  const { user } = useAuth();
  const { activeOwnerId } = useSharedProfile();
  const { selectedDate } = useMonth();
  const [activeTab, setActiveTab] = useState("overview");

  // ── Dados ──────────────────────────────────────────────────
  const { data: transactions = [] } = useQuery({
    queryKey: ["transactions", activeOwnerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions").select("*")
        .eq("user_id", activeOwnerId)
        .order("date", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!activeOwnerId,
  });

  const { data: goals = [] } = useQuery({
    queryKey: ["goals", activeOwnerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("goals").select("*")
        .eq("user_id", activeOwnerId);
      if (error) throw error;
      return data;
    },
    enabled: !!activeOwnerId,
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts", activeOwnerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accounts").select("*")
        .eq("user_id", activeOwnerId);
      if (error) throw error;
      return data;
    },
    enabled: !!activeOwnerId,
  });

  // ── Período atual (mês selecionado) ────────────────────────
  const monthStart = startOfMonth(selectedDate);
  const monthEnd   = endOfMonth(selectedDate);
  const monthLabel = format(selectedDate, "MMMM yyyy", { locale: ptBR });

  const monthTx = useMemo(() =>
    transactions.filter(t =>
      t.is_realized !== false &&
      isWithinInterval(parseISO(t.date), { start: monthStart, end: monthEnd })
    ), [transactions, monthStart, monthEnd]);

  const income  = useMemo(() => monthTx.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0),  [monthTx]);
  const expense = useMemo(() => monthTx.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0), [monthTx]);
  const balance = income - expense;
  const savingsRate = income > 0 ? ((balance / income) * 100).toFixed(1) : 0;

  // Mês anterior para comparação
  const prevMonthStart = startOfMonth(subMonths(selectedDate, 1));
  const prevMonthEnd   = endOfMonth(subMonths(selectedDate, 1));
  const prevTx = useMemo(() =>
    transactions.filter(t =>
      t.is_realized !== false &&
      isWithinInterval(parseISO(t.date), { start: prevMonthStart, end: prevMonthEnd })
    ), [transactions, prevMonthStart, prevMonthEnd]);
  const prevExpense = prevTx.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const expenseDiff = prevExpense > 0 ? (((expense - prevExpense) / prevExpense) * 100).toFixed(1) : null;

  // ── Despesas por categoria (rosca) ─────────────────────────
  const expenseByCategory = useMemo(() => {
    const map = {};
    monthTx.filter(t => t.type === "expense").forEach(t => {
      const cat = t.category || "outros";
      map[cat] = (map[cat] || 0) + t.amount;
    });
    return Object.entries(map)
      .map(([name, value]) => ({
        name, value,
        color: getColor(name),
        percent: expense > 0 ? ((value / expense) * 100).toFixed(1) : 0,
      }))
      .sort((a, b) => b.value - a.value);
  }, [monthTx, expense]);

  // ── Entradas por categoria ─────────────────────────────────
  const incomeByCategory = useMemo(() => {
    const map = {};
    monthTx.filter(t => t.type === "income").forEach(t => {
      const cat = t.category || "outros";
      map[cat] = (map[cat] || 0) + t.amount;
    });
    return Object.entries(map)
      .map(([name, value]) => ({
        name, value,
        color: getColor(name),
        percent: income > 0 ? ((value / income) * 100).toFixed(1) : 0,
      }))
      .sort((a, b) => b.value - a.value);
  }, [monthTx, income]);

  // ── Evolução últimos 6 meses ───────────────────────────────
  const last6Months = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => {
      const date  = subMonths(selectedDate, 5 - i);
      const start = startOfMonth(date);
      const end   = endOfMonth(date);
      const tx = transactions.filter(t =>
        t.is_realized !== false &&
        isWithinInterval(parseISO(t.date), { start, end })
      );
      return {
        name: format(date, "MMM", { locale: ptBR }),
        income:  tx.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0),
        expense: tx.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0),
      };
    });
  }, [transactions, selectedDate]);

  // ── Maiores gastos do mês ──────────────────────────────────
  const topExpenses = useMemo(() =>
    monthTx
      .filter(t => t.type === "expense")
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5),
    [monthTx]
  );

  // ── Progresso de metas ─────────────────────────────────────
  const goalsWithProgress = useMemo(() => {
    return goals
      .filter(g => !isBefore(parseISO(g.end_date), new Date()))
      .map(goal => {
        let current = 0;
        if (goal.linked_account_id) {
          const acc = accounts.find(a => a.id === goal.linked_account_id);
          current = acc?.initial_balance || 0;
          transactions.forEach(t => {
            if (t.account_id !== goal.linked_account_id || t.is_realized === false) return;
            current += t.type === "income" ? t.amount : -t.amount;
          });
        } else {
          const start = parseISO(goal.start_date);
          const end   = parseISO(goal.end_date);
          transactions.forEach(t => {
            if (t.is_realized === false || t.type !== goal.type) return;
            if (goal.category && t.category !== goal.category) return;
            if (isWithinInterval(parseISO(t.date), { start, end })) current += t.amount;
          });
        }
        return { ...goal, current };
      });
  }, [goals, transactions, accounts]);

  const tabs = [
    { key: "overview",  label: "Resumo"     },
    { key: "expenses",  label: "Despesas"   },
    { key: "income",    label: "Receitas"   },
    { key: "goals",     label: "Metas"      },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-24">

      {/* Header */}
      <div className="bg-gradient-to-br from-slate-800 via-slate-700 to-slate-900 text-white">
        <div className="px-5 pt-12 pb-5">
          <h1 className="text-2xl font-bold mb-1">Relatórios</h1>
          <p className="text-slate-400 text-sm capitalize">{monthLabel}</p>
        </div>

        {/* Tabs */}
        <div className="flex px-4 pb-0 gap-1">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 py-2.5 text-xs font-semibold rounded-t-xl transition-all ${
                activeTab === tab.key
                  ? "bg-gray-50 dark:bg-gray-900 text-slate-800 dark:text-white"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">

        {/* ── ABA RESUMO ─────────────────────────────────────── */}
        <AnimatePresence mode="wait">
          {activeTab === "overview" && (
            <motion.div key="overview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">

              {/* KPIs */}
              <div className="grid grid-cols-2 gap-3">
                <KpiCard label="Entradas" value={fmt(income)} color="green" Icon={TrendingUp} delay={0.05}
                  sub={`${monthTx.filter(t => t.type === "income").length} lançamentos`} />
                <KpiCard label="Saídas" value={fmt(expense)} color="red" Icon={TrendingDown} delay={0.1}
                  sub={expenseDiff !== null ? `${expenseDiff > 0 ? "+" : ""}${expenseDiff}% vs mês ant.` : undefined} />
                <KpiCard label="Saldo" value={fmt(balance)} color={balance >= 0 ? "blue" : "red"} Icon={Wallet} delay={0.15} />
                <KpiCard label="Taxa de poupança" value={`${savingsRate}%`} color="purple" Icon={Target} delay={0.2}
                  sub="da receita guardada" />
              </div>

              {/* Evolução 6 meses */}
              <Section title="Evolução — últimos 6 meses">
                <div className="px-2 pb-4" style={{ height: 180 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={last6Months} barSize={10} barGap={2}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                      <YAxis tickFormatter={fmtShort} tick={{ fontSize: 9, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={36} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="income"  fill="#34d399" radius={[4,4,0,0]} name="income"  />
                      <Bar dataKey="expense" fill="#f87171" radius={[4,4,0,0]} name="expense" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex justify-center gap-4 pb-3">
                  <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-emerald-400"/><span className="text-xs text-gray-500">Entradas</span></div>
                  <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-red-400"/><span className="text-xs text-gray-500">Saídas</span></div>
                </div>
              </Section>

              {/* Maiores gastos */}
              {topExpenses.length > 0 && (
                <Section title={`Top gastos — ${format(selectedDate, "MMM", { locale: ptBR })}`}>
                  <div className="divide-y divide-gray-50 dark:divide-gray-700">
                    {topExpenses.map((t, i) => (
                      <div key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                        <span className="text-xs font-bold text-gray-300 w-4">{i + 1}</span>
                        <div
                          className="w-2 h-6 rounded-full flex-shrink-0"
                          style={{ backgroundColor: getColor(t.category) }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{t.description}</p>
                          <p className="text-xs text-gray-400 capitalize">{t.category || "outros"}</p>
                        </div>
                        <span className="text-sm font-bold text-red-500">{fmt(t.amount)}</span>
                      </div>
                    ))}
                  </div>
                </Section>
              )}
            </motion.div>
          )}

          {/* ── ABA DESPESAS ────────────────────────────────── */}
          {activeTab === "expenses" && (
            <motion.div key="expenses" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">

              <Section title="Despesas por categoria">
                <DonutChart data={expenseByCategory} total={expense} />
              </Section>

              {/* Lista detalhada por categoria */}
              <Section title="Detalhamento">
                {expenseByCategory.length === 0 ? (
                  <p className="text-center text-sm text-gray-400 py-8">Sem despesas no período</p>
                ) : (
                  <div className="divide-y divide-gray-50 dark:divide-gray-700">
                    {expenseByCategory.map(cat => (
                      <div key={cat.name} className="px-4 py-3">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cat.color }} />
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300 capitalize">{cat.name}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-sm font-bold text-gray-900 dark:text-white">{fmt(cat.value)}</span>
                            <span className="text-xs text-gray-400 ml-2">{cat.percent}%</span>
                          </div>
                        </div>
                        <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${cat.percent}%` }}
                            transition={{ duration: 0.6 }}
                            className="h-1 rounded-full"
                            style={{ backgroundColor: cat.color }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              {/* Evolução de despesas */}
              <Section title="Tendência de saídas">
                <div className="px-2 pb-4" style={{ height: 160 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={last6Months}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                      <YAxis tickFormatter={fmtShort} tick={{ fontSize: 9, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={36} />
                      <Tooltip content={<CustomTooltip />} />
                      <Line type="monotone" dataKey="expense" stroke="#f87171" strokeWidth={2.5} dot={{ fill: "#f87171", r: 3 }} name="expense" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Section>
            </motion.div>
          )}

          {/* ── ABA RECEITAS ────────────────────────────────── */}
          {activeTab === "income" && (
            <motion.div key="income" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">

              <Section title="Receitas por categoria">
                <DonutChart data={incomeByCategory} total={income} />
              </Section>

              <Section title="Detalhamento">
                {incomeByCategory.length === 0 ? (
                  <p className="text-center text-sm text-gray-400 py-8">Sem receitas no período</p>
                ) : (
                  <div className="divide-y divide-gray-50 dark:divide-gray-700">
                    {incomeByCategory.map(cat => (
                      <div key={cat.name} className="px-4 py-3">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cat.color }} />
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300 capitalize">{cat.name}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-sm font-bold text-gray-900 dark:text-white">{fmt(cat.value)}</span>
                            <span className="text-xs text-gray-400 ml-2">{cat.percent}%</span>
                          </div>
                        </div>
                        <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${cat.percent}%` }}
                            transition={{ duration: 0.6 }}
                            className="h-1 rounded-full"
                            style={{ backgroundColor: cat.color }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              {/* Tendência de entradas */}
              <Section title="Tendência de entradas">
                <div className="px-2 pb-4" style={{ height: 160 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={last6Months}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                      <YAxis tickFormatter={fmtShort} tick={{ fontSize: 9, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={36} />
                      <Tooltip content={<CustomTooltip />} />
                      <Line type="monotone" dataKey="income" stroke="#34d399" strokeWidth={2.5} dot={{ fill: "#34d399", r: 3 }} name="income" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Section>
            </motion.div>
          )}

          {/* ── ABA METAS ───────────────────────────────────── */}
          {activeTab === "goals" && (
            <motion.div key="goals" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">

              {goalsWithProgress.length === 0 ? (
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-10 text-center border border-gray-100 dark:border-gray-700">
                  <Target className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                  <p className="text-sm text-gray-400">Nenhuma meta ativa</p>
                </div>
              ) : (
                <>
                  {/* Resumo rápido */}
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: "Total", value: goalsWithProgress.length, color: "bg-blue-50 dark:bg-blue-950 text-blue-600" },
                      { label: "Concluídas", value: goalsWithProgress.filter(g => g.current >= g.target_amount).length, color: "bg-emerald-50 dark:bg-emerald-950 text-emerald-600" },
                      { label: "Em risco", value: goalsWithProgress.filter(g => {
                        const days = differenceInDays(parseISO(g.end_date), new Date());
                        const pct  = g.current / g.target_amount;
                        return days <= 30 && pct < 0.7;
                      }).length, color: "bg-red-50 dark:bg-red-950 text-red-600" },
                    ].map(({ label, value, color }) => (
                      <div key={label} className={`${color} rounded-2xl p-3 text-center`}>
                        <p className="text-xl font-bold">{value}</p>
                        <p className="text-xs opacity-70 mt-0.5">{label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Barras de progresso */}
                  <Section title="Progresso das metas">
                    {goalsWithProgress.map(goal => (
                      <GoalBar key={goal.id} goal={goal} />
                    ))}
                  </Section>

                  {/* Rosca de distribuição por tipo */}
                  {(() => {
                    const byType = [
                      { name: "Saídas",      value: goalsWithProgress.filter(g => g.type === "expense").length,    color: "#f87171" },
                      { name: "Entradas",    value: goalsWithProgress.filter(g => g.type === "income").length,     color: "#34d399" },
                      { name: "Investimento",value: goalsWithProgress.filter(g => g.type === "investment").length, color: "#60a5fa" },
                    ].filter(d => d.value > 0);
                    const total = byType.reduce((s, d) => s + d.value, 0);
                    const withPct = byType.map(d => ({ ...d, percent: ((d.value / total) * 100).toFixed(0) }));
                    return byType.length > 1 ? (
                      <Section title="Distribuição por tipo">
                        <DonutChart data={withPct} total={total} />
                      </Section>
                    ) : null;
                  })()}
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}