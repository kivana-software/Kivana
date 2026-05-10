import { useMemo, useState } from 'react'
import { useAppStore } from '../app/appStore'
import type { Account, Bill } from '../domain/models'
import { t } from './i18n'

type Step = 'welcome' | 'accounts' | 'bills' | 'finish'

export function OnboardingModal() {
  const { state, dispatch } = useAppStore()
  const [step, setStep] = useState<Step>('welcome')
  const [forceOpen, setForceOpen] = useState(false)
  const lang = state.settings.language
  const tt = (key: string, fallback?: string) => t(lang, key, fallback)

  const shouldShow = useMemo(() => {
    const empty = state.bills.length === 0 && state.accounts.length === 0 && state.transactions.length === 0
    return !state.ui.didCompleteOnboarding && (empty || forceOpen)
  }, [forceOpen, state.accounts.length, state.bills.length, state.transactions.length, state.ui.didCompleteOnboarding])

  const stepOrder: Step[] = ['welcome', 'accounts', 'bills', 'finish']
  const stepIndex = stepOrder.indexOf(step)

  function addAccount() {
    const a: Account = {
      id: crypto.randomUUID(),
      name: tt('demo.checking', 'Checking'),
      kind: 'checking',
      currencyCode: state.settings.displayCurrencyCode,
      openingBalance: 0,
      institution: null,
      notes: null,
      archived: false,
    }
    dispatch({ type: 'accounts/add', account: a })
  }

  function addBill() {
    const b: Bill = {
      id: crypto.randomUUID(),
      name: tt('demo.rent', 'Rent'),
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
    }
    dispatch({ type: 'bills/add', bill: b })
  }

  function finish() {
    dispatch({ type: 'ui/completeOnboarding' })
    setForceOpen(false)
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
                  setForceOpen(true)
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
            <div className="modalActions onboardingActions">
              <div className="onboardingActionsLeft" />
              <div className="onboardingActionsRight">
                <button type="button" onClick={addAccount}>
                  {tt('onboarding.accounts.add', 'Add account')}
                </button>
                <button type="button" className="btnPrimary" onClick={() => setStep('bills')}>
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
            <div className="modalActions onboardingActions">
              <div className="onboardingActionsLeft" />
              <div className="onboardingActionsRight">
                <button type="button" onClick={addBill}>
                  {tt('onboarding.bills.add', 'Add bill')}
                </button>
                <button type="button" className="btnPrimary" onClick={() => setStep('finish')}>
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
