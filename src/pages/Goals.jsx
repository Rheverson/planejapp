import React, { useMemo, useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthContext";
import { useSharedProfile } from "@/lib/SharedProfileContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Target, TrendingUp, TrendingDown, PiggyBank, CheckCircle2 } from "lucide-react";
import { parseISO, isWithinInterval, isBefore } from "date-fns";
import { toast } from "sonner";

import GoalForm from "@/components/goals/GoalForm";
import GoalProgressCard from "@/components/goals/GoalProgressCard";
import EmptyState from "@/components/common/EmptyState";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

function useIsDark() {
  const [dark, setDark] = useState(() => localStorage.getItem("darkMode") === "true");
  useEffect(() => {
    const h = (e) => setDark(e.detail);
    window.addEventListener("darkModeChange", h);
    return () => window.removeEventListener("darkModeChange", h);
  }, []);
  return dark;
}

export default function Goals() {
  const dark = useIsDark();
  const { user } = useAuth();
  const { activeOwnerId, isViewingSharedProfile, sharedPermissions } = useSharedProfile();
  const [showForm, setShowForm] = useState(false);
  const [editGoal, setEditGoal] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const queryClient = useQueryClient();

  const ownerId     = activeOwnerId ?? user?.id;
  const canAddGoals = !isViewingSharedProfile || sharedPermissions?.add_transactions;

  const { data: goals = [], isLoading: goalsLoading, error: goalsError } = useQuery({
    queryKey: ["goals", ownerId],
    queryFn: async () => {
      if (isViewingSharedProfile) {
        const { data, error } = await supabase.rpc("get_shared_goals", { p_owner_id: ownerId });
        if (error) throw error;
        return data ?? [];
      }
      const { data, error } = await supabase.from("goals").select("*").eq("user_id", ownerId).order("end_date");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!ownerId,
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts", ownerId],
    queryFn: async () => {
      const { data, error } = await supabase.from("accounts").select("*").eq("user_id", ownerId).order("name");
      if (error) throw error; return data ?? [];
    },
    enabled: !!ownerId,
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ["transactions", ownerId],
    queryFn: async () => {
      const { data, error } = await supabase.from("transactions").select("*").eq("user_id", ownerId).order("date", { ascending: false });
      if (error) throw error; return data ?? [];
    },
    enabled: !!ownerId,
  });

  const createMutation = useMutation({
    mutationFn: async (data) => {
      if (!ownerId) throw new Error("Usuário não identificado.");
      const { error } = await supabase.from("goals").insert([{ ...data, user_id: ownerId }]);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["goals", ownerId] }); setShowForm(false); toast.success("Meta criada!"); },
    onError: (err) => toast.error("Erro: " + err.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      if (!ownerId) throw new Error("Usuário não identificado.");
      const { error } = await supabase.from("goals").update(data).eq("id", id).eq("user_id", ownerId);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["goals", ownerId] }); setEditGoal(null); setShowForm(false); toast.success("Meta atualizada!"); },
    onError: (err) => toast.error("Erro: " + err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      if (!ownerId) throw new Error("Usuário não identificado.");
      const { error } = await supabase.from("goals").delete().eq("id", id).eq("user_id", ownerId);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["goals", ownerId] }); setDeleteId(null); toast.success("Meta excluída!"); },
    onError: (err) => toast.error("Erro: " + err.message),
  });

  const goalsWithProgress = useMemo(() => {
    const getPeriodBounds = (goal) => {
      const now = new Date();
      if (goal.contribution_period === "daily") {
        const s = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const e = new Date(s); e.setDate(e.getDate() + 1);
        return { start: s, end: e };
      }
      if (goal.contribution_period === "weekly") {
        const s = new Date(now); s.setDate(now.getDate() - now.getDay()); s.setHours(0,0,0,0);
        const e = new Date(s); e.setDate(s.getDate() + 7);
        return { start: s, end: e };
      }
      if (goal.contribution_period === "yearly") {
        return { start: new Date(now.getFullYear(), 0, 1), end: new Date(now.getFullYear() + 1, 0, 1) };
      }
      return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: new Date(now.getFullYear(), now.getMonth() + 1, 1) };
    };

    return goals.map((goal) => {
      let current = 0;
      if (goal.type === "investment") {
        if (goal.investment_type === "contribution") {
          const { start, end } = getPeriodBounds(goal);
          transactions.forEach((t) => {
            if (!t.is_realized) return;
            if (t.account_id !== goal.linked_account_id) return;
            if (t.type !== "income") return;
            const date = parseISO(t.date);
            if (date < start || date >= end) return;
            current += Number(t.amount);
          });
        } else {
          const account = accounts.find(a => a.id === goal.linked_account_id);
          if (account) {
            current = Number(account.initial_balance) || 0;
            transactions.forEach((t) => {
              if (!t.is_realized) return;
              if (t.type === "transfer") {
                if (t.transfer_account_id === goal.linked_account_id) current += Number(t.amount);
                if (t.account_id === goal.linked_account_id) current -= Number(t.amount);
                return;
              }
              if (t.account_id !== goal.linked_account_id) return;
              if (t.type === "income") current += Number(t.amount);
              if (t.type === "expense") current -= Number(t.amount);
            });
          } else {
            const start = parseISO(goal.start_date), end = parseISO(goal.end_date);
            transactions.forEach((t) => {
              if (!t.is_realized) return;
              const date = parseISO(t.date);
              if (!isWithinInterval(date, { start, end })) return;
              const acc = accounts.find(a => a.id === t.account_id);
              if (acc?.type === "investment") {
                if (t.type === "income") current += Number(t.amount);
                if (t.type === "expense") current -= Number(t.amount);
              }
            });
          }
        }
      } else {
        const start = parseISO(goal.start_date), end = parseISO(goal.end_date);
        transactions.forEach((t) => {
          if (!t.is_realized) return;
          const date = parseISO(t.date);
          if (!isWithinInterval(date, { start, end })) return;
          if (t.type !== goal.type) return;
          if (goal.category && t.category !== goal.category) return;
          current += Number(t.amount);
        });
      }
      return { ...goal, current };
    });
  }, [goals, transactions, accounts]);

  const activeGoals     = goalsWithProgress.filter(g => !isBefore(parseISO(g.end_date), new Date()));
  const completedGoals  = goalsWithProgress.filter(g => isBefore(parseISO(g.end_date), new Date()));
  const expenseGoals    = activeGoals.filter(g => g.type === "expense");
  const incomeGoals     = activeGoals.filter(g => g.type === "income");
  const investmentGoals = activeGoals.filter(g => g.type === "investment");

  const handleSubmit = (data) => {
    if (editGoal) updateMutation.mutate({ id: editGoal.id, data });
    else createMutation.mutate(data);
  };

  const goalsErrorMessage = goalsError instanceof Error
    ? goalsError.message
    : goalsError?.message || JSON.stringify(goalsError) || "Erro desconhecido.";

  // Tokens — mesmos do Home/Transactions
  const bg      = dark ? "#060709" : "#f1f4f9";
  const cardBg  = dark ? "#0c0e13" : "#ffffff";
  const cardBrd = dark ? "rgba(255,255,255,0.07)" : "rgba(17,24,39,0.05)";
  const shadow  = dark ? "none" : "0 1px 3px rgba(17,24,39,0.04), 0 4px 12px rgba(17,24,39,0.05)";
  const text    = dark ? "#e8edf5" : "#0f172a";
  const muted   = dark ? "#6b7a96" : "#64748b";

  // Seção de metas com label
  const Section = ({ title, icon: Icon, iconColor, goals: list }) => (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
        <div style={{ width: 22, height: 22, borderRadius: 7, background: `${iconColor}18`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon size={12} color={iconColor} />
        </div>
        <p style={{ fontSize: "0.72rem", fontWeight: 700, color: muted, textTransform: "uppercase", letterSpacing: "0.1em" }}>{title}</p>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {list.map((goal, i) => (
          <GoalProgressCard
            key={goal.id} goal={goal} current={goal.current}
            onEdit={canAddGoals ? (g) => { setEditGoal(g); setShowForm(true); } : undefined}
            onDelete={canAddGoals ? setDeleteId : undefined}
            delay={i * 0.08}
          />
        ))}
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: bg, paddingBottom: 96, fontFamily: "'Outfit',sans-serif" }}>

      {/* ══ HEADER — mesmo padrão do Home/Transactions ══════════
          radial-gradient embutido, sem filter:blur, sem bleeding
      ══════════════════════════════════════════════════════════ */}
      <div style={{
        isolation: "isolate",
        overflow: "hidden",
        borderRadius: "0 0 28px 28px",
        boxShadow: dark
          ? "0 8px 32px rgba(0,0,0,0.5)"
          : "0 8px 32px rgba(109,40,217,0.2)",
        background: dark
          ? `
              radial-gradient(ellipse 70% 60% at 50% -10%, rgba(109,40,217,0.4) 0%, transparent 70%),
              radial-gradient(ellipse 40% 40% at 90% 110%, rgba(37,99,235,0.2) 0%, transparent 70%),
              linear-gradient(160deg, #06080f 0%, #0f0a1a 40%, #130d24 100%)
            `
          : `
              radial-gradient(ellipse 70% 60% at 50% -10%, rgba(167,139,250,0.45) 0%, transparent 70%),
              radial-gradient(ellipse 40% 40% at 90% 110%, rgba(99,102,241,0.25) 0%, transparent 70%),
              linear-gradient(165deg, #6d28d9 0%, #5b21b6 50%, #4338ca 100%)
            `,
      }}>
        <div style={{ padding: "52px 20px 0" }}>

          {isViewingSharedProfile && (
            <div style={{ background: "rgba(255,255,255,0.12)", borderRadius: 8, padding: "4px 12px", marginBottom: 10, fontSize: "0.72rem", color: "rgba(255,255,255,0.85)", display: "inline-block", fontWeight: 500 }}>
              👁 Visualizando perfil compartilhado
            </div>
          )}

          {/* Título + contagem */}
          <div style={{ marginBottom: 10 }}>
            <p style={{ fontFamily: "'Cabinet Grotesk',sans-serif", fontWeight: 900, fontSize: "clamp(1.5rem,5vw,1.8rem)", color: "#ffffff", letterSpacing: "-0.03em", marginBottom: 3 }}>
              Minhas Metas
            </p>
            <p style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.55)", fontWeight: 400 }}>
              {activeGoals.length === 0
                ? "Nenhuma meta ativa"
                : `${activeGoals.length} ${activeGoals.length === 1 ? "meta ativa" : "metas ativas"}`}
            </p>
          </div>

          {/* Cards de resumo 3 colunas */}
          {activeGoals.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1px 1fr 1px 1fr", background: "rgba(255,255,255,0.1)", borderRadius: 14, overflow: "hidden" }}>
              <div style={{ padding: "9px 6px", textAlign: "center" }}>
                <p style={{ fontSize: "0.56rem", fontWeight: 600, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 2 }}>Saídas</p>
                <p style={{ fontFamily: "'Cabinet Grotesk',sans-serif", fontWeight: 800, fontSize: "1rem", color: "#ffffff" }}>{expenseGoals.length}</p>
              </div>
              <div style={{ background: "rgba(255,255,255,0.15)" }} />
              <div style={{ padding: "9px 6px", textAlign: "center" }}>
                <p style={{ fontSize: "0.56rem", fontWeight: 600, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 2 }}>Entradas</p>
                <p style={{ fontFamily: "'Cabinet Grotesk',sans-serif", fontWeight: 800, fontSize: "1rem", color: "#ffffff" }}>{incomeGoals.length}</p>
              </div>
              <div style={{ background: "rgba(255,255,255,0.15)" }} />
              <div style={{ padding: "9px 6px", textAlign: "center" }}>
                <p style={{ fontSize: "0.56rem", fontWeight: 600, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 2 }}>Invest.</p>
                <p style={{ fontFamily: "'Cabinet Grotesk',sans-serif", fontWeight: 800, fontSize: "1rem", color: "#ffffff" }}>{investmentGoals.length}</p>
              </div>
            </div>
          )}
        </div>

        {/* Padding extra abaixo */}
        <div style={{ height: 20 }} />
      </div>

      {/* ══ CONTEÚDO ════════════════════════════════════════════ */}
      <div style={{ padding: "16px 14px 0", display: "flex", flexDirection: "column", gap: 20 }}>

        {/* Estados de loading/erro */}
        {!ownerId && (
          <div style={{ background: dark ? "rgba(220,38,38,0.08)" : "#fef2f2", border: `1px solid ${dark ? "rgba(220,38,38,0.2)" : "#fecaca"}`, borderRadius: 14, padding: "12px 16px" }}>
            <p style={{ fontSize: "0.85rem", fontWeight: 500, color: "#dc2626" }}>Não foi possível identificar o perfil ativo.</p>
          </div>
        )}

        {ownerId && goalsLoading && (
          <div style={{ background: cardBg, border: `1px solid ${cardBrd}`, borderRadius: 14, padding: "16px", boxShadow: shadow }}>
            <p style={{ fontSize: "0.85rem", color: muted }}>Carregando metas...</p>
          </div>
        )}

        {ownerId && goalsError && (
          <div style={{ background: dark ? "rgba(220,38,38,0.08)" : "#fef2f2", border: `1px solid ${dark ? "rgba(220,38,38,0.2)" : "#fecaca"}`, borderRadius: 14, padding: "12px 16px" }}>
            <p style={{ fontSize: "0.85rem", fontWeight: 500, color: "#dc2626" }}>Erro ao carregar metas.</p>
            <p style={{ fontSize: "0.72rem", color: "#ef4444", marginTop: 4, wordBreak: "break-all" }}>{goalsErrorMessage}</p>
          </div>
        )}

        {/* Empty state */}
        {!goalsLoading && !goalsError && activeGoals.length === 0 && (
          <div style={{ background: cardBg, border: `1px solid ${cardBrd}`, borderRadius: 16, padding: "24px", boxShadow: shadow }}>
            <EmptyState
              icon={Target}
              title="Nenhuma meta ativa"
              description="Crie metas para acompanhar seu progresso financeiro."
              action={canAddGoals ? "Criar Meta" : undefined}
              onAction={canAddGoals ? () => setShowForm(true) : undefined}
            />
          </div>
        )}

        {/* Investimentos */}
        {!goalsLoading && !goalsError && investmentGoals.length > 0 && (
          <Section title="Investimentos" icon={PiggyBank} iconColor={dark ? "#a78bfa" : "#6d28d9"} goals={investmentGoals} />
        )}

        {/* Metas de saídas */}
        {!goalsLoading && !goalsError && expenseGoals.length > 0 && (
          <Section title="Metas de saídas" icon={TrendingDown} iconColor={dark ? "#e85d5d" : "#dc2626"} goals={expenseGoals} />
        )}

        {/* Metas de entradas */}
        {!goalsLoading && !goalsError && incomeGoals.length > 0 && (
          <Section title="Metas de entradas" icon={TrendingUp} iconColor={dark ? "#2ecc8a" : "#059669"} goals={incomeGoals} />
        )}

        {/* Metas encerradas */}
        {!goalsLoading && !goalsError && completedGoals.length > 0 && (
          <div style={{ opacity: 0.6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
              <div style={{ width: 22, height: 22, borderRadius: 7, background: dark ? "rgba(107,122,150,0.15)" : "rgba(100,116,139,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <CheckCircle2 size={12} color={muted} />
              </div>
              <p style={{ fontSize: "0.72rem", fontWeight: 700, color: muted, textTransform: "uppercase", letterSpacing: "0.1em" }}>Encerradas</p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {completedGoals.map((goal, i) => (
                <GoalProgressCard
                  key={goal.id} goal={goal} current={goal.current}
                  onEdit={canAddGoals ? (g) => { setEditGoal(g); setShowForm(true); } : undefined}
                  onDelete={canAddGoals ? setDeleteId : undefined}
                  delay={i * 0.08}
                />
              ))}
            </div>
          </div>
        )}

      </div>

      {/* FAB — violeta para diferenciar da tela home */}
      {canAddGoals && (
        <motion.button
          whileTap={{ scale: 0.88 }}
          whileHover={{ scale: 1.06 }}
          onClick={() => { setEditGoal(null); setShowForm(true); }}
          style={{ position: "fixed", bottom: 88, right: 20, width: 52, height: 52, background: "linear-gradient(135deg,#6d28d9,#4338ca)", border: "none", borderRadius: "50%", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 24px rgba(109,40,217,0.5),0 4px 14px rgba(0,0,0,0.25)", zIndex: 40 }}
        >
          <Plus size={21} color="#fff" />
        </motion.button>
      )}

      <AnimatePresence>
        {showForm && canAddGoals && (
          <GoalForm
            goal={editGoal} accounts={accounts} onSubmit={handleSubmit}
            onClose={() => { setShowForm(false); setEditGoal(null); }}
          />
        )}
      </AnimatePresence>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir meta?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (deleteId) deleteMutation.mutate(deleteId); }}
              style={{ background: "#dc2626", color: "#ffffff", border: "none" }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}