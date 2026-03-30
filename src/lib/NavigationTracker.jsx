import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export default function NavigationTracker({ children }) {
  const location = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location]);
  return children;
}