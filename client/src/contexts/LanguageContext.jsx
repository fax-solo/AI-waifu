import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import en from '../translations/en';
import ar from '../translations/ar';

const LanguageContext = createContext();

const translations = {
  en,
  ar,
};

export const LanguageProvider = ({ children }) => {
  const [language, setLanguage] = useState(() => {
    const saved = localStorage.getItem('waifu-language');
    return saved ? saved : 'en';
  });

  useEffect(() => {
    localStorage.setItem('waifu-language', language);
    document.documentElement.lang = language;
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
  }, [language]);

  const t = useCallback((key) => {
    const keys = key.split('.');
    let value = translations[language];
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        let fallbackValue = translations['en'];
        for (const fk of keys) {
            if (fallbackValue && typeof fallbackValue === 'object' && fk in fallbackValue) {
                fallbackValue = fallbackValue[fk];
            } else {
                return key;
            }
        }
        return fallbackValue;
      }
    }
    return value;
  }, [language]);

  const value = useMemo(() => ({ language, setLanguage, t }), [language, t]);

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
