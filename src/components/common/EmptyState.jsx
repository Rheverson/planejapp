import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";

export default function EmptyState({ icon: Icon, title, description, action, onAction }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center py-12 px-4 text-center"
    >
      <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
        <Icon className="w-8 h-8 text-gray-400 dark:text-gray-500" />
      </div>
      
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">{title}</h3>
      <p className="text-gray-500 dark:text-gray-400 mb-6 max-w-xs">{description}</p>
      
      {action && onAction && (
        <Button
          onClick={onAction}
          className="rounded-xl bg-blue-600 hover:bg-blue-700"
        >
          {action}
        </Button>
      )}
    </motion.div>
  );
}