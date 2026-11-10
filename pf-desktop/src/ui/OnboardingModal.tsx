import { useMemo, useState } from 'react'
import { useAppStore } from '../app/appStore'
import { setSection } from '../app/AppProvider'
import type { Account, Bill, Income } from '../domain/models'

type Step = 'welcome' | 'accounts' | 'bills' | 'income' | 'finish'

export function OnboardingModal() {
  const { state, dispatch } = useAppStore()
  const [step, setStep] = useState<Step>('welcome')

  const shouldShow = useMemo(() => {
    const empty = state.bills.length === 0 && state.incomes.length === 0 && state.accounts.length === 0
    return empty && !state.ui.didCompleteOnboarding
  }, [state.accounts.length, state.bills.length, state.incomes.length, state.ui.didCompleteOnboarding])

  function addAccount() {
    const a: Account = {
      id: crypto.randomUUID(),
      name: 'Checking',
      kind: 'checking',
      currencyCode: state.settings.displayCurrencyCode,
      openingBalance: 0,
      institution: null,
      notes: null,
      archived: false,
    }
    dispatch({ type: 'accounts/add', account: a })
    dispatch(setSection('accounts'))
  }

  function addBill() {
    const b: Bill = {
      id: crypto.randomUUID(),
      name: 'Rent',
      amount: { currencyCode: state.settings.displayCurrencyCode, value: 0 },
      category: 'housing',
      customCategoryName: null,
      recurrence: 'monthly',
      nextDueDate: new Date(),
      notes: null,
      payments: [],
      paidAutomatically: false,
      hiddenUntilEdited: false,
      snoozeUntil: null,
      snoozeCount: 0,
      attachments: [],
    }
    dispatch({ type: 'bills/add', bill: b })
    dispatch(setSection('bills'))
  }

  function addIncome() {
    const i: Income = {
      id: crypto.randomUUID(),
      name: 'Salary',
      amount: { currencyCode: state.settings.displayCurrencyCode, value: 0 },
      source: 'salary',
      customSourceName: null,
      recurrence: 'monthly',
      nextPayDate: new Date(),
      notes: null,
      receipts: [],
    }
    dispatch({ type: 'incomes/add', income: i })
    dispatch(setSection('income'))
  }

  function finish() {
    dispatch({ type: 'ui/completeOnboarding' })
    dispatch(setSection('dashboard'))
  }

  if (!shouldShow) return null

  return (
    <div className="modalBackdrop">
      <div className="modal">
        {step === 'welcome' ? (
          <>
            <div className="modalTitle">Welcome to Kivana</div>
            <div className="note">This wizard helps you set up your first financial data.</div>
            <div className="modalActions">
              <button type="button" onClick={() => setStep('accounts')}>
                Start
              </button>
            </div>
          </>
        ) : null}

        {step === 'accounts' ? (
          <>
            <div className="modalTitle">Step 1: Add an account</div>
            <div className="note">Accounts help calculate balances and transfers.</div>
            <div className="modalActions">
              <button type="button" onClick={addAccount}>
                Add account
              </button>
              <button type="button" onClick={() => setStep('bills')}>
                Next
              </button>
            </div>
          </>
        ) : null}

        {step === 'bills' ? (
          <>
            <div className="modalTitle">Step 2: Add a bill</div>
            <div className="note">Bills track upcoming due dates.</div>
            <div className="modalActions">
              <button type="button" onClick={addBill}>
                Add bill
              </button>
              <button type="button" onClick={() => setStep('income')}>
                Next
              </button>
            </div>
          </>
        ) : null}

        {step === 'income' ? (
          <>
            <div className="modalTitle">Step 3: Add income</div>
            <div className="note">Income helps with monthly forecasting.</div>
            <div className="modalActions">
              <button type="button" onClick={addIncome}>
                Add income
              </button>
              <button type="button" onClick={() => setStep('finish')}>
                Next
              </button>
            </div>
          </>
        ) : null}

        {step === 'finish' ? (
          <>
            <div className="modalTitle">Done</div>
            <div className="note">You can change anything later in the app.</div>
            <div className="modalActions">
              <button type="button" onClick={finish}>
                Finish
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
