import React, { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import { useAuth } from "@/lib/AuthContext";
import { supabase } from "@/lib/supabase";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Sparkles, Send, X, Check, AlertCircle,
  TrendingUp, TrendingDown, Wallet, MessageCircle,
  BarChart2, RefreshCw, Clock, ChevronDown, ChevronUp,
  CheckCircle2, AlertTriangle, Info, PiggyBank, Calendar,
  Target, Building2, Mail, Trash2, CheckCheck, Mic, MicOff
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const NAV_HEIGHT = 68;

function getBrasiliaDate() {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit"
  }).format(new Date()).split("/").reverse().join("-");
}
function getBrasiliaMonth() { return getBrasiliaDate().slice(0, 7); }

function useIsDark() {
  const [dark, setDark] = useState(() => localStorage.getItem("darkMode") === "true");
  useEffect(() => {
    const h = (e) => setDark(e.detail);
    window.addEventListener("darkModeChange", h);
    return () => window.removeEventListener("darkModeChange", h);
  }, []);
  return dark;
}

const QUICK_QUESTIONS = [
  { icon: "💰", text: "Posso gastar R$500 essa semana?" },
  { icon: "📊", text: "Como estão minhas finanças?" },
  { icon: "✂️", text: "Como reduzir meus gastos?" },
  { icon: "🎯", text: "Estou no caminho certo?" },
  { icon: "🏦", text: "Quanto tenho investido?" },
  { icon: "⚠️", text: "Tenho contas vencendo?" },
];

const CATEGORIES = [
  { value: "alimentação", label: "🍔 Alimentação" },
  { value: "transporte",  label: "🚗 Transporte"  },
  { value: "moradia",     label: "🏠 Moradia"     },
  { value: "saúde",       label: "❤️ Saúde"       },
  { value: "educação",    label: "📚 Educação"    },
  { value: "lazer",       label: "🎉 Lazer"       },
  { value: "compras",     label: "🛍️ Compras"    },
  { value: "outros",      label: "📦 Outros"      },
];

const scoreColors = {
  red: "from-red-500 to-rose-600", orange: "from-orange-500 to-amber-600",
  yellow: "from-yellow-500 to-amber-500", blue: "from-blue-500 to-indigo-600",
  green: "from-emerald-500 to-teal-600",
};

const insightIcons = {
  positivo: { icon: CheckCircle2, color: "text-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-900/20", border: "border-emerald-200 dark:border-emerald-800" },
  negativo: { icon: AlertTriangle, color: "text-red-500",    bg: "bg-red-50 dark:bg-red-900/20",         border: "border-red-200 dark:border-red-800"         },
  neutro:   { icon: Info,          color: "text-blue-500",   bg: "bg-blue-50 dark:bg-blue-900/20",        border: "border-blue-200 dark:border-blue-800"        },
};

const months = [
  { value: "01", label: "Janeiro" }, { value: "02", label: "Fevereiro" },
  { value: "03", label: "Março"   }, { value: "04", label: "Abril"     },
  { value: "05", label: "Maio"    }, { value: "06", label: "Junho"     },
  { value: "07", label: "Julho"   }, { value: "08", label: "Agosto"    },
  { value: "09", label: "Setembro"}, { value: "10", label: "Outubro"   },
  { value: "11", label: "Novembro"}, { value: "12", label: "Dezembro"  },
];

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 3 }, (_, i) => currentYear - i);

function parseBlock(content, tag, endTag) {
  try {
    const match = content?.match(new RegExp(`${tag}(.*?)${endTag}`, "s"));
    if (!match) return null;
    let json = match[1].replace(/(\d)\.(\d{3})/g, "$1$2").trim();
    return JSON.parse(json);
  } catch {}
  return null;
}

function parsePendingTx(c)      { return parseBlock(c, "__PENDING_TX__",      "__END_TX__")            }
function parseRecurringTx(c) {
  const m1 = c?.match(/__RECURRING_TX__([\s\S]*?)__END_RECURRING__/);
  const m2 = c?.match(/RECURRING_TX([\s\S]*?)END_RECURRING/);
  const m = m1 || m2;
  if (!m) return null;
  try { let json = m[1].replace(/(\d)\.(\d{3})/g, "$1$2").trim(); return JSON.parse(json); } catch { return null; }
}
function parsePartialRealize(c) { return parseBlock(c, "__PARTIAL_REALIZE__", "__END_PARTIAL__")       }
function parseRealizeTx(c)      { return parseBlock(c, "__REALIZE_TX__",      "__END_REALIZE__")       }
function parseDeleteTx(c)       { return parseBlock(c, "__DELETE_TX__",       "__END_DELETE__")        }
function parseCreateGoal(c)     { return parseBlock(c, "__CREATE_GOAL__",     "__END_GOAL__")          }
function parseDeleteGoal(c)     { return parseBlock(c, "__DELETE_GOAL__",     "__END_DELETE_GOAL__")   }
function parseCreateAccount(c)  { return parseBlock(c, "__CREATE_ACCOUNT__",  "__END_ACCOUNT__")       }
function parseDeleteAccount(c)  { return parseBlock(c, "__DELETE_ACCOUNT__",  "__END_DELETE_ACCOUNT__")}
function parseSendInvite(c)     { return parseBlock(c, "__SEND_INVITE__",     "__END_INVITE__")        }

function cleanContent(content) {
  return content
    ?.replace(/__PENDING_TX__.*?__END_TX__/s, "")
    ?.replace(/__RECURRING_TX__.*?__END_RECURRING__/s, "")
    ?.replace(/RECURRING_TX\b.*?END_RECURRING/s, "")
    ?.replace(/RECURRING_TX.*?END_RECURRING/s, "")
    ?.replace(/__REALIZE_TX__.*?__END_REALIZE__/s, "")
    ?.replace(/__DELETE_TX__.*?__END_DELETE__/s, "")
    ?.replace(/__CREATE_GOAL__.*?__END_GOAL__/s, "")
    ?.replace(/__DELETE_GOAL__.*?__END_DELETE_GOAL__/s, "")
    ?.replace(/__CREATE_ACCOUNT__.*?__END_ACCOUNT__/s, "")
    ?.replace(/__DELETE_ACCOUNT__.*?__END_DELETE_ACCOUNT__/s, "")
    ?.replace(/__SEND_INVITE__.*?__END_INVITE__/s, "")
    ?.replace(/__PARTIAL_REALIZE__.*?__END_PARTIAL__/s, "")
    ?.replace(/NO_ACTION.*?END_NO_ACTION/s, "")
    ?.trim() || "";
}

function buildHistory(messages) {
  const CONFIRMATION_PATTERNS = [
    /^✅ \*\*Lançado/, /^✅ \*\*Transferência/, /^✅ \*\*Pago/,
    /^✅ \*\*Meta criada/, /^✅ \*\*Conta criada/, /^✅ \*\*Convite/,
    /^✅ \*\*Pagamento parcial/, /^✅ \*\*\d+ lançamentos/,
    /^🗑️/, /^❌ Cancelado/, /^❌ Erro/, /^Confira os dados abaixo/,
  ];
  return messages.slice(1)
    .filter(m => {
      const clean = cleanContent(m.content);
      if (m.role === "assistant" && CONFIRMATION_PATTERNS.some(p => p.test(clean))) return false;
      return true;
    })
    .map(m => ({ role: m.role, content: cleanContent(m.content) }));
}

const fmt = (v) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

function Row({ label, value }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
      <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{value}</span>
    </div>
  );
}

function AutoRealizeToggle({ value, onChange }) {
  return (
    <div className="mt-2 p-3 bg-violet-50 dark:bg-violet-900/20 rounded-xl border border-violet-100 dark:border-violet-800">
      <p className="text-xs font-medium text-violet-700 dark:text-violet-300 mb-1">🤖 Registrar automaticamente no dia?</p>
      <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-2.5">Se ativado, o Planeje registra sozinho quando chegar a data.</p>
      <div className="flex gap-2">
        <button onClick={() => onChange(true)} className={`flex-1 h-8 rounded-xl text-xs font-medium transition-all ${value === true ? "bg-violet-600 text-white shadow-sm" : "bg-white dark:bg-gray-700 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-600"}`}>✅ Sim, automático</button>
        <button onClick={() => onChange(false)} className={`flex-1 h-8 rounded-xl text-xs font-medium transition-all ${value === false ? "bg-gray-600 text-white shadow-sm" : "bg-white dark:bg-gray-700 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-600"}`}>📋 Não, só previsto</button>
      </div>
    </div>
  );
}

function ActionCard({ action, onConfirm, onCancel, confirmLoading, onSetAutoRealize }) {
  if (!action) return null;
  const isPending   = action._type === "tx" && action.is_realized === false;
  const isRecurring = action._type === "recurring";
  const showAutoRealize = isPending || isRecurring;
  const configs = {
    tx: { icon: action.type === "expense" ? TrendingDown : TrendingUp, color: action.intent === "transfer" ? "text-blue-600" : action.type === "expense" ? "text-red-600" : "text-emerald-600", title: action.intent === "transfer" ? "Confirmar transferência" : action.is_realized === false ? "Confirmar prevista" : "Confirmar lançamento", headerColor: "from-violet-50 to-indigo-50 dark:from-violet-900/30 dark:to-indigo-900/30", borderColor: "border-violet-200 dark:border-violet-800" },
    recurring:       { icon: RefreshCw,  color: "text-violet-600", title: "Lançamento recorrente", headerColor: "from-violet-50 to-indigo-50 dark:from-violet-900/30 dark:to-indigo-900/30", borderColor: "border-violet-200 dark:border-violet-800" },
    partial_realize: { icon: CheckCheck,  color: "text-blue-600",    title: "Pagamento parcial",    headerColor: "from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-indigo-900/30",     borderColor: "border-blue-200 dark:border-blue-800"    },
    realize:         { icon: CheckCheck,  color: "text-emerald-600", title: "Realizar prevista",    headerColor: "from-emerald-50 to-teal-50 dark:from-emerald-900/30 dark:to-teal-900/30",  borderColor: "border-emerald-200 dark:border-emerald-800" },
    delete_tx:       { icon: Trash2,      color: "text-red-600",     title: "Excluir transação",    headerColor: "from-red-50 to-rose-50 dark:from-red-900/30 dark:to-rose-900/30",          borderColor: "border-red-200 dark:border-red-800"      },
    create_goal:     { icon: Target,      color: "text-violet-600",  title: "Criar meta",           headerColor: "from-violet-50 to-indigo-50 dark:from-violet-900/30 dark:to-indigo-900/30",borderColor: "border-violet-200 dark:border-violet-800" },
    delete_goal:     { icon: Trash2,      color: "text-red-600",     title: "Excluir meta",         headerColor: "from-red-50 to-rose-50 dark:from-red-900/30 dark:to-rose-900/30",          borderColor: "border-red-200 dark:border-red-800"      },
    create_account:  { icon: Building2,   color: "text-blue-600",    title: "Criar conta",          headerColor: "from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-indigo-900/30",    borderColor: "border-blue-200 dark:border-blue-800"    },
    delete_account:  { icon: Trash2,      color: "text-red-600",     title: "Excluir conta",        headerColor: "from-red-50 to-rose-50 dark:from-red-900/30 dark:to-rose-900/30",          borderColor: "border-red-200 dark:border-red-800"      },
    send_invite:     { icon: Mail,        color: "text-blue-600",    title: "Enviar convite",       headerColor: "from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-indigo-900/30",    borderColor: "border-blue-200 dark:border-blue-800"    },
  };
  const cfg  = configs[action._type] || configs.tx;
  const Icon = cfg.icon;
  const needsAutoRealize = showAutoRealize && action.auto_realize === undefined;

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
      <div className={`bg-white dark:bg-gray-800 rounded-2xl border ${cfg.borderColor} overflow-hidden mx-1`}>
        <div className={`bg-gradient-to-r ${cfg.headerColor} px-4 py-2.5 border-b ${cfg.borderColor} flex items-center gap-2`}>
          <Icon className={`w-4 h-4 ${cfg.color}`} />
          <p className={`text-sm font-medium ${cfg.color}`}>{cfg.title}</p>
        </div>
        <div className="px-4 py-3 space-y-2.5">
          {action._type === "tx" && !action.intent && (<>
            <Row label="Valor" value={<span className={`text-lg font-bold ${cfg.color}`}>{fmt(action.amount)}</span>} />
            <Row label="Tipo" value={<span className={`text-sm font-medium ${cfg.color}`}>{action.type === "expense" ? "💸 Saída" : "💰 Entrada"}</span>} />
            <Row label="Descrição" value={action.description} />
            <Row label="Categoria" value={<span className="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full capitalize">{action.category}</span>} />
            {action.account_name && <Row label="Conta" value={action.account_name} />}
            <Row label="Data" value={action.date} />
            <Row label="Status" value={<span className={`text-xs font-medium px-2 py-0.5 rounded-full ${action.is_realized ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{action.is_realized ? "✅ Realizado" : "📋 Previsto"}</span>} />
            {isPending && <AutoRealizeToggle value={action.auto_realize} onChange={onSetAutoRealize} />}
          </>)}
          {action._type === "tx" && action.intent === "transfer" && (<>
            <Row label="Valor" value={<span className={`text-lg font-bold ${cfg.color}`}>{fmt(action.amount)}</span>} />
            <Row label="De" value={action.from_account} />
            <Row label="Para" value={action.to_account} />
            <Row label="Data" value={action.date} />
          </>)}
          {action._type === "recurring" && (<>
            <Row label="Descrição" value={action.description} />
            <Row label="Tipo" value={<span className={`text-sm font-medium ${cfg.color}`}>{action.type === "expense" ? "💸 Saída" : "💰 Entrada"}</span>} />
            <Row label="Valor" value={<span className={`text-lg font-bold ${cfg.color}`}>{fmt(action.amount)}</span>} />
            <Row label="Categoria" value={<span className="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full capitalize">{action.category}</span>} />
            {action.account_name && <Row label="Conta" value={action.account_name} />}
            <Row label="Todo dia" value={<span className="text-sm font-medium text-violet-600">dia {action.day} de cada mês</span>} />
            <Row label="Duração" value={`${action.months} meses`} />
            <div className="bg-violet-50 dark:bg-violet-900/20 rounded-xl px-3 py-2 text-xs text-violet-600 dark:text-violet-400 font-medium">📅 {action.months} previstas serão criadas a partir de {action.start_date}</div>
            <AutoRealizeToggle value={action.auto_realize} onChange={onSetAutoRealize} />
          </>)}
          {action._type === "realize" && (<>
            <Row label="Descrição" value={action.description} />
            <Row label="Valor" value={<span className="text-base font-bold text-emerald-600">{fmt(action.amount)}</span>} />
            <Row label="Data" value={action.date} />
          </>)}
          {action._type === "partial_realize" && (<>
            <Row label="Descrição" value={action.description} />
            <Row label="Valor pago" value={<span className="text-base font-bold text-emerald-600">{fmt(action.paid_amount)}</span>} />
            <Row label="Restante" value={<span className="text-base font-bold text-amber-600">{fmt(action.remaining_amount)}</span>} />
            <Row label="Data" value={action.date} />
          </>)}
          {action._type === "delete_tx" && (<><Row label="Descrição" value={action.description} /><Row label="Valor" value={fmt(action.amount)} /><p className="text-xs text-red-500 font-medium">⚠️ Esta ação não pode ser desfeita!</p></>)}
          {action._type === "create_goal" && (<><Row label="Nome" value={action.name} /><Row label="Tipo" value={action.type === "expense" ? "📉 Limite de gasto" : action.type === "income" ? "📈 Meta de renda" : "💹 Investimento"} /><Row label="Valor" value={<span className="text-base font-bold text-violet-600">{fmt(action.target_amount)}</span>} /><Row label="Período" value={`${action.start_date} até ${action.end_date}`} /></>)}
          {action._type === "delete_goal" && (<><Row label="Meta" value={action.name} /><p className="text-xs text-red-500 font-medium">⚠️ Esta ação não pode ser desfeita!</p></>)}
          {action._type === "create_account" && (<><Row label="Nome" value={action.name} /><Row label="Tipo" value={{ bank: "🏦 Bancária", digital: "📱 Digital", wallet: "👛 Carteira", investment: "📈 Investimento", other: "📦 Outro" }[action.type] || action.type} /><Row label="Saldo inicial" value={fmt(action.initial_balance)} /></>)}
          {action._type === "delete_account" && (<><Row label="Conta" value={action.name} /><p className="text-xs text-red-500 font-medium">⚠️ A conta será removida mas as transações serão mantidas.</p></>)}
          {action._type === "send_invite" && (<><Row label="Para" value={action.email} />{action.name && <Row label="Nome" value={action.name} />}</>)}
          {needsAutoRealize && (<p className="text-[10px] text-amber-600 dark:text-amber-400 text-center">👆 Escolha uma opção acima para confirmar</p>)}
        </div>
        <div className="flex gap-2 px-4 pb-4">
          <button onClick={onCancel} className="flex-1 h-10 rounded-xl border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 text-sm font-medium flex items-center justify-center gap-1.5">
            <X className="w-3.5 h-3.5" /> Cancelar
          </button>
          <button onClick={onConfirm} disabled={confirmLoading || needsAutoRealize}
            className={`flex-1 h-10 rounded-xl text-white text-sm font-medium flex items-center justify-center gap-1.5 disabled:opacity-50 ${["delete_tx","delete_goal","delete_account"].includes(action._type) ? "bg-red-500 hover:bg-red-600" : action._type === "realize" ? "bg-emerald-500 hover:bg-emerald-600" : "bg-gradient-to-r from-violet-600 to-indigo-600"}`}>
            {confirmLoading
              ? <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full" />
              : <><Check className="w-3.5 h-3.5" /> Confirmar</>}
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function useSpeechRecognition({ onResult }) {
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef(null);
  const start = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert("Reconhecimento de voz não suportado."); return; }
    const r = new SR();
    r.lang = "pt-BR"; r.continuous = false; r.interimResults = false;
    r.onstart = () => setListening(true); r.onend = () => setListening(false); r.onerror = () => setListening(false);
    r.onresult = (e) => onResult(e.results[0][0].transcript);
    r.onspeechend = () => r.stop();
    recognitionRef.current = r; r.start();
  };
  const stop = () => { recognitionRef.current?.stop(); setListening(false); };
  return { listening, start, stop };
}

// ── Chat Tab ──────────────────────────────────────────────────
function ChatTab({ user, dark }) {
  const [messages, setMessages]             = useState([]);
  const [input, setInput]                   = useState("");
  const [loading, setLoading]               = useState(false);
  const [pendingAction, setPendingAction]   = useState(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [wizard, setWizard]                 = useState(null);
  const loadingRef    = useRef(false);
  const confirmingRef = useRef(false);
  const endRef        = useRef(null);
  const inputRef      = useRef(null);
  const today         = getBrasiliaDate();
  const currentMonth  = getBrasiliaMonth();

  const bg      = dark ? "#060709" : "#f1f4f9";
  const cardBg  = dark ? "#0c0e13" : "#ffffff";
  const cardBrd = dark ? "rgba(255,255,255,0.07)" : "rgba(17,24,39,0.06)";
  const muted   = dark ? "#6b7a96" : "#64748b";
  const text    = dark ? "#e8edf5" : "#0f172a";
  const inputBg = dark ? "#12151c" : "#f8fafc";
  const inputBrd = dark ? "rgba(255,255,255,0.08)" : "rgba(17,24,39,0.1)";

  useEffect(() => {
    setMessages([{ role: "assistant", content: `Olá! Sou o **Finn** ✨\n\nSeu assistente financeiro pessoal. Posso responder perguntas, **registrar transações**, **criar metas e contas**, **lançamentos recorrentes** e muito mais!\n\nComo posso te ajudar hoje?` }]);
  }, [user?.id]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, pendingAction]);

  const detectAction = (reply) => {
    const rc = parseRecurringTx(reply); if (rc) return { ...rc, _type: "recurring" };
    const tx = parsePendingTx(reply);   if (tx) return { ...tx, _type: "tx" };
    const pr = parsePartialRealize(reply); if (pr) return { ...pr, _type: "partial_realize" };
    const re = parseRealizeTx(reply);   if (re) return { ...re, _type: "realize" };
    const dt = parseDeleteTx(reply);    if (dt) return { ...dt, _type: "delete_tx" };
    const cg = parseCreateGoal(reply);  if (cg) return { ...cg, _type: "create_goal" };
    const dg = parseDeleteGoal(reply);  if (dg) return { ...dg, _type: "delete_goal" };
    const ca = parseCreateAccount(reply); if (ca) return { ...ca, _type: "create_account" };
    const da = parseDeleteAccount(reply); if (da) return { ...da, _type: "delete_account" };
    const si = parseSendInvite(reply);  if (si) return { ...si, _type: "send_invite" };
    return null;
  };

  const handleSetAutoRealize = (value) => setPendingAction(prev => prev ? { ...prev, auto_realize: value } : prev);

  const startWizard = async (type) => {
    setShowSuggestions(false); setPendingAction(null);
    const { data: accs } = await supabase.from("accounts").select("id, name, type").eq("user_id", user.id);
    const label = type === "expense" ? "despesa" : type === "income" ? "entrada" : "transferência";
    const emoji = type === "expense" ? "💸" : type === "income" ? "💰" : "🔄";
    setWizard({ type, step: "amount", data: { _accounts: accs || [] } });
    setMessages(prev => [...prev, { role: "assistant", content: `${emoji} Vamos registrar uma **${label}**!\n\nQual o **valor**?` }]);
  };

  const handleWizardInput = async (value) => {
    const w = { ...wizard, data: { ...wizard.data } };
    if (w.step === "amount") {
      const amount = parseFloat(value.replace(",", ".").replace(/[^0-9.]/g, ""));
      if (!amount || amount <= 0) { setMessages(prev => [...prev, { role: "assistant", content: "❓ Valor inválido. Ex: **50** ou **32,90**" }]); return; }
      w.data.amount = amount;
      if (w.type === "transfer") { w.step = "from_account"; setWizard(w); setMessages(prev => [...prev, { role: "assistant", content: `De qual conta?\n\n${w.data._accounts.map(a => `• **${a.name}**`).join("\n")}` }]); }
      else { w.step = "description"; setWizard(w); setMessages(prev => [...prev, { role: "assistant", content: "O que foi? (ex: mercado, uber, salário)" }]); }
      return;
    }
    if (w.step === "description") { w.data.description = value; w.step = "category"; setWizard(w); setMessages(prev => [...prev, { role: "assistant", content: `Qual categoria?\n\n${CATEGORIES.map(c => `• ${c.label}`).join("\n")}` }]); return; }
    if (w.step === "category") {
      const found = CATEGORIES.find(c => c.value.includes(value.toLowerCase()) || c.label.toLowerCase().includes(value.toLowerCase()));
      if (!found) { setMessages(prev => [...prev, { role: "assistant", content: "❓ Digite: alimentação, transporte, moradia, saúde, educação, lazer, compras ou outros" }]); return; }
      w.data.category = found.value; w.step = "account"; setWizard(w);
      setMessages(prev => [...prev, { role: "assistant", content: `Qual conta?\n\n${w.data._accounts.map(a => `• **${a.name}**`).join("\n")}` }]); return;
    }
    if (w.step === "account") {
      const found = w.data._accounts.find(a => a.name.toLowerCase().includes(value.toLowerCase()));
      if (!found) { setMessages(prev => [...prev, { role: "assistant", content: `❓ Escolha:\n\n${w.data._accounts.map(a => `• **${a.name}**`).join("\n")}` }]); return; }
      w.data.account_id = found.id; w.data.account_name = found.name; setWizard(null);
      setPendingAction({ _type: "tx", type: w.type, amount: w.data.amount, description: w.data.description, category: w.data.category, account_name: w.data.account_name, account_id: w.data.account_id, date: today, is_realized: true });
      setMessages(prev => [...prev, { role: "assistant", content: "Confira os dados abaixo 👇" }]); return;
    }
    if (w.step === "from_account") {
      const found = w.data._accounts.find(a => a.name.toLowerCase().includes(value.toLowerCase()));
      if (!found) { setMessages(prev => [...prev, { role: "assistant", content: `❓ Escolha:\n\n${w.data._accounts.map(a => `• **${a.name}**`).join("\n")}` }]); return; }
      w.data.from_account_id = found.id; w.data.from_account_name = found.name; w.step = "to_account"; setWizard(w);
      const remaining = w.data._accounts.filter(a => a.id !== found.id).map(a => `• **${a.name}**`).join("\n");
      setMessages(prev => [...prev, { role: "assistant", content: `Para qual conta?\n\n${remaining}` }]); return;
    }
    if (w.step === "to_account") {
      const found = w.data._accounts.find(a => a.name.toLowerCase().includes(value.toLowerCase()) && a.id !== w.data.from_account_id);
      if (!found) { const rem = w.data._accounts.filter(a => a.id !== w.data.from_account_id).map(a => `• **${a.name}**`).join("\n"); setMessages(prev => [...prev, { role: "assistant", content: `❓ Escolha:\n\n${rem}` }]); return; }
      w.data.to_account_id = found.id; w.data.to_account_name = found.name; setWizard(null);
      setPendingAction({ _type: "tx", intent: "transfer", amount: w.data.amount, from_account: w.data.from_account_name, to_account: w.data.to_account_name, from_account_id: w.data.from_account_id, to_account_id: w.data.to_account_id, date: today });
      setMessages(prev => [...prev, { role: "assistant", content: "Confira os dados abaixo 👇" }]); return;
    }
  };

  const sendMessage = async (text) => {
    const message = (text || input).trim();
    if (!message || loadingRef.current) return;
    setInput(""); setLoading(true); loadingRef.current = true;
    setMessages(prev => [...prev, { role: "user", content: message }]);
    if (wizard) { loadingRef.current = false; setLoading(false); await handleWizardInput(message); return; }
    setShowSuggestions(false);
    try {
      const history = buildHistory(messages);
      const { data: result, error: err } = await supabase.functions.invoke("ai-chat", { body: { userId: user.id, message, history, month: currentMonth } });
      if (err || result?.error) throw new Error(result?.error || "Erro");
      const reply  = result.reply;
      const action = detectAction(reply);
      if (action) setPendingAction(action); else setPendingAction(null);
      setMessages(prev => [...prev, { role: "assistant", content: reply }]);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "😕 Não entendi bem. Pode reformular?" }]);
    } finally { setLoading(false); loadingRef.current = false; }
  };

  const confirmAction = async () => {
    if (!pendingAction || confirmLoading || confirmingRef.current) return;
    confirmingRef.current = true;
    setConfirmLoading(true);
    const action = pendingAction;
    const confirmDate = (action.is_realized === false && action.date) ? action.date : getBrasiliaDate();
    try {
      if (action._type === "tx" && !action.intent) {
        setPendingAction(null);
        let accountId = action.account_id || null;
        if (!accountId && action.account_name) { const { data: accs } = await supabase.from("accounts").select("id").eq("user_id", user.id).ilike("name", `%${action.account_name}%`).limit(1); accountId = accs?.[0]?.id || null; }
        const { error } = await supabase.from("transactions").insert({ user_id: user.id, type: action.type, amount: action.amount, description: action.description, category: action.category, account_id: accountId, date: confirmDate, is_realized: action.is_realized ?? true, auto_realize: action.is_realized === false ? (action.auto_realize ?? false) : null });
        if (error) throw error;
        const autoMsg = action.is_realized === false && action.auto_realize ? " · registro automático ativado ✅" : "";
        setMessages(prev => [...prev, { role: "assistant", content: `✅ **Lançado!**\n\n${action.type === "expense" ? "💸" : "💰"} **${fmt(action.amount)}** — ${action.description}\n📅 ${confirmDate}${autoMsg}` }]);
      } else if (action._type === "tx" && action.intent === "transfer") {
        const { error } = await supabase.from("transactions").insert({ user_id: user.id, type: "transfer", amount: action.amount, description: "Transferência", account_id: action.from_account_id, transfer_account_id: action.to_account_id, date: confirmDate, is_realized: true });
        if (error) throw error;
        setPendingAction(null);
        setMessages(prev => [...prev, { role: "assistant", content: `✅ **Transferência lançada!**\n\n🔄 **${fmt(action.amount)}** — ${action.from_account} → ${action.to_account}` }]);
      } else if (action._type === "recurring") {
        setPendingAction(null);
        const { data: result, error } = await supabase.functions.invoke("create-recurring", { body: { userId: user.id, type: action.type, amount: action.amount, description: action.description, category: action.category, accountName: action.account_name, day: action.day, months: action.months, frequency: action.frequency || "monthly", startDate: action.start_date || getBrasiliaDate(), autoRealize: action.auto_realize ?? false } });
        if (error || result?.error) throw new Error(result?.error || "Erro ao criar recorrentes");
        const autoMsg = action.auto_realize ? " com **registro automático** ✅" : "";
        setMessages(prev => [...prev, { role: "assistant", content: `✅ **${result.inserted} lançamentos recorrentes criados!**\n\n🔄 **${fmt(action.amount)}** — ${action.description}\n📅 Todo dia ${action.day} por ${action.months} meses${autoMsg}` }]);
      } else if (action._type === "partial_realize") {
        await supabase.from("transactions").update({ amount: action.remaining_amount }).eq("id", action.id).eq("user_id", user.id);
        let accountId = null;
        if (action.account_name) { const { data: accs } = await supabase.from("accounts").select("id").eq("user_id", user.id).ilike("name", `%${action.account_name}%`).limit(1); accountId = accs?.[0]?.id || null; }
        await supabase.from("transactions").insert({ user_id: user.id, type: "expense", amount: action.paid_amount, description: action.description, category: action.category, account_id: accountId, date: confirmDate, is_realized: true });
        setPendingAction(null);
        setMessages(prev => [...prev, { role: "assistant", content: `✅ **Pagamento parcial registrado!**\n\n💸 **${fmt(action.paid_amount)}** pago — restante: **${fmt(action.remaining_amount)}**` }]);
      } else if (action._type === "realize") {
        const { error } = await supabase.from("transactions").update({ is_realized: true, date: confirmDate }).eq("id", action.id).eq("user_id", user.id);
        if (error) throw error;
        setPendingAction(null);
        setMessages(prev => [...prev, { role: "assistant", content: `✅ **Pago!** ${action.description} marcado como realizado.` }]);
      } else if (action._type === "delete_tx") {
        await supabase.from("transactions").delete().eq("id", action.id).eq("user_id", user.id);
        setPendingAction(null);
        setMessages(prev => [...prev, { role: "assistant", content: `🗑️ Transação excluída.` }]);
      } else if (action._type === "create_goal") {
        await supabase.from("goals").insert({ user_id: user.id, name: action.name, type: action.type, category: action.category, target_amount: action.target_amount, start_date: action.start_date, end_date: action.end_date });
        setPendingAction(null);
        setMessages(prev => [...prev, { role: "assistant", content: `✅ **Meta criada!** 🎯 ${action.name} — ${fmt(action.target_amount)}` }]);
      } else if (action._type === "delete_goal") {
        await supabase.from("goals").delete().eq("id", action.id).eq("user_id", user.id);
        setPendingAction(null);
        setMessages(prev => [...prev, { role: "assistant", content: `🗑️ Meta excluída.` }]);
      } else if (action._type === "create_account") {
        await supabase.from("accounts").insert({ user_id: user.id, name: action.name, type: action.type || "bank", initial_balance: action.initial_balance || 0, color: "bg-blue-500" });
        setPendingAction(null);
        setMessages(prev => [...prev, { role: "assistant", content: `✅ **Conta criada!** 🏦 ${action.name}` }]);
      } else if (action._type === "delete_account") {
        await supabase.from("accounts").delete().eq("id", action.id).eq("user_id", user.id);
        setPendingAction(null);
        setMessages(prev => [...prev, { role: "assistant", content: `🗑️ Conta excluída.` }]);
      } else if (action._type === "send_invite") {
        const { data: profile } = await supabase.from("profiles").select("referral_code").eq("id", user.id).single();
        const referralLink = `https://www.planejapp.com.br/subscribe?ref=${profile?.referral_code || ""}`;
        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-email`, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` }, body: JSON.stringify({ to: action.email, senderEmail: "noreply@planejapp.com.br", senderName: "Planeje", subject: `Você foi convidado para o Planeje! 💜`, html: `<p>Olá${action.name ? ", " + action.name : ""}! Acesse: <a href="${referralLink}">${referralLink}</a></p>` }) });
        if (!res.ok) throw new Error("Erro ao enviar email");
        setPendingAction(null);
        setMessages(prev => [...prev, { role: "assistant", content: `✅ **Convite enviado!** 📧 ${action.email}` }]);
      }
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "❌ Erro ao executar. Tente novamente." }]);
      setPendingAction(null);
    } finally { setConfirmLoading(false); confirmingRef.current = false; }
  };

  const { listening, start, stop } = useSpeechRecognition({ onResult: (transcript) => { setInput(transcript); sendMessage(transcript); } });
  const cancelAction = () => { setPendingAction(null); setWizard(null); setMessages(prev => [...prev, { role: "assistant", content: "❌ Cancelado!" }]); };

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, background: bg }}>
      {/* Mensagens */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        {messages.map((msg, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ display: "flex", gap: 10, flexDirection: msg.role === "user" ? "row-reverse" : "row" }}>
            {msg.role === "assistant" && (
              <div style={{ width: 28, height: 28, borderRadius: 10, background: "linear-gradient(135deg,#7c3aed,#4f46e5)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>
                <Sparkles size={13} color="#fff" />
              </div>
            )}
            <div style={{ maxWidth: "82%", display: "flex", flexDirection: "column", alignItems: msg.role === "user" ? "flex-end" : "flex-start" }}>
              <div style={{
                borderRadius: msg.role === "user" ? "16px 4px 16px 16px" : "4px 16px 16px 16px",
                padding: "10px 14px",
                background: msg.role === "user"
                  ? "linear-gradient(135deg,#6d28d9,#4338ca)"
                  : (dark ? "#0c0e13" : "#ffffff"),
                border: msg.role === "assistant" ? `1px solid ${cardBrd}` : "none",
                color: msg.role === "user" ? "#ffffff" : text,
                fontSize: "0.85rem", lineHeight: 1.55,
              }}>
                <ReactMarkdown className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1" style={{ color: "inherit" }}>
                  {cleanContent(msg.content)}
                </ReactMarkdown>
              </div>
            </div>
          </motion.div>
        ))}

        <AnimatePresence>
          {pendingAction && (
            <ActionCard action={pendingAction} onConfirm={confirmAction} onCancel={cancelAction} confirmLoading={confirmLoading} onSetAutoRealize={handleSetAutoRealize} />
          )}
        </AnimatePresence>

        {loading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: "flex", gap: 10 }}>
            <div style={{ width: 28, height: 28, borderRadius: 10, background: "linear-gradient(135deg,#7c3aed,#4f46e5)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Sparkles size={13} color="#fff" />
            </div>
            <div style={{ background: dark ? "#0c0e13" : "#ffffff", border: `1px solid ${cardBrd}`, borderRadius: "4px 16px 16px 16px", padding: "10px 16px" }}>
              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                {[0,1,2].map(i => (
                  <motion.div key={i} animate={{ y: [0,-4,0], opacity: [0.4,1,0.4] }} transition={{ duration: 0.6, repeat: Infinity, delay: i*0.15 }} style={{ width: 6, height: 6, background: "#7c3aed", borderRadius: "50%" }} />
                ))}
              </div>
            </div>
          </motion.div>
        )}
        <div ref={endRef} />
      </div>

      {/* Sugestões */}
      <AnimatePresence>
        {showSuggestions && messages.length <= 1 && !wizard && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} style={{ padding: "0 14px 8px", flexShrink: 0 }}>
            <p style={{ fontSize: "0.68rem", color: muted, fontWeight: 600, marginBottom: 6 }}>Perguntas frequentes</p>
            <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }}>
              {QUICK_QUESTIONS.map((q, i) => (
                <button key={i} onClick={() => sendMessage(q.text)} style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 5, fontSize: "0.72rem", background: dark ? "#0c0e13" : "#ffffff", color: dark ? "#e8edf5" : "#0f172a", border: `1px solid ${cardBrd}`, borderRadius: 999, padding: "5px 11px", cursor: "pointer", fontFamily: "'Outfit',sans-serif" }}>
                  <span>{q.icon}</span> {q.text}
                </button>
              ))}
            </div>
            <p style={{ fontSize: "0.68rem", color: muted, fontWeight: 600, marginTop: 10, marginBottom: 6 }}>Ações rápidas</p>
            <div style={{ display: "flex", gap: 8 }}>
              {[{ icon: "💸", label: "Despesa", type: "expense" }, { icon: "💰", label: "Entrada", type: "income" }, { icon: "🔄", label: "Transferência", type: "transfer" }].map((s, i) => (
                <motion.button key={i} whileTap={{ scale: 0.95 }} onClick={() => startWizard(s.type)} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, fontSize: "0.75rem", fontWeight: 600, background: dark ? "rgba(109,40,217,0.12)" : "rgba(109,40,217,0.06)", color: dark ? "#a78bfa" : "#6d28d9", border: `1px solid ${dark ? "rgba(109,40,217,0.2)" : "rgba(109,40,217,0.15)"}`, borderRadius: 12, padding: "8px 4px", cursor: "pointer", fontFamily: "'Outfit',sans-serif" }}>
                  <span>{s.icon}</span> {s.label}
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input */}
      <div style={{ padding: "10px 14px 12px", background: dark ? "#060709" : "#ffffff", borderTop: `1px solid ${cardBrd}`, flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            ref={inputRef} value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            placeholder={wizard ? "Digite sua resposta..." : listening ? "🎤 Ouvindo..." : "Pergunte ou registre..."}
            style={{ flex: 1, background: inputBg, border: `1px solid ${inputBrd}`, borderRadius: 14, padding: "10px 16px", fontSize: "0.85rem", color: text, outline: "none", fontFamily: "'Outfit',sans-serif" }}
          />
          <motion.button whileTap={{ scale: 0.9 }} onPointerDown={start} onPointerUp={stop} onPointerLeave={stop}
            style={{ width: 40, height: 40, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", border: "none", cursor: "pointer", background: listening ? "#ef4444" : (dark ? "#12151c" : "#f1f4f9"), transition: "all .2s" }}>
            {listening ? <MicOff size={16} color="#fff" /> : <Mic size={16} color={muted} />}
          </motion.button>
          <motion.button whileTap={{ scale: 0.9 }} onClick={() => sendMessage()} disabled={!input.trim() || loading}
            style={{ width: 40, height: 40, background: "linear-gradient(135deg,#6d28d9,#4338ca)", border: "none", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", opacity: (!input.trim() || loading) ? 0.4 : 1, transition: "opacity .2s" }}>
            <Send size={16} color="#fff" />
          </motion.button>
        </div>
        {listening && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 8 }}>
            <div style={{ display: "flex", gap: 3 }}>
              {[0,1,2,3].map(i => (
                <motion.div key={i} animate={{ scaleY: [1,2.5,1] }} transition={{ duration: 0.5, repeat: Infinity, delay: i*0.1 }} style={{ width: 3, height: 14, background: "#ef4444", borderRadius: 999, transformOrigin: "bottom" }} />
              ))}
            </div>
            <span style={{ fontSize: "0.72rem", color: "#ef4444", fontWeight: 600 }}>Ouvindo...</span>
          </motion.div>
        )}
      </div>
    </div>
  );
}

// ── Analysis Tab ──────────────────────────────────────────────
function AnalysisTab({ user, dark }) {
  const [loading, setLoading] = useState(false);
  const [loadingSaved, setLoadingSaved] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [limiteAtingido, setLimiteAtingido] = useState(false);
  const [expandedInsight, setExpandedInsight] = useState(null);
  const [usage, setUsage] = useState(null);
  const [showPeriodSelector, setShowPeriodSelector] = useState(false);
  const currentMonth = String(new Date().getMonth() + 1).padStart(2, "0");
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [selectedYear, setSelectedYear] = useState(String(currentYear));
  const month = `${selectedYear}-${selectedMonth}`;
  const monthLabel = format(new Date(`${selectedYear}-${selectedMonth}-02`), "MMMM yyyy", { locale: ptBR });

  const bg      = dark ? "#060709" : "#f1f4f9";
  const cardBg  = dark ? "#0c0e13" : "#ffffff";
  const cardBrd = dark ? "rgba(255,255,255,0.07)" : "rgba(17,24,39,0.06)";
  const text    = dark ? "#e8edf5" : "#0f172a";
  const muted   = dark ? "#6b7a96" : "#64748b";

  useEffect(() => { loadSavedInsights(); }, [user?.id]);
  const loadSavedInsights = async () => { setLoadingSaved(true); try { const { data: profile } = await supabase.from("profiles").select("ai_insights, ai_insights_date").eq("id", user.id).single(); if (profile?.ai_insights) setData(profile.ai_insights); } catch {} finally { setLoadingSaved(false); } };
  const saveInsights   = async (d) => supabase.from("profiles").update({ ai_insights: d, ai_insights_date: new Date().toISOString() }).eq("id", user.id);
  const deleteInsights = async () => { await supabase.from("profiles").update({ ai_insights: null, ai_insights_date: null }).eq("id", user.id); setData(null); setUsage(null); };
  const fetchInsights  = async () => {
    setLoading(true); setError(null); setLimiteAtingido(false); setShowPeriodSelector(false);
    try {
      const { data: result, error: err } = await supabase.functions.invoke("ai-insights", { body: { userId: user.id, month } });
      if (err) { try { const b = JSON.parse(err.context?.responseText || "{}"); if (b.error === "limite_atingido") { setLimiteAtingido(true); setError(b.message); return; } } catch {} throw err; }
      if (result?.error === "limite_atingido") { setLimiteAtingido(true); setError(result.message); return; }
      if (result?.error) throw new Error(result.error);
      setData(result); setUsage(result.usage); await saveInsights(result);
    } catch { setError("Erro ao gerar análise. Tente novamente."); }
    finally { setLoading(false); }
  };

  if (loadingSaved) return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: bg }}>
      <div className="w-8 h-8 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
    </div>
  );

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10, background: bg }}>

      {usage && (
        <div style={{ background: dark ? "rgba(109,40,217,0.1)" : "rgba(109,40,217,0.06)", border: `1px solid ${dark ? "rgba(109,40,217,0.2)" : "rgba(109,40,217,0.15)"}`, borderRadius: 12, padding: "8px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <Clock size={13} color={dark ? "#a78bfa" : "#6d28d9"} />
            <p style={{ fontSize: "0.75rem", color: dark ? "#a78bfa" : "#6d28d9", fontWeight: 500 }}>Análises restantes esta semana</p>
          </div>
          <span style={{ fontFamily: "'Cabinet Grotesk',sans-serif", fontWeight: 800, fontSize: "0.95rem", color: dark ? "#a78bfa" : "#6d28d9" }}>{usage.remaining}/2</span>
        </div>
      )}

      {limiteAtingido && (
        <div style={{ background: dark ? "rgba(217,119,6,0.1)" : "#fffbeb", border: `1px solid ${dark ? "rgba(217,119,6,0.2)" : "#fcd34d"}`, borderRadius: 14, padding: "20px", textAlign: "center" }}>
          <Clock size={28} color="#f59e0b" style={{ margin: "0 auto 8px" }} />
          <p style={{ fontWeight: 600, fontSize: "0.9rem", color: "#92400e", marginBottom: 4 }}>Limite semanal atingido</p>
          <p style={{ fontSize: "0.75rem", color: "#b45309" }}>{error}</p>
        </div>
      )}

      <AnimatePresence>
        {showPeriodSelector && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            style={{ background: cardBg, border: `1px solid ${cardBrd}`, borderRadius: 16, padding: 16 }}>
            <p style={{ fontSize: "0.88rem", fontWeight: 700, color: text, marginBottom: 12, display: "flex", alignItems: "center", gap: 6, fontFamily: "'Cabinet Grotesk',sans-serif" }}>
              <Calendar size={15} color={dark ? "#a78bfa" : "#6d28d9"} /> Qual período analisar?
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
              <div>
                <p style={{ fontSize: "0.65rem", fontWeight: 600, color: muted, marginBottom: 6 }}>Mês</p>
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                  <SelectTrigger className="h-9 rounded-xl border-gray-200 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>{months.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <p style={{ fontSize: "0.65rem", fontWeight: 600, color: muted, marginBottom: 6 }}>Ano</p>
                <Select value={selectedYear} onValueChange={setSelectedYear}>
                  <SelectTrigger className="h-9 rounded-xl border-gray-200 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>{years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div style={{ background: dark ? "rgba(109,40,217,0.1)" : "rgba(109,40,217,0.06)", borderRadius: 10, padding: "8px", textAlign: "center", marginBottom: 12 }}>
              <p style={{ fontSize: "0.75rem", color: dark ? "#a78bfa" : "#6d28d9", fontWeight: 600, textTransform: "capitalize" }}>📊 {monthLabel}</p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setShowPeriodSelector(false)} style={{ flex: 1, height: 40, borderRadius: 12, border: `1px solid ${cardBrd}`, background: "none", color: muted, fontSize: "0.85rem", cursor: "pointer" }}>Cancelar</button>
              <button onClick={fetchInsights} style={{ flex: 1, height: 40, borderRadius: 12, background: "linear-gradient(135deg,#6d28d9,#4338ca)", border: "none", color: "#fff", fontSize: "0.85rem", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <Sparkles size={14} /> Gerar
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!data && !loading && !limiteAtingido && !showPeriodSelector && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          style={{ background: cardBg, border: `1px solid ${cardBrd}`, borderRadius: 16, padding: 24, textAlign: "center" }}>
          <div style={{ width: 56, height: 56, background: dark ? "rgba(109,40,217,0.12)" : "rgba(109,40,217,0.08)", borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
            <BarChart2 size={26} color={dark ? "#a78bfa" : "#6d28d9"} />
          </div>
          <p style={{ fontFamily: "'Cabinet Grotesk',sans-serif", fontWeight: 800, fontSize: "1rem", color: text, marginBottom: 4 }}>Análise Financeira</p>
          <p style={{ fontSize: "0.78rem", color: muted, marginBottom: 4 }}>Score de saúde, insights e recomendações.</p>
          <p style={{ fontSize: "0.72rem", color: muted, marginBottom: 20 }}>📊 2 análises gratuitas por semana</p>
          <button onClick={() => setShowPeriodSelector(true)} style={{ width: "100%", height: 44, background: "linear-gradient(135deg,#6d28d9,#4338ca)", border: "none", borderRadius: 14, color: "#fff", fontWeight: 700, fontSize: "0.9rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "'Cabinet Grotesk',sans-serif" }}>
            <Sparkles size={16} /> Gerar Análise
          </button>
        </motion.div>
      )}

      {loading && (
        <div style={{ background: cardBg, border: `1px solid ${cardBrd}`, borderRadius: 16, padding: 32, textAlign: "center" }}>
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }} style={{ width: 48, height: 48, background: dark ? "rgba(109,40,217,0.12)" : "rgba(109,40,217,0.08)", borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
            <Sparkles size={22} color={dark ? "#a78bfa" : "#6d28d9"} />
          </motion.div>
          <p style={{ fontWeight: 600, fontSize: "0.9rem", color: text, marginBottom: 4 }}>Analisando suas finanças...</p>
          <p style={{ fontSize: "0.75rem", color: muted }}>Isso pode levar alguns segundos</p>
        </div>
      )}

      {error && !limiteAtingido && (
        <div style={{ background: dark ? "rgba(220,38,38,0.08)" : "#fef2f2", border: `1px solid ${dark ? "rgba(220,38,38,0.2)" : "#fecaca"}`, borderRadius: 14, padding: 16 }}>
          <p style={{ color: "#dc2626", fontSize: "0.85rem", fontWeight: 500, marginBottom: 10 }}>{error}</p>
          <button onClick={() => setShowPeriodSelector(true)} style={{ width: "100%", height: 38, borderRadius: 10, border: `1px solid ${cardBrd}`, background: "none", color: muted, fontSize: "0.82rem", cursor: "pointer" }}>Tentar novamente</button>
        </div>
      )}

      {data && !loading && (<>
        {/* Score card */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`bg-gradient-to-br ${scoreColors[data.insights?.score_color] || scoreColors.blue} rounded-2xl p-5 text-white`}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-white/75 text-xs mb-0.5">Saúde Financeira</p>
              <p className="text-3xl font-bold" style={{ fontFamily: "'Cabinet Grotesk',sans-serif" }}>{data.insights?.score}<span className="text-lg">/100</span></p>
              <span className="inline-block mt-1 px-2.5 py-0.5 bg-white/20 rounded-full text-xs font-medium">{data.insights?.score_label}</span>
            </div>
            <div className="w-16 h-16 relative">
              <svg viewBox="0 0 36 36" className="w-16 h-16 -rotate-90">
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="3" />
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="white" strokeWidth="3" strokeDasharray={`${data.insights?.score} 100`} strokeLinecap="round" />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center"><Sparkles className="w-5 h-5 text-white" /></div>
            </div>
          </div>
          <p className="text-white/85 text-xs leading-relaxed mb-3">{data.insights?.resumo}</p>
          {data.insights?.alerta_projecao && data.insights.alerta_projecao !== "null" && (
            <div className="bg-red-500/30 border border-red-300/50 rounded-xl p-2.5 mb-3"><p className="text-white text-xs font-medium">{data.insights.alerta_projecao}</p></div>
          )}
          <div className="grid grid-cols-3 gap-2">
            {[["Entradas", data.meta?.totalIncome], ["Saídas", data.meta?.totalExpense], ["Poupança", null]].map(([label, val], i) => (
              <div key={i} className="bg-white/20 rounded-xl p-2 text-center">
                <p className="text-white/65 text-[10px]">{label}</p>
                <p className="text-white font-medium text-xs">{i === 2 ? `${data.meta?.savingsRate}%` : fmt(val)}</p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Insights */}
        {data.insights?.insights?.length > 0 && (
          <div className="space-y-2.5">
            <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 px-1">💡 Insights do mês</h3>
            {data.insights.insights.map((insight, i) => {
              const { icon: Icon, color, bg, border } = insightIcons[insight.tipo] || insightIcons.neutro;
              const isExpanded = expandedInsight === i;
              return (
                <div key={i} className={`${bg} rounded-2xl border ${border} overflow-hidden`}>
                  <button onClick={() => setExpandedInsight(isExpanded ? null : i)} className="w-full flex items-center gap-3 p-3.5 text-left">
                    <div className={`w-7 h-7 rounded-xl ${bg} flex items-center justify-center flex-shrink-0`}><Icon className={`w-3.5 h-3.5 ${color}`} /></div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{insight.titulo}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{insight.descricao}</p>
                    </div>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                  </button>
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
                        <div className="px-4 pb-3 border-t border-gray-100 dark:border-gray-700 pt-3">
                          <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">{insight.descricao}</p>
                          <div className="bg-white dark:bg-gray-700 rounded-xl p-3">
                            <p className="text-xs font-medium text-gray-500 mb-1">✅ Ação recomendada:</p>
                            <p className="text-sm text-gray-700 dark:text-gray-200">{insight.acao}</p>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        )}

        {/* Recomendações */}
        {data.insights?.recomendacoes?.length > 0 && (
          <div style={{ background: cardBg, border: `1px solid ${cardBrd}`, borderRadius: 16, overflow: "hidden" }}>
            <p style={{ padding: "12px 16px 6px", fontSize: "0.72rem", fontWeight: 600, color: muted }}>✂️ Onde reduzir custos</p>
            {data.insights.recomendacoes.map((rec, i) => (
              <div key={i} style={{ padding: "10px 16px", borderTop: i === 0 ? "none" : `1px solid ${dark ? "rgba(255,255,255,0.05)" : "rgba(17,24,39,0.04)"}` }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                  <p style={{ fontSize: "0.85rem", fontWeight: 600, color: text, textTransform: "capitalize" }}>{rec.categoria}</p>
                  <span style={{ fontSize: "0.7rem", fontWeight: 600, color: "#059669", background: dark ? "rgba(5,150,105,0.12)" : "rgba(5,150,105,0.08)", padding: "2px 8px", borderRadius: 999 }}>Economize {fmt(rec.economia_possivel)}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: "0.72rem", color: "#e85d5d" }}>Atual: {fmt(rec.gasto_atual)}</span>
                  <span style={{ color: muted, fontSize: "0.72rem" }}>→</span>
                  <span style={{ fontSize: "0.72rem", color: "#059669" }}>Ideal: {fmt(rec.gasto_ideal)}</span>
                </div>
                <p style={{ fontSize: "0.7rem", color: muted }}>{rec.dica}</p>
              </div>
            ))}
          </div>
        )}

        {/* Investimento sugerido */}
        {data.insights?.investimento_sugerido && (
          <div className={`rounded-2xl p-4 text-white ${data.meta?.isProjectedNegative ? "bg-gradient-to-br from-red-500 to-rose-600" : "bg-gradient-to-br from-emerald-500 to-teal-600"}`}>
            <div className="flex items-center gap-2 mb-2"><PiggyBank className="w-4 h-4" /><h3 className="text-xs font-medium">💰 Quanto investir</h3></div>
            <p className="text-2xl font-bold" style={{ fontFamily: "'Cabinet Grotesk',sans-serif" }}>{fmt(data.insights.investimento_sugerido.valor)}</p>
            <p className="text-white/75 text-xs mb-1">{data.insights.investimento_sugerido.percentual} da sua renda</p>
            <p className="text-white/75 text-xs">{data.insights.investimento_sugerido.justificativa}</p>
          </div>
        )}

        {/* Ações */}
        <div style={{ display: "flex", gap: 8, paddingBottom: 8 }}>
          <button onClick={() => setShowPeriodSelector(true)} style={{ flex: 1, height: 40, borderRadius: 12, border: `1px solid ${cardBrd}`, background: "none", color: muted, fontSize: "0.82rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <RefreshCw size={13} /> Nova análise
          </button>
          <button onClick={deleteInsights} style={{ height: 40, padding: "0 14px", borderRadius: 12, border: `1px solid ${dark ? "rgba(220,38,38,0.2)" : "#fecaca"}`, background: "none", color: "#e85d5d", fontSize: "0.82rem", cursor: "pointer" }}>
            Apagar
          </button>
        </div>
      </>)}
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────
export default function AIInsights() {
  const { user } = useAuth();
  const dark = useIsDark();
  const [activeTab, setActiveTab] = useState("chat");

  return (
    <div style={{
      display: "flex", flexDirection: "column",
      position: "fixed", top: 0, left: 0, right: 0, bottom: `${NAV_HEIGHT}px`,
      fontFamily: "'Outfit',sans-serif",
      background: dark ? "#060709" : "#f1f4f9",
    }}>
      {/* ══ HEADER — mesmo padrão do sistema, violeta para o Finn ══ */}
      <div style={{
        flexShrink: 0,
        isolation: "isolate",
        overflow: "hidden",
        borderRadius: "0 0 28px 28px",
        boxShadow: dark ? "0 8px 32px rgba(0,0,0,0.5)" : "0 8px 32px rgba(109,40,217,0.25)",
        background: dark
          ? `radial-gradient(ellipse 80% 70% at 50% -15%, rgba(109,40,217,0.5) 0%, transparent 70%),
             radial-gradient(ellipse 40% 40% at 90% 110%, rgba(67,56,202,0.25) 0%, transparent 70%),
             linear-gradient(160deg, #06080f 0%, #0f0a1a 40%, #130d24 100%)`
          : `radial-gradient(ellipse 80% 70% at 50% -15%, rgba(196,181,253,0.6) 0%, transparent 70%),
             radial-gradient(ellipse 40% 40% at 90% 110%, rgba(129,140,248,0.3) 0%, transparent 70%),
             linear-gradient(165deg, #6d28d9 0%, #5b21b6 50%, #4338ca 100%)`,
      }}>
        <div style={{ padding: "max(44px, calc(env(safe-area-inset-top, 0px) + 10px)) 20px 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
            {/* Avatar do Finn com pulse */}
            <div style={{ position: "relative" }}>
              <motion.div
                animate={{ boxShadow: ["0 0 0 0 rgba(167,139,250,0.4)", "0 0 0 10px rgba(167,139,250,0)", "0 0 0 0 rgba(167,139,250,0)"] }}
                transition={{ duration: 2.5, repeat: Infinity }}
                style={{ width: 44, height: 44, background: "rgba(255,255,255,0.18)", backdropFilter: "blur(8px)", borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid rgba(255,255,255,0.25)" }}
              >
                <motion.div animate={{ rotate: [0, 5, -5, 0] }} transition={{ duration: 4, repeat: Infinity, repeatDelay: 2 }}>
                  <Sparkles size={20} color="#fff" />
                </motion.div>
              </motion.div>
              {/* Indicador online */}
              <div style={{ position: "absolute", bottom: -2, right: -2, width: 12, height: 12, background: "#34d399", borderRadius: "50%", border: "2px solid #5b21b6" }} />
            </div>
            <div>
              <p style={{ fontFamily: "'Cabinet Grotesk',sans-serif", fontWeight: 900, fontSize: "1.15rem", color: "#ffffff", letterSpacing: "-0.02em", lineHeight: 1 }}>Finn</p>
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 3 }}>
                <motion.div animate={{ opacity: [1, 0.4, 1] }} transition={{ duration: 2, repeat: Infinity }} style={{ width: 6, height: 6, background: "#34d399", borderRadius: "50%" }} />
                <p style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.6)" }}>Consultor financeiro IA</p>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
            {[
              { id: "chat", label: "Chat", icon: MessageCircle },
              { id: "analysis", label: "Análise", icon: BarChart2 },
            ].map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
                flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                padding: "10px 0", fontSize: "0.82rem", fontWeight: 600,
                color: activeTab === tab.id ? "#ffffff" : "rgba(255,255,255,0.45)",
                borderBottom: activeTab === tab.id ? "2px solid #ffffff" : "2px solid transparent",
                background: "none", border: "none",
                borderBottom: activeTab === tab.id ? "2px solid #ffffff" : "2px solid transparent",
                cursor: "pointer", transition: "all .2s",
                fontFamily: "'Outfit',sans-serif",
              }}>
                <tab.icon size={14} />
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Conteúdo das tabs */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, x: activeTab === "chat" ? -12 : 12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflow: "hidden" }}
        >
          {activeTab === "chat"
            ? <ChatTab user={user} dark={dark} />
            : <AnalysisTab user={user} dark={dark} />
          }
        </motion.div>
      </AnimatePresence>
    </div>
  );
}