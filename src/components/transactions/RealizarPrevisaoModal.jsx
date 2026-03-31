import React, { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { X, CheckCircle2, SplitSquareHorizontal } from "lucide-react";

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

export default function RealizarPrevisaoModal({ transaction, onConfirm, onClose }) {
  const [modo, setModo] = useState(null); // "total" | "parcial"
  const [valorParcial, setValorParcial] = useState("");

  const handleConfirmar = () => {
    const valor = modo === "total"
      ? transaction.amount
      : parseFloat(valorParcial) || 0;

    if (valor <= 0 || valor > transaction.amount) return;
    onConfirm({ transaction, valorRealizado: valor });
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center pb-16 sm:pb-0"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-gray-800 rounded-t-3xl sm:rounded-3xl w-full max-w-md overflow-hidden"
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-white">Registrar realização</h2>
            <p className="text-xs text-gray-400">{transaction.description} · previsão de {fmt(transaction.amount)}</p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="px-4 py-4 space-y-3">
          {/* Escolha do modo */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setModo("total")}
              className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                modo === "total"
                  ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20"
                  : "border-gray-200 dark:border-gray-700 hover:border-gray-300"
              }`}
            >
              <CheckCircle2 className={`w-6 h-6 ${modo === "total" ? "text-emerald-500" : "text-gray-400"}`} />
              <div className="text-center">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">Total</p>
                <p className="text-xs text-gray-400">{fmt(transaction.amount)}</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setModo("parcial")}
              className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                modo === "parcial"
                  ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                  : "border-gray-200 dark:border-gray-700 hover:border-gray-300"
              }`}
            >
              <SplitSquareHorizontal className={`w-6 h-6 ${modo === "parcial" ? "text-blue-500" : "text-gray-400"}`} />
              <div className="text-center">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">Parcial</p>
                <p className="text-xs text-gray-400">Digitar valor</p>
              </div>
            </button>
          </div>

          {/* Input valor parcial */}
          {modo === "parcial" && (
            <motion.div
              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
              className="space-y-1"
            >
              <Label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                Valor realizado (máx. {fmt(transaction.amount)})
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">R$</span>
                <Input
                  type="number" step="0.01" placeholder="0,00"
                  value={valorParcial}
                  onChange={(e) => setValorParcial(e.target.value)}
                  max={transaction.amount}
                  className="pl-10 h-11 text-xl font-bold border-gray-200 rounded-xl"
                  autoFocus
                />
              </div>
              {valorParcial && parseFloat(valorParcial) > 0 && (
                <p className="text-xs text-gray-400">
                  Saldo restante na previsão:{" "}
                  <span className="font-semibold text-amber-600">
                    {fmt(transaction.amount - (parseFloat(valorParcial) || 0))}
                  </span>
                </p>
              )}
            </motion.div>
          )}

          {/* Botão confirmar */}
          <Button
            onClick={handleConfirmar}
            disabled={!modo || (modo === "parcial" && (!valorParcial || parseFloat(valorParcial) <= 0 || parseFloat(valorParcial) > transaction.amount))}
            className="w-full h-11 rounded-xl text-sm font-semibold bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40"
          >
            Confirmar realização
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}