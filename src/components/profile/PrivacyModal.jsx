import { motion } from "framer-motion";
import { X, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PrivacyModal({ onClose }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-end sm:items-center justify-center"
      onClick={onClose}>
      <motion.div initial={{ y: "100%", opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: "100%", opacity: 0 }}
        transition={{ type: "spring", damping: 30, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-gray-900 rounded-t-3xl sm:rounded-3xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl">

        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-green-50 dark:bg-green-900/30 flex items-center justify-center">
              <Shield className="w-5 h-5 text-green-600" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Política de Privacidade</h2>
          </div>
          <button onClick={onClose} className="w-10 h-10 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 text-gray-700 dark:text-gray-300">
          {[
            { title: "1. Informações que Coletamos", text: "Coletamos informações que você nos fornece diretamente, como nome, e-mail e dados financeiros inseridos no aplicativo (transações, contas, metas)." },
            { title: "2. Como Usamos suas Informações", text: "Utilizamos suas informações para fornecer e melhorar nossos serviços, personalizar sua experiência, enviar notificações importantes e análise estatística interna." },
            { title: "3. Segurança dos Dados", text: "Implementamos medidas de segurança para proteger suas informações, incluindo criptografia de dados em trânsito e em repouso. No entanto, nenhum sistema é 100% seguro." },
            { title: "4. Compartilhamento de Dados", text: "Não vendemos suas informações pessoais. Podemos compartilhar dados apenas quando você autorizar explicitamente (compartilhamento de finanças), ou quando exigido por lei." },
            { title: "5. Seus Direitos", text: "Você tem direito a acessar seus dados pessoais, corrigir informações incorretas, solicitar exclusão de sua conta e dados, e exportar seus dados." },
            { title: "6. Cookies e Tecnologias", text: "Utilizamos cookies e tecnologias similares para melhorar sua experiência e analisar o uso do aplicativo." },
          ].map(({ title, text }) => (
            <div key={title}>
              <h3 className="font-semibold text-gray-900 dark:text-white mb-2">{title}</h3>
              <p className="text-sm leading-relaxed">{text}</p>
            </div>
          ))}
          <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400">Última atualização: 23 de fevereiro de 2026</p>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex-shrink-0">
          <Button onClick={onClose} className="w-full rounded-xl bg-blue-600 hover:bg-blue-700 text-white">Entendi</Button>
        </div>
      </motion.div>
    </motion.div>
  );
}