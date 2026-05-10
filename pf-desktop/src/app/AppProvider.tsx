import { useEffect, useMemo, useReducer, useRef } from 'react'
import { AppStoreContext, type AppAction, type AppState, type AppStore, type Section } from './appStore'
import { defaultSettings } from '../domain/settings'
import type { LoadedDatasets } from '../storage/localJsonStore'
import { loadAllFromLocalStorage, saveAllToLocalStorage } from '../storage/localJsonStore'
import { isTauriRuntime, loadAllFromTauriFiles, saveAllToTauriFiles } from '../storage/tauriJsonStore'
import { advanceRecurrence, billClearSnooze, billMarkPaid, billSetSnooze } from '../domain/models'

const ONBOARDING_KEY = 'Kivana/didCompleteOnboarding'

function loadOnboardingFlag(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_KEY) === 'true'
  } catch {
    return false
  }
}

function saveOnboardingFlag(v: boolean): void {
  try {
    localStorage.setItem(ONBOARDING_KEY, v ? 'true' : 'false')
  } catch {
  }
}

export function setSection(section: Section): AppAction {
  return { type: 'ui/setSection', section }
}

function datasetsAreEmpty(data: LoadedDatasets): boolean {
  return (data.bills ?? []).length === 0 && (data.accounts ?? []).length === 0 && (data.transactions ?? []).length === 0
}

function buildInitialState(): AppState {
  const fallback = defaultSettings()
  const loaded = loadAllFromLocalStorage(fallback)
  const didCompleteOnboarding = datasetsAreEmpty(loaded) ? false : loadOnboardingFlag()
  return {
    ...loaded,
    ui: {
      section: 'dashboard',
      didCompleteOnboarding,
      selectedBillId: null,
      selectedAccountId: null,
      selectedTransactionId: null,
      transactionsAccountFilterId: null,
    },
  }
}

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'ui/setSection':
      return { ...state, ui: { ...state.ui, section: action.section } }
    case 'ui/completeOnboarding': {
      saveOnboardingFlag(true)
      return { ...state, ui: { ...state.ui, didCompleteOnboarding: true } }
    }
    case 'ui/selectBill':
      return { ...state, ui: { ...state.ui, selectedBillId: action.id } }
    case 'ui/selectAccount':
      return { ...state, ui: { ...state.ui, selectedAccountId: action.id } }
    case 'ui/selectTransaction':
      return { ...state, ui: { ...state.ui, selectedTransactionId: action.id } }
    case 'ui/setTransactionsAccountFilter':
      return { ...state, ui: { ...state.ui, transactionsAccountFilterId: action.id } }
    case 'data/replaceAll': {
      const data = action.data as LoadedDatasets
      const empty = datasetsAreEmpty(data)
      if (empty) saveOnboardingFlag(false)
      return {
        ...state,
        ...data,
        bills: (data.bills ?? []).map((b) => ({ ...b, customCategoryName: null })),
        ui: {
          ...state.ui,
          didCompleteOnboarding: empty ? false : state.ui.didCompleteOnboarding,
          selectedBillId: null,
          selectedAccountId: null,
          selectedTransactionId: null,
          transactionsAccountFilterId: null,
        },
      }
    }
    case 'settings/update':
      return { ...state, settings: { ...state.settings, ...action.patch } }
    case 'bills/add':
      return {
        ...state,
        bills: [{ ...action.bill, customCategoryName: null }, ...state.bills],
        ui: { ...state.ui, selectedBillId: action.bill.id },
      }
    case 'bills/update':
      return { ...state, bills: state.bills.map((b) => (b.id === action.bill.id ? { ...action.bill, customCategoryName: null } : b)) }
    case 'bills/delete':
      return { ...state, bills: state.bills.filter((b) => b.id !== action.id), ui: { ...state.ui, selectedBillId: null } }
    case 'bills/logPayment': {
      const date = action.date ?? new Date()
      return {
        ...state,
        bills: state.bills.map((b) => (b.id === action.id ? billMarkPaid(b, date) : b)),
      }
    }
    case 'bills/skip':
      return {
        ...state,
        bills: state.bills.map((b) =>
          b.id === action.id
            ? {
                ...billClearSnooze(b),
                nextDueDate: advanceRecurrence(b.recurrence, b.nextDueDate),
              }
            : b,
        ),
      }
    case 'bills/setSnooze':
      return { ...state, bills: state.bills.map((b) => (b.id === action.id ? billSetSnooze(b, action.until) : b)) }
    case 'bills/clearSnooze':
      return { ...state, bills: state.bills.map((b) => (b.id === action.id ? billClearSnooze(b) : b)) }
    case 'bills/deletePayment':
      return {
        ...state,
        bills: state.bills.map((b) => (b.id === action.id ? { ...b, payments: b.payments.filter((p) => p.id !== action.paymentId) } : b)),
      }
    case 'accounts/add':
      return { ...state, accounts: [action.account, ...state.accounts], ui: { ...state.ui, selectedAccountId: action.account.id } }
    case 'accounts/update':
      return { ...state, accounts: state.accounts.map((a) => (a.id === action.account.id ? action.account : a)) }
    case 'accounts/delete': {
      const id = action.id
      const orphanedTransactions = state.transactions.map((t) => {
        if (t.accountId === id) return { ...t, accountId: null }
        if (t.toAccountId === id) return { ...t, toAccountId: null }
        return t
      })
      return {
        ...state,
        accounts: state.accounts.filter((a) => a.id !== id),
        transactions: orphanedTransactions,
        ui: { ...state.ui, selectedAccountId: null },
      }
    }
    case 'transactions/add':
      return {
        ...state,
        transactions: [action.transaction, ...state.transactions].sort((a, b) => b.date.getTime() - a.date.getTime()),
        ui: { ...state.ui, selectedTransactionId: action.transaction.id },
      }
    case 'transactions/update':
      return {
        ...state,
        transactions: state.transactions
          .map((t) => (t.id === action.transaction.id ? action.transaction : t))
          .sort((a, b) => b.date.getTime() - a.date.getTime()),
      }
    case 'transactions/bulkUpdate': {
      const byId = new Map(action.transactions.map((t) => [t.id, t] as const))
      return {
        ...state,
        transactions: state.transactions
          .map((t) => byId.get(t.id) ?? t)
          .sort((a, b) => b.date.getTime() - a.date.getTime()),
      }
    }
    case 'transactions/replaceLoaded':
      return { ...state, transactions: [...action.transactions].sort((a, b) => b.date.getTime() - a.date.getTime()) }
    case 'transactions/delete':
      return { ...state, transactions: state.transactions.filter((t) => t.id !== action.id), ui: { ...state.ui, selectedTransactionId: null } }
    case 'transactions/clearAll':
      return { ...state, transactions: [], ui: { ...state.ui, selectedTransactionId: null } }
  }
}

export function AppProvider(props: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, buildInitialState)
  const stateRef = useRef(state)
  stateRef.current = state

  const persistTimerRef = useRef<number | null>(null)
  const persistInFlightRef = useRef(false)

  useEffect(() => {
    if (!isTauriRuntime()) return
    void loadAllFromTauriFiles(defaultSettings()).then((datasets) => {
      dispatch({ type: 'data/replaceAll', data: datasets })
    })
  }, [])

  const persistNow = useMemo(() => {
    return async () => {
      if (persistInFlightRef.current) return
      persistInFlightRef.current = true
      try {
        const datasets: LoadedDatasets = {
          settings: stateRef.current.settings,
          bills: stateRef.current.bills,
          accounts: stateRef.current.accounts,
          transactions: stateRef.current.transactions,
        }
        if (isTauriRuntime()) await saveAllToTauriFiles(datasets)
        else saveAllToLocalStorage(datasets)
      } finally {
        persistInFlightRef.current = false
      }
    }
  }, [])

  useEffect(() => {
    if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current)
    persistTimerRef.current = window.setTimeout(() => {
      void persistNow()
    }, 600)
    return () => {
      if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current)
    }
  }, [persistNow, state.accounts, state.bills, state.settings, state.transactions])

  const store: AppStore = useMemo(
    () => ({
      state,
      dispatch,
      persistNow,
    }),
    [dispatch, persistNow, state],
  )

  return <AppStoreContext.Provider value={store}>{props.children}</AppStoreContext.Provider>
}
