import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';

const SharedProfileContext = createContext();

export const SharedProfileProvider = ({ children }) => {
  const { user } = useAuth();
  const [activeProfile, setActiveProfile] = useState(null);

  useEffect(() => {
    if (user?.id) {
      const saved = localStorage.getItem(`activeProfile_${user.id}`);
      if (saved) {
        try {
          setActiveProfile(JSON.parse(saved));
        } catch (e) {
          console.error('Erro ao restaurar perfil:', e);
        }
      }
    }
  }, [user?.id]);

  const switchProfile = (profileData) => {
    console.log('📌 switchProfile chamado com:', profileData);
    setActiveProfile(profileData);
    if (user?.id) {
      localStorage.setItem(`activeProfile_${user.id}`, JSON.stringify(profileData));
    }
  };

  const switchToOwnProfile = () => {
    console.log('📌 switchToOwnProfile chamado');
    setActiveProfile(null);
    if (user?.id) {
      localStorage.removeItem(`activeProfile_${user.id}`);
    }
  };

  return (
    <SharedProfileContext.Provider
      value={{
        activeProfile,
        switchProfile,
        switchToOwnProfile,
        isViewingSharedProfile: activeProfile !== null,
        // ✅ activeOwnerId agora vem do activeProfile.owner_id
        activeOwnerId: activeProfile?.owner_id || user?.id,
        sharedPermissions: activeProfile?.permissions || null
      }}
    >
      {children}
    </SharedProfileContext.Provider>
  );
};

export const useSharedProfile = () => {
  const context = useContext(SharedProfileContext);
  if (!context) {
    throw new Error('useSharedProfile deve ser usado dentro de SharedProfileProvider');
  }
  return context;
};