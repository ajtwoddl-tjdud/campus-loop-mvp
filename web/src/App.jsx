import { useEffect, useState } from 'react'
import {
  ArrowRight, BedDouble, CalendarDays, Check, ChevronDown, Mail,
  MapPin, RotateCcw, ShieldCheck, Sparkles,
} from 'lucide-react'

import { copy } from './i18n.js'

const languages = ['en', 'ja', 'zh']

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
        <img src="/assets/campus-loop-hero-cau.png" alt={t.imageAlt} decoding="async" />
        <span className="image-caption"><Sparkles size={15} />{t.imageCaption}</span>
      </div>
      <div className="hero-copy">
        <p className="pilot-badge">{t.serviceBadge}</p>
        <h1>{t.hero}</h1>
        <p className="hero-body">{t.heroBody}</p>
        <div className="hero-actions">
          <a className="button button-primary" href="#sold-out">{t.soldOutCta}<ArrowRight size={18} /></a>
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

function SoldOut({ t }) {
  return (
    <section className="apply-section" id="sold-out">
      <div className="success-panel sold-out-panel" role="status">
        <p className="sold-out-label">{t.soldOutLabel}</p>
        <h2>{t.soldOutTitle}</h2>
        <p>{t.soldOutBody}</p>
        <a className="button button-primary sold-out-contact" href="mailto:nvpz1598@gmail.com">
          {t.soldOutContact}<Mail size={18} />
        </a>
      </div>
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
        <SoldOut t={t} />
        <Faq t={t} />
        <Contact t={t} />
      </main>
      <footer><Logo /><p>{t.footer}</p></footer>
    </div>
  )
}

export default App
