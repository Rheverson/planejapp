import { motion } from "framer-motion";
import { X, MessageCircle, Mail, Book, Video } from "lucide-react";
import { Button } from "@/components/ui/button";

const helpTopics = [
  {
    icon: Book,
    title: "Como começar",
    description: "Aprenda o básico sobre como usar o app",
    action: "tutorial"
  },
  {
    icon: MessageCircle,
    title: "FAQ - Perguntas Frequentes",
    description: "Respostas para dúvidas comuns",
    action: "faq"
  },
  {
    icon: Video,
    title: "Tutoriais em vídeo",
    description: "Assista guias passo a passo",
    action: "videos"
  },
  {
    icon: Mail,
    title: "Contato com suporte",
    description: "Envie sua dúvida para nossa equipe",
    action: "contact"
  }
];

export default function HelpModal({ onClose }) {
  const handleTopicClick = (action) => {
    // Aqui você pode adicionar navegação ou outras ações
    console.log(`Help topic clicked: ${action}`);
  };

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
        className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-lg shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Central de Ajuda</h2>
          <button 
            onClick={onClose} 
            className="w-10 h-10 flex items-center justify-center hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-3">
          {helpTopics.map((topic, index) => (
            <motion.button
              key={topic.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              onClick={() => handleTopicClick(topic.action)}
              className="w-full flex items-center gap-4 p-4 bg-gray-50 hover:bg-gray-100 rounded-2xl transition-colors"
            >
              <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
                <topic.icon className="w-6 h-6 text-blue-600" />
              </div>
              <div className="flex-1 text-left">
                <p className="font-semibold text-gray-900 text-sm">{topic.title}</p>
                <p className="text-xs text-gray-500 mt-0.5">{topic.description}</p>
              </div>
            </motion.button>
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100">
          <p className="text-center text-sm text-gray-500">
            Não encontrou o que procura?{" "}
            <a href="mailto:suporte@financeplan.com" className="text-blue-600 font-medium">
              Fale conosco
            </a>
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}
