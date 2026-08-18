import { useEffect, useRef, useState } from 'react'
import {
  ArrowRight, BedDouble, CalendarDays, Check, ChevronDown, Mail,
  MapPin, RotateCcw, ShieldCheck, Sparkles,
} from 'lucide-react'

import { createPilotApplication } from './api.js'
import { copy } from './i18n.js'

const languages = ['en', 'ja', 'zh']
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const TURNSTILE_SITE_KEY = '0x4AAAAAAEUW9W3Ef9cHai7m'
const TURNSTILE_SCRIPT_ID = 'campus-loop-turnstile-script'
const EMPTY_FORM = {
  isChungAngExchangeStudent: false,
  housing: '',
  arrivalDate: '',
  departureDate: '',
  name: '',
  email: '',
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

function Hero({ t }) {
  return (
    <section className="pilot-hero">
      <div className="hero-image-wrap">
        <img src="/assets/campus-loop-hero-cau.png" alt={t.imageAlt} fetchPriority="high" decoding="async" />
        <span className="image-caption"><Sparkles size={15} />{t.imageCaption}</span>
      </div>
      <div className="hero-copy">
        <p className="pilot-badge">{t.pilotBadge}</p>
        <h1>{t.hero}</h1>
        <p className="hero-body">{t.heroBody}</p>
        <div className="hero-actions">
          <a className="button button-primary" href="#apply">{t.apply}<ArrowRight size={18} /></a>
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
        action: 'pilot_application',
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

function ApplicationForm({ t }) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [application, setApplication] = useState(null)
  const [turnstileToken, setTurnstileToken] = useState('')
  const turnstileReset = useRef(null)

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }))

  const validate = () => {
    if (!form.isChungAngExchangeStudent || !form.housing || !form.arrivalDate ||
        !form.departureDate || !form.name.trim() || !form.email.trim() || !form.agree) {
      return t.formError
    }
    if (!EMAIL_PATTERN.test(form.email)) return t.emailError
    if (form.departureDate <= form.arrivalDate) return t.dateError
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
      const response = await createPilotApplication({
        ...form,
        name: form.name.trim(),
        email: form.email.trim(),
        turnstileToken,
      })
      setApplication(response)
      window.dispatchEvent(new CustomEvent('campus-loop:event', {
        detail: { name: 'pilot_application_submitted', housing: form.housing },
      }))
    } catch {
      setError(t.submitError)
      turnstileReset.current?.()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="apply-section" id="apply">
      <div className="apply-copy">
        <p className="eyebrow">{t.applyEyebrow}</p>
        <h2>{t.applyTitle}</h2>
        <p>{t.applyBody}</p>
        <div className="apply-price"><span>{t.price}</span><strong>{t.payback}</strong></div>
      </div>
      {application ? (
        <div className="success-panel" role="status">
          <span className="success-mark"><Check size={28} /></span>
          <h2>{t.successTitle}</h2>
          <p>{t.successBody}</p>
          <dl><dt>{t.applicationId}</dt><dd>{application.id}</dd></dl>
          <small>{t.successNext}</small>
        </div>
      ) : (
        <form className="application-form" onSubmit={submit} noValidate>
          <label className="check-row emphasized">
            <input type="checkbox" checked={form.isChungAngExchangeStudent} onChange={(event) => update('isChungAngExchangeStudent', event.target.checked)} />
            <span>{t.exchangeStudent}</span>
          </label>

          <fieldset>
            <legend>{t.housingLegend}</legend>
            <div className="radio-row">
              <label><input type="radio" name="housing" value="dorm" checked={form.housing === 'dorm'} onChange={(event) => update('housing', event.target.value)} /><span>{t.dorm}</span></label>
              <label><input type="radio" name="housing" value="off" checked={form.housing === 'off'} onChange={(event) => update('housing', event.target.value)} /><span>{t.off}</span></label>
            </div>
          </fieldset>

          <div className="field-grid">
            <label>{t.arrival}<input type="date" value={form.arrivalDate} onChange={(event) => update('arrivalDate', event.target.value)} /></label>
            <label>{t.departure}<input type="date" value={form.departureDate} onChange={(event) => update('departureDate', event.target.value)} /></label>
            <label>{t.name}<input type="text" autoComplete="name" value={form.name} onChange={(event) => update('name', event.target.value)} /></label>
            <label>{t.email}<input type="email" autoComplete="email" value={form.email} onChange={(event) => update('email', event.target.value)} /></label>
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
          <p className="non-confirmation"><ShieldCheck size={16} />{t.nonConfirmation}</p>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <button className="button button-primary submit-button" type="submit" disabled={submitting}>
            {submitting ? t.submitting : t.submit}<ArrowRight size={18} />
          </button>
        </form>
      )}
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
        <ApplicationForm t={t} />
        <Faq t={t} />
      </main>
      <footer><Logo /><p>{t.footer}</p></footer>
    </div>
  )
}

export default App
