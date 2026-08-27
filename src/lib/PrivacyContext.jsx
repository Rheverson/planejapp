// src/lib/PrivacyContext.jsx
import React, { createContext, useContext, useState, useEffect } from "react";

const CHAVE = "privacy_hidden";
const PrivacyContext = createContext();

export const PrivacyProvider = ({ children }) => {
  // Persistido: antes os valores reapareciam a cada recarga, o que
  // contraria a expectativa de quem ativou o modo privacidade.
  const [hidden, setHidden] = useState(() => {
    try { return localStorage.getItem(CHAVE) === "true"; } catch { return false; }
  });

  useEffect(() => {
    try { localStorage.setItem(CHAVE, String(hidden)); } catch { /* modo privado do navegador */ }
  }, [hidden]);

  const toggle = () => setHidden(h => !h);
  const mask = (value) => hidden ? "••••••" : value;

  return (
    <PrivacyContext.Provider value={{ hidden, toggle, mask }}>
      {children}
    </PrivacyContext.Provider>
  );
};

export const usePrivacy = () => useContext(PrivacyContext);
