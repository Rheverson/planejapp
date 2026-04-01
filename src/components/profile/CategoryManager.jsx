import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/lib/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { X, Plus, Trash2, TrendingUp, TrendingDown, PiggyBank, Tag } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const tabs = [
  { value: "expense",    label: "Saídas",        Icon: TrendingDown, color: "text-red-600",    active: "bg-red-500 text-white" },
  { value: "income",     label: "Entradas",       Icon: TrendingUp,   color: "text-emerald-600", active: "bg-emerald-500 text-white" },
  { value: "investment", label: "Investimentos",  Icon: PiggyBank,    color: "text-violet-600",  active: "bg-violet-500 text-white" },
];

export default function CategoryManager({ onClose }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("expense");
  const [newName, setNewName] = useState("");

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ['categories', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .or(`user_id.eq.${user?.id},is_default.eq.true`)
        .order('is_default', { ascending: false })
        .order('name');
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id
  });

  const createMutation = useMutation({
    mutationFn: async ({ name, type }) => {
      const { error } = await supabase.from('categories').insert([{
        name, type, user_id: user?.id, is_default: false
      }]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories', user?.id] });
      setNewName("");
      toast.success("Categoria criada!");
    },
    onError: (err) => toast.error("Erro: " + err.message)
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('categories').delete().eq('id', id).eq('user_id', user?.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories', user?.id] });
      toast.success("Categoria removida!");
    },
    onError: (err) => toast.error("Erro: " + err.message)
  });

  const filtered = categories.filter(c => c.type === activeTab);
  const defaultCats = filtered.filter(c => c.is_default);
  const customCats = filtered.filter(c => !c.is_default);

  const handleAdd = () => {
    if (!newName.trim()) return;
    createMutation.mutate({ name: newName.trim(), type: activeTab });
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center pb-16 sm:pb-0"
      onClick={onClose}>
      <motion.div initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-gray-800 rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[88vh] flex flex-col">

        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4 text-blue-600" />
            <h2 className="text-base font-bold text-gray-900 dark:text-white">Categorias</h2>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1.5 p-3 flex-shrink-0">
          {tabs.map(({ value, label, Icon, active }) => (
            <button key={value} type="button" onClick={() => setActiveTab(value)}
              className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-xl text-xs font-semibold transition-all ${
                activeTab === value ? active : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
              }`}>
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>

        {/* Adicionar nova */}
        <div className="px-4 pb-3 flex gap-2 flex-shrink-0">
          <Input
            placeholder="Nova categoria..."
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            className="h-10 text-sm border-gray-200 rounded-xl flex-1"
          />
          <Button onClick={handleAdd} disabled={!newName.trim() || createMutation.isPending}
            className="h-10 px-4 rounded-xl bg-blue-600 hover:bg-blue-700">
            <Plus className="w-4 h-4" />
          </Button>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-4">
          {/* Categorias personalizadas */}
          {customCats.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">Minhas categorias</p>
              <div className="space-y-2">
                {customCats.map(cat => (
                  <div key={cat.id} className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800">
                    <span className="text-sm font-medium text-gray-900 dark:text-white">{cat.name}</span>
                    <button type="button" onClick={() => deleteMutation.mutate(cat.id)}
                      className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
                      <Trash2 className="w-3.5 h-3.5 text-red-400" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Categorias padrão */}
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">Categorias padrão</p>
            <div className="space-y-1.5">
              {isLoading ? (
                <p className="text-sm text-gray-400 text-center py-4">Carregando...</p>
              ) : (
                defaultCats.map(cat => (
                  <div key={cat.id} className="flex items-center p-3 bg-gray-50 dark:bg-gray-700 rounded-xl">
                    <span className="text-sm text-gray-700 dark:text-gray-300">{cat.name}</span>
                    <span className="ml-auto text-xs text-gray-400">padrão</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}