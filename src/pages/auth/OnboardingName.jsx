import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowRight, User } from "lucide-react";

export default function OnboardingName() {
  const location = useLocation();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  
  // Recuperamos o e-mail que veio da tela de login
  const email = location.state?.email || "";

  const handleNext = () => {
    if (name.length >= 3) {
      // Passamos o e-mail e o nome para a próxima etapa (Meta Financeira)
      navigate("/onboarding/goals", { state: { email, name } });
    }
  };

  return (
    <div className="min-h-screen bg-blue-600 flex flex-col justify-end sm:justify-center items-center p-4">
      <div className="mb-8 text-center text-white">
        <h1 className="text-3xl font-bold tracking-tight">Quase lá!</h1>
        <p className="opacity-80">Vamos personalizar sua experiência</p>
      </div>

      <motion.div 
        initial={{ y: 50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="bg-white w-full max-w-md rounded-3xl p-8 shadow-2xl"
      >
        <div className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="name" className="text-lg">Como podemos te chamar?</Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
              <Input 
                id="name" 
                placeholder="Seu nome ou apelido" 
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-14 rounded-xl pl-10 border-gray-200 focus:ring-blue-500 text-lg"
                autoFocus
              />
            </div>
          </div>

          <Button 
            onClick={handleNext}
            disabled={name.length < 3}
            className="w-full h-14 rounded-xl text-lg font-semibold bg-blue-600 hover:bg-blue-700 transition-all flex items-center justify-center gap-2"
          >
            Continuar
            <ArrowRight size={20} />
          </Button>
          
          <p className="text-center text-xs text-gray-400">
            Etapa 1 de 3
          </p>
        </div>
      </motion.div>
    </div>
  );
}