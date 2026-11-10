import type { LanguageCode } from '../domain/settings'

type Dict = Record<string, string>

const EN: Dict = {
  'settings.language.label': 'Language',
  'settings.language.hint': 'App language (more coming soon).',
  'settings.language.en': 'English',
  'settings.language.no': 'Norwegian',
  'settings.language.de': 'German',
  'settings.language.pl': 'Polish',
  'settings.language.es': 'Spanish',
  'settings.language.fr': 'French',

  'nav.dashboard': 'Dashboard',
  'nav.budget': 'Budget',
  'nav.calendar': 'Calendar',
  'nav.income': 'Income',
  'nav.dueSoon': 'Due Soon',
  'nav.deferred': 'Deferred',
  'nav.paidRecently': 'Paid Recently',
  'nav.goals': 'Goals',
  'nav.accounts': 'Accounts',
  'nav.transactions': 'Transactions',
  'nav.files': 'Files',
  'nav.debts': 'Debts',
  'nav.reports': 'Reports',
  'nav.settings': 'Settings',

  'sidebar.group.bills': 'Bills',
  'sidebar.group.accountant': 'Accountant',
  'sidebar.group.settings': 'Settings',
  'sidebar.group.people': 'People',

  'sidebar.tooltip.show': 'Show',
  'sidebar.tooltip.hide': 'Hide',

  'app.quickAdd.title': 'Create',
  'app.quickAdd.newBill': 'New Bill',
  'app.quickAdd.newIncome': 'New Income',
}

const DICTS: Partial<Record<LanguageCode, Dict>> = {
  en: EN,
}

export function t(language: LanguageCode | null | undefined, key: string, fallback?: string): string {
  const lang = (language ?? 'en') as LanguageCode
  const dict = DICTS[lang] ?? EN
  return dict[key] ?? EN[key] ?? fallback ?? key
}

export function languageLabel(code: LanguageCode): string {
  switch (code) {
    case 'en':
      return t('en', 'settings.language.en')
    case 'no':
      return t('en', 'settings.language.no')
    case 'de':
      return t('en', 'settings.language.de')
    case 'pl':
      return t('en', 'settings.language.pl')
    case 'es':
      return t('en', 'settings.language.es')
    case 'fr':
      return t('en', 'settings.language.fr')
  }
}
