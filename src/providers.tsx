import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

/* ── theme ── */
type Theme = 'dark' | 'light';
interface ThemeCtx {
  theme: Theme;
  setTheme: (t: Theme) => void;
}
const ThemeContext = createContext<ThemeCtx>({ theme: 'dark', setTheme: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(
    () => ((typeof localStorage !== 'undefined' && localStorage.getItem('pivi-theme')) as Theme) || 'dark',
  );
  useEffect(() => {
    localStorage.setItem('pivi-theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);
  const setTheme = (t: Theme) => setThemeState(t);
  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}
export const useTheme = () => useContext(ThemeContext);

/* ── language ── */
type Lang = 'zh' | 'en';
interface LangCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
}
const LangContext = createContext<LangCtx>({ lang: 'zh', setLang: () => {} });

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(
    () => ((typeof localStorage !== 'undefined' && localStorage.getItem('pivi-lang')) as Lang) || 'zh',
  );
  useEffect(() => {
    localStorage.setItem('pivi-lang', lang);
    document.documentElement.setAttribute('data-lang', lang);
  }, [lang]);
  const setLang = (l: Lang) => setLangState(l);
  return <LangContext.Provider value={{ lang, setLang }}>{children}</LangContext.Provider>;
}
export const useLang = () => useContext(LangContext);

/** Inline bilingual text. Use <T zh="加入" en="Join" /> */
export function T({ zh, en }: { zh: string; en: string }) {
  const { lang } = useLang();
  return <>{lang === 'zh' ? zh : en}</>;
}

/** Fixed top-right theme + language switcher, visible on every screen. */
export function Toggles() {
  const { theme, setTheme } = useTheme();
  const { lang, setLang } = useLang();
  return (
    <div className="toggles">
      <div className="tog" role="group" aria-label="Language">
        <button className={lang === 'zh' ? 'on' : ''} onClick={() => setLang('zh')}>中</button>
        <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>EN</button>
      </div>
      <div className="tog" role="group" aria-label="Theme">
        <button className={theme === 'dark' ? 'on' : ''} onClick={() => setTheme('dark')}>Dark</button>
        <button className={theme === 'light' ? 'on' : ''} onClick={() => setTheme('light')}>Light</button>
      </div>
    </div>
  );
}
