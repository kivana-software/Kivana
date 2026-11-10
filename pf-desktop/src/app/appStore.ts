import { createContext, useContext } from 'react'
import type { LoadedDatasets } from '../storage/localJsonStore'
import type { Account, Bill, Debt, Goal, Income, Invoice, Reminder, Transaction, UUID } from '../domain/models'

export type Section =
  | 'dashboard'
  | 'budget'
  | 'calendar'
  | 'bills'
  | 'income'
  | 'dueSoon'
  | 'deferred'
  | 'paidRecently'
  | 'accounts'
  | 'transactions'
  | 'invoices'
  | 'goals'
  | 'debts'
  | 'reports'
  | 'settings'

export interface UIState {
  section: Section
  didCompleteOnboarding: boolean
  selectedBillId: UUID | null
  selectedIncomeId: UUID | null
  selectedAccountId: UUID | null
  selectedTransactionId: UUID | null
  selectedGoalId: UUID | null
  selectedDebtId: UUID | null
}

export interface AppState extends LoadedDatasets {
  ui: UIState
}

export type AppAction =
  | { type: 'ui/setSection'; section: Section }
  | { type: 'ui/completeOnboarding' }
  | { type: 'ui/selectBill'; id: UUID | null }
  | { type: 'ui/selectIncome'; id: UUID | null }
  | { type: 'ui/selectAccount'; id: UUID | null }
  | { type: 'ui/selectTransaction'; id: UUID | null }
  | { type: 'ui/selectGoal'; id: UUID | null }
  | { type: 'ui/selectDebt'; id: UUID | null }
  | { type: 'data/replaceAll'; data: LoadedDatasets }
  | { type: 'settings/update'; patch: Partial<LoadedDatasets['settings']> }
  | { type: 'bills/add'; bill: Bill }
  | { type: 'bills/update'; bill: Bill }
  | { type: 'bills/bulkUpdate'; bills: Bill[] }
  | { type: 'bills/delete'; id: UUID }
  | { type: 'bills/bulkDelete'; ids: UUID[] }
  | { type: 'bills/logPayment'; id: UUID; date?: Date }
  | { type: 'bills/logPaymentFromTransaction'; billId: UUID; transactionId: UUID }
  | { type: 'bills/skip'; id: UUID }
  | { type: 'bills/setSnooze'; id: UUID; until: Date }
  | { type: 'bills/clearSnooze'; id: UUID }
  | { type: 'bills/deletePayment'; id: UUID; paymentId: UUID }
  | { type: 'incomes/add'; income: Income }
  | { type: 'incomes/update'; income: Income }
  | { type: 'incomes/delete'; id: UUID }
  | { type: 'incomes/logReceipt'; id: UUID; date?: Date }
  | { type: 'incomes/logReceiptFromTransaction'; incomeId: UUID; transactionId: UUID }
  | { type: 'incomes/skip'; id: UUID }
  | { type: 'accounts/add'; account: Account }
  | { type: 'accounts/update'; account: Account }
  | { type: 'accounts/delete'; id: UUID }
  | { type: 'transactions/add'; transaction: Transaction }
  | { type: 'transactions/update'; transaction: Transaction }
  | { type: 'transactions/bulkUpdate'; transactions: Transaction[] }
  | { type: 'transactions/replaceLoaded'; transactions: Transaction[] }
  | { type: 'transactions/delete'; id: UUID }
  | { type: 'transactions/bulkDelete'; ids: UUID[] }
  | { type: 'transactions/clearAll' }
  | { type: 'reminders/add'; reminder: Reminder }
  | { type: 'reminders/update'; reminder: Reminder }
  | { type: 'reminders/delete'; id: UUID }
  | { type: 'reminders/toggleComplete'; id: UUID; completed: boolean }
  | { type: 'invoices/add'; invoice: Invoice }
  | { type: 'invoices/update'; invoice: Invoice }
  | { type: 'invoices/delete'; id: UUID }
  | { type: 'goals/add'; goal: Goal }
  | { type: 'goals/update'; goal: Goal }
  | { type: 'goals/delete'; id: UUID }
  | { type: 'debts/add'; debt: Debt }
  | { type: 'debts/update'; debt: Debt }
  | { type: 'debts/delete'; id: UUID }

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
