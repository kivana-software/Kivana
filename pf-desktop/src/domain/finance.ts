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

export function clamp01(x: number): number {
  if (x < 0) return 0
  if (x > 1) return 1
  return x
}

export function goalProgress(saved: number, target: number): number {
  if (!Number.isFinite(saved) || !Number.isFinite(target) || target <= 0) return 0
  return clamp01(saved / target)
}

export interface PayoffProjection {
  months: number
  totalInterest: number
  payoffDate?: Date | null
  message?: string | null
}

export function payoffProjection(params: {
  principal: number
  annualInterestRate: number
  minimumPayment: number
  extraPayment: number
  now?: Date
}): PayoffProjection {
  const principal = params.principal
  const apr = params.annualInterestRate
  const minPay = params.minimumPayment
  const extra = params.extraPayment
  const now = params.now ?? new Date()

  if (principal <= 0) {
    return { months: 0, totalInterest: 0, payoffDate: now, message: 'Balance is already paid off.' }
  }
  if (minPay <= 0) {
    return { months: 0, totalInterest: 0, payoffDate: null, message: 'Set a minimum payment to compute payoff.' }
  }

  const monthlyRate = (apr / 100) / 12
  const payment = minPay + extra
  let balance = principal
  let interestTotal = 0
  let months = 0

  for (let i = 0; i < 600; i++) {
    if (balance <= 0) break
    const interest = monthlyRate <= 0 ? 0 : balance * monthlyRate
    interestTotal += interest
    const newBalance = balance + interest - payment
    months += 1
    if (payment <= interest && monthlyRate > 0) {
      return { months: 0, totalInterest: 0, payoffDate: null, message: 'Payment is too low to reduce the balance.' }
    }
    balance = newBalance
  }

  if (balance > 0) {
    return { months, totalInterest: interestTotal, payoffDate: null, message: 'Payoff exceeds 50 years with these inputs.' }
  }

  const payoff = new Date(now)
  payoff.setMonth(payoff.getMonth() + months)
  return { months, totalInterest: interestTotal, payoffDate: payoff, message: null }
}
