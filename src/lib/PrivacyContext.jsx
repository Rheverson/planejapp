// src/lib/PrivacyContext.jsx
import React, { createContext, useContext, useState } from "react";

const PrivacyContext = createContext();

export const PrivacyProvider = ({ children }) => {
  const [hidden, setHidden] = useState(false);
  const toggle = () => setHidden(h => !h);
  const mask = (value) => hidden ? "••••••" : value;
  return (
    <PrivacyContext.Provider value={{ hidden, toggle, mask }}>
      {children}
    </PrivacyContext.Provider>
  );
};

export const usePrivacy = () => useContext(PrivacyContext);