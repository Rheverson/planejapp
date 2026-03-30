import React, { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X, Users, Mail, Check, AlertCircle, Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "sonner";

const relationshipTypes = [
  { value: "Esposo(a)", label: "Esposo(a)" },
  { value: "Namorado(a)", label: "Namorado(a)" },
  { value: "Noivo(a)", label: "Noivo(a)" },
  { value: "Irmão(ã)", label: "Irmão(ã)" },
  { value: "Pai/Mãe", label: "Pai/Mãe" },
  { value: "Filho(a)", label: "Filho(a)" },
  { value: "Outro", label: "Outro" }
];

const PermissionItem = ({ title, description, checked, onChange, disabled }) => (
  <div className="flex items-start gap-4 py-4">
    <div className="flex-1 min-w-0">
      <p className="font-medium text-gray-900 dark:text-gray-100 text-sm leading-tight mb-1">{title}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400">{description}</p>
    </div>
    <Switch 
      checked={checked} 
      onCheckedChange={onChange} 
      className="flex-shrink-0" 
      disabled={disabled}
    />
  </div>
);

export default function ShareFinancesModal({ onSubmit, onClose }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [emailCheckLoading, setEmailCheckLoading] = useState(false);
  const [emailExists, setEmailExists] = useState(null);
  const [formData, setFormData] = useState({
    shared_with_email: "",
    relationship_type: "",
    permissions: {
      view_transactions: true,
      add_transactions: true,
      edit_transactions: false,
      delete_transactions: false,
      view_accounts: true,
      manage_accounts: false
    }
  });

  const checkEmailExists = async (email) => {
    try {
      setEmailCheckLoading(true);

      const { data, error } = await supabase
        .rpc('get_user_by_email', { email_input: email.trim().toLowerCase() });

      if (error) {
        console.error('Erro RPC:', error); // Vai aparecer o erro exato no console
        setEmailExists(false);
        return;
      }

      setEmailExists(data && data.length > 0);
    } catch (err) {
      console.error('Erro catch:', err);
      setEmailExists(false);
    } finally {
      setEmailCheckLoading(false);
    }
  };
  const handleEmailChange = async (e) => {
    const newEmail = e.target.value;
    setFormData({ ...formData, shared_with_email: newEmail });

    if (newEmail.includes('@') && newEmail.length > 5) {
      await checkEmailExists(newEmail);
    } else {
      setEmailExists(null);
    }
  };

  const updatePermission = (key, value) => {
    setFormData(prev => ({
      ...prev,
      permissions: { ...prev.permissions, [key]: value }
    }));
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    console.log('🔵 handleSubmit chamado!');
    console.log('🔵 onSubmit existe?', typeof onSubmit); 
    console.log('🔵 emailExists:', emailExists);           // <- adiciona
    console.log('🔵 formData:', JSON.stringify(formData)); // <- adiciona
    console.log('🔵 user:', user?.email);                  // <- adiciona

    // Validações
    if (!formData.shared_with_email || !formData.relationship_type) {
      console.log('❌ Parou: campos obrigatórios');
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    if (emailExists !== true) {
      console.log('❌ Parou: emailExists =', emailExists);
      toast.error('O e-mail digitado não possui uma conta ativa');
      return;
    }

    if (formData.shared_with_email.toLowerCase() === user?.email?.toLowerCase()) {
          console.log('❌ Parou: mesmo email');
          toast.error('Você não pode compartilhar com você mesmo');
          return;
        }
        if (formData.shared_with_email.toLowerCase() === user?.email?.toLowerCase()) {
      console.log('❌ Parou: mesmo email');
      toast.error('Você não pode compartilhar com você mesmo');
      return;
    }

    console.log('✅ Passou validações, chamando onSubmit...');
    setLoading(true);
    try {
      console.log('🔵 Chamando onSubmit...');
      // Chama a função handleShare que está no Profile.jsx
      await onSubmit({
        shared_with_email: formData.shared_with_email.toLowerCase().trim(),
        relationship_type: formData.relationship_type,
        permissions: formData.permissions
      });
      // O fechamento do modal é feito pelo componente pai (Profile.jsx) no onSuccess da mutation
    } catch (error) {
        console.error("Erro no Modal:", error);
        // O toast de erro já é disparado pela mutation no Pai, mas garantimos aqui se necessário
    } finally {
      setLoading(false);
    }
  };

  const isFormValid = 
    formData.shared_with_email && 
    formData.relationship_type && 
    emailExists === true && 
    formData.shared_with_email.toLowerCase() !== user?.email?.toLowerCase() && // <- adiciona
    !loading;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[999] flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: "100%", opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: "100%", opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-gray-800 w-full max-w-md rounded-t-[2.5rem] sm:rounded-[2rem] flex flex-col max-h-[92vh] overflow-hidden shadow-2xl"
      >
        {/* Header */}
        <div className="flex-shrink-0 px-6 py-5 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between bg-white dark:bg-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
              <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Compartilhar finanças</h2>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <form id="share-form" onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-semibold">
                E-mail do convidado <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <Input
                  id="email"
                  type="email"
                  placeholder="exemplo@email.com"
                  value={formData.shared_with_email}
                  onChange={handleEmailChange}
                  className="h-12 rounded-xl pl-10 pr-10 border-gray-200 dark:border-gray-700"
                  disabled={loading}
                  required
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {emailCheckLoading && <Loader2 className="w-5 h-5 animate-spin text-blue-500" />}
                  {!emailCheckLoading && emailExists === true && <Check className="w-5 h-5 text-green-500" />}
                  {!emailCheckLoading && emailExists === false && <AlertCircle className="w-5 h-5 text-red-500" />}
                </div>
              </div>
              {emailExists === false && (
                <p className="text-[11px] text-red-500 font-medium">Este usuário ainda não possui conta no App.</p>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-semibold">Tipo de relacionamento <span className="text-red-500">*</span></Label>
              <Select 
                disabled={loading}
                value={formData.relationship_type} 
                onValueChange={(v) => setFormData(prev => ({ ...prev, relationship_type: v }))}
              >
                <SelectTrigger className="h-12 rounded-xl border-gray-200 dark:border-gray-700">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent className="z-[1001]">
                  {relationshipTypes.map((type) => (
                    <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3 pt-2">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Permissões de Acesso</h3>
              <div className="bg-gray-50 dark:bg-gray-900/50 rounded-2xl p-2 border border-gray-100 dark:border-gray-700">
                <PermissionItem
                  title="Ver transações e contas"
                  description="Permite visualizar extratos e saldos"
                  checked={formData.permissions.view_transactions}
                  onChange={(c) => updatePermission('view_transactions', c)}
                  disabled={loading}
                />
                <PermissionItem
                  title="Adicionar registros"
                  description="Permite criar novas receitas ou despesas"
                  checked={formData.permissions.add_transactions}
                  onChange={(c) => updatePermission('add_transactions', c)}
                  disabled={loading}
                />
              </div>
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-6 py-6 border-t border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800">
          <div className="flex gap-3">
            <Button
              type="button"
              onClick={onClose}
              variant="ghost"
              className="flex-1 h-12 rounded-xl text-gray-500"
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={!isFormValid}
              className={`flex-1 h-12 rounded-xl font-bold shadow-lg transition-all ${
                isFormValid 
                  ? "bg-blue-600 hover:bg-blue-700 text-white shadow-blue-200" 
                  : "bg-gray-100 text-gray-400"
              }`}
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Enviando...</span>
                </div>
              ) : (
                "Compartilhar"
              )}
            </Button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}