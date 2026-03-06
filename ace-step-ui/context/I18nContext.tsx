import React, { createContext, useContext, ReactNode, useEffect } from 'react';
import { useTranslation, type TFunction } from 'react-i18next';
import i18n from '../i18n';
import { Language } from '../i18n';

interface I18nContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: TFunction;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

export const I18nProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { t, i18n: i18nInstance } = useTranslation();
  const language = i18nInstance.language as Language;

  const handleSetLanguage = (lang: Language) => {
    i18nInstance.changeLanguage(lang);
  };

  // Sync with localStorage if needed (i18next-browser-languagedetector usually handles this)
  useEffect(() => {
    const stored = localStorage.getItem('i18nextLng');
    if (stored && stored !== language) {
      // i18next handles this automatically if configured, 
      // but we ensure compatibility with the old 'language' key if necessary
      const oldLang = localStorage.getItem('language');
      if (oldLang && !stored) {
        handleSetLanguage(oldLang as Language);
      }
    }
  }, [language]);

  return (
    <I18nContext.Provider value={{ language, setLanguage: handleSetLanguage, t }}>
      {children}
    </I18nContext.Provider>
  );
};

export const useI18n = () => {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within I18nProvider');
  }
  return context;
};
