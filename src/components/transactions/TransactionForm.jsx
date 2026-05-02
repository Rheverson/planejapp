import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, TrendingUp, TrendingDown, Repeat, Zap } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import CategorySuggestion from "./CategorySuggestion";
import { useCategorySuggestion } from "./useCategorySuggestion";
import { useAuth } from "@/lib/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { addMonths, format } from "date-fns";
import { supabase } from "@/lib/supabase";

const frequencyOptions = [
  { value: "monthly", label: "Mensal"  },
  { value: "weekly",  label: "Semanal" },
  { value: "yearly",  label: "Anual"   },
];
const dayOptions = Array.from({ length: 31 }, (_, i) => i + 1);
const today    = new Date().toISOString().split("T")[0];
const todayDay = new Date().getDate();

// ✅ useIsDark robusto — observa a classe do <html> diretamente
function useIsDark() {
  const [dark, setDark] = useState(() =>
    localStorage.getItem("darkMode") === "true" ||
    document.documentElement.classList.contains("dark")
  );
  useEffect(() => {
    const obs = new MutationObserver(() =>
      setDark(document.documentElement.classList.contains("dark"))
    );
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    const h = (e) => setDark(e.detail);
    window.addEventListener("darkModeChange", h);
    return () => { obs.disconnect(); window.removeEventListener("darkModeChange", h); };
  }, []);
  return dark;
}

export default function TransactionForm({ accounts, onSubmit, onClose, initialType = "expense", initialData = null }) {
  const isEditing = !!initialData;
  const dark      = useIsDark();
  const { user }  = useAuth();

  const { data: allCategories = [] } = useQuery({
    queryKey: ["categories", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories").select("*")
        .or(`user_id.eq.${user?.id},is_default.eq.true`)
        .order("is_default", { ascending: false }).order("name");
      if (error) throw error; return data;
    },
    enabled: !!user?.id,
  });

  const [type, setType]                         = useState(initialData?.type || initialType);
  const [description, setDescription]           = useState(initialData?.description || "");
  const [amount, setAmount]                     = useState(initialData?.amount ? String(initialData.amount) : "");
  const [category, setCategory]                 = useState(initialData?.category || "");
  const [accountId, setAccountId]               = useState(initialData?.account_id || "");
  const [date, setDate]                         = useState(initialData?.date || today);
  const [isRealized, setIsRealized]             = useState(initialData?.is_realized ?? true);
  const [autoRealize, setAutoRealize]           = useState(initialData?.auto_realize || false);
  const [isRecurring, setIsRecurring]           = useState(initialData?.is_recurring || false);
  const [recurringFreq, setRecurringFreq]       = useState(initialData?.recurring_frequency || "monthly");
  const [recurringDay, setRecurringDay]         = useState(initialData?.recurring_day || todayDay);
  const [recurringEndDate, setRecurringEndDate] = useState(initialData?.recurring_end_date || "");
  const [showSuggestion, setShowSuggestion]     = useState(false);

  const { data: creditCards = [] } = useQuery({
    queryKey: ["credit_cards", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("credit_cards").select("*").eq("user_id", user?.id).eq("is_active", true);
      if (error) throw error; return data;
    },
    enabled: !!user?.id,
  });

  // walletId pode ser account_id ou credit_card_id prefixado com "cc_"
  const [walletId, setWalletId] = useState(() => {
    if (initialData?.credit_card_id) return "cc_" + initialData.credit_card_id;
    return initialData?.account_id || "";
  });

  const selectedCard = walletId.startsWith("cc_")
    ? creditCards.find(cc => cc.id === walletId.replace("cc_", ""))
    : null;

  const { suggestion, confidence, confirmCategory } = useCategorySuggestion(description, type);
  const categories = allCategories.filter(c => c.type === type).map(c => c.name);

  const handleAutoRealizeChange  = (val) => { setAutoRealize(val); if (val) setIsRealized(false); };
  const handleIsRealizedChange   = (val) => { setIsRealized(val); if (val) setAutoRealize(false); };
  const handleDescriptionChange  = (val) => { setDescription(val); if (val && !category) setShowSuggestion(true); else if (!val) setShowSuggestion(false); };
  const handleDateChange         = (val) => { setDate(val); if (isRecurring && recurringFreq === "monthly") setRecurringDay(new Date(val + "T00:00:00").getDate()); };
  const handleCategoryChange     = (val) => { setCategory(val); setShowSuggestion(false); };
  const handleTypeChange         = (val) => { setType(val); setCategory(""); setShowSuggestion(false); };
  const handleAcceptSuggestion   = () => { setCategory(suggestion); setShowSuggestion(false); };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (description && category) confirmCategory(category, description);
    // Calcula invoice_month se cartão selecionado
    let invoiceMonth = null;
    let finalCreditCardId = null;
    let finalAccountId = accountId;

    if (selectedCard) {
      finalCreditCardId = selectedCard.id;
      finalAccountId = null; // não debita conta agora
      const d = new Date(date + "T00:00:00");
      invoiceMonth = selectedCard.expense_date_mode === "purchase_date"
        ? format(d, "yyyy-MM")
        : d.getDate() > selectedCard.closing_day
          ? format(addMonths(d, 1), "yyyy-MM")
          : format(d, "yyyy-MM");
    }

    onSubmit({
      description, amount: parseFloat(amount) || 0, category,
      account_id: accountId || null, date,
      is_realized: isRecurring ? false : (finalCreditCardId ? false : isRealized),
      credit_card_id: finalCreditCardId,
      invoice_month: invoiceMonth,
      account_id: finalAccountId || null,
      auto_realize: !isRecurring && !isRealized ? autoRealize : false,
      notes: initialData?.notes || "", type,
      is_recurring: isRecurring,
      recurring_frequency: isRecurring ? recurringFreq : null,
      recurring_day: isRecurring && recurringFreq === "monthly" ? recurringDay : null,
      recurring_end_date: isRecurring && recurringEndDate ? recurringEndDate : null,
    });
  };

  const showAutoRealize = !isRecurring && !isRealized;

  // ── Tokens de cor por tema ─────────────────────────────────
  const modalBg   = dark ? "#0c0e13" : "#ffffff";
  const headerBrd = dark ? "rgba(255,255,255,0.07)" : "rgba(17,24,39,0.06)";
  const text      = dark ? "#e8edf5" : "#0f172a";
  const muted     = dark ? "#6b7a96" : "#64748b";
  const inputBg   = dark ? "#12151c" : "#f8fafc";
  const inputBrd  = dark ? "rgba(255,255,255,0.08)" : "rgba(17,24,39,0.1)";
  const rowBg     = dark ? "rgba(255,255,255,0.03)" : "#f8fafc";
  const rowBrd    = dark ? "rgba(255,255,255,0.06)" : "rgba(17,24,39,0.07)";

  const incomeC  = { bg: "#059669", text: dark ? "#2ecc8a" : "#059669" };
  const expenseC = { bg: "#dc2626", text: dark ? "#e85d5d" : "#dc2626" };
  const currentTypeC = type === "income" ? incomeC : expenseC;
  const submitBg = type === "income"
    ? "linear-gradient(135deg,#059669,#047857)"
    : "linear-gradient(135deg,#dc2626,#b91c1c)";

  const inputStyle = {
    width: "100%", height: 40, padding: "0 12px",
    background: inputBg, border: `1px solid ${inputBrd}`,
    borderRadius: 12, color: text, fontSize: "0.85rem",
    fontFamily: "'Outfit',sans-serif", outline: "none",
    transition: "border-color .2s", boxSizing: "border-box",
  };

  const labelStyle = {
    fontSize: "0.65rem", fontWeight: 600, color: muted,
    textTransform: "uppercase", letterSpacing: "0.08em",
    display: "block", marginBottom: 5,
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)", zIndex: 50, display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 64 }}
    >
      <motion.div
        initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }}
        transition={{ type: "spring", damping: 28, stiffness: 280 }}
        onClick={e => e.stopPropagation()}
        style={{ background: modalBg, borderRadius: "24px 24px 0 0", width: "100%", maxWidth: 480, maxHeight: "90vh", display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: "'Outfit',sans-serif" }}
      >
        {/* Handle */}
        <div style={{ display: "flex", justifyContent: "center", paddingTop: 10, paddingBottom: 2 }}>
          <div style={{ width: 36, height: 4, borderRadius: 999, background: dark ? "rgba(255,255,255,0.1)" : "rgba(17,24,39,0.1)" }} />
        </div>

        {/* Header */}
        <div style={{ background: modalBg, padding: "10px 20px 12px", borderBottom: `1px solid ${headerBrd}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <p style={{ fontFamily: "'Cabinet Grotesk',sans-serif", fontWeight: 800, fontSize: "1rem", color: text, letterSpacing: "-0.02em", margin: 0 }}>
            {isEditing ? "Editar Transação" : "Nova Transação"}
          </p>
          <button type="button" onClick={onClose}
            style={{ width: 30, height: 30, borderRadius: "50%", background: dark ? "rgba(255,255,255,0.06)" : "#f1f4f9", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <X size={15} color={muted} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ flex: 1, overflowY: "auto", padding: "14px 20px 24px", display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Tipo */}
          <div style={{ display: "flex", gap: 6, padding: 5, background: dark ? "rgba(255,255,255,0.04)" : "#f1f4f9", borderRadius: 14, border: `1px solid ${rowBrd}` }}>
            {[
              { val: "income",  label: "Entrada", Icon: TrendingUp,   c: incomeC  },
              { val: "expense", label: "Saída",   Icon: TrendingDown, c: expenseC },
            ].map(({ val, label, Icon, c }) => (
              <motion.button key={val} type="button" whileTap={{ scale: 0.95 }}
                onClick={() => handleTypeChange(val)}
                style={{
                  flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                  padding: "8px 0", borderRadius: 10, border: "none", cursor: "pointer",
                  fontFamily: "'Cabinet Grotesk',sans-serif", fontWeight: 700, fontSize: "0.88rem",
                  background: type === val ? c.bg : "transparent",
                  color: type === val ? "#ffffff" : muted,
                  boxShadow: type === val ? `0 2px 12px ${c.bg}55` : "none",
                  transition: "all .2s",
                }}>
                <Icon size={15} strokeWidth={2.2} /> {label}
              </motion.button>
            ))}
          </div>

          {/* Valor */}
          <div>
            <label style={labelStyle}>Valor</label>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", fontSize: "0.9rem", fontWeight: 600, color: muted }}>R$</span>
              <input type="number" step="0.01" placeholder="0,00" value={amount}
                onChange={e => setAmount(e.target.value)}
                onFocus={e => e.target.style.borderColor = "#1d4ed8"}
                onBlur={e => e.target.style.borderColor = inputBrd}
                required
                style={{ ...inputStyle, height: 52, paddingLeft: 42, fontSize: "1.4rem", fontWeight: 800, fontFamily: "'Cabinet Grotesk',sans-serif", color: currentTypeC.text, letterSpacing: "-0.02em" }}
              />
            </div>
          </div>

          {/* Descrição */}
          <div>
            <label style={labelStyle}>Descrição</label>
            <input placeholder="Ex: Salário, Aluguel, Mercado..." value={description}
              onChange={e => handleDescriptionChange(e.target.value)}
              onFocus={e => e.target.style.borderColor = "#1d4ed8"}
              onBlur={e => e.target.style.borderColor = inputBrd}
              required style={inputStyle}
            />
          </div>

          <CategorySuggestion
            suggestion={suggestion} confidence={confidence}
            onAccept={handleAcceptSuggestion}
            onReject={() => setShowSuggestion(false)}
            isVisible={showSuggestion && !!suggestion && !category}
          />

          {/* Categoria + Carteira */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={labelStyle}>Categoria</label>
              <Select value={category} onValueChange={handleCategoryChange}>
                <SelectTrigger style={{ height: 40, borderRadius: 12, background: inputBg, border: `1px solid ${inputBrd}`, fontSize: "0.82rem", color: text, fontFamily: "'Outfit',sans-serif" }}>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map(cat => <SelectItem key={cat} value={cat.toLowerCase()}>{cat}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label style={labelStyle}>Carteira</label>
              <Select value={walletId} onValueChange={v => {
                setWalletId(v);
                // Sincroniza accountId para contas normais
                if (!v.startsWith("cc_")) setAccountId(v);
                else setAccountId("");
              }}>
                <SelectTrigger style={{ height: 40, borderRadius: 12, background: walletId.startsWith("cc_") ? (type==="expense"?"rgba(139,92,246,0.08)":inputBg) : inputBg, border: `1px solid ${walletId.startsWith("cc_")?"rgba(139,92,246,0.4)":inputBrd}`, fontSize: "0.82rem", color: text, fontFamily: "'Outfit',sans-serif" }}>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.length > 0 && (
                    <>
                      <SelectItem value="__sep_acc__" disabled style={{fontSize:"0.65rem",color:"#9ca3af",fontWeight:600}}>🏦 CONTAS</SelectItem>
                      {accounts.map(acc => <SelectItem key={acc.id} value={acc.id}>🏦 {acc.name}</SelectItem>)}
                    </>
                  )}
                  {type === "expense" && creditCards.length > 0 && (
                    <>
                      <SelectItem value="__sep_cc__" disabled style={{fontSize:"0.65rem",color:"#9ca3af",fontWeight:600}}>💳 CARTÕES</SelectItem>
                      {creditCards.map(cc => <SelectItem key={cc.id} value={"cc_"+cc.id}>💳 {cc.name}</SelectItem>)}
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Aviso quando cartão selecionado */}
          {selectedCard && (
            <div style={{ padding: "8px 12px", background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.2)", borderRadius: 10, fontSize: "0.7rem", color: "#8b5cf6" }}>
              💳 Vai para fatura de {(() => {
                const d = new Date(date + "T00:00:00");
                const m = selectedCard.expense_date_mode === "purchase_date"
                  ? format(d, "yyyy-MM")
                  : d.getDate() > selectedCard.closing_day
                    ? format(addMonths(d, 1), "yyyy-MM")
                    : format(d, "yyyy-MM");
                const [y,mo] = m.split("-");
                return new Date(Number(y), Number(mo)-1).toLocaleString("pt-BR",{month:"long",year:"numeric"});
              })()} · Não debita a conta agora
            </div>
          )}

          {/* Data */}
          <div>
            <label style={labelStyle}>{isRecurring ? "Primeira ocorrência" : "Data"}</label>
            <input type="date" value={date} onChange={e => handleDateChange(e.target.value)} required
              style={{ ...inputStyle, colorScheme: dark ? "dark" : "light" }} />
          </div>

          {/* Recorrente */}
          {!isEditing && (
            <div style={{ borderRadius: 14, border: `1px solid ${rowBrd}`, overflow: "hidden" }}>
              <button type="button" onClick={() => setIsRecurring(!isRecurring)}
                style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 14px", background: isRecurring ? (dark ? "rgba(29,78,216,0.08)" : "rgba(29,78,216,0.04)") : rowBg, border: "none", cursor: "pointer", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 10, background: isRecurring ? "rgba(29,78,216,0.12)" : (dark ? "rgba(255,255,255,0.05)" : "#f1f4f9"), display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Repeat size={15} color={isRecurring ? "#1d4ed8" : muted} />
                  </div>
                  <div style={{ textAlign: "left" }}>
                    <p style={{ fontSize: "0.85rem", fontWeight: 600, color: text, marginBottom: 1 }}>Recorrente</p>
                    <p style={{ fontSize: "0.68rem", color: muted }}>
                      {isRecurring ? "Ocorrências viram previsão automaticamente" : "Repetir todo mês, semana ou ano"}
                    </p>
                  </div>
                </div>
                <div onClick={e => e.stopPropagation()}>
                  <Switch checked={isRecurring} onCheckedChange={setIsRecurring} />
                </div>
              </button>

              <AnimatePresence>
                {isRecurring && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} style={{ overflow: "hidden" }}>
                    <div style={{ padding: "12px 14px", borderTop: `1px solid ${rowBrd}`, display: "flex", flexDirection: "column", gap: 12 }}>
                      <div>
                        <label style={labelStyle}>Frequência</label>
                        <div style={{ display: "flex", gap: 6 }}>
                          {frequencyOptions.map(({ value, label }) => (
                            <button key={value} type="button" onClick={() => setRecurringFreq(value)}
                              style={{ flex: 1, padding: "6px 0", fontSize: "0.72rem", fontWeight: 600, borderRadius: 10, border: `1px solid ${recurringFreq === value ? "#1d4ed8" : inputBrd}`, background: recurringFreq === value ? "#1d4ed8" : inputBg, color: recurringFreq === value ? "#fff" : muted, cursor: "pointer", fontFamily: "'Outfit',sans-serif", transition: "all .15s" }}>
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {recurringFreq === "monthly" && (
                        <div>
                          <label style={labelStyle}>Todo dia</label>
                          <Select value={String(recurringDay)} onValueChange={v => setRecurringDay(parseInt(v))}>
                            <SelectTrigger style={{ height: 40, borderRadius: 12, background: inputBg, border: `1px solid ${inputBrd}`, fontSize: "0.82rem", color: text }}>
                              <SelectValue placeholder="Dia" />
                            </SelectTrigger>
                            <SelectContent style={{ maxHeight: 200 }}>
                              {dayOptions.map(d => <SelectItem key={d} value={String(d)}>Dia {d}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <p style={{ fontSize: "0.65rem", color: muted, marginTop: 4 }}>Gera previsão todo dia {recurringDay} por 12 meses</p>
                        </div>
                      )}

                      <div>
                        <label style={labelStyle}>Encerra em <span style={{ fontWeight: 400, color: muted }}>(opcional)</span></label>
                        <input type="date" value={recurringEndDate} min={date}
                          onChange={e => setRecurringEndDate(e.target.value)}
                          style={{ ...inputStyle, colorScheme: dark ? "dark" : "light" }} />
                        <p style={{ fontSize: "0.65rem", color: muted, marginTop: 4 }}>Sem data final gera 12 meses</p>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Realizada / Auto realizar */}
          {!isRecurring && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 14px", background: rowBg, borderRadius: 14, border: `1px solid ${rowBrd}` }}>
                <div>
                  <p style={{ fontSize: "0.85rem", fontWeight: 600, color: text, marginBottom: 1 }}>Já foi realizada?</p>
                  <p style={{ fontSize: "0.68rem", color: muted }}>{isRealized ? "Transação confirmada" : "Previsão futura"}</p>
                </div>
                <Switch checked={isRealized} onCheckedChange={handleIsRealizedChange} />
              </div>

              <AnimatePresence>
                {showAutoRealize && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} style={{ overflow: "hidden" }}>
                    <div style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "11px 14px", borderRadius: 14,
                      background: autoRealize ? (dark ? "rgba(29,78,216,0.1)" : "rgba(29,78,216,0.05)") : rowBg,
                      border: `1px solid ${autoRealize ? (dark ? "rgba(29,78,216,0.25)" : "rgba(29,78,216,0.15)") : rowBrd}`,
                      transition: "all .2s",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: 10, background: autoRealize ? "rgba(29,78,216,0.12)" : (dark ? "rgba(255,255,255,0.05)" : "#f1f4f9"), display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <Zap size={15} color={autoRealize ? "#1d4ed8" : muted} />
                        </div>
                        <div>
                          <p style={{ fontSize: "0.85rem", fontWeight: 600, color: text, marginBottom: 1 }}>Realizar automaticamente</p>
                          <p style={{ fontSize: "0.68rem", color: muted }}>
                            {autoRealize ? `Será realizada em ${new Date(date + "T00:00:00").toLocaleDateString("pt-BR")}` : "Marcar como realizada na data de vencimento"}
                          </p>
                        </div>
                      </div>
                      <Switch checked={autoRealize} onCheckedChange={handleAutoRealizeChange} />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Submit */}
          <motion.button type="submit" whileTap={{ scale: 0.97 }}
            style={{
              width: "100%", height: 48, borderRadius: 14, border: "none", cursor: "pointer",
              background: submitBg, color: "#ffffff",
              fontFamily: "'Cabinet Grotesk',sans-serif",
              fontWeight: 800, fontSize: "0.95rem", letterSpacing: "-0.01em",
              boxShadow: type === "income" ? "0 4px 16px rgba(5,150,105,0.35)" : "0 4px 16px rgba(220,38,38,0.35)",
              marginTop: 4,
            }}>
            {isEditing ? "Salvar alterações" : isRecurring ? `Criar recorrência ${type === "income" ? "de entrada" : "de saída"}` : `Adicionar ${type === "income" ? "Entrada" : "Saída"}`}
          </motion.button>

        </form>
      </motion.div>
    </motion.div>
  );
}