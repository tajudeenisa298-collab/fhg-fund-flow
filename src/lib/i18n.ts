import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import en from "@/locales/en.json";

/**
 * i18n scaffolding. English is the only shipped locale for now, but every
 * user-facing string should be wrapped in `t("namespace.key")` so future
 * translators have a single JSON file to work from.
 *
 * Usage:
 *   import { useTranslation } from "react-i18next";
 *   const { t } = useTranslation();
 *   <button>{t("common.save")}</button>
 */
if (!i18n.isInitialized) {
  i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources: { en: { translation: en } },
      fallbackLng: "en",
      supportedLngs: ["en"],
      interpolation: { escapeValue: false },
      detection: {
        order: ["querystring", "localStorage", "navigator"],
        caches: ["localStorage"],
      },
      react: { useSuspense: false },
    });
}

export default i18n;
