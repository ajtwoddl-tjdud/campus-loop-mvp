import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft, BedDouble, CalendarDays, Check, ChevronDown, CircleCheck,
  Clock3, Droplets, Home, Layers3, MapPin, PackageCheck, RotateCcw,
  School, Sparkles, Utensils, Wind, X,
} from 'lucide-react'
import { addons, baseItems, campuses, money } from './data.js'
import { copy } from './i18n.js'

const STORAGE_KEY = 'campus-loop-reservation'
const languages = ['en', 'ko', 'zh']
const itemIcons = [Wind, Sparkles, PackageCheck, Home, Utensils, RotateCcw]
const addonIcons = { BedDouble, Layers3, Droplets }

function Logo() {
  return <a href="#top" className="logo" aria-label="Campus Loop home"><span className="loop-mark"><span /></span>Campus Loop</a>
}

function Header({ t, onLanguage, onReservation }) {
  return (
    <header className="site-header">
      <Logo />
      <nav aria-label="Primary navigation">
        <a href="#how">{t.how}</a>
        <a href="#inside">{t.inside}</a>
      </nav>
      <div className="header-actions">
        <button className="language" onClick={onLanguage} aria-label="Change language">{t.lang}<ChevronDown size={15} /></button>
        <button className="button button-dark button-small" onClick={onReservation}>{t.reservation}</button>
      </div>
    </header>
  )
}

function Steps({ step, t }) {
  return (
    <div className="steps" aria-label="Reservation progress">
      {[t.campus, t.kit, t.pickup].map((label, index) => {
        const n = index + 1
        return <div className={`step ${n === step ? 'active' : ''} ${n < step ? 'done' : ''}`} key={label}><span>{n < step ? <Check size={14} /> : n}</span>{label}</div>
      })}
    </div>
  )
}

function Choice({ selected, onClick, icon: Icon, children, testId }) {
  return (
    <button type="button" className={`choice ${selected ? 'selected' : ''}`} onClick={onClick} data-testid={testId}>
      <Icon size={23} strokeWidth={1.6} /><span>{children}</span><span className="choice-check">{selected && <Check size={14} />}</span>
    </button>
  )
}

function PriceSummary({ t, selectedAddons = [], compact = false }) {
  const addOnTotal = addons.filter((item) => selectedAddons.includes(item.id)).reduce((sum, item) => sum + item.price, 0)
  return (
    <div className={`price-summary ${compact ? 'compact' : ''}`} aria-label="Order summary">
      <div><span>{t.reusable}</span><strong>{money(2000)}</strong></div>
      {compact && <div><span>{t.addOns}</span><strong>{money(addOnTotal)}</strong></div>}
      {compact && <div className="total"><span>{t.due}</span><strong>{money(2000 + addOnTotal)}</strong></div>}
      <div className="credit"><span>{compact ? t.credit : t.goodReturn}</span><strong>− {money(600)}</strong></div>
      {!compact && <div className="total"><span>{t.yourCost}</span><strong>{money(1400)}</strong></div>}
    </div>
  )
}

function CampusStep({ campus, setCampus, housing, setHousing, t, next }) {
  return (
    <div className="step-grid campus-grid">
      <section className="selection-column">
        <h3>{t.selectCampus}</h3>
        <div className="choice-grid">
          {Object.keys(campuses).map((name) => <Choice key={name} selected={campus === name} onClick={() => setCampus(name)} icon={School} testId={`campus-${name}`}>{name}</Choice>)}
        </div>
        <h3>{t.selectHousing}</h3>
        <div className="choice-grid">
          <Choice selected={housing === 'dorm'} onClick={() => setHousing('dorm')} icon={School} testId="housing-dorm">{t.dorm}</Choice>
          <Choice selected={housing === 'off'} onClick={() => setHousing('off')} icon={Home} testId="housing-off">{t.off}</Choice>
        </div>
        <p className="selected-line"><CircleCheck size={18} /> {t.selected}: <strong>{campus} / {housing === 'dorm' ? t.dorm : t.off}</strong></p>
      </section>
      <section className="kit-list" id="inside">
        <h3>{t.includes}</h3>
        <ul>{baseItems.map((item, i) => { const Icon = itemIcons[i]; return <li key={item}><Icon size={18} /><span>{item}</span></li> })}</ul>
        <p>{t.adjusted}</p>
      </section>
      <section className="summary-column">
        <PriceSummary t={t} />
        <button className="button button-primary button-wide" onClick={next}>{t.continue}</button>
      </section>
    </div>
  )
}

function KitStep({ selectedAddons, toggleAddon, t, back, next }) {
  return (
    <div className="step-grid detail-grid">
      <section className="addons-column">
        <h2>{t.make}</h2><p className="section-copy">{t.makeBody}</p>
        <div className="addon-list">
          {addons.map((item) => { const Icon = addonIcons[item.icon]; const selected = selectedAddons.includes(item.id); return (
            <button type="button" key={item.id} className={`addon-row ${selected ? 'selected' : ''}`} onClick={() => toggleAddon(item.id)} data-testid={`addon-${item.id}`}>
              <span className="box">{selected && <Check size={15} />}</span><Icon size={28} strokeWidth={1.5} /><strong>{item.name}</strong><span>{money(item.price)}</span>
            </button>
          )})}
        </div>
      </section>
      <aside className="order-column">
        <h3>Order summary</h3><PriceSummary t={t} selectedAddons={selectedAddons} compact />
        <div className="button-pair"><button className="button button-outline" onClick={back}><ArrowLeft size={17} />{t.back}</button><button className="button button-primary" onClick={next}>{t.choosePickup}</button></div>
      </aside>
    </div>
  )
}

function PickupStep({ campus, form, setForm, selectedAddons, t, back, submit }) {
  const [errors, setErrors] = useState({})
  const details = campuses[campus]
  const validate = () => {
    const next = {}
    if (!form.date) next.date = t.required
    if (!form.time) next.time = t.required
    if (!form.name.trim()) next.name = t.required
    if (!form.email.trim()) next.email = t.required
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) next.email = t.emailError
    if (!form.agree) next.agree = t.required
    setErrors(next)
    if (Object.keys(next).length === 0) submit()
  }
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }))
  return (
    <div className="pickup-layout">
      <section className="pickup-main">
        <h2>{t.choose}</h2>
        <div className="pickup-form-grid">
          <div>
            <label>{t.location}</label><div className="static-input"><MapPin size={17} />{details.pickup}</div>
            <fieldset><legend>{t.date}</legend><div className="option-row">{details.dates.map((date) => <button type="button" className={form.date === date ? 'selected' : ''} onClick={() => update('date', date)} key={date}>{date}</button>)}</div>{errors.date && <p className="error">{errors.date}</p>}</fieldset>
            <fieldset><legend>{t.time}</legend><div className="option-row">{['10:00–12:00', '14:00–16:00'].map((time) => <button type="button" className={form.time === time ? 'selected' : ''} onClick={() => update('time', time)} key={time}>{time}</button>)}</div>{errors.time && <p className="error">{errors.time}</p>}</fieldset>
          </div>
          <div className="contact-fields">
            {['name', 'email', 'line'].map((key) => <label key={key}>{t[key]}<input name={key} data-testid={`field-${key}`} value={form[key]} onChange={(e) => update(key, e.target.value)} type={key === 'email' ? 'email' : 'text'} aria-invalid={Boolean(errors[key])} />{errors[key] && <span className="error">{errors[key]}</span>}</label>)}
            <label className="consent"><input name="agree" data-testid="field-agree" type="checkbox" checked={form.agree} onChange={(e) => update('agree', e.target.checked)} /><span>{t.agree}</span></label>{errors.agree && <span className="error">{errors.agree}</span>}
          </div>
        </div>
        <div className="pickup-actions"><button className="button button-outline" onClick={back}><ArrowLeft size={17} />{t.back}</button><button className="button button-primary" onClick={validate}>{t.confirm}</button></div>
      </section>
      <aside className="pickup-summary"><h3>Order summary</h3><PriceSummary t={t} selectedAddons={selectedAddons} compact /></aside>
    </div>
  )
}

function Success({ reservation, t, onReset, onClose }) {
  return (
    <section className="success-panel" aria-live="polite">
      {onClose && <button className="close-button" onClick={onClose} aria-label="Close"><X size={20} /></button>}
      <span className="success-icon"><Check size={30} /></span><h2>{t.success}</h2>
      <div className="success-details">
        <p><PackageCheck size={19} />Reservation {reservation.id}</p>
        <p><CalendarDays size={19} />{t.pickupLabel} {reservation.date} · {reservation.time}</p>
        <p><MapPin size={19} />{campuses[reservation.campus].pickup}</p>
      </div>
      <p className="payment-note">{t.payment}</p>
      <button className="button button-outline" onClick={onReset}>{t.newReservation}</button>
    </section>
  )
}

function App() {
  const [lang, setLang] = useState('en')
  const [step, setStep] = useState(1)
  const [campus, setCampus] = useState('NTU')
  const [housing, setHousing] = useState('dorm')
  const [selectedAddons, setSelectedAddons] = useState([])
  const [form, setForm] = useState({ date: 'Sep 1', time: '10:00–12:00', name: '', email: '', line: '', agree: false })
  const [reservation, setReservation] = useState(null)
  const [showReservation, setShowReservation] = useState(false)
  const builderRef = useRef(null)
  const t = copy[lang]

  useEffect(() => { try { const saved = localStorage.getItem(STORAGE_KEY); if (saved) setReservation(JSON.parse(saved)) } catch { /* storage may be unavailable */ } }, [])
  useEffect(() => { document.documentElement.lang = lang === 'zh' ? 'zh-Hant' : lang }, [lang])
  const pickupDates = useMemo(() => campuses[campus].dates, [campus])
  useEffect(() => { if (!pickupDates.includes(form.date)) setForm((current) => ({ ...current, date: pickupDates[1] })) }, [pickupDates, form.date])

  const scrollToBuilder = () => builderRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  const go = (number) => { setStep(number); requestAnimationFrame(scrollToBuilder) }
  const toggleAddon = (id) => setSelectedAddons((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  const submit = () => {
    const saved = { id: `CL-${new Date().getFullYear().toString().slice(-2)}${String(Math.floor(10000 + Math.random() * 90000))}`, campus, housing, addons: selectedAddons, ...form }
    setReservation(saved); try { localStorage.setItem(STORAGE_KEY, JSON.stringify(saved)) } catch { /* confirmation still works */ }
    setStep(4); window.dispatchEvent(new CustomEvent('campus-loop:event', { detail: { name: 'reservation_submitted', campus } })); requestAnimationFrame(scrollToBuilder)
  }
  const reset = () => { setStep(1); setSelectedAddons([]); setForm({ date: campuses[campus].dates[1], time: '10:00–12:00', name: '', email: '', line: '', agree: false }); setShowReservation(false); requestAnimationFrame(scrollToBuilder) }
  const cycleLanguage = () => setLang(languages[(languages.indexOf(lang) + 1) % languages.length])

  return (
    <div id="top">
      <Header t={t} onLanguage={cycleLanguage} onReservation={() => reservation ? setShowReservation(true) : scrollToBuilder()} />
      <main>
        <section className="hero">
          <div className="hero-copy"><h1>{t.hero.split('\n').map((line) => <span key={line}>{line}</span>)}</h1><p>{t.heroBody}</p><div className="hero-actions"><button className="button button-primary" onClick={scrollToBuilder}>{t.build}</button><a href="#inside">{t.see}</a></div></div>
          <div className="hero-visual"><span className="route-line" aria-hidden="true" /><img src="/assets/dorm-essentials.png" alt="Semester kit with drying rack, storage baskets, hangers, mirror, dining set, and cleaning kit" /></div>
        </section>

        <section className="builder" ref={builderRef} aria-labelledby="builder-title">
          {step < 4 && <div className="builder-head"><h2 id="builder-title">{t.builder}</h2><Steps step={step} t={t} /></div>}
          {step === 1 && <CampusStep campus={campus} setCampus={setCampus} housing={housing} setHousing={setHousing} t={t} next={() => go(2)} />}
          {step === 2 && <KitStep selectedAddons={selectedAddons} toggleAddon={toggleAddon} t={t} back={() => go(1)} next={() => go(3)} />}
          {step === 3 && <PickupStep campus={campus} form={form} setForm={setForm} selectedAddons={selectedAddons} t={t} back={() => go(2)} submit={submit} />}
          {step === 4 && reservation && <Success reservation={reservation} t={t} onReset={reset} />}
        </section>

        <section className="timeline" id="how" aria-label={t.how}>
          {t.timeline.map((label, i) => { const Icon = [PackageCheck, Clock3, RotateCcw][i]; return <div className="timeline-item" key={label}><span className="timeline-icon"><Icon size={29} strokeWidth={1.5} /></span><strong>{i + 1}</strong><p>{label}</p></div> })}
        </section>
      </main>
      <footer><Logo /><p>© 2026 Campus Loop · Taipei pilot</p></footer>
      {showReservation && reservation && <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setShowReservation(false)}><Success reservation={reservation} t={t} onReset={reset} onClose={() => setShowReservation(false)} /></div>}
    </div>
  )
}

export default App
