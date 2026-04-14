import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthContext";

// Hook que verifica se o usuário precisa adicionar/verificar telefone
// Usar no Layout.jsx ou App.jsx
export function usePhoneVerification() {
  const { user } = useAuth();
  const [showModal, setShowModal] = useState(false);

  const { data: profile } = useQuery({
    queryKey: ["profile-phone", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("phone, phone_verified, onboarding_completed")
        .eq("id", user.id)
        .single();
      return data;
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (!profile) return;
    // Só mostra após o onboarding estar completo
    if (!profile.onboarding_completed) return;
    // Mostra se não tem telefone ou não verificou
    if (!profile.phone || !profile.phone_verified) {
      // Delay de 2s para não aparecer logo na entrada
      const timer = setTimeout(() => setShowModal(true), 2000);
      return () => clearTimeout(timer);
    }
  }, [profile]);

  return {
    showPhoneModal: showModal,
    setShowPhoneModal: setShowModal,
    phoneVerified: profile?.phone_verified === true,
    phone: profile?.phone,
  };
}