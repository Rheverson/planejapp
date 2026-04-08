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
  CheckCircle2, AlertTriangle, Info, PiggyBank, Calendar
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// ── Constantes ─────────────────────────────────────────────
const NAV_HEIGHT = 68;

const QUICK_QUESTIONS = [
  { icon: "💰", text: "Posso gastar R$500 essa semana?" },
  { icon: "📊", text: "Como estão minhas finanças?" },
  { icon: "✂️", text: "Como reduzir meus gastos?" },
  { icon: "🎯", text: "Estou no caminho certo?" },
  { icon: "🏦", text: "Quanto tenho investido?" },
  { icon: "⚠️", text: "Tenho contas vencendo?" },
];

const CATEGORIES = [
  { value: 'alimentação', label: '🍔 Alimentação' },
  { value: 'transporte',  label: '🚗 Transporte'  },
  { value: 'moradia',     label: '🏠 Moradia'     },
  { value: 'saúde',       label: '❤️ Saúde'       },
  { value: 'educação',    label: '📚 Educação'    },
  { value: 'lazer',       label: '🎉 Lazer'       },
  { value: 'compras',     label: '🛍️ Compras'    },
  { value: 'outros',      label: '📦 Outros'      },
];

const scoreColors = {
  red:    "from-red-500 to-rose-600",
  orange: "from-orange-500 to-amber-600",
  yellow: "from-yellow-500 to-amber-500",
  blue:   "from-blue-500 to-indigo-600",
  green:  "from-emerald-500 to-teal-600",
};

const insightIcons = {
  positivo: { icon: CheckCircle2, color: "text-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-900/20", border: "border-emerald-200 dark:border-emerald-800" },
  negativo: { icon: AlertTriangle, color: "text-red-500",    bg: "bg-red-50 dark:bg-red-900/20",         border: "border-red-200 dark:border-red-800"         },
  neutro:   { icon: Info,          color: "text-blue-500",   bg: "bg-blue-50 dark:bg-blue-900/20",        border: "border-blue-200 dark:border-blue-800"        },
};

const months = [
  { value: "01", label: "Janeiro"  }, { value: "02", label: "Fevereiro" },
  { value: "03", label: "Março"    }, { value: "04", label: "Abril"     },
  { value: "05", label: "Maio"     }, { value: "06", label: "Junho"     },
  { value: "07", label: "Julho"    }, { value: "08", label: "Agosto"    },
  { value: "09", label: "Setembro" }, { value: "10", label: "Outubro"   },
  { value: "11", label: "Novembro" }, { value: "12", label: "Dezembro"  },
];

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 3 }, (_, i) => currentYear - i);

// ── Helpers ────────────────────────────────────────────────
function parsePendingTx(content) {
  try {
    const match = content?.match(/__PENDING_TX__(.*?)__END_TX__/s);
    if (match) return JSON.parse(match[1]);
  } catch {}
  return null;
}

function cleanContent(content) {
  return content?.replace(/__PENDING_TX__.*?__END_TX__/s, '').trim() || '';
}

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

// ── Card de confirmação ────────────────────────────────────
function ConfirmCard({ pendingTx, onConfirm, onCancel, confirmLoading }) {
  if (!pendingTx) return null;
  const isTransfer = pendingTx.intent === 'transfer';

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-violet-200 dark:border-violet-800 overflow-hidden shadow-lg mx-1">
        <div className="bg-gradient-to-r from-violet-50 to-indigo-50 dark:from-violet-900/30 dark:to-indigo-900/30 px-4 py-3 border-b border-violet-100 dark:border-violet-800 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-violet-600" />
          <p className="text-sm font-semibold text-violet-700 dark:text-violet-300">
            {isTransfer ? 'Confirmar transferência' : 'Confirmar lançamento'}
          </p>
        </div>
        <div className="px-4 py-4 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-xs text-gray-500">Valor</span>
            <span className={`text-xl font-bold ${isTransfer ? 'text-blue-600' : pendingTx.type === 'expense' ? 'text-red-600' : 'text-emerald-600'}`}>
              {fmt(pendingTx.amount)}
            </span>
          </div>
          {isTransfer ? (
            <>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500">De</span>
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200 flex items-center gap-1"><Wallet className="w-3.5 h-3.5 text-gray-400" />{pendingTx.from_account}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500">Para</span>
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200 flex items-center gap-1"><Wallet className="w-3.5 h-3.5 text-gray-400" />{pendingTx.to_account}</span>
              </div>
            </>
          ) : (
            <>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500">Tipo</span>
                <span className={`text-sm font-semibold flex items-center gap-1 ${pendingTx.type === 'expense' ? 'text-red-600' : 'text-emerald-600'}`}>
                  {pendingTx.type === 'expense' ? <><TrendingDown className="w-3.5 h-3.5" /> Saída</> : <><TrendingUp className="w-3.5 h-3.5" /> Entrada</>}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500">Descrição</span>
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{pendingTx.description}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500">Categoria</span>
                <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-2 py-1 rounded-full capitalize">{pendingTx.category}</span>
              </div>
              {pendingTx.account_name && (
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-500">Conta</span>
                  <span className="text-sm font-medium text-gray-800 dark:text-gray-200 flex items-center gap-1"><Wallet className="w-3.5 h-3.5 text-gray-400" />{pendingTx.account_name}</span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500">Status</span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${pendingTx.is_realized ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                  {pendingTx.is_realized ? '✅ Realizado' : '📋 Previsto'}
                </span>
              </div>
            </>
          )}
          <div className="flex justify-between items-center">
            <span className="text-xs text-gray-500">Data</span>
            <span className="text-sm text-gray-700 dark:text-gray-300">{pendingTx.date}</span>
          </div>
        </div>
        <div className="flex gap-2 px-4 pb-4">
          <button onClick={onCancel} className="flex-1 h-11 rounded-xl border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 text-sm font-medium flex items-center justify-center gap-2">
            <X className="w-4 h-4" /> Cancelar
          </button>
          <button onClick={onConfirm} disabled={confirmLoading}
            className="flex-1 h-11 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-sm font-semibold flex items-center justify-center gap-2 shadow-md disabled:opacity-60">
            {confirmLoading
              ? <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full" />
              : <><Check className="w-4 h-4" /> Confirmar</>}
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ── Aba Chat ───────────────────────────────────────────────
function ChatTab({ user }) {
  const [messages, setMessages]         = useState([]);
  const [input, setInput]               = useState("");
  const [loading, setLoading]           = useState(false);
  const [pendingTx, setPendingTx]       = useState(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [wizard, setWizard]             = useState(null);

  const endRef   = useRef(null);
  const inputRef = useRef(null);
  const today    = new Date().toISOString().split('T')[0];
  const currentMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

  useEffect(() => {
    setMessages([{
      role: 'assistant',
      content: `Olá! Sou o **Finn** ✨\n\nSeu consultor financeiro pessoal. Posso responder perguntas e **registrar transações** por você.\n\nComo posso te ajudar hoje?`
    }]);
  }, [user?.id]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, pendingTx]);

  // ── Wizard ───────────────────────────────────────────────
  const startWizard = async (type) => {
    setShowSuggestions(false);
    setPendingTx(null);
    const { data: accs } = await supabase.from('accounts').select('id, name, type').eq('user_id', user.id);
    const accounts = accs || [];
    const label = type === 'expense' ? 'despesa' : type === 'income' ? 'entrada' : 'transferência';
    const emoji = type === 'expense' ? '💸' : type === 'income' ? '💰' : '🔄';
    setWizard({ type, step: 'amount', data: { _accounts: accounts } });
    setMessages(prev => [...prev, {
      role: 'assistant',
      content: `${emoji} Vamos registrar uma **${label}**!\n\nQual o **valor**? (ex: 50 ou 32,90)`
    }]);
  };

  const handleWizardInput = async (value) => {
    const w = { ...wizard, data: { ...wizard.data } };

    if (w.step === 'amount') {
      const amount = parseFloat(value.replace(',', '.').replace(/[^0-9.]/g, ''));
      if (!amount || amount <= 0) {
        setMessages(prev => [...prev, { role: 'assistant', content: '❓ Valor inválido. Ex: **50** ou **32,90**' }]);
        return;
      }
      w.data.amount = amount;
      if (w.type === 'transfer') {
        w.step = 'from_account';
        setWizard(w);
        const accList = w.data._accounts.map(a => `• **${a.name}**`).join('\n');
        setMessages(prev => [...prev, { role: 'assistant', content: `De qual conta sai o dinheiro?\n\n${accList}` }]);
      } else {
        w.step = 'description';
        setWizard(w);
        setMessages(prev => [...prev, { role: 'assistant', content: `O que foi? (ex: mercado, uber, salário)` }]);
      }
      return;
    }

    if (w.step === 'description') {
      w.data.description = value;
      w.step = 'category';
      setWizard(w);
      const catList = CATEGORIES.map(c => `• ${c.label}`).join('\n');
      setMessages(prev => [...prev, { role: 'assistant', content: `Qual categoria?\n\n${catList}` }]);
      return;
    }

    if (w.step === 'category') {
      const found = CATEGORIES.find(c =>
        c.value.includes(value.toLowerCase()) ||
        c.label.toLowerCase().includes(value.toLowerCase())
      );
      if (!found) {
        setMessages(prev => [...prev, { role: 'assistant', content: `❓ Digite: alimentação, transporte, moradia, saúde, educação, lazer, compras ou outros` }]);
        return;
      }
      w.data.category = found.value;
      w.step = 'account';
      setWizard(w);
      const accList = w.data._accounts.map(a => `• **${a.name}**`).join('\n');
      setMessages(prev => [...prev, { role: 'assistant', content: `Qual conta?\n\n${accList}` }]);
      return;
    }

    if (w.step === 'account') {
      const found = w.data._accounts.find(a => a.name.toLowerCase().includes(value.toLowerCase()));
      if (!found) {
        const accList = w.data._accounts.map(a => `• **${a.name}**`).join('\n');
        setMessages(prev => [...prev, { role: 'assistant', content: `❓ Não encontrei. Escolha:\n\n${accList}` }]);
        return;
      }
      w.data.account_id   = found.id;
      w.data.account_name = found.name;
      setWizard(null);
      setPendingTx({ type: w.type, amount: w.data.amount, description: w.data.description, category: w.data.category, account_name: w.data.account_name, account_id: w.data.account_id, date: today, is_realized: true });
      setMessages(prev => [...prev, { role: 'assistant', content: `Confira os dados abaixo 👇` }]);
      return;
    }

    if (w.step === 'from_account') {
      const found = w.data._accounts.find(a => a.name.toLowerCase().includes(value.toLowerCase()));
      if (!found) {
        const accList = w.data._accounts.map(a => `• **${a.name}**`).join('\n');
        setMessages(prev => [...prev, { role: 'assistant', content: `❓ Não encontrei. Escolha:\n\n${accList}` }]);
        return;
      }
      w.data.from_account_id   = found.id;
      w.data.from_account_name = found.name;
      w.step = 'to_account';
      setWizard(w);
      const remaining = w.data._accounts.filter(a => a.id !== found.id).map(a => `• **${a.name}**`).join('\n');
      setMessages(prev => [...prev, { role: 'assistant', content: `Para qual conta?\n\n${remaining}` }]);
      return;
    }

    if (w.step === 'to_account') {
      const found = w.data._accounts.find(a => a.name.toLowerCase().includes(value.toLowerCase()) && a.id !== w.data.from_account_id);
      if (!found) {
        const remaining = w.data._accounts.filter(a => a.id !== w.data.from_account_id).map(a => `• **${a.name}**`).join('\n');
        setMessages(prev => [...prev, { role: 'assistant', content: `❓ Escolha:\n\n${remaining}` }]);
        return;
      }
      w.data.to_account_id   = found.id;
      w.data.to_account_name = found.name;
      setWizard(null);
      setPendingTx({ intent: 'transfer', amount: w.data.amount, from_account: w.data.from_account_name, to_account: w.data.to_account_name, from_account_id: w.data.from_account_id, to_account_id: w.data.to_account_id, date: today, description: 'Transferência' });
      setMessages(prev => [...prev, { role: 'assistant', content: `Confira os dados abaixo 👇` }]);
      return;
    }
  };

  // ── Send ─────────────────────────────────────────────────
  const sendMessage = async (text) => {
    const message = (text || input).trim();
    if (!message || loading) return;
    setInput("");
    setMessages(prev => [...prev, { role: 'user', content: message }]);
    if (wizard) { await handleWizardInput(message); return; }
    setShowSuggestions(false);
    setLoading(true);
    try {
      const history = messages.slice(1).map(m => ({ role: m.role, content: cleanContent(m.content) }));
      const { data: result, error: err } = await supabase.functions.invoke('ai-chat', {
        body: { userId: user.id, message, history, month: currentMonth }
      });
      if (err || result?.error) throw new Error(result?.error || 'Erro');
      const reply  = result.reply;
      const txData = parsePendingTx(reply);
      if (txData) setPendingTx(txData); else setPendingTx(null);
      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: '😕 Ocorreu um erro. Tente novamente!' }]);
    } finally { setLoading(false); }
  };

  // ── Confirm ───────────────────────────────────────────────
  const confirmTransaction = async () => {
    if (!pendingTx || confirmLoading) return;
    setConfirmLoading(true);
    try {
      if (pendingTx.intent === 'transfer') {
        const { error } = await supabase.from('transactions').insert({
          user_id: user.id, type: 'transfer', amount: pendingTx.amount,
          description: 'Transferência', account_id: pendingTx.from_account_id,
          transfer_account_id: pendingTx.to_account_id, date: pendingTx.date, is_realized: true
        });
        if (error) throw error;
        setPendingTx(null);
        setMessages(prev => [...prev, { role: 'assistant', content: `✅ **Transferência lançada!**\n\n🔄 **${fmt(pendingTx.amount)}**\n🏦 ${pendingTx.from_account} → ${pendingTx.to_account}` }]);
      } else {
        let accountId = pendingTx.account_id || null;
        if (!accountId && pendingTx.account_name) {
          const { data: accs } = await supabase.from('accounts').select('id').eq('user_id', user.id).ilike('name', `%${pendingTx.account_name}%`).limit(1);
          accountId = accs?.[0]?.id || null;
        }
        const { error } = await supabase.from('transactions').insert({
          user_id: user.id, type: pendingTx.type, amount: pendingTx.amount,
          description: pendingTx.description, category: pendingTx.category,
          account_id: accountId, date: pendingTx.date || today, is_realized: pendingTx.is_realized ?? true
        });
        if (error) throw error;
        setPendingTx(null);
        setMessages(prev => [...prev, { role: 'assistant', content: `✅ **Lançado!**\n\n${pendingTx.type === 'expense' ? '💸' : '💰'} **${fmt(pendingTx.amount)}** — ${pendingTx.description}\n📂 ${pendingTx.category}\n🏦 ${pendingTx.account_name || ''}` }]);
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: '❌ Erro ao salvar. Tente novamente.' }]);
      setPendingTx(null);
    } finally { setConfirmLoading(false); }
  };

  const cancelTransaction = () => {
    setPendingTx(null);
    setWizard(null);
    setMessages(prev => [...prev, { role: 'assistant', content: '❌ Cancelado!' }]);
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Mensagens */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.map((msg, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
            {msg.role === 'assistant' && (
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center flex-shrink-0 mt-1 shadow-md shadow-violet-200 dark:shadow-violet-900">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
            )}
            <div className={`max-w-[82%] flex flex-col gap-1 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
              <div className={`rounded-2xl px-4 py-3 ${
                msg.role === 'user'
                  ? 'bg-gradient-to-br from-violet-600 to-indigo-600 text-white rounded-tr-sm shadow-lg shadow-violet-200 dark:shadow-violet-900/50'
                  : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-tl-sm shadow-sm border border-gray-100 dark:border-gray-700'
              }`}>
                <ReactMarkdown className="text-sm leading-relaxed prose prose-sm dark:prose-invert max-w-none prose-p:my-1">
                  {cleanContent(msg.content)}
                </ReactMarkdown>
              </div>
            </div>
          </motion.div>
        ))}

        <AnimatePresence>
          {pendingTx && (
            <ConfirmCard pendingTx={pendingTx} onConfirm={confirmTransaction} onCancel={cancelTransaction} confirmLoading={confirmLoading} />
          )}
        </AnimatePresence>

        {loading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center flex-shrink-0 shadow-md">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm border border-gray-100 dark:border-gray-700">
              <div className="flex gap-1 items-center h-5">
                {[0, 1, 2].map(i => (
                  <motion.div key={i} animate={{ y: [0, -5, 0], opacity: [0.4, 1, 0.4] }}
                    transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.15 }}
                    className="w-2 h-2 bg-violet-400 rounded-full" />
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
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="px-4 pb-2 flex-shrink-0">
            <p className="text-xs text-gray-400 mb-2 font-medium">Perguntas frequentes</p>
            <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-1">
              {QUICK_QUESTIONS.map((q, i) => (
                <button key={i} onClick={() => sendMessage(q.text)}
                  className="flex-shrink-0 flex items-center gap-1.5 text-xs bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-full px-3 py-1.5 shadow-sm hover:border-violet-300 transition-all">
                  <span>{q.icon}</span> {q.text}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400 mb-2 mt-3 font-medium">Lançamentos rápidos</p>
            <div className="flex gap-2">
              {[
                { icon: "💸", label: "Despesa",       type: "expense"  },
                { icon: "💰", label: "Entrada",       type: "income"   },
                { icon: "🔄", label: "Transferência", type: "transfer" },
              ].map((s, i) => (
                <motion.button key={i} whileTap={{ scale: 0.96 }} onClick={() => startWizard(s.type)}
                  className="flex-1 flex items-center justify-center gap-1.5 text-xs bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800 rounded-xl px-2 py-2.5 hover:bg-violet-100 transition-all font-medium">
                  <span>{s.icon}</span> {s.label}
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input */}
      <div className="px-4 pt-3 bg-white dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700 flex-shrink-0"
        style={{ paddingBottom: '12px' }}>
        <div className="flex gap-2 items-end">
          <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            placeholder={wizard ? "Digite sua resposta..." : "Pergunte ou registre um gasto..."}
            className="flex-1 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-2xl px-4 py-3 text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 dark:focus:ring-violet-900/30 transition-all" />
          <motion.button whileTap={{ scale: 0.9 }} onClick={() => sendMessage()} disabled={!input.trim() || loading}
            className="w-12 h-12 bg-gradient-to-br from-violet-600 to-indigo-600 disabled:opacity-40 rounded-2xl flex items-center justify-center shadow-md">
            <Send className="w-4 h-4 text-white" />
          </motion.button>
        </div>
      </div>
    </div>
  );
}

// ── Aba Análise ────────────────────────────────────────────
function AnalysisTab({ user }) {
  const [loading, setLoading]           = useState(false);
  const [loadingSaved, setLoadingSaved] = useState(true);
  const [data, setData]                 = useState(null);
  const [error, setError]               = useState(null);
  const [limiteAtingido, setLimiteAtingido] = useState(false);
  const [expandedInsight, setExpandedInsight] = useState(null);
  const [usage, setUsage]               = useState(null);
  const [showPeriodSelector, setShowPeriodSelector] = useState(false);
  const currentMonth = String(new Date().getMonth() + 1).padStart(2, '0');
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [selectedYear, setSelectedYear]   = useState(String(currentYear));
  const month      = `${selectedYear}-${selectedMonth}`;
  const monthLabel = format(new Date(`${selectedYear}-${selectedMonth}-02`), 'MMMM yyyy', { locale: ptBR });

  useEffect(() => { loadSavedInsights(); }, [user?.id]);

  const loadSavedInsights = async () => {
    setLoadingSaved(true);
    try {
      const { data: profile } = await supabase.from('profiles').select('ai_insights, ai_insights_date').eq('id', user.id).single();
      if (profile?.ai_insights) setData(profile.ai_insights);
    } catch {}
    finally { setLoadingSaved(false); }
  };

  const saveInsights    = async (d) => supabase.from('profiles').update({ ai_insights: d, ai_insights_date: new Date().toISOString() }).eq('id', user.id);
  const deleteInsights  = async () => { await supabase.from('profiles').update({ ai_insights: null, ai_insights_date: null }).eq('id', user.id); setData(null); setUsage(null); };

  const fetchInsights = async () => {
    setLoading(true); setError(null); setLimiteAtingido(false); setShowPeriodSelector(false);
    try {
      const { data: result, error: err } = await supabase.functions.invoke('ai-insights', { body: { userId: user.id, month } });
      if (err) { try { const b = JSON.parse(err.context?.responseText || '{}'); if (b.error === 'limite_atingido') { setLimiteAtingido(true); setError(b.message); return; } } catch {} throw err; }
      if (result?.error === 'limite_atingido') { setLimiteAtingido(true); setError(result.message); return; }
      if (result?.error) throw new Error(result.error);
      setData(result); setUsage(result.usage);
      await saveInsights(result);
    } catch { setError("Erro ao gerar análise. Tente novamente."); }
    finally { setLoading(false); }
  };

  if (loadingSaved) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
      {usage && (
        <div className="bg-violet-50 dark:bg-violet-900/20 rounded-xl p-3 border border-violet-200 dark:border-violet-800 flex items-center justify-between">
          <div className="flex items-center gap-2"><Clock className="w-4 h-4 text-violet-600" /><p className="text-sm text-violet-700 dark:text-violet-300">Análises restantes esta semana</p></div>
          <span className="font-bold text-violet-600">{usage.remaining}/2</span>
        </div>
      )}
      {limiteAtingido && (
        <div className="bg-amber-50 dark:bg-amber-900/20 rounded-2xl p-5 border border-amber-200 dark:border-amber-800 text-center">
          <Clock className="w-10 h-10 text-amber-500 mx-auto mb-3" />
          <p className="text-amber-800 dark:text-amber-300 font-semibold mb-1">Limite semanal atingido</p>
          <p className="text-amber-600 dark:text-amber-400 text-sm">{error}</p>
        </div>
      )}
      <AnimatePresence>
        {showPeriodSelector && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
            <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-4 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-violet-600" /> Qual período deseja analisar?
            </h3>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1.5">Mês</p>
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                  <SelectTrigger className="h-10 rounded-xl border-gray-200"><SelectValue /></SelectTrigger>
                  <SelectContent>{months.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1.5">Ano</p>
                <Select value={selectedYear} onValueChange={setSelectedYear}>
                  <SelectTrigger className="h-10 rounded-xl border-gray-200"><SelectValue /></SelectTrigger>
                  <SelectContent>{years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="bg-violet-50 dark:bg-violet-900/20 rounded-xl p-3 mb-4">
              <p className="text-sm text-violet-700 dark:text-violet-300 text-center font-medium capitalize">📊 Analisando: {monthLabel}</p>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => setShowPeriodSelector(false)} variant="outline" className="flex-1 h-11 rounded-xl">Cancelar</Button>
              <Button onClick={fetchInsights} className="flex-1 h-11 bg-gradient-to-r from-violet-600 to-indigo-600 rounded-xl font-bold text-white">
                <Sparkles className="w-4 h-4 mr-2" />Gerar
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!data && !loading && !limiteAtingido && !showPeriodSelector && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 text-center">
          <div className="w-16 h-16 bg-violet-100 dark:bg-violet-900/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <BarChart2 className="w-8 h-8 text-violet-600" />
          </div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Análise Financeira Completa</h3>
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-2">Score de saúde, insights, recomendações e regra 50/30/20.</p>
          <p className="text-xs text-gray-400 mb-6">📊 2 análises gratuitas por semana</p>
          <Button onClick={() => setShowPeriodSelector(true)} className="w-full h-12 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 rounded-xl font-bold text-white">
            <Sparkles className="w-4 h-4 mr-2" />Gerar Análise
          </Button>
        </motion.div>
      )}

      {loading && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-sm border border-gray-100 dark:border-gray-700 text-center">
          <div className="w-16 h-16 bg-violet-100 dark:bg-violet-900/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }}>
              <Sparkles className="w-8 h-8 text-violet-600" />
            </motion.div>
          </div>
          <p className="text-gray-700 dark:text-gray-300 font-semibold mb-1">Analisando suas finanças...</p>
          <p className="text-gray-400 text-sm">Isso pode levar alguns segundos</p>
        </div>
      )}

      {error && !limiteAtingido && (
        <div className="bg-red-50 dark:bg-red-900/20 rounded-2xl p-4 border border-red-200">
          <p className="text-red-600 text-sm font-medium">{error}</p>
          <Button onClick={() => setShowPeriodSelector(true)} variant="outline" className="mt-3 w-full rounded-xl">Tentar novamente</Button>
        </div>
      )}

      {data && !loading && (
        <>
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            className={`bg-gradient-to-br ${scoreColors[data.insights?.score_color] || scoreColors.blue} rounded-2xl p-6 text-white`}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-white/80 text-sm">Saúde Financeira</p>
                <p className="text-4xl font-bold mt-1">{data.insights?.score}<span className="text-xl">/100</span></p>
                <span className="inline-block mt-1 px-3 py-1 bg-white/20 rounded-full text-sm font-semibold">{data.insights?.score_label}</span>
              </div>
              <div className="w-20 h-20 relative">
                <svg viewBox="0 0 36 36" className="w-20 h-20 -rotate-90">
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="3" />
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="white" strokeWidth="3" strokeDasharray={`${data.insights?.score} 100`} strokeLinecap="round" />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center"><Sparkles className="w-6 h-6 text-white" /></div>
              </div>
            </div>
            <p className="text-white/90 text-sm leading-relaxed mb-4">{data.insights?.resumo}</p>
            {data.insights?.alerta_projecao && data.insights.alerta_projecao !== 'null' && (
              <div className="bg-red-500/30 border border-red-300/50 rounded-xl p-3 mb-4">
                <p className="text-white text-sm font-semibold">{data.insights.alerta_projecao}</p>
              </div>
            )}
            <div className="grid grid-cols-3 gap-2">
              {[['Entradas', data.meta?.totalIncome], ['Saídas', data.meta?.totalExpense], ['Poupança', null]].map(([label, val], i) => (
                <div key={i} className="bg-white/20 rounded-xl p-2.5 text-center">
                  <p className="text-white/70 text-xs">{label}</p>
                  <p className="text-white font-bold text-xs">{i === 2 ? `${data.meta?.savingsRate}%` : fmt(val)}</p>
                </div>
              ))}
            </div>
          </motion.div>

          {data.insights?.insights?.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 px-1">💡 Insights do mês</h3>
              {data.insights.insights.map((insight, i) => {
                const { icon: Icon, color, bg, border } = insightIcons[insight.tipo] || insightIcons.neutro;
                const isExpanded = expandedInsight === i;
                return (
                  <div key={i} className={`${bg} rounded-2xl border ${border} overflow-hidden`}>
                    <button onClick={() => setExpandedInsight(isExpanded ? null : i)} className="w-full flex items-center gap-3 p-4 text-left">
                      <div className={`w-8 h-8 rounded-xl ${bg} flex items-center justify-center flex-shrink-0`}><Icon className={`w-4 h-4 ${color}`} /></div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{insight.titulo}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{insight.descricao}</p>
                      </div>
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                    </button>
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
                          <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-700 pt-3">
                            <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">{insight.descricao}</p>
                            <div className="bg-white dark:bg-gray-700 rounded-xl p-3">
                              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">✅ Ação recomendada:</p>
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

          {data.insights?.recomendacoes?.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
              <div className="px-5 pt-4 pb-2"><h3 className="text-sm font-bold text-gray-700 dark:text-gray-300">✂️ Onde reduzir custos</h3></div>
              <div className="divide-y divide-gray-50 dark:divide-gray-700">
                {data.insights.recomendacoes.map((rec, i) => (
                  <div key={i} className="px-5 py-3">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 capitalize">{rec.categoria}</p>
                      <span className="text-xs font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 rounded-full">Economize {fmt(rec.economia_possivel)}</span>
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs text-red-500">Atual: {fmt(rec.gasto_atual)}</span>
                      <span className="text-gray-300">→</span>
                      <span className="text-xs text-emerald-600">Ideal: {fmt(rec.gasto_ideal)}</span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{rec.dica}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.insights?.investimento_sugerido && (
            <div className={`rounded-2xl p-5 text-white ${data.meta?.isProjectedNegative ? 'bg-gradient-to-br from-red-500 to-rose-600' : 'bg-gradient-to-br from-emerald-500 to-teal-600'}`}>
              <div className="flex items-center gap-2 mb-3"><PiggyBank className="w-5 h-5 text-white" /><h3 className="text-sm font-bold">💰 Quanto investir</h3></div>
              <p className="text-3xl font-bold">{fmt(data.insights.investimento_sugerido.valor)}</p>
              <p className="text-white/80 text-sm mb-2">{data.insights.investimento_sugerido.percentual} da sua renda</p>
              <p className="text-white/80 text-sm">{data.insights.investimento_sugerido.justificativa}</p>
            </div>
          )}

          <div className="flex gap-3 pb-4">
            <Button onClick={() => setShowPeriodSelector(true)} variant="outline" className="flex-1 h-12 rounded-2xl border-gray-200 text-gray-600 font-medium">
              <RefreshCw className="w-4 h-4 mr-2" /> Nova análise
            </Button>
            <button onClick={deleteInsights} className="h-12 px-4 rounded-2xl border border-red-200 text-red-500 text-sm font-medium hover:bg-red-50 transition-colors">
              Apagar
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Componente principal ───────────────────────────────────
export default function AIInsights() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('chat');

  return (
    // ✅ position: fixed garante altura exata sem depender de dvh
    // bottom = NAV_HEIGHT para não ficar atrás da navbar
    <div
      className="flex flex-col bg-gray-50 dark:bg-gray-900"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: `${NAV_HEIGHT}px`,
      }}
    >
      {/* Header */}
      <div
        className="relative bg-gradient-to-br from-violet-600 via-purple-700 to-indigo-800 px-5 flex-shrink-0"
        style={{ paddingTop: 'max(48px, calc(env(safe-area-inset-top, 0px) + 12px))', paddingBottom: 0 }}
      >
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/5 rounded-full blur-2xl" />
          <div className="absolute top-5 -left-5 w-24 h-24 bg-violet-400/20 rounded-full blur-xl" />
        </div>

        <div className="relative flex items-center gap-4 mb-5">
          <div className="relative">
            <motion.div
              animate={{ boxShadow: ['0 0 0 0 rgba(167,139,250,0.4)', '0 0 0 12px rgba(167,139,250,0)', '0 0 0 0 rgba(167,139,250,0)'] }}
              transition={{ duration: 2.5, repeat: Infinity }}
              className="w-14 h-14 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center border border-white/30"
            >
              <motion.div animate={{ rotate: [0, 5, -5, 0] }} transition={{ duration: 4, repeat: Infinity, repeatDelay: 2 }}>
                <Sparkles className="w-7 h-7 text-white" />
              </motion.div>
            </motion.div>
            <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-400 rounded-full border-2 border-violet-700" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">Finn</h1>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
              <p className="text-violet-200 text-xs font-medium">Consultor financeiro IA</p>
            </div>
          </div>
        </div>

        {/* Abas */}
        <div className="relative flex">
          {[
            { id: 'chat',     label: 'Chat',    icon: MessageCircle },
            { id: 'analysis', label: 'Análise', icon: BarChart2     },
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold transition-all ${
                activeTab === tab.id
                  ? 'text-white border-b-2 border-white'
                  : 'text-white/50 border-b-2 border-transparent hover:text-white/70'
              }`}>
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Conteúdo */}
      <AnimatePresence mode="wait">
        <motion.div key={activeTab}
          initial={{ opacity: 0, x: activeTab === 'chat' ? -20 : 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="flex flex-col flex-1 min-h-0 overflow-hidden"
        >
          {activeTab === 'chat' ? <ChatTab user={user} /> : <AnalysisTab user={user} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}