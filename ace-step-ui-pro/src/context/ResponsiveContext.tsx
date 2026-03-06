import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode } from 'react';

interface ResponsiveContextType {
  isMobile: boolean;
  isDesktop: boolean;
}

const ResponsiveContext = createContext<ResponsiveContextType>({ isMobile: false, isDesktop: true });

export function ResponsiveProvider({ children }: { children: ReactNode }) {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    setIsMobile(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const value = useMemo(() => ({ isMobile, isDesktop: !isMobile }), [isMobile]);
  return <ResponsiveContext.Provider value={value}>{children}</ResponsiveContext.Provider>;
}

export function useResponsive() {
  return useContext(ResponsiveContext);
}
