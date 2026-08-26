import { useCallback, useEffect, useMemo, useState } from 'react'
import { PayPalButtons, PayPalScriptProvider } from '@paypal/react-paypal-js'
import {
  ArrowLeft, CheckCircle2, ChevronLeft, ChevronRight, ClipboardList,
  CreditCard, LogOut, PackageCheck, RefreshCw, RotateCcw, Search, ShieldCheck, Users,
  X,
} from 'lucide-react'
import { adminApi } from './admin-api.js'
import './admin.css'

const PAYMENT = ['pending', 'created', 'completed']
const FULFILLMENT = ['pending', 'ready', 'collected', 'returned', 'cancelled']
const REFUND = ['not_due', 'pending', 'completed', 'failed']
const STATUS_LABEL = {
  pending: '대기', created: '주문 생성', completed: '완료', ready: '수령 준비',
  collected: '수령', returned: '반납', cancelled: '취소', not_due: '해당 없음', failed: '실패',
}

function dateTime(value) {
  if (!value) return '—'
  return new window.Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function Status({ value }) {
  return <span className={`admin-status admin-status--${value}`}>{STATUS_LABEL[value] || value}</span>
}

function Login({ onLogin }) {
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await onLogin(username, password)
      setPassword('')
    } catch (nextError) {
      setError(nextError.status === 429 ? '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.' : '아이디 또는 비밀번호를 확인해 주세요.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="admin-login">
      <section className="admin-login__panel">
        <div className="admin-kicker"><ShieldCheck size={15} /> CAMPUS LOOP / OPS</div>
        <h1>운영 백오피스</h1>
        <p>신청, 결제, 수령, 반납과 보증금 환급 상태를 한곳에서 관리합니다.</p>
        <form onSubmit={submit}>
          <label>아이디<input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required /></label>
          <label>비밀번호<input autoComplete="current-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoFocus /></label>
          {error && <p className="admin-error" role="alert">{error}</p>}
          <button className="admin-button admin-button--primary" disabled={busy}>{busy ? '확인 중…' : '로그인'}</button>
        </form>
        <a href="/" className="admin-back"><ArrowLeft size={15} /> 웹사이트로 돌아가기</a>
      </section>
    </main>
  )
}

function Editor({ item, onClose, onSave, busy }) {
  const [form, setForm] = useState(() => ({
    customerName: item.customerName,
    customerEmail: item.customerEmail,
    secondaryContact: item.secondaryContact || '',
    paymentStatus: item.paymentStatus,
    fulfillmentStatus: item.fulfillmentStatus,
    refundStatus: item.refundStatus,
    adminNotes: item.adminNotes || '',
  }))
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }))
  return (
    <div className="admin-drawer-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="admin-drawer" aria-label="신청 상세 편집">
        <header><div><span className="admin-eyebrow">RENTAL INTAKE</span><h2>{item.id}</h2></div><button className="admin-icon-button" onClick={onClose} aria-label="닫기"><X /></button></header>
        <div className="admin-drawer__meta"><span>신청 {dateTime(item.createdAt)}</span><span>동의 {dateTime(item.consentAt)}</span></div>
        <form onSubmit={(event) => { event.preventDefault(); onSave({ ...form, secondaryContact: form.secondaryContact || null }) }}>
          <div className="admin-field-grid">
            <label>이름<input value={form.customerName} onChange={set('customerName')} required maxLength={120} /></label>
            <label>이메일<input type="email" value={form.customerEmail} onChange={set('customerEmail')} required maxLength={320} /></label>
          </div>
          <label>보조 연락처<input value={form.secondaryContact} onChange={set('secondaryContact')} maxLength={160} /></label>
          <div className="admin-field-grid">
            <label>결제 상태<select value={form.paymentStatus} onChange={set('paymentStatus')}>{PAYMENT.map((value) => <option key={value} value={value}>{STATUS_LABEL[value]}</option>)}</select></label>
            <label>운영 상태<select value={form.fulfillmentStatus} onChange={set('fulfillmentStatus')}>{FULFILLMENT.map((value) => <option key={value} value={value}>{STATUS_LABEL[value]}</option>)}</select></label>
            <label>환급 상태<select value={form.refundStatus} onChange={set('refundStatus')}>{REFUND.map((value) => <option key={value} value={value}>{STATUS_LABEL[value]}</option>)}</select></label>
          </div>
          <div className="admin-readonly">
            <div><span>PayPal Order</span><code>{item.paypalOrderId || '—'}</code></div>
            <div><span>PayPal Capture</span><code>{item.paypalCaptureId || '—'}</code></div>
            <div><span>결제 확인 시각</span><strong>{dateTime(item.paidAt)}</strong></div>
          </div>
          <label>운영 메모<textarea value={form.adminNotes} onChange={set('adminNotes')} maxLength={2000} rows={6} placeholder="수령 위치, 특이사항, 환급 확인 등" /><small>{form.adminNotes.length} / 2,000</small></label>
          <p className="admin-warning">결제 상태 수동 변경을 포함한 모든 수정은 관리자와 변경 전·후 값이 감사 로그에 기록됩니다.</p>
          <button className="admin-button admin-button--primary" disabled={busy}>{busy ? '저장 중…' : '변경사항 저장'}</button>
        </form>
      </aside>
    </div>
  )
}

function PayPalTestPanel({ session }) {
  const [config, setConfig] = useState(null)
  const [tests, setTests] = useState([])
  const [processing, setProcessing] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const [nextConfig, nextTests] = await Promise.all([adminApi.paypalConfig(), adminApi.paypalTests()])
      setConfig(nextConfig)
      setTests(nextTests.items)
    } catch (nextError) {
      setError(nextError.message)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const options = useMemo(() => config ? {
    clientId: config.clientId,
    currency: 'USD',
    intent: 'capture',
    components: 'buttons',
    disableFunding: 'venmo',
  } : null, [config])

  return (
    <section className="admin-panel admin-paypal-test">
      <div className="admin-panel__heading">
        <div><span className="admin-eyebrow">PAYMENT VERIFICATION</span><h2>PayPal $1 결제 테스트</h2></div>
        <strong className={`admin-env admin-env--${config?.environment || 'loading'}`}>{config?.environment || '확인 중'}</strong>
      </div>
      <div className="admin-paypal-test__grid">
        <div className="admin-paypal-test__checkout">
          <CreditCard />
          <div><h3>$1.00 USD</h3><p>PayPal 지갑 또는 카드로 실제 주문·승인·캡처 경로를 검증합니다. 카드 결제는 PayPal 로그인 없이 진행할 수 있으며, PayPal이 카드사 확인을 위해 청구 주소나 우편번호를 요청할 수 있습니다. 침구 신청 데이터는 생성되지 않습니다.</p></div>
          {config?.environment === 'production' && <p className="admin-warning"><b>LIVE 결제입니다.</b> 버튼을 완료하면 실제로 $1가 청구되고 PayPal 수수료가 발생할 수 있습니다.</p>}
          {options && <div className="admin-paypal-test__button"><PayPalScriptProvider options={options}>
              <PayPalButtons
                disabled={processing}
                style={{ layout: 'vertical', shape: 'rect', height: 42, label: 'paypal' }}
                createOrder={async () => {
                  setError('')
                  setMessage('')
                  const result = await adminApi.createPayPalTestOrder(session.csrfToken)
                  return result.orderId
                }}
                onApprove={async (data) => {
                  setProcessing(true)
                  setError('')
                  setMessage('')
                  try {
                    const result = await adminApi.capturePayPalTestOrder(data.orderID, session.csrfToken)
                    if (result.status !== 'COMPLETED') throw new Error('Payment was not completed')
                    setMessage(`결제 완료 · ${result.orderId}`)
                    await load()
                  } catch (nextError) {
                    setError(nextError.message || '결제 완료 상태를 확인하지 못했습니다.')
                  } finally {
                    setProcessing(false)
                  }
                }}
                onCancel={() => setError('PayPal 결제가 취소되었습니다.')}
                onError={() => setError('PayPal 결제를 처리하지 못했습니다.')}
              />
          </PayPalScriptProvider></div>}
          {processing && <p className="admin-paypal-test__status" role="status">PayPal 결제 완료 상태를 확인하고 있습니다…</p>}
          {message && <p className="admin-paypal-test__success" role="status">{message}</p>}
          {error && <p className="admin-error" role="alert">{error}</p>}
        </div>
        <div className="admin-paypal-test__history">
          <h3>최근 테스트</h3>
          {tests.map((test) => <article key={test.id}>
            <div><Status value={test.status} /><code>{test.id}</code></div>
            <strong>{test.amount} {test.currency}</strong>
            <span>{dateTime(test.paidAt || test.createdAt)}</span>
            <code>{test.paypalOrderId}</code>
          </article>)}
          {tests.length === 0 && <div className="admin-empty">아직 결제 테스트 기록이 없습니다.</div>}
        </div>
      </div>
    </section>
  )
}

export default function AdminApp() {
  const [session, setSession] = useState(null)
  const [checking, setChecking] = useState(true)
  const [overview, setOverview] = useState(null)
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [audit, setAudit] = useState([])
  const [selected, setSelected] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [filters, setFilters] = useState({ q: '', paymentStatus: '', fulfillmentStatus: '', refundStatus: '' })
  const [applied, setApplied] = useState(filters)
  const [offset, setOffset] = useState(0)
  const limit = 50

  useEffect(() => {
    document.body.classList.add('admin-page')
    adminApi.session().then(setSession).catch(() => setSession(null)).finally(() => setChecking(false))
    return () => document.body.classList.remove('admin-page')
  }, [])

  const load = useCallback(async () => {
    if (!session) return
    setBusy(true)
    setError('')
    try {
      const [overviewData, intakesData, auditData] = await Promise.all([
        adminApi.overview(),
        adminApi.intakes({ ...applied, limit: String(limit), offset: String(offset) }),
        adminApi.audit(),
      ])
      setOverview(overviewData)
      setItems(intakesData.items)
      setTotal(intakesData.total)
      setAudit(auditData.items)
    } catch (nextError) {
      if (nextError.status === 401) setSession(null)
      else setError(nextError.message)
    } finally {
      setBusy(false)
    }
  }, [session, applied, offset])

  useEffect(() => { load() }, [load])

  const cards = useMemo(() => overview ? [
    ['전체 신청', overview.total, Users], ['결제 완료', overview.paid, CheckCircle2],
    ['수령 준비', overview.ready, PackageCheck], ['수령 완료', overview.collected, ClipboardList],
    ['반납 완료', overview.returned, RotateCcw], ['환급 대기', overview.refundsPending, RefreshCw],
  ] : [], [overview])

  async function login(username, password) {
    const next = await adminApi.login(username, password)
    setSession(next)
  }

  async function logout() {
    try { await adminApi.logout(session.csrfToken) } finally { setSession(null) }
  }

  async function save(update) {
    setBusy(true)
    setError('')
    try {
      const result = await adminApi.updateIntake(selected.id, update, session.csrfToken)
      setSelected(result.item)
      await load()
      setSelected(null)
    } catch (nextError) {
      setError(nextError.message)
    } finally {
      setBusy(false)
    }
  }

  if (checking) return <div className="admin-loading"><RefreshCw className="spin" /> 인증 확인 중</div>
  if (!session) return <Login onLogin={login} />

  return (
    <main className="admin-shell">
      <header className="admin-topbar">
        <div><span className="admin-kicker">CAMPUS LOOP / OPERATIONS</span><h1>렌탈 운영 대시보드</h1></div>
        <div className="admin-topbar__actions"><span><ShieldCheck size={15} /> {session.username}</span><button className="admin-button" onClick={load} disabled={busy}><RefreshCw size={15} className={busy ? 'spin' : ''} /> 새로고침</button><button className="admin-icon-button" onClick={logout} aria-label="로그아웃"><LogOut /></button></div>
      </header>

      {error && <div className="admin-alert" role="alert">{error}</div>}
      <section className="admin-metrics" aria-label="운영 현황">
        {cards.map(([label, value, Icon]) => <article key={label}><Icon /><span>{label}</span><strong>{value}</strong></article>)}
      </section>

      <PayPalTestPanel session={session} />

      <section className="admin-panel">
        <div className="admin-panel__heading"><div><span className="admin-eyebrow">CUSTOMER LEDGER</span><h2>신청 및 운영 현황</h2></div><strong>{total}건</strong></div>
        <form className="admin-filters" onSubmit={(event) => { event.preventDefault(); setOffset(0); setApplied(filters) }}>
          <label className="admin-search"><Search size={17} /><input aria-label="신청 검색" placeholder="이름, 이메일, 연락처, 신청 ID" value={filters.q} onChange={(event) => setFilters({ ...filters, q: event.target.value })} /></label>
          <select aria-label="결제 상태" value={filters.paymentStatus} onChange={(event) => setFilters({ ...filters, paymentStatus: event.target.value })}><option value="">결제 전체</option>{PAYMENT.map((value) => <option key={value} value={value}>{STATUS_LABEL[value]}</option>)}</select>
          <select aria-label="운영 상태" value={filters.fulfillmentStatus} onChange={(event) => setFilters({ ...filters, fulfillmentStatus: event.target.value })}><option value="">운영 전체</option>{FULFILLMENT.map((value) => <option key={value} value={value}>{STATUS_LABEL[value]}</option>)}</select>
          <select aria-label="환급 상태" value={filters.refundStatus} onChange={(event) => setFilters({ ...filters, refundStatus: event.target.value })}><option value="">환급 전체</option>{REFUND.map((value) => <option key={value} value={value}>{STATUS_LABEL[value]}</option>)}</select>
          <button className="admin-button admin-button--dark">조회</button>
        </form>
        <div className="admin-table-wrap">
          <table><thead><tr><th>고객 / 신청 ID</th><th>연락처</th><th>결제</th><th>운영</th><th>환급</th><th>신청 시각</th><th></th></tr></thead>
            <tbody>{items.map((item) => <tr key={item.id}><td><strong>{item.customerName}</strong><code>{item.id}</code></td><td><a href={`mailto:${item.customerEmail}`}>{item.customerEmail}</a><span>{item.secondaryContact || '보조 연락처 없음'}</span></td><td><Status value={item.paymentStatus} /></td><td><Status value={item.fulfillmentStatus} /></td><td><Status value={item.refundStatus} /></td><td>{dateTime(item.createdAt)}</td><td><button className="admin-button" onClick={() => setSelected(item)}>상세 / 편집</button></td></tr>)}</tbody>
          </table>
          {!busy && items.length === 0 && <div className="admin-empty">조건에 맞는 신청이 없습니다.</div>}
        </div>
        <footer className="admin-pagination"><span>{total ? `${offset + 1}–${Math.min(offset + limit, total)} / ${total}` : '0건'}</span><div><button className="admin-icon-button" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))} aria-label="이전 페이지"><ChevronLeft /></button><button className="admin-icon-button" disabled={offset + limit >= total} onClick={() => setOffset(offset + limit)} aria-label="다음 페이지"><ChevronRight /></button></div></footer>
      </section>

      <section className="admin-panel admin-audit">
        <div className="admin-panel__heading"><div><span className="admin-eyebrow">IMMUTABLE TRAIL</span><h2>최근 변경 로그</h2></div></div>
        <div className="admin-audit__list">{audit.map((entry) => <article key={entry.id}><span>{dateTime(entry.createdAt)}</span><strong>{entry.intakeId}</strong><p><b>{entry.actor}</b> 관리자가 운영 정보를 수정했습니다.</p></article>)}{audit.length === 0 && <div className="admin-empty">아직 관리자 변경 기록이 없습니다.</div>}</div>
      </section>
      {selected && <Editor item={selected} onClose={() => setSelected(null)} onSave={save} busy={busy} />}
    </main>
  )
}
