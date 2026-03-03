# ACE-Step UI — Internationalization Guide

## Overview

The project supports 4 languages: English (default), Chinese, Japanese, and Korean.

## Architecture

```
ace-step-ui/
├── i18n/
│   └── translations.ts          # All translation strings
├── context/
│   └── I18nContext.tsx          # React context + useI18n hook
└── components/                   # i18n-enabled components
```

## Usage

### 1. Use translations in a component

```tsx
import { useI18n } from '../context/I18nContext';

function YourComponent() {
  const { t } = useI18n();
  return <div>{t('yourTranslationKey')}</div>;
}
```

### 2. Switch language

Users can switch language in Settings. Programmatically:

```tsx
const { language, setLanguage } = useI18n();
setLanguage('en'); // 'en' | 'zh' | 'ja' | 'ko'
```

### 3. Add a new translation key

Add the key to all 4 languages in `i18n/translations.ts`:

```typescript
export const translations = {
  en: { yourNewKey: 'English text' },
  zh: { yourNewKey: '中文文本' },
  ja: { yourNewKey: '日本語テキスト' },
  ko: { yourNewKey: '한국어 텍스트' },
};
```

## Language Persistence

The selected language is stored in `localStorage` and restored on next visit. Default is English.

## Notes

- All keys must exist in every language object
- TypeScript's `TranslationKey` type enforces key safety
- If a key is missing, the raw key name is returned as fallback
