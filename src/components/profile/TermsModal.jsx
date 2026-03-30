import { motion } from "framer-motion";
import { X, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function TermsModal({ onClose }) {
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
            <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center">
              <FileText className="w-5 h-5 text-blue-600" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">Termos de Uso</h2>
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
            <h3 className="font-semibold text-gray-900 mb-2">1. Aceitação dos Termos</h3>
            <p className="text-sm leading-relaxed">
              Ao utilizar o Finance Plan, você concorda com estes termos de uso. Se não concordar, 
              por favor, não utilize nosso aplicativo.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-gray-900 mb-2">2. Uso do Serviço</h3>
            <p className="text-sm leading-relaxed">
              O Finance Plan é uma ferramenta de gestão financeira pessoal. Você é responsável por 
              manter a confidencialidade de sua conta e senha, bem como por todas as atividades 
              realizadas em sua conta.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-gray-900 mb-2">3. Dados e Privacidade</h3>
            <p className="text-sm leading-relaxed">
              Seus dados financeiros são armazenados de forma segura e criptografada. Não compartilhamos 
              suas informações pessoais com terceiros sem seu consentimento explícito.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-gray-900 mb-2">4. Limitação de Responsabilidade</h3>
            <p className="text-sm leading-relaxed">
              O Finance Plan é fornecido "como está". Não nos responsabilizamos por decisões financeiras 
              tomadas com base nas informações do aplicativo.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-gray-900 mb-2">5. Modificações</h3>
            <p className="text-sm leading-relaxed">
              Reservamo-nos o direito de modificar estes termos a qualquer momento. Continuando a usar 
              o aplicativo após as mudanças, você aceita os novos termos.
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