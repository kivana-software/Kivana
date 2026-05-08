import type { Account, Transaction, UUID } from './models'

export function accountBalance(account: Account, transactions: Transaction[]): number {
  let total = account.openingBalance ?? 0
  for (const t of transactions) {
    switch (t.kind) {
      case 'income':
        if (t.accountId === account.id) total += t.amount.value
        break
      case 'expense':
        if (t.accountId === account.id) total -= t.amount.value
        break
      case 'transfer':
        if (t.accountId === account.id) total -= t.amount.value
        if (t.toAccountId === account.id) total += t.amount.value
        break
    }
  }
  return total
}

export function signedAmountForAccount(t: Transaction, accountId: UUID): number {
  switch (t.kind) {
    case 'income':
      return t.accountId === accountId ? t.amount.value : 0
    case 'expense':
      return t.accountId === accountId ? -t.amount.value : 0
    case 'transfer':
      if (t.accountId === accountId) return -t.amount.value
      if (t.toAccountId === accountId) return t.amount.value
      return 0
  }
}

export function currency(amount: number, code: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: code }).format(amount)
  } catch {
    return String(amount)
  }
}
