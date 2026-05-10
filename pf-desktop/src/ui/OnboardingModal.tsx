import { useMemo, useState } from 'react'
import { useAppStore } from '../app/appStore'
import type { Account, AccountKind, Bill, BillCategory, Recurrence } from '../domain/models'
import { startOfDay } from '../domain/models'
import { t } from './i18n'
import { accountKindLabel, billCategoryLabel, recurrenceLabel } from './i18n'

type Step = 'welcome' | 'accounts' | 'bills' | 'finish'

export function OnboardingModal() {
  const { state, dispatch } = useAppStore()
  const [step, setStep] = useState<Step>('welcome')
  const lang = state.settings.language
  const tt = (key: string, fallback?: string) => t(lang, key, fallback)
  const [accountName, setAccountName] = useState('')
  const [accountKind, setAccountKind] = useState<AccountKind>('checking')
  const [openingBalance, setOpeningBalance] = useState('')
  const [billName, setBillName] = useState('')
  const [billAmount, setBillAmount] = useState('')
  const [billCategory, setBillCategory] = useState<BillCategory>('housing')
  const [billRecurrence, setBillRecurrence] = useState<Recurrence>('monthly')
  const [billDueDate, setBillDueDate] = useState(() => {
    const d = new Date()
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${dd}`
  })
  const [error, setError] = useState<string>('')

  const shouldShow = useMemo(() => {
    const empty = state.bills.length === 0 && state.accounts.length === 0 && state.transactions.length === 0
    return (empty && !state.ui.didCompleteOnboarding) || state.ui.onboardingOpen
  }, [state.accounts.length, state.bills.length, state.transactions.length, state.ui.didCompleteOnboarding, state.ui.onboardingOpen])

  const stepOrder: Step[] = ['welcome', 'accounts', 'bills', 'finish']
  const stepIndex = stepOrder.indexOf(step)

  function makeId(): string {
    const anyCrypto = crypto as any
    if (anyCrypto && typeof anyCrypto.randomUUID === 'function') return anyCrypto.randomUUID()
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`
  }

  function parseDateOnly(input: string): Date | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.trim())
    if (!m) return null
    const y = Number(m[1])
    const mo = Number(m[2])
    const d = Number(m[3])
    const dt = new Date(y, mo - 1, d)
    if (!Number.isFinite(dt.getTime())) return null
    return startOfDay(dt)
  }

  function addAccount() {
    setError('')
    const name = accountName.trim()
    const obRaw = openingBalance.trim()
    const ob = obRaw ? Number(obRaw) : 0
    if (!name) {
      setError(tt('onboarding.error.accountName', 'Please enter an account name.'))
      return
    }
    if (!Number.isFinite(ob)) {
      setError(tt('onboarding.error.openingBalance', 'Opening balance must be a number.'))
      return
    }
    const a: Account = {
      id: makeId(),
      name,
      kind: accountKind,
      currencyCode: state.settings.displayCurrencyCode,
      openingBalance: ob,
      institution: null,
      notes: null,
      archived: false,
    }
    dispatch({ type: 'accounts/add', account: a })
    setAccountName('')
    setOpeningBalance('')
  }

  function addBill() {
    setError('')
    const name = billName.trim()
    const amtRaw = billAmount.trim()
    const amt = amtRaw ? Number(amtRaw) : 0
    const due = parseDateOnly(billDueDate)
    if (!name) {
      setError(tt('onboarding.error.billName', 'Please enter a bill name.'))
      return
    }
    if (!Number.isFinite(amt)) {
      setError(tt('onboarding.error.billAmount', 'Amount must be a number.'))
      return
    }
    if (!due) {
      setError(tt('onboarding.error.billDate', 'Please choose a due date.'))
      return
    }
    const b: Bill = {
      id: makeId(),
      name,
      amount: { currencyCode: state.settings.displayCurrencyCode, value: amt },
      category: billCategory,
      customCategoryName: null,
      recurrence: billRecurrence,
      nextDueDate: due,
      notes: null,
      payments: [],
      paidAutomatically: false,
      hiddenUntilEdited: false,
      snoozeUntil: null,
      snoozeCount: 0,
    }
    dispatch({ type: 'bills/add', bill: b })
    setBillName('')
    setBillAmount('')
  }

  function finish() {
    dispatch({ type: 'ui/completeOnboarding' })
    setStep('welcome')
  }

  if (!shouldShow) return null

  return (
    <div className="modalBackdrop modalBackdropLocked">
      <div className="modal onboardingModal">
        <div className="modalBrand">
          <div className="modalBrandLogo">
            <img className="modalBrandLogoImg" src="/kivana-logo.png" alt="Kivana" />
          </div>
          <div className="modalBrandText">
            <div className="modalBrandName">Kivana</div>
            <div className="modalBrandCaption">{tt('onboarding.caption', 'Basic setup wizard')}</div>
          </div>
          <div className="onboardingSteps" aria-hidden="true">
            {stepOrder.map((s, i) => (
              <div key={s} className={'onboardingDot' + (i <= stepIndex ? ' onboardingDotActive' : '')} />
            ))}
          </div>
        </div>

        {step === 'welcome' ? (
          <>
            <div className="modalTitle">{tt('onboarding.welcome.title', 'Welcome to Kivana')}</div>
            <div className="note">{tt('onboarding.welcome.note', 'This wizard helps you set up your first financial data.')}</div>
            <div className="modalActions">
              <button
                type="button"
                className="btnPrimary"
                onClick={() => {
                  dispatch({ type: 'ui/openOnboarding' })
                  setStep('accounts')
                }}
              >
                {tt('onboarding.start', 'Start')}
              </button>
            </div>
          </>
        ) : null}

        {step === 'accounts' ? (
          <>
            <div className="modalTitle">{tt('onboarding.accounts.title', 'Step 1: Add an account')}</div>
            <div className="note">{tt('onboarding.accounts.note', 'Accounts help calculate balances and transfers.')}</div>
            <div className="form onboardingForm">
              <div className="fieldRow">
                <label className="field">
                  <div className="fieldLabel">{tt('common.name', 'Name')}</div>
                  <input value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder={tt('demo.checking', 'Checking')} />
                </label>
                <label className="field">
                  <div className="fieldLabel">{tt('accounts.type', 'Type')}</div>
                  <select value={accountKind} onChange={(e) => setAccountKind(e.target.value as AccountKind)}>
                    {(['checking', 'savings', 'cash', 'credit', 'investment', 'other'] as AccountKind[]).map((k) => (
                      <option key={k} value={k}>
                        {accountKindLabel(lang, k)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="fieldRow" style={{ marginTop: 10 }}>
                <label className="field">
                  <div className="fieldLabel">{tt('accounts.addStartingBalance', 'Add starting balance')}</div>
                  <input type="number" inputMode="decimal" value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)} placeholder="0" />
                </label>
                <label className="field">
                  <div className="fieldLabel">{tt('common.currency', 'Currency')}</div>
                  <input value={state.settings.displayCurrencyCode} disabled />
                </label>
              </div>

              {state.accounts.length > 0 ? (
                <div className="note" style={{ marginTop: 10 }}>
                  {tt('onboarding.added.accounts', 'Added accounts')}: {state.accounts.length}
                </div>
              ) : null}
              {error ? (
                <div className="note" style={{ marginTop: 10, color: 'rgba(255, 59, 48, 0.9)' }}>
                  {error}
                </div>
              ) : null}
            </div>

            <div className="modalActions onboardingActions">
              <div className="onboardingActionsLeft">
                <button type="button" onClick={() => setStep('welcome')}>
                  {tt('onboarding.back', 'Back')}
                </button>
              </div>
              <div className="onboardingActionsRight">
                <button type="button" onClick={addAccount}>
                  {tt('onboarding.accounts.add', 'Add account')}
                </button>
                <button type="button" onClick={() => setStep('bills')}>
                  {tt('bills.skip', 'Skip')}
                </button>
                <button type="button" className="btnPrimary" onClick={() => setStep('bills')} disabled={state.accounts.length === 0}>
                  {tt('common.next', 'Next')}
                </button>
              </div>
            </div>
          </>
        ) : null}

        {step === 'bills' ? (
          <>
            <div className="modalTitle">{tt('onboarding.bills.title', 'Step 2: Add a bill')}</div>
            <div className="note">{tt('onboarding.bills.note', 'Bills track upcoming due dates.')}</div>
            <div className="form onboardingForm">
              <div className="fieldRow">
                <label className="field">
                  <div className="fieldLabel">{tt('common.name', 'Name')}</div>
                  <input value={billName} onChange={(e) => setBillName(e.target.value)} placeholder={tt('demo.rent', 'Rent')} />
                </label>
                <label className="field">
                  <div className="fieldLabel">{tt('common.amount', 'Amount')}</div>
                  <input type="number" inputMode="decimal" value={billAmount} onChange={(e) => setBillAmount(e.target.value)} placeholder="0" />
                </label>
              </div>

              <div className="fieldRow" style={{ marginTop: 10 }}>
                <label className="field">
                  <div className="fieldLabel">{tt('common.category', 'Category')}</div>
                  <select value={billCategory} onChange={(e) => setBillCategory(e.target.value as BillCategory)}>
                    {(['housing', 'utilities', 'subscriptions', 'insurance', 'taxes', 'transport', 'other'] as BillCategory[]).map((c) => (
                      <option key={c} value={c}>
                        {billCategoryLabel(lang, c)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <div className="fieldLabel">{tt('common.recurrence', 'Recurrence')}</div>
                  <select value={billRecurrence} onChange={(e) => setBillRecurrence(e.target.value as Recurrence)}>
                    {(['once', 'weekly', 'monthly', 'yearly'] as Recurrence[]).map((r) => (
                      <option key={r} value={r}>
                        {recurrenceLabel(lang, r)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="fieldRow" style={{ marginTop: 10 }}>
                <label className="field">
                  <div className="fieldLabel">{tt('bills.nextDueDate', 'Next due date')}</div>
                  <input type="date" value={billDueDate} onChange={(e) => setBillDueDate(e.target.value)} />
                </label>
                <label className="field">
                  <div className="fieldLabel">{tt('common.currency', 'Currency')}</div>
                  <input value={state.settings.displayCurrencyCode} disabled />
                </label>
              </div>

              {state.bills.length > 0 ? (
                <div className="note" style={{ marginTop: 10 }}>
                  {tt('onboarding.added.bills', 'Added bills')}: {state.bills.length}
                </div>
              ) : null}
              {error ? (
                <div className="note" style={{ marginTop: 10, color: 'rgba(255, 59, 48, 0.9)' }}>
                  {error}
                </div>
              ) : null}
            </div>

            <div className="modalActions onboardingActions">
              <div className="onboardingActionsLeft">
                <button type="button" onClick={() => setStep('accounts')}>
                  {tt('onboarding.back', 'Back')}
                </button>
              </div>
              <div className="onboardingActionsRight">
                <button type="button" onClick={addBill}>
                  {tt('onboarding.bills.add', 'Add bill')}
                </button>
                <button type="button" onClick={() => setStep('finish')}>
                  {tt('bills.skip', 'Skip')}
                </button>
                <button type="button" className="btnPrimary" onClick={() => setStep('finish')} disabled={state.bills.length === 0}>
                  {tt('common.next', 'Next')}
                </button>
              </div>
            </div>
          </>
        ) : null}

        {step === 'finish' ? (
          <>
            <div className="modalTitle">{tt('onboarding.finish.title', 'Done')}</div>
            <div className="note">{tt('onboarding.finish.note', 'You can change anything later in the app.')}</div>
            <div className="modalActions">
              <button
                type="button"
                onClick={() => {
                  dispatch({ type: 'ui/completeOnboarding' })
                  dispatch({ type: 'ui/startTutorial' })
                  setStep('welcome')
                }}
              >
                {tt('onboarding.finish.tutorial', 'Start tutorial')}
              </button>
              <button type="button" className="btnPrimary" onClick={finish}>
                {tt('onboarding.finish.cta', 'Finish')}
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
