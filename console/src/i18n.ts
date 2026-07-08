import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import ru from "./locales/ru.json";
import zh from "./locales/zh.json";
import ja from "./locales/ja.json";
import ptBR from "./locales/pt-BR.json";

const resources = {
  en: {
    translation: en,
  },
  ru: {
    translation: ru,
  },
  zh: {
    translation: zh,
  },
  ja: {
    translation: ja,
  },
  "pt-BR": {
    translation: ptBR,
  },
};

/** Map i18n language keys to BCP 47 document lang attributes. */
export function resolveDocumentLang(language: string): string {
  const normalized = language.split("-")[0];
  if (normalized === "zh") return "zh-CN";
  if (language === "pt-BR") return "pt-BR";
  return normalized || "zh-CN";
}

export function syncDocumentLang(language?: string): void {
  if (typeof document === "undefined") return;
  const lng = language ?? i18n.language;
  document.documentElement.lang = resolveDocumentLang(lng);
}

i18n.use(initReactI18next).init({
  resources,
  lng: localStorage.getItem("language") || "zh",
  fallbackLng: "zh",
  interpolation: {
    escapeValue: false,
  },
});

i18n.on("languageChanged", (lng) => {
  syncDocumentLang(lng);
});
syncDocumentLang();

export default i18n;
