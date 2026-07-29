import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft, ArrowRight, BedDouble, Box, CalendarDays, Check, ChevronDown,
  CircleCheck, Droplets, Home, Layers3, Leaf, MapPin, Menu, PackageCheck,
  PackageOpen, PanelTop, Plug, Recycle, RotateCcw, School, Shirt, Sparkles,
  SprayCan, UserRound, Utensils, Wind, X,
} from 'lucide-react'
import {
  bundles, campuses, localized, money, purchaseProducts, rentalProducts, stayOptions,
} from './data.js'
import { copy } from './i18n.js'

const STORAGE_KEY = 'campus-loop-reservation-v2'
const languages = ['en', 'ko', 'zh']
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const rentalIcons = { Wind, Shirt, PackageOpen, PanelTop, Utensils, SprayCan }
const purchaseIcons = { BedDouble, Layers3, Droplets }
const storySteps = [
  { title: 'Reserve before arrival', body: 'Choose your stay length and the items you need, then reserve everything online.', icon: CalendarDays },
  { title: 'Pick up', body: 'Collect your items at a designated campus hub or choose delivery when available.', icon: MapPin },
  { title: 'Use', body: 'Use your essentials for as long as you need with short- and long-stay rental options.', icon: PackageCheck },
  { title: 'Return', body: 'Bring everything back to the designated return point before moving out.', icon: Box },
  { title: 'Pass it on', body: 'Returned items are carefully inspected before they support the next student.', icon: Recycle },
]
const storyCategories = [
  { label: 'Hangers', icon: Shirt },
  { label: 'Cleaning tools', icon: SprayCan },
  { label: 'Power strip', icon: Plug },
  { label: 'Storage', icon: Box },
  { label: 'Dining & cookware', icon: Utensils },
  { label: 'Bedding', icon: BedDouble, isNew: true },
]

function Logo() {
  return <a href="#top" className="logo" aria-label="Campus Loop home"><span className="loop-mark"><span /></span>Campus Loop</a>
}

function Header({ t, onLanguage, onReservation, onStory }) {
  return (
    <header className="site-header">
      <Logo />
      <nav aria-label="Primary navigation">
        <button className="nav-link" onClick={onStory}>{t.storyTitle}</button>
        <a href="#how">{t.how}</a>
      </nav>
      <div className="header-actions">
        <button className="language" onClick={onLanguage} aria-label="Change language">{t.lang}<ChevronDown size={15} /></button>
        <button className="button button-dark button-small" onClick={onReservation}>{t.reservation}</button>
      </div>
    </header>
  )
}

function Progress({ step, labels }) {
  return (
    <div className="steps" aria-label="Reservation progress">
      {labels.map((label, index) => {
        const number = index + 1
        return (
          <div className={`step ${number === step ? 'active' : ''} ${number < step ? 'done' : ''}`} key={label}>
            <span>{number < step ? <Check size={14} /> : number}</span>
            <b>{label}</b>
          </div>
        )
      })}
    </div>
  )
}

function Choice({ selected, onClick, icon: Icon, title, body, testId }) {
  return (
    <button type="button" className={`choice ${selected ? 'selected' : ''}`} onClick={onClick} data-testid={testId}>
      {Icon ? <Icon size={23} strokeWidth={1.6} /> : null}
      <span><strong>{title}</strong>{body ? <small>{body}</small> : null}</span>
      <span className="choice-check">{selected ? <Check size={14} /> : null}</span>
    </button>
  )
}

function PanelHeader({ title, body }) {
  return <div className="panel-title"><h2>{title}</h2>{body ? <p>{body}</p> : null}</div>
}

function OrderSummary({ rentalIds, purchaseIds, language, t }) {
  const rentalTotal = rentalProducts.reduce((sum, item) => rentalIds.includes(item.id) ? sum + item.price : sum, 0)
  const purchaseTotal = purchaseProducts.reduce((sum, item) => purchaseIds.includes(item.id) ? sum + item.price : sum, 0)
  return (
    <div className="order-summary" aria-label={t.order}>
      <h3>{t.order}</h3>
      <div><span>{t.rentalSubtotal}</span><strong>{money(rentalTotal)}</strong></div>
      <div><span>{t.buySubtotal}</span><strong>{money(purchaseTotal)}</strong></div>
      <div className="order-total"><span>{t.total}</span><strong>{money(rentalTotal + purchaseTotal)}</strong></div>
      <p><PackageCheck size={19} /> {rentalIds.length} {t.selectedItems}</p>
      {rentalIds.length > 0 ? (
        <ul>
          {rentalProducts.filter((item) => rentalIds.includes(item.id)).map((item) => <li key={item.id}>{localized(item.name, language)}</li>)}
        </ul>
      ) : null}
    </div>
  )
}

function Actions({ back, next, nextLabel, backLabel, disabled = false }) {
  return (
    <div className="panel-actions">
      {back ? <button className="button button-outline" onClick={back}><ArrowLeft size={17} />{backLabel}</button> : <span />}
      <button className="button button-primary" onClick={next} disabled={disabled}>{nextLabel}</button>
    </div>
  )
}

function StayStep({ profile, setProfile, storage, setStorage, t, language, next, onStayType }) {
  const [errors, setErrors] = useState({})
  const today = new Date().toISOString().slice(0, 10)
  const update = (key, value) => setProfile((current) => ({ ...current, [key]: value }))
  const validate = () => {
    const nextErrors = {}
    if (profile.startDate < today) nextErrors.startDate = t.pastDate
    if (profile.endDate <= profile.startDate) nextErrors.endDate = t.dateError
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length === 0) next()
  }

  return (
    <div className="builder-content stay-layout">
      <section className="main-panel">
        <PanelHeader title={t.stayTitle} body={t.stayBody} />
        <div className="stay-fields">
          <fieldset>
            <legend>{t.campus}</legend>
            <div className="choice-grid two">
              {Object.keys(campuses).map((campus) => <Choice key={campus} selected={profile.campus === campus} onClick={() => update('campus', campus)} icon={School} title={campus} testId={`campus-${campus}`} />)}
            </div>
          </fieldset>
          <fieldset>
            <legend>{t.housing}</legend>
            <div className="choice-grid two">
              <Choice selected={profile.housing === 'dorm'} onClick={() => update('housing', 'dorm')} icon={School} title={t.dorm} testId="housing-dorm" />
              <Choice selected={profile.housing === 'off'} onClick={() => update('housing', 'off')} icon={Home} title={t.off} testId="housing-off" />
            </div>
          </fieldset>
          <fieldset className="duration-fieldset">
            <legend>{t.duration}</legend>
            <div className="choice-grid three">
              {stayOptions.map((option) => (
                <Choice
                  key={option.id}
                  selected={profile.stayType === option.id}
                  onClick={() => onStayType(option.id)}
                  title={localized(option.name, language)}
                  body={localized(option.description, language)}
                  testId={`stay-${option.id}`}
                />
              ))}
            </div>
          </fieldset>
          <div className="date-grid">
            <label>{t.start}<input type="date" min={today} value={profile.startDate} onChange={(event) => update('startDate', event.target.value)} aria-invalid={Boolean(errors.startDate)} />{errors.startDate ? <span className="error">{errors.startDate}</span> : null}</label>
            <label>{t.end}<input type="date" min={profile.startDate || today} value={profile.endDate} onChange={(event) => update('endDate', event.target.value)} aria-invalid={Boolean(errors.endDate)} />{errors.endDate ? <span className="error">{errors.endDate}</span> : null}</label>
          </div>
          <div className="school-rule"><CircleCheck size={19} /><span><strong>{t.schoolNote}</strong>{localized(campuses[profile.campus].rule, language)}</span></div>
          {profile.stayType === 'long' ? (
            <div className="storage-box">
              <h3>{t.storageTitle}</h3><p>{t.storageBody}</p>
              <div className="choice-grid two compact">
                <Choice selected={storage.interested} onClick={() => setStorage((current) => ({ ...current, interested: true }))} title={t.storageYes} />
                <Choice selected={!storage.interested} onClick={() => setStorage((current) => ({ ...current, interested: false }))} title={t.storageNo} />
              </div>
              {storage.interested ? (
                <div className="storage-fields">
                  <label>{t.storageStart}<input type="date" value={storage.startDate} onChange={(event) => setStorage((current) => ({ ...current, startDate: event.target.value }))} /></label>
                  <label>{t.storageEnd}<input type="date" value={storage.endDate} onChange={(event) => setStorage((current) => ({ ...current, endDate: event.target.value }))} /></label>
                  <label>{t.boxes}<input type="number" min="1" max="20" value={storage.boxes} onChange={(event) => setStorage((current) => ({ ...current, boxes: Number(event.target.value) }))} /></label>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        <Actions next={validate} nextLabel={t.continueRental} backLabel={t.back} />
      </section>
      <aside className="context-panel">
        <CalendarDays size={26} />
        <h3>{localized(stayOptions.find((option) => option.id === profile.stayType).name, language)}</h3>
        <p>{localized(stayOptions.find((option) => option.id === profile.stayType).description, language)}</p>
        <dl><div><dt>{t.campus}</dt><dd>{profile.campus}</dd></div><div><dt>{t.housing}</dt><dd>{profile.housing === 'dorm' ? t.dorm : t.off}</dd></div></dl>
      </aside>
    </div>
  )
}

function RentalStep({ rentalIds, setRentalIds, bundle, setBundle, language, t, back, next }) {
  const [error, setError] = useState('')
  const applyBundle = (id) => {
    setBundle(id)
    setRentalIds(bundles[id])
    setError('')
  }
  const toggle = (id) => {
    setBundle('custom')
    setRentalIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
    setError('')
  }
  const proceed = () => rentalIds.length ? next() : setError(t.noRental)

  return (
    <div className="builder-content product-layout">
      <section className="main-panel">
        <PanelHeader title={t.chooseTitle} body={t.chooseBody} />
        <p className="field-label">{t.recommended}</p>
        <div className="recommendations">
          <Choice selected={bundle === 'lite'} onClick={() => applyBundle('lite')} title={t.lite} body={t.liteBody} testId="bundle-lite" />
          <Choice selected={bundle === 'core'} onClick={() => applyBundle('core')} title={t.core} body={t.coreBody} testId="bundle-core" />
        </div>
        <div className="rental-list" id="rental-items">
          {rentalProducts.map((item) => {
            const Icon = rentalIcons[item.icon]
            const selected = rentalIds.includes(item.id)
            return (
              <button type="button" className={`product-row ${selected ? 'selected' : ''}`} onClick={() => toggle(item.id)} key={item.id} data-testid={`rental-${item.id}`}>
                <span className="box">{selected ? <Check size={15} /> : null}</span>
                <Icon size={27} strokeWidth={1.5} />
                <strong>{localized(item.name, language)}</strong>
                <small>{t.returnRequired}</small>
                <b>{money(item.price)}</b>
              </button>
            )
          })}
        </div>
        {error ? <p className="error product-error">{error}</p> : null}
      </section>
      <aside className="summary-panel">
        <OrderSummary rentalIds={rentalIds} purchaseIds={[]} language={language} t={t} />
        <Actions back={back} next={proceed} nextLabel={t.continueBuy} backLabel={t.back} />
      </aside>
    </div>
  )
}

function BuyStep({ rentalIds, purchaseIds, setPurchaseIds, language, t, back, next }) {
  const toggle = (id) => setPurchaseIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  return (
    <div className="builder-content product-layout">
      <section className="main-panel">
        <PanelHeader title={t.buyTitle} body={t.buyBody} />
        <div className="purchase-grid">
          {purchaseProducts.map((item) => {
            const Icon = purchaseIcons[item.icon]
            const selected = purchaseIds.includes(item.id)
            return (
              <button type="button" className={`purchase-card ${selected ? 'selected' : ''}`} onClick={() => toggle(item.id)} key={item.id} data-testid={`purchase-${item.id}`}>
                <span className="box">{selected ? <Check size={15} /> : null}</span>
                <Icon size={32} strokeWidth={1.45} />
                <strong>{localized(item.name, language)}</strong>
                <small>{localized(item.description, language)}</small>
                <b>{money(item.price)}</b>
              </button>
            )
          })}
        </div>
        <p className="quiet-note"><Sparkles size={17} />{t.skipAllowed}</p>
      </section>
      <aside className="summary-panel">
        <OrderSummary rentalIds={rentalIds} purchaseIds={purchaseIds} language={language} t={t} />
        <Actions back={back} next={next} nextLabel={t.continuePickup} backLabel={t.back} />
      </aside>
    </div>
  )
}

function PickupStep({ profile, pickup, setPickup, rentalIds, purchaseIds, language, t, back, next }) {
  const campus = campuses[profile.campus]
  return (
    <div className="builder-content product-layout">
      <section className="main-panel">
        <PanelHeader title={t.pickupTitle} body={t.pickupBody} />
        <div className="logistics-grid">
          <div>
            <label className="field-label">{t.pickupLocation}</label>
            <div className="static-input"><MapPin size={18} />{campus.pickup}</div>
            <fieldset><legend>{t.pickupDate}</legend><div className="option-row">{campus.dates.map((date) => <button type="button" className={pickup.date === date ? 'selected' : ''} onClick={() => setPickup((current) => ({ ...current, date }))} key={date}>{date.slice(5).replace('-', '/')}</button>)}</div></fieldset>
            <fieldset><legend>{t.pickupTime}</legend><div className="option-row two">{['10:00–12:00', '14:00–16:00'].map((time) => <button type="button" className={pickup.time === time ? 'selected' : ''} onClick={() => setPickup((current) => ({ ...current, time }))} key={time}>{time}</button>)}</div></fieldset>
          </div>
          <div className="return-card">
            <RotateCcw size={25} />
            <h3>{t.returnLocation}</h3><p>{campus.returnPoint}</p>
            <h3>{t.plannedReturn}</h3><p>{profile.endDate}</p>
            <div className="operator-note">{t.operatorNote}</div>
          </div>
        </div>
      </section>
      <aside className="summary-panel">
        <OrderSummary rentalIds={rentalIds} purchaseIds={purchaseIds} language={language} t={t} />
        <Actions back={back} next={next} nextLabel={t.continueContact} backLabel={t.back} />
      </aside>
    </div>
  )
}

function ContactStep({ contact, setContact, rentalIds, purchaseIds, language, t, back, submit }) {
  const [errors, setErrors] = useState({})
  const update = (key, value) => setContact((current) => ({ ...current, [key]: value }))
  const validate = () => {
    const nextErrors = {}
    if (!contact.name.trim()) nextErrors.name = t.required
    if (!contact.email.trim()) nextErrors.email = t.required
    else if (!EMAIL_PATTERN.test(contact.email)) nextErrors.email = t.emailError
    if (!contact.agree) nextErrors.agree = t.required
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length === 0) submit()
  }
  return (
    <div className="builder-content product-layout">
      <section className="main-panel">
        <PanelHeader title={t.contactTitle} body={t.contactBody} />
        <div className="contact-form">
          {['name', 'email', 'line'].map((key) => (
            <label key={key}>{t[key]}
              <input type={key === 'email' ? 'email' : 'text'} value={contact[key]} onChange={(event) => update(key, event.target.value)} aria-invalid={Boolean(errors[key])} data-testid={`field-${key}`} />
              {errors[key] ? <span className="error">{errors[key]}</span> : null}
            </label>
          ))}
          <label className="consent"><input type="checkbox" checked={contact.agree} onChange={(event) => update('agree', event.target.checked)} data-testid="field-agree" /><span>{t.agree}</span></label>
          {errors.agree ? <span className="error">{errors.agree}</span> : null}
        </div>
      </section>
      <aside className="summary-panel">
        <OrderSummary rentalIds={rentalIds} purchaseIds={purchaseIds} language={language} t={t} />
        <Actions back={back} next={validate} nextLabel={t.confirm} backLabel={t.back} />
      </aside>
    </div>
  )
}

function Success({ reservation, language, t, onReset, onClose }) {
  const rentalNames = rentalProducts.filter((item) => reservation.rentalIds.includes(item.id)).map((item) => localized(item.name, language)).join(', ')
  const purchaseNames = purchaseProducts.filter((item) => reservation.purchaseIds.includes(item.id)).map((item) => localized(item.name, language)).join(', ')
  return (
    <section className="success-panel" aria-live="polite">
      {onClose ? <button className="close-button" onClick={onClose} aria-label="Close"><X size={20} /></button> : null}
      <span className="success-icon"><Check size={30} /></span><h2>{t.success}</h2>
      <div className="success-details">
        <p><PackageCheck size={19} /><span><strong>{t.reservationLabel}</strong>{reservation.id}</span></p>
        <p><CalendarDays size={19} /><span><strong>{t.pickupLabel}</strong>{reservation.pickup.date} · {reservation.pickup.time}</span></p>
        <p><RotateCcw size={19} /><span><strong>{t.returnLabel}</strong>{reservation.profile.endDate} · {campuses[reservation.profile.campus].returnPoint}</span></p>
        <p><PackageOpen size={19} /><span><strong>{t.rentalLabel}</strong>{rentalNames}</span></p>
        {purchaseNames ? <p><Sparkles size={19} /><span><strong>{t.purchaseLabel}</strong>{purchaseNames}</span></p> : null}
        {reservation.storage.interested ? <p><Home size={19} /><span><strong>{t.storagePending}</strong>{reservation.storage.boxes} boxes</span></p> : null}
      </div>
      <p className="payment-note">{t.payment}</p>
      <button className="button button-outline" onClick={onReset}>{t.newReservation}</button>
    </section>
  )
}

function CampusLoopStory({ onBack }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const scrollTop = () => window.scrollTo({ top: 0, behavior: 'smooth' })
  const scrollToSection = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <div className="story-page">
      <div className="story-shell">
        <header className="story-header">
          <button className="story-brand" onClick={() => onBack('top')} aria-label="Back to Campus Loop rental">
            <span className="loop-mark"><span /></span>
            <span>CAMPUS LOOP</span>
          </button>
          <nav className="story-desktop-nav" aria-label="Campus Loop information">
            <button onClick={() => scrollToSection('story-how')}>How it works</button>
            <button className="story-rental-link" onClick={() => onBack('builder')}>Build my rental</button>
          </nav>
          <button className="story-menu-button" onClick={() => setMenuOpen((open) => !open)} aria-expanded={menuOpen} aria-label="Open menu">
            {menuOpen ? <X size={23} /> : <Menu size={23} />}
          </button>
          {menuOpen ? (
            <div className="story-menu" role="menu">
              <button role="menuitem" onClick={() => onBack('top')}>Back to main</button>
              <button role="menuitem" onClick={() => onBack('builder')}>Build my rental</button>
            </div>
          ) : null}
        </header>

        <main className="story-content">
          <section className="story-hero">
            <span className="story-exclusive">INTERNATIONAL STUDENT EXCLUSIVE</span>
            <h1>Arrive ready.<br />Leave light.</h1>
            <p>Rent the everyday essentials you need after arrival, then return everything at once before moving out.</p>
            <img src="/assets/campus-loop-about-dorm.png" alt="A tidy dorm room with bedding, a desk, and organized storage" />
          </section>

          <section className="story-how" id="story-how" aria-labelledby="story-how-title">
            <h2 id="story-how-title">How It Works</h2>
            <div className="story-steps">
              {storySteps.map(({ title, body, icon: Icon }, index) => (
                <article className="story-step" key={title}>
                  <div className={`story-step-number ${index === storySteps.length - 1 ? 'final' : ''}`}>
                    {index === storySteps.length - 1 ? <Recycle size={15} /> : index + 1}
                  </div>
                  <div>
                    <h3><Icon size={16} />{title}</h3>
                    <p>{body}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="story-inventory" id="story-inventory" aria-labelledby="story-inventory-title">
            <span>CATEGORY</span>
            <h2 id="story-inventory-title">What&apos;s In The Loop</h2>
            <div className="story-category-grid">
              {storyCategories.map(({ label, icon: Icon, isNew }) => (
                <article className={isNew ? 'featured' : ''} key={label}>
                  {isNew ? <b>NEW</b> : null}
                  <Icon size={22} strokeWidth={1.7} />
                  <h3>{label}</h3>
                </article>
              ))}
            </div>
          </section>

          <div className="story-lower-grid">
            <section className="story-storage" id="story-storage">
              <div className="story-storage-label"><Leaf size={15} />SPECIAL OFFER</div>
              <h2>Storage for<br />long-stay students</h2>
              <p>Leave heavy luggage with us during school breaks or trips home. Campus Loop keeps your move simple and light.</p>
              <div className="story-storage-note"><span />Vacation Storage Available</div>
            </section>

            <section className="story-cta">
              <div className="story-try-copy">
                <span>YOUR STAY, MADE LIGHTER</span>
                <h2>Try it for one stay.</h2>
                <p>Pack less, settle in faster, and return everything at once when it&apos;s time to leave.</p>
                <button onClick={() => onBack('builder')}>Build my rental <ArrowRight size={17} /></button>
              </div>
              <div className="story-kit-visual" aria-hidden="true">
                <div className="story-kit-core"><PackageOpen size={66} strokeWidth={1.35} /></div>
                <span className="story-kit-item story-kit-shirt"><Shirt size={25} /></span>
                <span className="story-kit-item story-kit-bed"><BedDouble size={25} /></span>
                <span className="story-kit-item story-kit-dining"><Utensils size={24} /></span>
                <Sparkles className="story-kit-sparkle" size={23} />
              </div>
            </section>
          </div>
        </main>

        <nav className="story-bottom-nav" aria-label="Campus Loop story navigation">
          <button className="active" onClick={scrollTop}><Home size={17} /><span>Home</span></button>
          <button onClick={() => onBack('builder')}><PackageOpen size={17} /><span>Rent</span></button>
          <button onClick={() => onBack('how')}><Recycle size={17} /><span>Returns</span></button>
          <button onClick={() => onBack('top')}><UserRound size={17} /><span>Profile</span></button>
        </nav>
      </div>
    </div>
  )
}

function App() {
  const [language, setLanguage] = useState('en')
  const [surface, setSurface] = useState(() => window.location.hash === '#whats-campus-loop' ? 'story' : 'mvp')
  const [step, setStep] = useState(1)
  const [profile, setProfile] = useState({ campus: 'NTU', housing: 'dorm', stayType: 'semester', startDate: '2026-09-01', endDate: '2027-01-15' })
  const [storage, setStorage] = useState({ interested: false, startDate: '2027-01-16', endDate: '2027-02-15', boxes: 2 })
  const [bundle, setBundle] = useState('core')
  const [rentalIds, setRentalIds] = useState(bundles.core)
  const [purchaseIds, setPurchaseIds] = useState([])
  const [pickup, setPickup] = useState({ date: campuses.NTU.dates[1], time: '10:00–12:00' })
  const [contact, setContact] = useState({ name: '', email: '', line: '', agree: false })
  const [reservation, setReservation] = useState(null)
  const [showReservation, setShowReservation] = useState(false)
  const builderRef = useRef(null)
  const t = copy[language]

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) setReservation(JSON.parse(saved))
    } catch {
      // The confirmation flow still works when storage is unavailable.
    }
  }, [])

  useEffect(() => {
    document.documentElement.lang = language === 'zh' ? 'zh-Hant' : language
  }, [language])

  useEffect(() => {
    const syncSurface = () => setSurface(window.location.hash === '#whats-campus-loop' ? 'story' : 'mvp')
    window.addEventListener('hashchange', syncSurface)
    return () => window.removeEventListener('hashchange', syncSurface)
  }, [])

  useEffect(() => {
    if (!campuses[profile.campus].dates.includes(pickup.date)) {
      setPickup((current) => ({ ...current, date: campuses[profile.campus].dates[1] }))
    }
  }, [pickup.date, profile.campus])

  const totals = useMemo(() => ({
    rental: rentalProducts.reduce((sum, item) => rentalIds.includes(item.id) ? sum + item.price : sum, 0),
    purchase: purchaseProducts.reduce((sum, item) => purchaseIds.includes(item.id) ? sum + item.price : sum, 0),
  }), [purchaseIds, rentalIds])

  const scrollToBuilder = () => builderRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  const go = (nextStep) => {
    setStep(nextStep)
    requestAnimationFrame(scrollToBuilder)
  }
  const selectStayType = (stayType) => {
    const recommendation = stayOptions.find((option) => option.id === stayType).recommendation
    setProfile((current) => ({ ...current, stayType }))
    if (recommendation === 'lite' || recommendation === 'core') {
      setBundle(recommendation)
      setRentalIds(bundles[recommendation])
    } else {
      setBundle('custom')
      setRentalIds(['hangers', 'baskets', 'mirror'])
    }
    window.dispatchEvent(new CustomEvent('campus-loop:event', { detail: { name: 'stay_type_selected', stayType } }))
  }
  const submit = () => {
    const saved = {
      id: `CL-${new Date().getFullYear().toString().slice(-2)}${String(Math.floor(10000 + Math.random() * 90000))}`,
      version: 2,
      profile,
      storage,
      rentalIds,
      purchaseIds,
      pickup,
      contact: { ...contact, agree: true },
      totals,
      createdAt: new Date().toISOString(),
    }
    setReservation(saved)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved))
    } catch {
      // The visible confirmation remains available.
    }
    setStep(6)
    window.dispatchEvent(new CustomEvent('campus-loop:event', { detail: { name: 'reservation_submitted', school: profile.campus, stayType: profile.stayType, total: totals.rental + totals.purchase } }))
    requestAnimationFrame(scrollToBuilder)
  }
  const reset = () => {
    setStep(1)
    setShowReservation(false)
    setContact({ name: '', email: '', line: '', agree: false })
    requestAnimationFrame(scrollToBuilder)
  }
  const cycleLanguage = () => setLanguage(languages[(languages.indexOf(language) + 1) % languages.length])
  const openStory = () => {
    setSurface('story')
    window.location.hash = 'whats-campus-loop'
    requestAnimationFrame(() => window.scrollTo({ top: 0 }))
  }
  const openMvp = (target = 'top') => {
    setSurface('mvp')
    window.location.hash = target
    requestAnimationFrame(() => document.getElementById(target)?.scrollIntoView({ block: 'start' }))
  }

  if (surface === 'story') return <CampusLoopStory onBack={openMvp} />

  return (
    <div id="top">
      <Header t={t} onLanguage={cycleLanguage} onReservation={() => reservation ? setShowReservation(true) : scrollToBuilder()} onStory={openStory} />
      <main>
        <section className="hero">
          <div className="hero-copy"><h1>{t.hero.split('\n').map((line) => <span key={line}>{line}</span>)}</h1><p>{t.heroBody}</p><div className="hero-actions"><button className="button button-primary" onClick={scrollToBuilder}>{t.build}</button><button className="hero-text-link" onClick={openStory}>{t.storyTitle}</button></div></div>
          <div className="hero-visual"><span className="route-line" aria-hidden="true" /><img src="/assets/dorm-essentials.png" alt="Reusable dorm essentials available through Campus Loop" /></div>
        </section>

        <section className="builder" id="builder" ref={builderRef} aria-labelledby="builder-title">
          {step <= 5 ? <div className="builder-head"><h2 id="builder-title">{t.builder}</h2><Progress step={step} labels={t.steps} /></div> : null}
          {step === 1 ? <StayStep profile={profile} setProfile={setProfile} storage={storage} setStorage={setStorage} t={t} language={language} next={() => go(2)} onStayType={selectStayType} /> : null}
          {step === 2 ? <RentalStep rentalIds={rentalIds} setRentalIds={setRentalIds} bundle={bundle} setBundle={setBundle} language={language} t={t} back={() => go(1)} next={() => go(3)} /> : null}
          {step === 3 ? <BuyStep rentalIds={rentalIds} purchaseIds={purchaseIds} setPurchaseIds={setPurchaseIds} language={language} t={t} back={() => go(2)} next={() => go(4)} /> : null}
          {step === 4 ? <PickupStep profile={profile} pickup={pickup} setPickup={setPickup} rentalIds={rentalIds} purchaseIds={purchaseIds} language={language} t={t} back={() => go(3)} next={() => go(5)} /> : null}
          {step === 5 ? <ContactStep contact={contact} setContact={setContact} rentalIds={rentalIds} purchaseIds={purchaseIds} language={language} t={t} back={() => go(4)} submit={submit} /> : null}
          {step === 6 && reservation ? <Success reservation={reservation} language={language} t={t} onReset={reset} /> : null}
        </section>

        <section className="timeline" id="how" aria-label={t.how}>
          {t.timeline.map((label, index) => {
            const Icon = [PackageOpen, MapPin, RotateCcw][index]
            return <div className="timeline-item" key={label}><span className="timeline-icon"><Icon size={29} strokeWidth={1.5} /></span><strong>{index + 1}</strong><p>{label}</p></div>
          })}
        </section>
      </main>
      <footer><Logo /><p>© 2026 Campus Loop · Taipei pilot</p></footer>
      {showReservation && reservation ? <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setShowReservation(false)}><Success reservation={reservation} language={language} t={t} onReset={reset} onClose={() => setShowReservation(false)} /></div> : null}
    </div>
  )
}

export default App
