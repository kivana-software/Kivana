import { createContext, useContext } from 'react'
import type { LoadedDatasets } from '../storage/localJsonStore'
import type { Account, Bill, Transaction, UUID } from '../domain/models'

export type Section =
  | 'dashboard'
  | 'bills'
  | 'accounts'
  | 'transactions'
  | 'settings'

export interface UIState {
  section: Section
  didCompleteOnboarding: boolean
  selectedBillId: UUID | null
  selectedAccountId: UUID | null
  selectedTransactionId: UUID | null
  transactionsAccountFilterId: UUID | null
}

export interface AppState extends LoadedDatasets {
  ui: UIState
}

export type AppAction =
  | { type: 'ui/setSection'; section: Section }
  | { type: 'ui/completeOnboarding' }
  | { type: 'ui/selectBill'; id: UUID | null }
  | { type: 'ui/selectAccount'; id: UUID | null }
  | { type: 'ui/selectTransaction'; id: UUID | null }
  | { type: 'ui/setTransactionsAccountFilter'; id: UUID | null }
  | { type: 'data/replaceAll'; data: LoadedDatasets }
  | { type: 'settings/update'; patch: Partial<LoadedDatasets['settings']> }
  | { type: 'bills/add'; bill: Bill }
  | { type: 'bills/update'; bill: Bill }
  | { type: 'bills/delete'; id: UUID }
  | { type: 'bills/logPayment'; id: UUID; date?: Date }
  | { type: 'bills/skip'; id: UUID }
  | { type: 'bills/setSnooze'; id: UUID; until: Date }
  | { type: 'bills/clearSnooze'; id: UUID }
  | { type: 'bills/deletePayment'; id: UUID; paymentId: UUID }
  | { type: 'accounts/add'; account: Account }
  | { type: 'accounts/update'; account: Account }
  | { type: 'accounts/delete'; id: UUID }
  | { type: 'transactions/add'; transaction: Transaction }
  | { type: 'transactions/update'; transaction: Transaction }
  | { type: 'transactions/bulkUpdate'; transactions: Transaction[] }
  | { type: 'transactions/replaceLoaded'; transactions: Transaction[] }
  | { type: 'transactions/delete'; id: UUID }
  | { type: 'transactions/clearAll' }

export interface AppStore {
  state: AppState
  dispatch: (action: AppAction) => void
  persistNow: () => Promise<void>
}

export const AppStoreContext = createContext<AppStore | null>(null)

export function useAppStore(): AppStore {
  const v = useContext(AppStoreContext)
  if (!v) throw new Error('AppStore is not available')
  return v
}
