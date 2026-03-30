import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';

const SharedProfileContext = createContext();

export const SharedProfileProvider = ({ children }) => {
  const { user } = useAuth();
  const [activeProfile, setActiveProfile] = useState(null);
  const [activeProfileData, setActiveProfileData] = useState(null);

  useEffect(() => {
    if (user?.id) {
      const saved = localStorage.getItem(`activeProfile_${user.id}`);
      if (saved) {
        setActiveProfile(JSON.parse(saved));
      }
    }
  }, [user?.id]);

  const switchProfile = (profileData) => {
    setActiveProfile(profileData);
    setActiveProfileData(profileData);
    if (user?.id) {
      localStorage.setItem(`activeProfile_${user.id}`, JSON.stringify(profileData));
    }
  };

  const switchToOwnProfile = () => {
    setActiveProfile(null);
    setActiveProfileData(null);
    if (user?.id) {
      localStorage.removeItem(`activeProfile_${user.id}`);
    }
  };

  return (
    <SharedProfileContext.Provider value={{
      activeProfile,
      activeProfileData,
      switchProfile,
      switchToOwnProfile,
      isViewingSharedProfile: activeProfile !== null,
      activeOwnerId: activeProfile?.owner_id || user?.id,
      sharedPermissions: activeProfile?.permissions || null 
    }}>
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