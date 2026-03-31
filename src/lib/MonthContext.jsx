import React, { createContext, useContext, useState } from "react";

const MonthContext = createContext();

export function MonthProvider({ children }) {
  const [selectedDate, setSelectedDate] = useState(new Date());
  return (
    <MonthContext.Provider value={{ selectedDate, setSelectedDate }}>
      {children}
    </MonthContext.Provider>
  );
}

export function useMonth() {
  return useContext(MonthContext);
}