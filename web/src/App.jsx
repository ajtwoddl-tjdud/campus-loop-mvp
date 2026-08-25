import { useEffect, useMemo, useRef, useState } from 'react'
import { PayPalButtons, PayPalScriptProvider } from '@paypal/react-paypal-js'
import {
  ArrowRight, BedDouble, CalendarDays, Check, ChevronDown, Mail,
  MapPin, RotateCcw, ShieldCheck, Sparkles,
} from 'lucide-react'

import { capturePayPalOrder, createPayPalOrder, createRentalIntake } from './api.js'
import { copy } from './i18n.js'

const languages = ['en', 'ja', 'zh']
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const TURNSTILE_SITE_KEY = '0x4AAAAAAEUW9W3Ef9cHai7m'
const TURNSTILE_SCRIPT_ID = 'campus-loop-turnstile-script'
const EMPTY_FORM = {
  name: '',
  email: '',
  secondaryContact: '',
  agree: false,
}

function Logo() {
  return (
    <a href="#top" className="logo" aria-label="Campus Loop home">
      <span className="loop-mark" aria-hidden="true"><span /></span>
      <span>Campus Loop</span>
    </a>
  )
}

function Header({ t, onLanguage }) {
  return (
    <header className="site-header">
      <Logo />
      <nav aria-label="Primary navigation">
        <a href="#included">{t.navIncluded}</a>
        <a href="#how">{t.navHow}</a>
        <a href="#faq">{t.navFaq}</a>
      </nav>
      <button className="language" onClick={onLanguage} aria-label={t.languageAria}>
        {t.lang}<ChevronDown size={15} />
      </button>
    </header>
  )
}

function SectionIntro({ eyebrow, title, body }) {
  return (
    <div className="section-intro">
      <p className="eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      {body ? <p className="section-body">{body}</p> : null}
    </div>
  )
}

function PayPalCheckout({ t, intake, onCompleted }) {
  const [error, setError] = useState('')
  const [processing, setProcessing] = useState(false)
  const options = useMemo(() => ({
    clientId: intake.paypal.clientId,
    currency: 'USD',
    intent: 'capture',
    components: 'buttons',
    disableFunding: 'venmo',
  }), [intake.paypal.clientId])

  return (
    <div className="paypal-checkout">
      <p>{t.paymentMethods}</p>
      <PayPalScriptProvider options={options}>
        <div aria-label={t.paymentLabel}>
          <PayPalButtons
            disabled={processing}
            forceReRender={[intake.id]}
            style={{ layout: 'vertical', shape: 'rect', height: 45, label: 'paypal' }}
            createOrder={async () => {
              setError('')
              const result = await createPayPalOrder(intake)
              return result.orderId
            }}
            onApprove={async (data) => {
              setProcessing(true)
              setError('')
              try {
                const result = await capturePayPalOrder(intake, data.orderID)
                if (result.status !== 'COMPLETED') throw new Error('Payment was not completed')
                onCompleted()
              } catch {
                setError(t.paymentError)
              } finally {
                setProcessing(false)
              }
            }}
            onCancel={() => setError(t.paymentCancelled)}
            onError={() => setError(t.paymentError)}
          />
        </div>
      </PayPalScriptProvider>
      {processing ? <p className="paypal-processing" role="status">{t.paymentProcessing}</p> : null}
      {error ? <p className="paypal-error" role="alert">{error}</p> : null}
    </div>
  )
}

function Hero({ t }) {
  return (
    <section className="pilot-hero">
      <div className="hero-image-wrap">
        <img src="/assets/campus-loop-hero-cau.png" alt={t.imageAlt} decoding="async" />
        <span className="image-caption"><Sparkles size={15} />{t.imageCaption}</span>
      </div>
      <div className="hero-copy">
        <p className="pilot-badge">{t.serviceBadge}</p>
        <h1>{t.hero}</h1>
        <p className="hero-body">{t.heroBody}</p>
        <div className="hero-actions">
          <a className="button button-primary" href="#checkout">{t.apply}<ArrowRight size={18} /></a>
          <a className="text-link" href="#included">{t.seeIncluded}</a>
        </div>
        <p className="hero-note"><ShieldCheck size={17} />{t.heroNote}</p>
      </div>
    </section>
  )
}

function Included({ t }) {
  return (
    <section className="included-section" id="included">
      <SectionIntro eyebrow={t.includedEyebrow} title={t.includedTitle} body={t.includedBody} />
      <div className="kit-layout">
        <div className="kit-sheet">
          <img className="kit-photo" src="/assets/campus-loop-kit-flatlay.png" alt={t.kitImageAlt} loading="lazy" decoding="async" />
          <div className="kit-copy">
            <div className="kit-number">01</div>
            <div>
              <BedDouble size={31} strokeWidth={1.5} />
              <ul>
                {t.kitItems.map((item) => <li key={item}><Check size={16} />{item}</li>)}
              </ul>
              {t.excluded ? <p>{t.excluded}</p> : null}
            </div>
          </div>
        </div>
        <aside className="price-panel" aria-label={t.priceEyebrow}>
          <p className="eyebrow">{t.priceEyebrow}</p>
          <strong className="price">{t.price}</strong>
          <p>{t.priceBody}</p>
          <div className="payback-line"><RotateCcw size={20} /><strong>{t.payback}</strong></div>
          <small>{t.paybackNote}</small>
          <p className="reference-rate">{t.referenceRate}</p>
        </aside>
      </div>
    </section>
  )
}

function Research({ t }) {
  return (
    <section className="research-section">
      <SectionIntro eyebrow={t.researchEyebrow} title={t.researchTitle} body={t.researchBody} />
      <div className="stat-strip">
        {t.stats.map((stat) => (
          <div className="stat" key={stat.value + stat.label}>
            <strong>{stat.value}</strong><span>{stat.label}</span>
          </div>
        ))}
        <p>{t.researchNote}</p>
      </div>
    </section>
  )
}

function HowItWorks({ t }) {
  const icons = [CalendarDays, Mail, MapPin]
  return (
    <section className="how-section" id="how">
      <SectionIntro eyebrow={t.howEyebrow} title={t.howTitle} />
      <div className="journey-images">
        <figure>
          <img src="/assets/campus-loop-arrival-scene.png" alt={t.arrivalImageAlt} loading="lazy" decoding="async" />
          <figcaption><span>01</span>{t.arrivalImageCaption}</figcaption>
        </figure>
        <figure>
          <img src="/assets/campus-loop-return-scene.png" alt={t.returnImageAlt} loading="lazy" decoding="async" />
          <figcaption><span>02</span>{t.returnImageCaption}</figcaption>
        </figure>
      </div>
      <ol className="process-list">
        {t.steps.map((step, index) => {
          const Icon = icons[index]
          return (
            <li key={step.title}>
              <span className="process-index">0{index + 1}</span>
              <Icon size={24} strokeWidth={1.5} />
              <div><h3>{step.title}</h3><p>{step.body}</p></div>
            </li>
          )
        })}
      </ol>
      <div className="boundary-note"><ShieldCheck size={26} /><div><h3>{t.boundaryTitle}</h3><p>{t.boundaryBody}</p></div></div>
    </section>
  )
}

function TurnstileWidget({ onToken, onError, resetHandle, t }) {
  const containerRef = useRef(null)

  useEffect(() => {
    let widgetId
    let active = true

    const renderWidget = () => {
      if (!active || !containerRef.current || !window.turnstile) return
      widgetId = window.turnstile.render(containerRef.current, {
        sitekey: TURNSTILE_SITE_KEY,
        action: 'rental_intake',
        appearance: 'interaction-only',
        execution: 'render',
        size: 'flexible',
        theme: 'auto',
        callback: (token) => {
          onToken(token)
          onError('')
        },
        'expired-callback': () => {
          onToken('')
          onError(t.turnstileRequired)
        },
        'error-callback': () => {
          onToken('')
          onError(t.turnstileError)
        },
      })
      resetHandle.current = () => {
        window.turnstile?.reset(widgetId)
        onToken('')
      }
    }

    if (window.turnstile) {
      renderWidget()
    } else {
      let script = document.getElementById(TURNSTILE_SCRIPT_ID)
      if (!script) {
        script = document.createElement('script')
        script.id = TURNSTILE_SCRIPT_ID
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
        script.async = true
        script.defer = true
        document.head.appendChild(script)
      }
      script.addEventListener('load', renderWidget, { once: true })
    }

    return () => {
      active = false
      resetHandle.current = null
      if (widgetId !== undefined) window.turnstile?.remove(widgetId)
    }
  }, [onError, onToken, resetHandle, t.turnstileError, t.turnstileRequired])

  return (
    <div className="turnstile-field">
      <span>{t.securityCheck}</span>
      <div ref={containerRef} aria-label={t.securityCheck} />
    </div>
  )
}

function RentalIntakeForm({ t }) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [intake, setIntake] = useState(null)
  const [paymentCompleted, setPaymentCompleted] = useState(false)
  const [turnstileToken, setTurnstileToken] = useState('')
  const turnstileReset = useRef(null)

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }))

  const validate = () => {
    if (!form.name.trim() || !form.email.trim() || !form.agree) {
      return t.formError
    }
    if (!EMAIL_PATTERN.test(form.email)) return t.emailError
    if (!turnstileToken) return t.turnstileRequired
    return ''
  }

  const submit = async (event) => {
    event.preventDefault()
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }

    setError('')
    setSubmitting(true)
    try {
      const response = await createRentalIntake({
        name: form.name.trim(),
        email: form.email.trim(),
        secondaryContact: form.secondaryContact.trim(),
        agree: form.agree,
        turnstileToken,
      })
      setIntake(response)
      window.dispatchEvent(new CustomEvent('campus-loop:event', {
        detail: { name: 'rental_intake_submitted' },
      }))
    } catch {
      setError(t.submitError)
      turnstileReset.current?.()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="apply-section" id="checkout">
      {intake ? (
        <div className="success-panel" role="status">
          <span className="success-mark"><Check size={28} /></span>
          <h2>{paymentCompleted ? t.paymentSuccessTitle : t.successTitle}</h2>
          <p>{paymentCompleted ? t.paymentSuccessBody : t.successBody}</p>
          {paymentCompleted ? (
            <p className="payment-confirmed"><Check size={18} />{t.paymentConfirmed}</p>
          ) : (
            <>
              <p className="checkout-price">{t.checkoutPrice}</p>
              <PayPalCheckout t={t} intake={intake} onCompleted={() => setPaymentCompleted(true)} />
            </>
          )}
        </div>
      ) : (
        <form className="application-form" onSubmit={submit} noValidate>
          <div className="field-grid">
            <label>{t.name}<input type="text" autoComplete="name" value={form.name} onChange={(event) => update('name', event.target.value)} /></label>
            <label>{t.email}<input type="email" autoComplete="email" value={form.email} onChange={(event) => update('email', event.target.value)} /></label>
            <label className="field-wide">{t.secondaryContact}<input type="text" autoComplete="off" placeholder={t.secondaryPlaceholder} value={form.secondaryContact} onChange={(event) => update('secondaryContact', event.target.value)} /></label>
          </div>

          <label className="check-row consent-row">
            <input type="checkbox" checked={form.agree} onChange={(event) => update('agree', event.target.checked)} />
            <span>{t.consent}</span>
          </label>
          <TurnstileWidget
            onToken={setTurnstileToken}
            onError={setError}
            resetHandle={turnstileReset}
            t={t}
          />
          <p className="non-confirmation"><ShieldCheck size={16} />{t.noChargeYet}</p>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <button className="button button-primary submit-button" type="submit" disabled={submitting}>
            {submitting ? t.submitting : t.submit}<ArrowRight size={18} />
          </button>
        </form>
      )}
    </section>
  )
}

function Contact({ t }) {
  return (
    <section className="contact-section" id="contact">
      <div>
        <p className="eyebrow">{t.contactEyebrow}</p>
        <h2>{t.contactTitle}</h2>
        <p>{t.contactBody}</p>
      </div>
      <div className="contact-links">
        <a className="button button-primary" href="mailto:nvpz1598@gmail.com">{t.contactEmail}<Mail size={18} /></a>
        <a className="text-link" href="https://www.instagram.com/campusloop.for.u" target="_blank" rel="noreferrer">{t.contactInstagram}<ArrowRight size={16} /></a>
      </div>
    </section>
  )
}

function Faq({ t }) {
  return (
    <section className="faq-section" id="faq">
      <SectionIntro eyebrow={t.faqEyebrow} title={t.faqTitle} />
      <div className="faq-list">
        {t.faqs.map((item, index) => (
          <details key={item.q}>
            <summary><span>0{index + 1}</span>{item.q}</summary>
            <p>{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  )
}

function App() {
  const [language, setLanguage] = useState('en')
  const t = copy[language]

  useEffect(() => {
    document.documentElement.lang = language === 'zh' ? 'zh-Hant' : language
  }, [language])

  const cycleLanguage = () => {
    setLanguage((current) => languages[(languages.indexOf(current) + 1) % languages.length])
  }

  return (
    <div id="top">
      <Header t={t} onLanguage={cycleLanguage} />
      <main>
        <Hero t={t} />
        <Included t={t} />
        <Research t={t} />
        <HowItWorks t={t} />
        <RentalIntakeForm t={t} />
        <Faq t={t} />
        <Contact t={t} />
      </main>
      <footer><Logo /><p>{t.footer}</p></footer>
    </div>
  )
}

export default App
