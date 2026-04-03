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
import {
  TrendingUp, TrendingDown, Target, Wallet, BarChart2
} from "lucide-react";
import { useMonth } from "@/lib/MonthContext";
import MonthSelector from "@/components/common/MonthSelector";

const CATEGORY_COLORS = {
  alimentação:       "#f97316",
  moradia:           "#3b82f6",
  transporte:        "#8b5cf6",
  saúde:             "#10b981",
  educação:          "#06b6d4",
  lazer:             "#f59e0b",
  compras:           "#ec4899",
  streaming:         "#a855f7",
  assinaturas:       "#6366f1",
  telefone:          "#0ea5e9",
  internet:          "#14b8a6",
  roupas:            "#f43f5e",
  beleza:            "#e879f9",
  pet:               "#84cc16",
  presente:          "#fb923c",
  doação:            "#94a3b8",
  "cartão de crédito": "#ef4444",
  impostos:          "#78716c",
  viagem:            "#0284c7",
  restaurante:       "#dc2626",
  energia:           "#eab308",
  água:              "#38bdf8",
  salário:           "#22c55e",
  freelance:         "#a3e635",
  comissão:          "#fbbf24",
  investimentos:     "#34d399",
  outros:            "#6b7280",
};
const DEFAULT_COLOR = "#94a3b8";
const getColor = (cat) => CATEGORY_COLORS[cat?.toLowerCase()] || DEFAULT_COLOR;
const fmt = (v) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
const fmtShort = (v) => Math.abs(v) >= 1000 ? `R$${(v / 1000).toFixed(1)}k` : `R$${v.toFixed(0)}`;

function DonutChart({ data, total }) {
  const [active, setActive] = useState(null);

  if (!data.length) return (
    <div className="flex items-center justify-center h-48 text-gray-300 text-sm">Sem dados</div>
  );

  const activeItem = active !== null ? data[active] : null;

  return (
    <div className="px-4 pb-6">
      {/* Rosca grande centralizada */}
      <div className="relative mx-auto" style={{ width: 220, height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%" cy="50%"
              innerRadius={72} outerRadius={100}
              paddingAngle={2}
              dataKey="value"
              onMouseEnter={(_, i) => setActive(i)}
              onMouseLeave={() => setActive(null)}
              onClick={(_, i) => setActive(active === i ? null : i)}
              strokeWidth={0}
            >
              {data.map((entry, i) => (
                <Cell
                  key={entry.name}
                  fill={entry.color}
                  opacity={active === null || active === i ? 1 : 0.25}
                  style={{ cursor: 'pointer', outline: 'none' }}
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>

        {/* Centro — info da categoria ativa ou total */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          {activeItem ? (
            <>
              <div className="w-3 h-3 rounded-full mb-1" style={{ backgroundColor: activeItem.color }} />
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 capitalize text-center px-4 leading-tight">
                {activeItem.name}
              </span>
              <span className="text-2xl font-bold text-gray-900 dark:text-white mt-0.5">
                {activeItem.percent}%
              </span>
              <span className="text-xs text-gray-400">{fmt(activeItem.value)}</span>
            </>
          ) : (
            <>
              <span className="text-xs text-gray-400 mb-0.5">Total</span>
              <span className="text-2xl font-bold text-gray-900 dark:text-white">{fmt(total)}</span>
              <span className="text-xs text-gray-400 mt-0.5">{data.length} categorias</span>
            </>
          )}
        </div>
      </div>

      {/* Legenda em grid abaixo da rosca */}
      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2.5">
        {data.map((item, i) => (
          <div
            key={item.name}
            className={`flex items-center gap-2 cursor-pointer transition-opacity ${
              active === null || active === i ? "opacity-100" : "opacity-30"
            }`}
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive(null)}
            onClick={() => setActive(active === i ? null : i)}
          >
            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate capitalize">{item.name}</p>
              <p className="text-xs text-gray-400">{item.percent}%</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

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

function GoalBar({ goal }) {
  const pct = Math.min((goal.current / goal.target_amount) * 100, 100);
  const barColor = goal.type === "expense"
    ? pct >= 100 ? "#ef4444" : pct >= 80 ? "#f97316" : "#3b82f6"
    : pct >= 100 ? "#22c55e" : "#8b5cf6";
  return (
    <div className="px-4 py-3 border-b border-gray-50 dark:border-gray-700 last:border-0">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: barColor }} />
          <span className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{goal.name}</span>
        </div>
        <span className="text-xs font-bold text-gray-600 dark:text-gray-300 ml-2">{pct.toFixed(0)}%</span>
      </div>
      <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1.5 mb-1">
        <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="h-1.5 rounded-full" style={{ backgroundColor: barColor }} />
      </div>
      <div className="flex justify-between">
        <span className="text-xs text-gray-400">{fmt(goal.current)}</span>
        <span className="text-xs text-gray-400">meta: {fmt(goal.target_amount)}</span>
      </div>
    </div>
  );
}

function Card({ title, children, className = "" }) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      className={`bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden ${className}`}>
      {title && (
        <div className="px-4 pt-4 pb-2">
          <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300">{title}</h3>
        </div>
      )}
      {children}
    </motion.div>
  );
}

export default function Reports() {
  const { user } = useAuth();
  const { activeOwnerId } = useSharedProfile();
  const { selectedDate, setSelectedDate } = useMonth();
  const [activeTab, setActiveTab] = useState("overview");

  const { data: transactions = [] } = useQuery({
    queryKey: ["transactions", activeOwnerId],
    queryFn: async () => {
      const { data, error } = await supabase.from("transactions").select("*")
        .eq("user_id", activeOwnerId).order("date", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!activeOwnerId,
  });

  const { data: goals = [] } = useQuery({
    queryKey: ["goals", activeOwnerId],
    queryFn: async () => {
      const { data, error } = await supabase.from("goals").select("*").eq("user_id", activeOwnerId);
      if (error) throw error;
      return data;
    },
    enabled: !!activeOwnerId,
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts", activeOwnerId],
    queryFn: async () => {
      const { data, error } = await supabase.from("accounts").select("*").eq("user_id", activeOwnerId);
      if (error) throw error;
      return data;
    },
    enabled: !!activeOwnerId,
  });

  const monthStart = startOfMonth(selectedDate);
  const monthEnd   = endOfMonth(selectedDate);

  const monthTx = useMemo(() =>
    transactions.filter(t =>
      t.is_realized !== false && t.type !== 'transfer' &&
      isWithinInterval(parseISO(t.date), { start: monthStart, end: monthEnd })
    ), [transactions, monthStart, monthEnd]);

  const income  = useMemo(() => monthTx.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0),  [monthTx]);
  const expense = useMemo(() => monthTx.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0), [monthTx]);
  const balance = income - expense;
  const savingsRate = income > 0 ? ((balance / income) * 100).toFixed(1) : 0;

  const prevTx = useMemo(() => {
    const s = startOfMonth(subMonths(selectedDate, 1));
    const e = endOfMonth(subMonths(selectedDate, 1));
    return transactions.filter(t =>
      t.is_realized !== false && t.type !== 'transfer' &&
      isWithinInterval(parseISO(t.date), { start: s, end: e })
    );
  }, [transactions, selectedDate]);
  const prevExpense = prevTx.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const expenseDiff = prevExpense > 0 ? (((expense - prevExpense) / prevExpense) * 100).toFixed(1) : null;

  const expenseByCategory = useMemo(() => {
    const map = {};
    monthTx.filter(t => t.type === "expense").forEach(t => {
      const cat = t.category || "outros";
      map[cat] = (map[cat] || 0) + t.amount;
    });
    return Object.entries(map)
      .map(([name, value]) => ({ name, value, color: getColor(name), percent: expense > 0 ? ((value / expense) * 100).toFixed(1) : 0 }))
      .sort((a, b) => b.value - a.value);
  }, [monthTx, expense]);

  const incomeByCategory = useMemo(() => {
    const map = {};
    monthTx.filter(t => t.type === "income").forEach(t => {
      const cat = t.category || "outros";
      map[cat] = (map[cat] || 0) + t.amount;
    });
    return Object.entries(map)
      .map(([name, value]) => ({ name, value, color: getColor(name), percent: income > 0 ? ((value / income) * 100).toFixed(1) : 0 }))
      .sort((a, b) => b.value - a.value);
  }, [monthTx, income]);

  const last6Months = useMemo(() => Array.from({ length: 6 }, (_, i) => {
    const date = subMonths(selectedDate, 5 - i);
    const s = startOfMonth(date), e = endOfMonth(date);
    const tx = transactions.filter(t =>
      t.is_realized !== false && t.type !== 'transfer' &&
      isWithinInterval(parseISO(t.date), { start: s, end: e })
    );
    return {
      name: format(date, "MMM", { locale: ptBR }),
      income:  tx.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0),
      expense: tx.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0),
    };
  }), [transactions, selectedDate]);

  const topExpenses = useMemo(() =>
    monthTx.filter(t => t.type === "expense").sort((a, b) => b.amount - a.amount).slice(0, 5),
    [monthTx]);

  const goalsWithProgress = useMemo(() => goals
    .filter(g => g.end_date && !isBefore(parseISO(g.end_date), new Date()))
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
        const s = parseISO(goal.start_date), e = parseISO(goal.end_date);
        transactions.forEach(t => {
          if (t.is_realized === false || t.type !== goal.type) return;
          if (goal.category && t.category !== goal.category) return;
          if (isWithinInterval(parseISO(t.date), { start: s, end: e })) current += t.amount;
        });
      }
      return { ...goal, current };
    }), [goals, transactions, accounts]);

  const tabs = [
    { key: "overview", label: "Resumo"   },
    { key: "expenses", label: "Despesas" },
    { key: "income",   label: "Receitas" },
    { key: "goals",    label: "Metas"    },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-24 transition-colors duration-200">

      {/* Header — mesmo padrão das outras telas */}
      <div className="bg-gradient-to-br from-slate-700 via-slate-600 to-slate-800 text-white sticky top-0 z-20">
        <div className="px-5 pt-12 pb-4">
          <div className="flex items-center gap-2 mb-4">
            <BarChart2 className="w-5 h-5 text-slate-300" />
            <h1 className="text-2xl font-bold text-white">Relatórios</h1>
          </div>
          <MonthSelector selectedDate={selectedDate} onChange={setSelectedDate} />
        </div>

        {/* Resumo rápido no header */}
        <div className="flex gap-4 px-5 pb-4">
          <div className="flex-1 text-center">
            <p className="text-xs text-slate-400 mb-1">Entradas</p>
            <p className="text-lg font-bold text-emerald-300">{fmt(income)}</p>
          </div>
          <div className="flex-1 text-center border-x border-white/10">
            <p className="text-xs text-slate-400 mb-1">Saídas</p>
            <p className="text-lg font-bold text-red-300">{fmt(expense)}</p>
          </div>
          <div className="flex-1 text-center">
            <p className="text-xs text-slate-400 mb-1">Saldo</p>
            <p className={`text-lg font-bold ${balance >= 0 ? 'text-white' : 'text-red-300'}`}>{fmt(balance)}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex px-4 gap-1 pb-0">
          {tabs.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`flex-1 py-2.5 text-xs font-semibold rounded-t-xl transition-all ${
                activeTab === tab.key
                  ? "bg-gray-50 dark:bg-gray-900 text-slate-800 dark:text-white"
                  : "text-slate-400 hover:text-white"
              }`}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">
        <AnimatePresence mode="wait">

          {/* ── RESUMO ────────────────────────────────────────── */}
          {activeTab === "overview" && (
            <motion.div key="overview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">

              {/* KPIs */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Taxa de poupança", value: `${savingsRate}%`, sub: "da receita guardada", bg: "bg-emerald-50 dark:bg-emerald-950", text: "text-emerald-600 dark:text-emerald-400" },
                  { label: "Variação saídas", value: expenseDiff !== null ? `${expenseDiff > 0 ? "+" : ""}${expenseDiff}%` : "—", sub: "vs mês anterior", bg: expenseDiff > 0 ? "bg-red-50 dark:bg-red-950" : "bg-emerald-50 dark:bg-emerald-950", text: expenseDiff > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400" },
                ].map(({ label, value, sub, bg, text }) => (
                  <div key={label} className={`${bg} rounded-2xl p-4`}>
                    <p className={`text-2xl font-bold ${text}`}>{value}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{label}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">{sub}</p>
                  </div>
                ))}
              </div>

              {/* Evolução 6 meses */}
              <Card title="Evolução — últimos 6 meses">
                <div className="px-2 pb-4" style={{ height: 180 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={last6Months} barSize={10} barGap={2}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                      <YAxis tickFormatter={fmtShort} tick={{ fontSize: 9, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={36} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="income"  fill="#34d399" radius={[4,4,0,0]} name="income" />
                      <Bar dataKey="expense" fill="#f87171" radius={[4,4,0,0]} name="expense" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex justify-center gap-4 pb-3">
                  <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-emerald-400"/><span className="text-xs text-gray-500">Entradas</span></div>
                  <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-red-400"/><span className="text-xs text-gray-500">Saídas</span></div>
                </div>
              </Card>

              {/* Top gastos */}
              {topExpenses.length > 0 && (
                <Card title="Maiores gastos do mês">
                  <div className="divide-y divide-gray-50 dark:divide-gray-700">
                    {topExpenses.map((t, i) => (
                      <div key={t.id} className="flex items-center gap-3 px-4 py-3">
                        <span className="text-xs font-bold text-gray-300 w-4">{i + 1}</span>
                        <div className="w-2 h-6 rounded-full flex-shrink-0" style={{ backgroundColor: getColor(t.category) }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{t.description}</p>
                          <p className="text-xs text-gray-400 capitalize">{t.category || "outros"}</p>
                        </div>
                        <span className="text-sm font-bold text-red-500">{fmt(t.amount)}</span>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </motion.div>
          )}

          {/* ── DESPESAS ──────────────────────────────────────── */}
          {activeTab === "expenses" && (
            <motion.div key="expenses" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
              <Card title="Por categoria">
                <DonutChart data={expenseByCategory} total={expense} />
              </Card>
              <Card title="Detalhamento">
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
                        <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1.5">
                          <motion.div initial={{ width: 0 }} animate={{ width: `${cat.percent}%` }}
                            transition={{ duration: 0.6 }} className="h-1.5 rounded-full"
                            style={{ backgroundColor: cat.color }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
              <Card title="Tendência de saídas">
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
              </Card>
            </motion.div>
          )}

          {/* ── RECEITAS ──────────────────────────────────────── */}
          {activeTab === "income" && (
            <motion.div key="income" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
              <Card title="Por categoria">
                <DonutChart data={incomeByCategory} total={income} />
              </Card>
              <Card title="Detalhamento">
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
                        <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1.5">
                          <motion.div initial={{ width: 0 }} animate={{ width: `${cat.percent}%` }}
                            transition={{ duration: 0.6 }} className="h-1.5 rounded-full"
                            style={{ backgroundColor: cat.color }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
              <Card title="Tendência de entradas">
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
              </Card>
            </motion.div>
          )}

          {/* ── METAS ─────────────────────────────────────────── */}
          {activeTab === "goals" && (
            <motion.div key="goals" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
              {goalsWithProgress.length === 0 ? (
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-10 text-center border border-gray-100 dark:border-gray-700">
                  <Target className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                  <p className="text-sm text-gray-400">Nenhuma meta ativa</p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: "Total",      value: goalsWithProgress.length, bg: "bg-blue-50 dark:bg-blue-950",    text: "text-blue-600 dark:text-blue-400" },
                      { label: "Concluídas", value: goalsWithProgress.filter(g => g.current >= g.target_amount).length, bg: "bg-emerald-50 dark:bg-emerald-950", text: "text-emerald-600 dark:text-emerald-400" },
                      { label: "Em risco",   value: goalsWithProgress.filter(g => {
                        const days = differenceInDays(parseISO(g.end_date), new Date());
                        return days <= 30 && g.current / g.target_amount < 0.7;
                      }).length, bg: "bg-red-50 dark:bg-red-950", text: "text-red-600 dark:text-red-400" },
                    ].map(({ label, value, bg, text }) => (
                      <div key={label} className={`${bg} rounded-2xl p-3 text-center`}>
                        <p className={`text-xl font-bold ${text}`}>{value}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{label}</p>
                      </div>
                    ))}
                  </div>
                  <Card title="Progresso das metas">
                    {goalsWithProgress.map(goal => <GoalBar key={goal.id} goal={goal} />)}
                  </Card>
                </>
              )}
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}