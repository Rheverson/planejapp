import { motion } from "framer-motion";
import { X, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PrivacyModal({ onClose }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: "100%", opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: "100%", opacity: 0 }}
        transition={{ type: "spring", damping: 30, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center">
              <Shield className="w-5 h-5 text-green-600" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">Política de Privacidade</h2>
          </div>
          <button 
            onClick={onClose} 
            className="w-10 h-10 flex items-center justify-center hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 text-gray-700">
          <div>
            <h3 className="font-semibold text-gray-900 mb-2">1. Informações que Coletamos</h3>
            <p className="text-sm leading-relaxed">
              Coletamos informações que você nos fornece diretamente, como nome, e-mail e dados 
              financeiros inseridos no aplicativo (transações, contas, metas).
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-gray-900 mb-2">2. Como Usamos suas Informações</h3>
            <p className="text-sm leading-relaxed mb-2">
              Utilizamos suas informações para:
            </p>
            <ul className="text-sm space-y-1 ml-4 list-disc">
              <li>Fornecer e melhorar nossos serviços</li>
              <li>Personalizar sua experiência</li>
              <li>Enviar notificações importantes</li>
              <li>Análise e estatísticas internas</li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-gray-900 mb-2">3. Segurança dos Dados</h3>
            <p className="text-sm leading-relaxed">
              Implementamos medidas de segurança para proteger suas informações, incluindo 
              criptografia de dados em trânsito e em repouso. No entanto, nenhum sistema é 
              100% seguro.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-gray-900 mb-2">4. Compartilhamento de Dados</h3>
            <p className="text-sm leading-relaxed">
              Não vendemos suas informações pessoais. Podemos compartilhar dados apenas quando:
              você autorizar explicitamente (compartilhamento de finanças), ou quando exigido por lei.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-gray-900 mb-2">5. Seus Direitos</h3>
            <p className="text-sm leading-relaxed mb-2">
              Você tem direito a:
            </p>
            <ul className="text-sm space-y-1 ml-4 list-disc">
              <li>Acessar seus dados pessoais</li>
              <li>Corrigir informações incorretas</li>
              <li>Solicitar exclusão de sua conta e dados</li>
              <li>Exportar seus dados</li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-gray-900 mb-2">6. Cookies e Tecnologias</h3>
            <p className="text-sm leading-relaxed">
              Utilizamos cookies e tecnologias similares para melhorar sua experiência e 
              analisar o uso do aplicativo.
            </p>
          </div>

          <div className="pt-4 border-t border-gray-200">
            <p className="text-xs text-gray-500">
              Última atualização: 23 de fevereiro de 2026
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex-shrink-0">
          <Button onClick={onClose} className="w-full rounded-xl">
            Entendi
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}