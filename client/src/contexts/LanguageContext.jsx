import React, { createContext, useContext, useState, useEffect } from 'react';
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

  const t = (key) => {
    const keys = key.split('.');
    let value = translations[language];
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        // Fallback to English if key is missing in Arabic
        let fallbackValue = translations['en'];
        for (const fk of keys) {
            if (fallbackValue && typeof fallbackValue === 'object' && fk in fallbackValue) {
                fallbackValue = fallbackValue[fk];
            } else {
                return key; // Return key if not found in fallback either
            }
        }
        return fallbackValue;
      }
    }
    return value;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
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
