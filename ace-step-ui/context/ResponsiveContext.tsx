import React, { createContext, useContext, useState, useEffect, ReactNode, useMemo } from 'react';

interface ResponsiveContextType {
  isMobile: boolean;
  isDesktop: boolean;
}

const MOBILE_BREAKPOINT = 768;

const ResponsiveContext = createContext<ResponsiveContextType | undefined>(undefined);

function getInitialState(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  return window.innerWidth < MOBILE_BREAKPOINT;
}

export function ResponsiveProvider({ children }: { children: ReactNode }): React.ReactElement {
  const [isMobile, setIsMobile] = useState<boolean>(getInitialState);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const mediaQuery = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);

    const handleChange = (event: MediaQueryListEvent) => {
      setIsMobile(event.matches);
    };

    setIsMobile(mediaQuery.matches);

    mediaQuery.addEventListener('change', handleChange);
    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);

  const value = useMemo<ResponsiveContextType>(() => ({
    isMobile,
    isDesktop: !isMobile,
  }), [isMobile]);

  return <ResponsiveContext.Provider value={value}>{children}</ResponsiveContext.Provider>;
}

export function useResponsive(): ResponsiveContextType {
  const context = useContext(ResponsiveContext);
  if (context === undefined) {
    throw new Error('useResponsive must be used within a ResponsiveProvider');
  }
  return context;
}
