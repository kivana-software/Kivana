import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { loadLastLoginEmail, saveLastLoginEmail } from '../storage/userPrefs'
import { displayPlanName } from '../licensing/licenseGates'
import { getCaptchaChallenge } from '../auth/authApi'

export function LoginModal(props: { variant?: 'account' | 'locked'; contextNote?: string }) {
  const auth = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [captchaQuestion, setCaptchaQuestion] = useState('')
  const [captchaToken, setCaptchaToken] = useState('')
  const [captchaAnswer, setCaptchaAnswer] = useState('')
  const [captchaLoading, setCaptchaLoading] = useState(false)
  const [status, setStatus] = useState('')

  const shouldShow = useMemo(() => auth.openLogin && auth.ready, [auth.openLogin, auth.ready])
  const variant = props.variant || 'account'
  const needsCaptcha = true
  const canSubmit = Boolean(email.trim()) && Boolean(password) && (!needsCaptcha || (captchaToken.trim() && captchaAnswer.trim()))

  async function refreshCaptcha() {
    setCaptchaLoading(true)
    try {
      const base = auth.session?.backendBaseURL || 'https://kivana.eu'
      const c = await getCaptchaChallenge(base)
      setCaptchaQuestion(String(c.question || ''))
      setCaptchaToken(String(c.token || ''))
      setCaptchaAnswer('')
      setCaptchaLoading(false)
    } catch {
      setCaptchaQuestion('')
      setCaptchaToken('')
      setCaptchaAnswer('')
      setCaptchaLoading(false)
    }
  }

  useEffect(() => {
    if (email) return
    const remembered = loadLastLoginEmail()
    if (remembered) setEmail(remembered)
  }, [email])

  useEffect(() => {
    if (!shouldShow) return
    if (auth.session) return
    void refreshCaptcha()
  }, [shouldShow, auth.session])

  const kivanaPlan = useMemo(() => {
    const p = auth.entitlements?.products?.find((x) => x.productCode === 'kivana') ?? auth.entitlements?.products?.[0]
    if (!p) return null
    return `${p.productCode} / ${displayPlanName(p)}`
  }, [auth.entitlements])

  async function signInClick() {
    setStatus('')
    try {
      await auth.signIn(email, password, { token: captchaToken, answer: captchaAnswer })
      saveLastLoginEmail(email)
      setStatus('')
    } catch (e: any) {
      const msg = String(e?.message ?? e)
      setStatus(`Sign in failed: ${msg}`)
      if (msg === 'captcha_required' || msg === 'captcha_failed') void refreshCaptcha()
    }
  }

  async function signUpClick() {
    setStatus('')
    try {
      await auth.signUp(email, password, { token: captchaToken, answer: captchaAnswer })
      saveLastLoginEmail(email)
      setStatus('')
    } catch (e: any) {
      const msg = String(e?.message ?? e)
      setStatus(`Sign up failed: ${msg}`)
      if (msg === 'captcha_required' || msg === 'captcha_failed') void refreshCaptcha()
    }
  }

  async function signOutClick() {
    setStatus('')
    try {
      await auth.signOut()
      setStatus('')
    } catch (e: any) {
      setStatus(`Sign out failed: ${String(e?.message ?? e)}`)
    }
  }

  async function refreshEntitlementsClick() {
    setStatus('')
    try {
      await auth.refreshEntitlements()
      setStatus('')
    } catch (e: any) {
      setStatus(`Refresh failed: ${String(e?.message ?? e)}`)
    }
  }

  if (!shouldShow) return null

  return (
    <div className={variant === 'locked' ? 'modalBackdrop modalBackdropLocked' : 'modalBackdrop'}>
      <div className={variant === 'locked' ? 'modal loginModal' : 'modal'}>
        <div className="modalBrand">
          <div className="modalBrandLogo" aria-hidden="true">
            <img className="modalBrandLogoImg" src="/kivana-logo.png" alt="" />
          </div>
          <div className="modalBrandText">
            <div className="modalBrandName">Kivana</div>
            <div className="modalBrandCaption">{variant === 'locked' ? 'Sign in to continue' : 'Account'}</div>
          </div>
        </div>
        {variant === 'locked' && props.contextNote ? <div className="note">{props.contextNote}</div> : null}
        {auth.session ? (
          <>
            <div className="modalTitle">Account</div>
            <div className="note">Signed in: {auth.session.userEmail}</div>
            {kivanaPlan ? <div className="note">Plan: {kivanaPlan}</div> : null}
            <div className="modalActions">
              <button type="button" onClick={() => auth.setOpenLogin(false)}>
                Close
              </button>
              <button type="button" onClick={() => void refreshEntitlementsClick()}>
                Refresh
              </button>
              <button type="button" onClick={() => void signOutClick()}>
                Sign out
              </button>
            </div>
            {status ? <div className="note">{status}</div> : null}
          </>
        ) : (
          <>
            <div className="modalTitle">{variant === 'locked' ? 'Sign in' : 'Account'}</div>
            <div className="note">Create an account or sign in. Your plan will show here.</div>
            <div className="field" style={{ marginTop: 12 }}>
              <div className="fieldLabel">Email</div>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@domain.com"
                autoFocus
              />
            </div>
            <div className="field" style={{ marginTop: 12 }}>
              <div className="fieldLabel">Password</div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={variant === 'locked' ? 'current-password' : 'password'}
                placeholder="Your password"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void signInClick()
                }}
              />
            </div>
            {needsCaptcha ? (
              <div className="field" style={{ marginTop: 12 }}>
                <div className="fieldLabel">Captcha</div>
                <div className="note" style={{ marginTop: 6 }}>{captchaQuestion || (captchaLoading ? 'Loading…' : 'Captcha required. Press Refresh.')}</div>
                <div style={{ display: 'flex', gap: 10, marginTop: 8, alignItems: 'center' }}>
                  <input
                    value={captchaAnswer}
                    onChange={(e) => setCaptchaAnswer(e.target.value)}
                    placeholder="Answer"
                    style={{ flex: 1 }}
                  />
                  <button type="button" onClick={() => void refreshCaptcha()} style={{ flex: '0 0 auto' }} disabled={captchaLoading}>
                    {captchaLoading ? 'Loading…' : 'Refresh'}
                  </button>
                </div>
              </div>
            ) : null}
            <div className="modalActions loginActions">
              <button type="button" onClick={() => auth.setOpenLogin(false)}>
                Cancel
              </button>
              <div className="loginActionsRight">
                <button type="button" onClick={() => void signUpClick()} disabled={!canSubmit}>
                  Create account
                </button>
                <button type="button" onClick={() => void signInClick()} className="btnPrimary" disabled={!canSubmit}>
                  Sign in
                </button>
              </div>
            </div>
            {status ? <div className="note">{status}</div> : null}
          </>
        )}
      </div>
    </div>
  )
}
