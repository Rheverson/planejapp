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
  // Aceita com ou sem underscores
  const m1 = c?.match(/__RECURRING_TX__([\s\S]*?)__END_RECURRING__/);
  const m2 = c?.match(/RECURRING_TX([\s\S]*?)END_RECURRING/);
  const m = m1 || m2;
  if (!m) return null;
  try {
    let json = m[1].replace(/(\d)\.(\d{3})/g, "$1$2").trim();
    return JSON.parse(json);
  } catch { return null; }
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
    ?.replace(/RECURRING_TX\b.*?END_RECURRING/s, "") ?.replace(/RECURRING_TX.*?END_RECURRING/s, "")
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
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{value}</span>
    </div>
  );
}

// ── Toggle de auto_realize ─────────────────────────────────
function AutoRealizeToggle({ value, onChange }) {
  return (
    <div className="mt-2 p-3 bg-violet-50 dark:bg-violet-900/20 rounded-xl border border-violet-100 dark:border-violet-800">
      <p className="text-xs font-medium text-violet-700 dark:text-violet-300 mb-1">
        🤖 Registrar automaticamente no dia?
      </p>
      <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-2.5">
        Se ativado, o Planeje registra sozinho quando chegar a data.
      </p>
      <div className="flex gap-2">
        <button
          onClick={() => onChange(true)}
          className={`flex-1 h-8 rounded-xl text-xs font-medium transition-all ${
            value === true
              ? "bg-violet-600 text-white shadow-sm"
              : "bg-white dark:bg-gray-700 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-600"
          }`}
        >
          ✅ Sim, automático
        </button>
        <button
          onClick={() => onChange(false)}
          className={`flex-1 h-8 rounded-xl text-xs font-medium transition-all ${
            value === false
              ? "bg-gray-600 text-white shadow-sm"
              : "bg-white dark:bg-gray-700 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-600"
          }`}
        >
          📋 Não, só previsto
        </button>
      </div>
    </div>
  );
}

// ── Card de confirmação universal ──────────────────────────
function ActionCard({ action, onConfirm, onCancel, confirmLoading, onSetAutoRealize }) {
  if (!action) return null;

  const isPending   = action._type === "tx" && action.is_realized === false;
  const isRecurring = action._type === "recurring";
  const showAutoRealize = isPending || isRecurring;

  const configs = {
    tx: {
      icon: action.type === "expense" ? TrendingDown : TrendingUp,
      color: action.intent === "transfer" ? "text-blue-600" : action.type === "expense" ? "text-red-600" : "text-emerald-600",
      title: action.intent === "transfer" ? "Confirmar transferência" : action.is_realized === false ? "Confirmar prevista" : "Confirmar lançamento",
      headerColor: "from-violet-50 to-indigo-50 dark:from-violet-900/30 dark:to-indigo-900/30",
      borderColor: "border-violet-200 dark:border-violet-800",
    },
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

  // Bloqueia confirmação de prevista/recorrente sem escolher auto_realize
  const needsAutoRealize = showAutoRealize && action.auto_realize === undefined;

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
      <div className={`bg-white dark:bg-gray-800 rounded-2xl border ${cfg.borderColor} overflow-hidden mx-1`}>
        <div className={`bg-gradient-to-r ${cfg.headerColor} px-4 py-2.5 border-b ${cfg.borderColor} flex items-center gap-2`}>
          <Icon className={`w-4 h-4 ${cfg.color}`} />
          <p className={`text-sm font-medium ${cfg.color}`}>{cfg.title}</p>
        </div>
        <div className="px-4 py-3 space-y-2.5">

          {/* TX normal ou prevista */}
          {action._type === "tx" && !action.intent && (<>
            <Row label="Valor" value={<span className={`text-lg font-bold ${cfg.color}`}>{fmt(action.amount)}</span>} />
            <Row label="Tipo" value={<span className={`text-sm font-medium ${cfg.color}`}>{action.type === "expense" ? "💸 Saída" : "💰 Entrada"}</span>} />
            <Row label="Descrição" value={action.description} />
            <Row label="Categoria" value={<span className="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full capitalize">{action.category}</span>} />
            {action.account_name && <Row label="Conta" value={action.account_name} />}
            <Row label="Data" value={action.date} />
            <Row label="Status" value={
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${action.is_realized ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                {action.is_realized ? "✅ Realizado" : "📋 Previsto"}
              </span>
            } />
            {/* Auto realize apenas para previstas */}
            {isPending && <AutoRealizeToggle value={action.auto_realize} onChange={onSetAutoRealize} />}
          </>)}

          {/* Transferência */}
          {action._type === "tx" && action.intent === "transfer" && (<>
            <Row label="Valor" value={<span className={`text-lg font-bold ${cfg.color}`}>{fmt(action.amount)}</span>} />
            <Row label="De" value={action.from_account} />
            <Row label="Para" value={action.to_account} />
            <Row label="Data" value={action.date} />
          </>)}

          {/* Recorrente */}
          {action._type === "recurring" && (<>
            <Row label="Descrição" value={action.description} />
            <Row label="Tipo" value={<span className={`text-sm font-medium ${cfg.color}`}>{action.type === "expense" ? "💸 Saída" : "💰 Entrada"}</span>} />
            <Row label="Valor" value={<span className={`text-lg font-bold ${cfg.color}`}>{fmt(action.amount)}</span>} />
            <Row label="Categoria" value={<span className="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full capitalize">{action.category}</span>} />
            {action.account_name && <Row label="Conta" value={action.account_name} />}
            <Row label="Todo dia" value={<span className="text-sm font-medium text-violet-600">dia {action.day} de cada mês</span>} />
            <Row label="Duração" value={`${action.months} meses`} />
            <div className="bg-violet-50 dark:bg-violet-900/20 rounded-xl px-3 py-2 text-xs text-violet-600 dark:text-violet-400 font-medium">
              📅 {action.months} previstas serão criadas a partir de {action.start_date}
            </div>
            <AutoRealizeToggle value={action.auto_realize} onChange={onSetAutoRealize} />
          </>)}

          {/* Realizar prevista */}
          {action._type === "realize" && (<>
            <Row label="Descrição" value={action.description} />
            <Row label="Valor" value={<span className="text-base font-bold text-emerald-600">{fmt(action.amount)}</span>} />
            <Row label="Data" value={action.date} />
          </>)}

          {/* Parcial */}
          {action._type === "partial_realize" && (<>
            <Row label="Descrição" value={action.description} />
            <Row label="Valor pago" value={<span className="text-base font-bold text-emerald-600">{fmt(action.paid_amount)}</span>} />
            <Row label="Restante" value={<span className="text-base font-bold text-amber-600">{fmt(action.remaining_amount)}</span>} />
            <Row label="Data" value={action.date} />
          </>)}

          {action._type === "delete_tx" && (<>
            <Row label="Descrição" value={action.description} />
            <Row label="Valor" value={fmt(action.amount)} />
            <p className="text-xs text-red-500 font-medium">⚠️ Esta ação não pode ser desfeita!</p>
          </>)}

          {action._type === "create_goal" && (<>
            <Row label="Nome" value={action.name} />
            <Row label="Tipo" value={action.type === "expense" ? "📉 Limite de gasto" : action.type === "income" ? "📈 Meta de renda" : "💹 Investimento"} />
            <Row label="Valor" value={<span className="text-base font-bold text-violet-600">{fmt(action.target_amount)}</span>} />
            <Row label="Período" value={`${action.start_date} até ${action.end_date}`} />
          </>)}

          {action._type === "delete_goal" && (<>
            <Row label="Meta" value={action.name} />
            <p className="text-xs text-red-500 font-medium">⚠️ Esta ação não pode ser desfeita!</p>
          </>)}

          {action._type === "create_account" && (<>
            <Row label="Nome" value={action.name} />
            <Row label="Tipo" value={{ bank: "🏦 Bancária", digital: "📱 Digital", wallet: "👛 Carteira", investment: "📈 Investimento", other: "📦 Outro" }[action.type] || action.type} />
            <Row label="Saldo inicial" value={fmt(action.initial_balance)} />
          </>)}

          {action._type === "delete_account" && (<>
            <Row label="Conta" value={action.name} />
            <p className="text-xs text-red-500 font-medium">⚠️ A conta será removida mas as transações serão mantidas.</p>
          </>)}

          {action._type === "send_invite" && (<>
            <Row label="Para" value={action.email} />
            {action.name && <Row label="Nome" value={action.name} />}
          </>)}

          {/* Aviso quando precisa escolher auto_realize */}
          {needsAutoRealize && (
            <p className="text-[10px] text-amber-600 dark:text-amber-400 text-center">
              👆 Escolha uma opção acima para confirmar
            </p>
          )}
        </div>

        <div className="flex gap-2 px-4 pb-4">
          <button onClick={onCancel} className="flex-1 h-10 rounded-xl border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 text-sm font-medium flex items-center justify-center gap-1.5">
            <X className="w-3.5 h-3.5" /> Cancelar
          </button>
          <button onClick={onConfirm} disabled={confirmLoading || needsAutoRealize}
            className={`flex-1 h-10 rounded-xl text-white text-sm font-medium flex items-center justify-center gap-1.5 disabled:opacity-50 ${
              ["delete_tx","delete_goal","delete_account"].includes(action._type) ? "bg-red-500 hover:bg-red-600"
              : action._type === "realize" ? "bg-emerald-500 hover:bg-emerald-600"
              : "bg-gradient-to-r from-violet-600 to-indigo-600"
            }`}>
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

function ChatTab({ user }) {
  const [messages, setMessages]             = useState([]);
  const [input, setInput]                   = useState("");
  const [loading, setLoading]               = useState(false);
  const [pendingAction, setPendingAction]   = useState(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [wizard, setWizard]                 = useState(null);
  const loadingRef = useRef(false);
  const endRef     = useRef(null);
  const inputRef   = useRef(null);
  const today        = getBrasiliaDate();
  const currentMonth = getBrasiliaMonth();

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

  // Atualiza auto_realize no pendingAction
  const handleSetAutoRealize = (value) => {
    setPendingAction(prev => prev ? { ...prev, auto_realize: value } : prev);
  };

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
    if (!pendingAction || confirmLoading) return;
    setConfirmLoading(true);
    const action = pendingAction;
    const confirmDate = (action.is_realized === false && action.date) ? action.date : getBrasiliaDate();

    try {
      // ── TX normal ──────────────────────────────────────────
      if (action._type === "tx" && !action.intent) {
        setPendingAction(null); // ← limpa imediatamente para evitar duplo clique
        let accountId = action.account_id || null;
        if (!accountId && action.account_name) {
          const { data: accs } = await supabase.from("accounts").select("id").eq("user_id", user.id).ilike("name", `%${action.account_name}%`).limit(1);
          accountId = accs?.[0]?.id || null;
        }
        const { error } = await supabase.from("transactions").insert({
          user_id: user.id, type: action.type, amount: action.amount,
          description: action.description, category: action.category,
          account_id: accountId, date: confirmDate,
          is_realized: action.is_realized ?? true,
          auto_realize: action.is_realized === false ? (action.auto_realize ?? false) : null,
        });
        if (error) throw error;
        setPendingAction(null);
        const autoMsg = action.is_realized === false && action.auto_realize ? " · registro automático ativado ✅" : "";
        setMessages(prev => [...prev, { role: "assistant", content: `✅ **Lançado!**\n\n${action.type === "expense" ? "💸" : "💰"} **${fmt(action.amount)}** — ${action.description}\n📅 ${confirmDate}${autoMsg}` }]);
      }

      // ── Transferência ──────────────────────────────────────
      else if (action._type === "tx" && action.intent === "transfer") {
        const { error } = await supabase.from("transactions").insert({ user_id: user.id, type: "transfer", amount: action.amount, description: "Transferência", account_id: action.from_account_id, transfer_account_id: action.to_account_id, date: confirmDate, is_realized: true });
        if (error) throw error;
        setPendingAction(null);
        setMessages(prev => [...prev, { role: "assistant", content: `✅ **Transferência lançada!**\n\n🔄 **${fmt(action.amount)}** — ${action.from_account} → ${action.to_account}` }]);
      }

      // ── Recorrente ─────────────────────────────────────────
      else if (action._type === "recurring") {
        setPendingAction(null); // ← limpa imediatamente para evitar duplo clique
        let accountId = null;
        if (action.account_name) {
          const { data: accs } = await supabase.from("accounts").select("id").eq("user_id", user.id).ilike("name", `%${action.account_name}%`).limit(1);
          accountId = accs?.[0]?.id || null;
        }
        const inserts = [];
        const start = new Date(action.start_date + "T12:00:00");
        for (let i = 0; i < action.months; i++) {
          const d = new Date(start.getFullYear(), start.getMonth() + i, action.day);
          const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
          inserts.push({
            user_id: user.id, type: action.type, amount: action.amount,
            description: action.description, category: action.category,
            account_id: accountId, date: dateStr, is_realized: false,
            is_recurring: true, recurring_frequency: action.frequency || "monthly",
            recurring_day: action.day, auto_realize: action.auto_realize ?? false,
          });
        }
        const { error } = await supabase.from("transactions").insert(inserts);
        if (error) throw error;
        setPendingAction(null);
        const autoMsg = action.auto_realize ? " com **registro automático** ✅" : "";
        setMessages(prev => [...prev, { role: "assistant", content: `✅ **${action.months} lançamentos recorrentes criados!**\n\n🔄 **${fmt(action.amount)}** — ${action.description}\n📅 Todo dia ${action.day} por ${action.months} meses${autoMsg}` }]);
      }

      // ── Parcial ────────────────────────────────────────────
      else if (action._type === "partial_realize") {
        await supabase.from("transactions").update({ amount: action.remaining_amount }).eq("id", action.id).eq("user_id", user.id);
        let accountId = null;
        if (action.account_name) { const { data: accs } = await supabase.from("accounts").select("id").eq("user_id", user.id).ilike("name", `%${action.account_name}%`).limit(1); accountId = accs?.[0]?.id || null; }
        await supabase.from("transactions").insert({ user_id: user.id, type: "expense", amount: action.paid_amount, description: action.description, category: action.category, account_id: accountId, date: confirmDate, is_realized: true });
        setPendingAction(null);
        setMessages(prev => [...prev, { role: "assistant", content: `✅ **Pagamento parcial registrado!**\n\n💸 **${fmt(action.paid_amount)}** pago — restante: **${fmt(action.remaining_amount)}**` }]);
      }

      // ── Realizar prevista ──────────────────────────────────
      else if (action._type === "realize") {
        const { error } = await supabase.from("transactions").update({ is_realized: true, date: confirmDate }).eq("id", action.id).eq("user_id", user.id);
        if (error) throw error;
        setPendingAction(null);
        setMessages(prev => [...prev, { role: "assistant", content: `✅ **Pago!** ${action.description} marcado como realizado.` }]);
      }

      else if (action._type === "delete_tx") {
        await supabase.from("transactions").delete().eq("id", action.id).eq("user_id", user.id);
        setPendingAction(null);
        setMessages(prev => [...prev, { role: "assistant", content: `🗑️ Transação excluída.` }]);
      }
      else if (action._type === "create_goal") {
        await supabase.from("goals").insert({ user_id: user.id, name: action.name, type: action.type, category: action.category, target_amount: action.target_amount, start_date: action.start_date, end_date: action.end_date });
        setPendingAction(null);
        setMessages(prev => [...prev, { role: "assistant", content: `✅ **Meta criada!** 🎯 ${action.name} — ${fmt(action.target_amount)}` }]);
      }
      else if (action._type === "delete_goal") {
        await supabase.from("goals").delete().eq("id", action.id).eq("user_id", user.id);
        setPendingAction(null);
        setMessages(prev => [...prev, { role: "assistant", content: `🗑️ Meta excluída.` }]);
      }
      else if (action._type === "create_account") {
        await supabase.from("accounts").insert({ user_id: user.id, name: action.name, type: action.type || "bank", initial_balance: action.initial_balance || 0, color: "bg-blue-500" });
        setPendingAction(null);
        setMessages(prev => [...prev, { role: "assistant", content: `✅ **Conta criada!** 🏦 ${action.name}` }]);
      }
      else if (action._type === "delete_account") {
        await supabase.from("accounts").delete().eq("id", action.id).eq("user_id", user.id);
        setPendingAction(null);
        setMessages(prev => [...prev, { role: "assistant", content: `🗑️ Conta excluída.` }]);
      }
      else if (action._type === "send_invite") {
        const { data: profile } = await supabase.from("profiles").select("referral_code").eq("id", user.id).single();
        const referralLink = `https://planeje.vercel.app/subscribe?ref=${profile?.referral_code || ""}`;
        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-email`, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` }, body: JSON.stringify({ to: action.email, senderEmail: "noreply@planejapp.com.br", senderName: "Planeje", subject: `Você foi convidado para o Planeje! 💜`, html: `<p>Olá${action.name ? ", " + action.name : ""}! Acesse: <a href="${referralLink}">${referralLink}</a></p>` }) });
        if (!res.ok) throw new Error("Erro ao enviar email");
        setPendingAction(null);
        setMessages(prev => [...prev, { role: "assistant", content: `✅ **Convite enviado!** 📧 ${action.email}` }]);
      }
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "❌ Erro ao executar. Tente novamente." }]);
      setPendingAction(null);
    } finally { setConfirmLoading(false); }
  };

  const { listening, start, stop } = useSpeechRecognition({ onResult: (transcript) => { setInput(transcript); sendMessage(transcript); } });
  const cancelAction = () => { setPendingAction(null); setWizard(null); setMessages(prev => [...prev, { role: "assistant", content: "❌ Cancelado!" }]); };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.map((msg, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`flex gap-2.5 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
            {msg.role === "assistant" && (<div className="w-7 h-7 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center flex-shrink-0 mt-1"><Sparkles className="w-3.5 h-3.5 text-white" /></div>)}
            <div className={`max-w-[82%] ${msg.role === "user" ? "items-end" : "items-start"} flex flex-col`}>
              <div className={`rounded-2xl px-3.5 py-2.5 ${msg.role === "user" ? "bg-gradient-to-br from-violet-600 to-indigo-600 text-white rounded-tr-sm" : "bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-tl-sm border border-gray-100 dark:border-gray-700"}`}>
                <ReactMarkdown className="text-sm leading-relaxed prose prose-sm dark:prose-invert max-w-none prose-p:my-1">{cleanContent(msg.content)}</ReactMarkdown>
              </div>
            </div>
          </motion.div>
        ))}
        <AnimatePresence>
          {pendingAction && <ActionCard action={pendingAction} onConfirm={confirmAction} onCancel={cancelAction} confirmLoading={confirmLoading} onSetAutoRealize={handleSetAutoRealize} />}
        </AnimatePresence>
        {loading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-2.5">
            <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center flex-shrink-0"><Sparkles className="w-3.5 h-3.5 text-white" /></div>
            <div className="bg-white dark:bg-gray-800 rounded-2xl rounded-tl-sm px-4 py-3 border border-gray-100 dark:border-gray-700">
              <div className="flex gap-1 items-center h-4">{[0,1,2].map(i => (<motion.div key={i} animate={{ y: [0,-4,0], opacity: [0.4,1,0.4] }} transition={{ duration: 0.6, repeat: Infinity, delay: i*0.15 }} className="w-1.5 h-1.5 bg-violet-400 rounded-full" />))}</div>
            </div>
          </motion.div>
        )}
        <div ref={endRef} />
      </div>
      <AnimatePresence>
        {showSuggestions && messages.length <= 1 && !wizard && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="px-4 pb-2 flex-shrink-0">
            <p className="text-xs text-gray-400 mb-1.5 font-medium">Perguntas frequentes</p>
            <div className="flex gap-1.5 overflow-x-auto pb-1">{QUICK_QUESTIONS.map((q, i) => (<button key={i} onClick={() => sendMessage(q.text)} className="flex-shrink-0 flex items-center gap-1 text-xs bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-full px-2.5 py-1.5 hover:border-violet-300 transition-all"><span>{q.icon}</span> {q.text}</button>))}</div>
            <p className="text-xs text-gray-400 mt-2.5 mb-1.5 font-medium">Ações rápidas</p>
            <div className="flex gap-2">{[{ icon: "💸", label: "Despesa", type: "expense" }, { icon: "💰", label: "Entrada", type: "income" }, { icon: "🔄", label: "Transferência", type: "transfer" }].map((s, i) => (<motion.button key={i} whileTap={{ scale: 0.96 }} onClick={() => startWizard(s.type)} className="flex-1 flex items-center justify-center gap-1 text-xs bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800 rounded-xl py-2 hover:bg-violet-100 transition-all font-medium"><span>{s.icon}</span> {s.label}</motion.button>))}</div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="px-4 pt-2.5 pb-3 bg-white dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700 flex-shrink-0">
        <div className="flex gap-2 items-center">
          <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }} placeholder={wizard ? "Digite sua resposta..." : listening ? "🎤 Ouvindo..." : "Pergunte ou registre..."} className="flex-1 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-2xl px-4 py-2.5 text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 outline-none focus:border-violet-400 transition-all" />
          <motion.button whileTap={{ scale: 0.9 }} onPointerDown={start} onPointerUp={stop} onPointerLeave={stop} className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${listening ? "bg-red-500 animate-pulse" : "bg-gray-100 dark:bg-gray-700"}`}>{listening ? <MicOff className="w-4 h-4 text-white" /> : <Mic className="w-4 h-4 text-gray-500 dark:text-gray-300" />}</motion.button>
          <motion.button whileTap={{ scale: 0.9 }} onClick={() => sendMessage()} disabled={!input.trim() || loading} className="w-10 h-10 bg-gradient-to-br from-violet-600 to-indigo-600 disabled:opacity-40 rounded-xl flex items-center justify-center"><Send className="w-4 h-4 text-white" /></motion.button>
        </div>
        {listening && (<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center justify-center gap-2 mt-2"><div className="flex gap-1">{[0,1,2,3].map(i => (<motion.div key={i} animate={{ scaleY: [1,2,1] }} transition={{ duration: 0.5, repeat: Infinity, delay: i*0.1 }} className="w-1 h-3 bg-red-500 rounded-full origin-bottom" />))}</div><span className="text-xs text-red-500 font-medium">Ouvindo...</span></motion.div>)}
      </div>
    </div>
  );
}

function AnalysisTab({ user }) {
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

  if (loadingSaved) return <div className="flex-1 flex items-center justify-center"><div className="w-8 h-8 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin" /></div>;

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
      {usage && (<div className="bg-violet-50 dark:bg-violet-900/20 rounded-xl px-3 py-2 border border-violet-200 dark:border-violet-800 flex items-center justify-between"><div className="flex items-center gap-2"><Clock className="w-3.5 h-3.5 text-violet-600" /><p className="text-xs text-violet-700 dark:text-violet-300">Análises restantes esta semana</p></div><span className="font-bold text-sm text-violet-600">{usage.remaining}/2</span></div>)}
      {limiteAtingido && (<div className="bg-amber-50 dark:bg-amber-900/20 rounded-2xl p-5 border border-amber-200 dark:border-amber-800 text-center"><Clock className="w-8 h-8 text-amber-500 mx-auto mb-2" /><p className="text-amber-800 dark:text-amber-300 font-medium mb-1 text-sm">Limite semanal atingido</p><p className="text-amber-600 dark:text-amber-400 text-xs">{error}</p></div>)}
      <AnimatePresence>{showPeriodSelector && (<motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-100 dark:border-gray-700"><h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2"><Calendar className="w-4 h-4 text-violet-600" /> Qual período analisar?</h3><div className="grid grid-cols-2 gap-3 mb-3"><div><p className="text-xs font-medium text-gray-400 mb-1">Mês</p><Select value={selectedMonth} onValueChange={setSelectedMonth}><SelectTrigger className="h-9 rounded-xl border-gray-200 text-sm"><SelectValue /></SelectTrigger><SelectContent>{months.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent></Select></div><div><p className="text-xs font-medium text-gray-400 mb-1">Ano</p><Select value={selectedYear} onValueChange={setSelectedYear}><SelectTrigger className="h-9 rounded-xl border-gray-200 text-sm"><SelectValue /></SelectTrigger><SelectContent>{years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent></Select></div></div><div className="bg-violet-50 dark:bg-violet-900/20 rounded-xl p-2.5 mb-3 text-center"><p className="text-xs text-violet-700 dark:text-violet-300 font-medium capitalize">📊 {monthLabel}</p></div><div className="flex gap-2"><Button onClick={() => setShowPeriodSelector(false)} variant="outline" className="flex-1 h-9 rounded-xl text-sm">Cancelar</Button><Button onClick={fetchInsights} className="flex-1 h-9 bg-gradient-to-r from-violet-600 to-indigo-600 rounded-xl text-sm text-white"><Sparkles className="w-3.5 h-3.5 mr-1.5" />Gerar</Button></div></motion.div>)}</AnimatePresence>
      {!data && !loading && !limiteAtingido && !showPeriodSelector && (<motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-100 dark:border-gray-700 text-center"><div className="w-14 h-14 bg-violet-100 dark:bg-violet-900/30 rounded-2xl flex items-center justify-center mx-auto mb-3"><BarChart2 className="w-7 h-7 text-violet-600" /></div><h3 className="text-base font-medium text-gray-900 dark:text-white mb-1">Análise Financeira</h3><p className="text-gray-400 text-xs mb-1">Score de saúde, insights e recomendações.</p><p className="text-xs text-gray-400 mb-5">📊 2 análises gratuitas por semana</p><Button onClick={() => setShowPeriodSelector(true)} className="w-full h-11 bg-gradient-to-r from-violet-600 to-indigo-600 rounded-xl font-medium text-white"><Sparkles className="w-4 h-4 mr-2" />Gerar Análise</Button></motion.div>)}
      {loading && (<div className="bg-white dark:bg-gray-800 rounded-2xl p-8 border border-gray-100 dark:border-gray-700 text-center"><motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }} className="w-12 h-12 bg-violet-100 dark:bg-violet-900/30 rounded-2xl flex items-center justify-center mx-auto mb-3"><Sparkles className="w-6 h-6 text-violet-600" /></motion.div><p className="text-gray-700 dark:text-gray-300 font-medium text-sm mb-1">Analisando suas finanças...</p><p className="text-gray-400 text-xs">Isso pode levar alguns segundos</p></div>)}
      {error && !limiteAtingido && (<div className="bg-red-50 dark:bg-red-900/20 rounded-2xl p-4 border border-red-200"><p className="text-red-600 text-sm font-medium">{error}</p><Button onClick={() => setShowPeriodSelector(true)} variant="outline" className="mt-3 w-full rounded-xl">Tentar novamente</Button></div>)}
      {data && !loading && (<>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`bg-gradient-to-br ${scoreColors[data.insights?.score_color] || scoreColors.blue} rounded-2xl p-5 text-white`}>
          <div className="flex items-center justify-between mb-3"><div><p className="text-white/75 text-xs mb-0.5">Saúde Financeira</p><p className="text-3xl font-bold">{data.insights?.score}<span className="text-lg">/100</span></p><span className="inline-block mt-1 px-2.5 py-0.5 bg-white/20 rounded-full text-xs font-medium">{data.insights?.score_label}</span></div><div className="w-16 h-16 relative"><svg viewBox="0 0 36 36" className="w-16 h-16 -rotate-90"><circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="3" /><circle cx="18" cy="18" r="15.9" fill="none" stroke="white" strokeWidth="3" strokeDasharray={`${data.insights?.score} 100`} strokeLinecap="round" /></svg><div className="absolute inset-0 flex items-center justify-center"><Sparkles className="w-5 h-5 text-white" /></div></div></div>
          <p className="text-white/85 text-xs leading-relaxed mb-3">{data.insights?.resumo}</p>
          {data.insights?.alerta_projecao && data.insights.alerta_projecao !== "null" && (<div className="bg-red-500/30 border border-red-300/50 rounded-xl p-2.5 mb-3"><p className="text-white text-xs font-medium">{data.insights.alerta_projecao}</p></div>)}
          <div className="grid grid-cols-3 gap-2">{[["Entradas", data.meta?.totalIncome], ["Saídas", data.meta?.totalExpense], ["Poupança", null]].map(([label, val], i) => (<div key={i} className="bg-white/20 rounded-xl p-2 text-center"><p className="text-white/65 text-[10px]">{label}</p><p className="text-white font-medium text-xs">{i === 2 ? `${data.meta?.savingsRate}%` : fmt(val)}</p></div>))}</div>
        </motion.div>
        {data.insights?.insights?.length > 0 && (<div className="space-y-2.5"><h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 px-1">💡 Insights do mês</h3>{data.insights.insights.map((insight, i) => { const { icon: Icon, color, bg, border } = insightIcons[insight.tipo] || insightIcons.neutro; const isExpanded = expandedInsight === i; return (<div key={i} className={`${bg} rounded-2xl border ${border} overflow-hidden`}><button onClick={() => setExpandedInsight(isExpanded ? null : i)} className="w-full flex items-center gap-3 p-3.5 text-left"><div className={`w-7 h-7 rounded-xl ${bg} flex items-center justify-center flex-shrink-0`}><Icon className={`w-3.5 h-3.5 ${color}`} /></div><div className="flex-1 min-w-0"><p className="text-sm font-medium text-gray-800 dark:text-gray-200">{insight.titulo}</p><p className="text-xs text-gray-500 dark:text-gray-400 truncate">{insight.descricao}</p></div>{isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />}</button><AnimatePresence>{isExpanded && (<motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden"><div className="px-4 pb-3 border-t border-gray-100 dark:border-gray-700 pt-3"><p className="text-sm text-gray-600 dark:text-gray-300 mb-2">{insight.descricao}</p><div className="bg-white dark:bg-gray-700 rounded-xl p-3"><p className="text-xs font-medium text-gray-500 mb-1">✅ Ação recomendada:</p><p className="text-sm text-gray-700 dark:text-gray-200">{insight.acao}</p></div></div></motion.div>)}</AnimatePresence></div>); })}</div>)}
        {data.insights?.recomendacoes?.length > 0 && (<div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden"><div className="px-4 pt-3 pb-1.5"><h3 className="text-xs font-medium text-gray-500 dark:text-gray-400">✂️ Onde reduzir custos</h3></div><div className="divide-y divide-gray-50 dark:divide-gray-700">{data.insights.recomendacoes.map((rec, i) => (<div key={i} className="px-4 py-3"><div className="flex items-center justify-between mb-1"><p className="text-sm font-medium text-gray-800 dark:text-gray-200 capitalize">{rec.categoria}</p><span className="text-xs font-medium text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 rounded-full">Economize {fmt(rec.economia_possivel)}</span></div><div className="flex items-center gap-2 mb-1"><span className="text-xs text-red-500">Atual: {fmt(rec.gasto_atual)}</span><span className="text-gray-300 text-xs">→</span><span className="text-xs text-emerald-600">Ideal: {fmt(rec.gasto_ideal)}</span></div><p className="text-xs text-gray-400">{rec.dica}</p></div>))}</div></div>)}
        {data.insights?.investimento_sugerido && (<div className={`rounded-2xl p-4 text-white ${data.meta?.isProjectedNegative ? "bg-gradient-to-br from-red-500 to-rose-600" : "bg-gradient-to-br from-emerald-500 to-teal-600"}`}><div className="flex items-center gap-2 mb-2"><PiggyBank className="w-4 h-4" /><h3 className="text-xs font-medium">💰 Quanto investir</h3></div><p className="text-2xl font-bold">{fmt(data.insights.investimento_sugerido.valor)}</p><p className="text-white/75 text-xs mb-1">{data.insights.investimento_sugerido.percentual} da sua renda</p><p className="text-white/75 text-xs">{data.insights.investimento_sugerido.justificativa}</p></div>)}
        <div className="flex gap-2 pb-2"><Button onClick={() => setShowPeriodSelector(true)} variant="outline" className="flex-1 h-10 rounded-xl border-gray-200 text-gray-600 text-sm"><RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Nova análise</Button><button onClick={deleteInsights} className="h-10 px-4 rounded-xl border border-red-200 text-red-500 text-sm hover:bg-red-50 transition-colors">Apagar</button></div>
      </>)}
    </div>
  );
}

export default function AIInsights() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("chat");
  return (
    <div className="flex flex-col bg-gray-50 dark:bg-gray-900" style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: `${NAV_HEIGHT}px` }}>
      <div className="bg-gradient-to-br from-violet-700 via-purple-800 to-indigo-900 px-5 flex-shrink-0" style={{ paddingTop: "max(44px, calc(env(safe-area-inset-top, 0px) + 10px))", paddingBottom: 0 }}>
        <div className="flex items-center gap-3 mb-4">
          <div className="relative">
            <motion.div animate={{ boxShadow: ["0 0 0 0 rgba(167,139,250,0.4)", "0 0 0 10px rgba(167,139,250,0)", "0 0 0 0 rgba(167,139,250,0)"] }} transition={{ duration: 2.5, repeat: Infinity }} className="w-11 h-11 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center border border-white/30">
              <motion.div animate={{ rotate: [0, 5, -5, 0] }} transition={{ duration: 4, repeat: Infinity, repeatDelay: 2 }}><Sparkles className="w-5 h-5 text-white" /></motion.div>
            </motion.div>
            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-400 rounded-full border-2 border-violet-800" />
          </div>
          <div>
            <h1 className="text-lg font-medium text-white">Finn</h1>
            <div className="flex items-center gap-1"><div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" /><p className="text-violet-200 text-xs">Consultor financeiro IA</p></div>
          </div>
        </div>
        <div className="flex">
          {[{ id: "chat", label: "Chat", icon: MessageCircle }, { id: "analysis", label: "Análise", icon: BarChart2 }].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium transition-all ${activeTab === tab.id ? "text-white border-b-2 border-white" : "text-white/50 border-b-2 border-transparent hover:text-white/70"}`}>
              <tab.icon className="w-3.5 h-3.5" />{tab.label}
            </button>
          ))}
        </div>
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={activeTab} initial={{ opacity: 0, x: activeTab === "chat" ? -12 : 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          {activeTab === "chat" ? <ChatTab user={user} /> : <AnalysisTab user={user} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}