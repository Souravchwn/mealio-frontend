/**
 * Closed-month integrity test: once a month is closed, nobody can change it, and everyone can see it.
 *
 *   npm run dev            (in another terminal)
 *   npm run test:closed
 *
 * Builds a throw-away mess with a finished month (meals, bazaar, deposits), closes it through the real
 * API, then tries to tamper with it every way we know: editing or voiding records, adding records dated
 * inside it, closing it again, flipping settings, removing members. The archive must stay identical.
 * Also checks who may read the archive. Cleans up after itself. Exit code 1 if anything slips through.
 */
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'
import { randomBytes } from 'node:crypto'

const BASE = process.env.TEST_BASE_URL || 'http://localhost:3000'
const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL) })
const tag = randomBytes(4).toString('hex')
const PASSWORD = `Closed-${tag}-pass`
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

let failures = 0
const results = []
const check = (name, ok, info = '') => { results.push({ name, ok, info }); if (!ok) failures++ }
const blocked = (name, r) => check(name, r.status >= 400 && r.status < 500, `status ${r.status}`)

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  let json = null
  try { json = await res.json() } catch { /* empty */ }
  return { status: res.status, json }
}
async function login(email) {
  const r = await api('/api/auth/login', { method: 'POST', body: { email, password: PASSWORD } })
  if (!r.json?.access_token) throw new Error(`login failed for ${email}: ${r.status}`)
  return r.json.access_token
}

const hash = await bcrypt.hash(PASSWORD, 10)
const day = (s) => new Date(`${s}T00:00:00.000Z`)

async function makeMess(label, { withMonth }) {
  const mess = await prisma.mess.create({
    data: { name: `Closed ${label} ${tag}`, inviteCode: `CLS-${label}-${tag}`.toUpperCase(), cutOffTime: new Date('1970-01-01T21:00:00Z'), requireJoinApproval: false, weekendDays: '5,6' },
  })
  const mk = (name, role) => prisma.member.create({
    data: { messId: mess.id, name, email: `cl-${label}-${name.toLowerCase()}-${tag}@test.invalid`, passwordHash: hash, role, joinedAt: day('2025-12-01') },
  })
  const admin = await mk('Admin', 'ADMIN')
  const alice = await mk('Alice', 'MEMBER')
  const bob = await mk('Bob', 'MEMBER')
  await prisma.mess.update({ where: { id: mess.id }, data: { ownerId: admin.id } })
  await prisma.mealConfig.createMany({ data: ['BREAKFAST', 'LUNCH', 'DINNER'].map((m) => ({ messId: mess.id, mealType: m, cutoffTime: new Date('1970-01-01T21:00:00Z'), enabled: true, maxCount: 10 })) })

  if (withMonth) {
    // January 2026: long finished
    await prisma.messMonth.create({ data: { messId: mess.id, yearMonth: '2026-01', startDate: day('2026-01-01'), endDate: day('2026-01-31'), isClosed: false } })
    const logs = []
    for (let d = 1; d <= 31; d++) {
      for (const m of [admin, alice, bob]) {
        logs.push({ messId: mess.id, memberId: m.id, logDate: day(`2026-01-${String(d).padStart(2, '0')}`), breakfastCount: 0, lunchCount: 1, dinnerCount: m === bob ? 0 : 1, guestCount: 0, isOverride: true, overrideType: 'ADMIN' })
      }
    }
    await prisma.dailyLog.createMany({ data: logs })
    const session = await prisma.bazaarSession.create({
      data: { messId: mess.id, sessionDate: day('2026-01-05'), yearMonth: '2026-01', shoppers: [{ id: alice.id, name: 'Alice' }], createdBy: admin.id },
    })
    const expense = await prisma.expense.create({
      data: { messId: mess.id, addedBy: alice.id, sessionId: session.id, amount: 3100, category: 'OTHER', description: 'Bazaar', expenseDate: day('2026-01-05'), yearMonth: '2026-01' },
    })
    await prisma.ledgerEntry.createMany({
      data: [
        { messId: mess.id, memberId: admin.id, entryType: 'CONTRIBUTION', amount: 2000, createdBy: admin.id, createdAt: new Date('2026-01-02T12:00:00Z') },
        { messId: mess.id, memberId: alice.id, entryType: 'CONTRIBUTION', amount: 1500, createdBy: admin.id, createdAt: new Date('2026-01-03T12:00:00Z') },
        { messId: mess.id, memberId: bob.id, entryType: 'CONTRIBUTION', amount: 1000, createdBy: admin.id, createdAt: new Date('2026-01-04T12:00:00Z') },
      ],
    })
    const deposit = await prisma.ledgerEntry.findFirst({ where: { messId: mess.id, entryType: 'CONTRIBUTION', memberId: alice.id } })
    return { mess, admin, alice, bob, session, expense, deposit }
  }
  return { mess, admin, alice, bob }
}

try {
  const A = await makeMess('a', { withMonth: true })
  const B = await makeMess('b', { withMonth: false })
  const tAdmin = await login(A.admin.email)
  const tAlice = await login(A.alice.email)
  const tBAdmin = await login(B.admin.email)

  // Close it through the real API
  const closed = await api('/api/admin/close-month', { method: 'POST', token: tAdmin, body: { year_month: '2026-01' } })
  check('month closes', closed.status === 200, `status ${closed.status} ${JSON.stringify(closed.json)}`)
  // 186 meals (31 days × (2 + 2 + 1)... = 155), expense 3100
  check('closing returns the rate', closed.json?.total_meals === 155 && Math.abs(closed.json?.meal_rate - 20) < 1e-9, JSON.stringify(closed.json))

  const snapshotOf = async () => {
    const r = await api('/api/archive/2026-01', { token: tAlice })
    return JSON.stringify({ totals: r.json?.totals, members: r.json?.members?.map((m) => [m.name, m.billable_meals, m.meal_cost, m.deposited, m.balance]) })
  }
  const before = await snapshotOf()

  // ── Who can see it ──
  let r = await api('/api/archive', { token: tAlice })
  check('a plain member can list closed months', r.status === 200 && r.json?.periods?.length === 1)
  r = await api('/api/archive/2026-01', { token: tAlice })
  check('a plain member can open a closed month', r.status === 200 && r.json?.totals?.total_expense === 3100 && r.json?.members?.length === 3)
  check('the day grid adds up to the meals', r.json?.members?.reduce((s, m) => s + m.daily_meals.reduce((a, b) => a + b, 0), 0) === 155)
  check('the bazaar trip and deposits are listed', r.json?.bazaar?.length === 1 && r.json?.deposits?.length === 3)
  r = await api('/api/archive/2026-01')
  check('anonymous visitors cannot read it', r.status === 401)
  r = await api('/api/archive', { token: tBAdmin })
  check('another mess sees none of it (list)', r.status === 200 && r.json?.periods?.length === 0)
  r = await api('/api/archive/2026-01', { token: tBAdmin })
  check('another mess cannot open it', r.status === 404)
  r = await api('/api/archive/2099-01', { token: tAlice })
  check('a month that does not exist is 404', r.status === 404)

  // ── Tampering with records ──
  blocked('admin edits a closed-day meal', await api('/api/admin/meals', { method: 'PUT', token: tAdmin, body: { member_id: A.bob.id, date: '2026-01-10', slot: 'lunch', value: false } }))
  blocked('member toggles a closed-day meal', await api('/api/meals/toggle', { method: 'POST', token: tAlice, body: { member_id: A.alice.id, date: '2026-01-10', slot: 'lunch', status: false } }))
  blocked('member adds guests on a closed day', await api('/api/meals/guest', { method: 'POST', token: tAlice, body: { member_id: A.alice.id, date: '2026-01-10', guest_count: 4 } }))
  blocked('no-cook on a closed day', await api('/api/admin/no-cook', { method: 'POST', token: tAdmin, body: { action: 'off', date: '2026-01-10' } }))
  blocked('edit a closed bazaar trip', await api(`/api/expenses/sessions/${A.session.id}`, { method: 'PUT', token: tAdmin, body: { items: [{ category: 'OTHER', amount: 1 }] } }))
  blocked('void a closed bazaar trip', await api(`/api/expenses/sessions/${A.session.id}`, { method: 'DELETE', token: tAdmin, body: { reason: 'x' } }))
  blocked('add a memo photo to a closed trip', await api(`/api/expenses/sessions/${A.session.id}/memos`, { method: 'POST', token: tAdmin, body: { memos: [{ data: PNG }] } }))
  blocked('edit a closed expense', await api(`/api/expenses/${A.expense.id}`, { method: 'PUT', token: tAdmin, body: { amount: 1 } }))
  blocked('void a closed expense', await api(`/api/expenses/${A.expense.id}`, { method: 'DELETE', token: tAdmin }))
  blocked('void a closed deposit', await api(`/api/contributions/${A.deposit.id}`, { method: 'DELETE', token: tAdmin, body: { reason: 'x' } }))
  const deduction = await prisma.ledgerEntry.findFirst({ where: { messId: A.mess.id, entryType: 'DEDUCTION' } })
  blocked('void a DEDUCTION ledger row', await api(`/api/contributions/${deduction.id}`, { method: 'DELETE', token: tAdmin, body: { reason: 'x' } }))
  const carry = await prisma.ledgerEntry.findFirst({ where: { messId: A.mess.id, entryType: 'CARRY_FORWARD' } })
  if (carry) blocked('void a CARRY_FORWARD ledger row', await api(`/api/contributions/${carry.id}`, { method: 'DELETE', token: tAdmin, body: { reason: 'x' } }))
  blocked('new deposit dated inside the closed month', await api('/api/contributions', { method: 'POST', token: tAdmin, body: { member_id: A.bob.id, amount: 50, date: '2026-01-20' } }))
  blocked('new bazaar trip dated inside the closed month', await api('/api/expenses/sessions', { method: 'POST', token: tAdmin, body: { date: '2026-01-20', shoppers: [], items: [{ category: 'OTHER', amount: 5 }] } }))
  blocked('new legacy expense dated inside the closed month', await api('/api/expenses', { method: 'POST', token: tAdmin, body: { date: '2026-01-20', amount: 5, category: 'OTHER', description: 'x' } }))
  blocked('close the same month again', await api('/api/admin/close-month', { method: 'POST', token: tAdmin, body: { year_month: '2026-01' } }))
  blocked('a plain member cannot close or edit', await api('/api/admin/close-month', { method: 'POST', token: tAlice, body: { year_month: '2026-01' } }))
  check('nothing above changed the archive', (await snapshotOf()) === before)

  // ── Rewriting history through settings or membership ──
  await api('/api/mess/settings', { method: 'PUT', token: tAdmin, body: { bazaar_counts_as_deposit: true, guest_meal_policy: 'SHARED', carry_forward_balance: false } })
  check('flipping settings does not move a closed month', (await snapshotOf()) === before)
  await api('/api/mess/settings', { method: 'PUT', token: tAdmin, body: { bazaar_counts_as_deposit: false, guest_meal_policy: 'HOST', carry_forward_balance: true } })
  await api(`/api/members/${A.bob.id}`, { method: 'PUT', token: tAdmin, body: { is_active: false } })
  check('a member leaving does not change a closed month', (await snapshotOf()) === before)
  r = await api('/api/admin/matrix?year_month=2026-01', { token: tAdmin })
  check('the closed matrix still lists the member who left', r.json?.members?.length === 3, `members ${r.json?.members?.length}`)
  const matrixBal = r.json?.members?.find((m) => m.member_name === 'Alice')?.balance
  check('the closed matrix matches the archive', Math.abs(matrixBal - 20 * 0 - JSON.parse(before).members.find((m) => m[0] === 'Alice')[4]) < 1e-9)

  // Deleting an account removes the name from the archive, keeps the numbers
  await api('/api/me', { method: 'DELETE', token: tAlice, body: { password: PASSWORD } })
  r = await api('/api/archive/2026-01', { token: tAdmin })
  check('a deleted account loses its name but keeps its figures', r.json?.members?.some((m) => m.name === 'Deleted member') && !r.json?.members?.some((m) => m.name === 'Alice') && r.json?.totals?.total_expense === 3100)
} catch (err) {
  console.error(err)
  failures++
} finally {
  const messes = await prisma.mess.findMany({ where: { name: { endsWith: tag } }, select: { id: true } })
  const ids = messes.map((m) => m.id)
  await prisma.securityEvent.deleteMany({ where: { OR: [{ messId: { in: ids } }, { email: { endsWith: `${tag}@test.invalid` } }] } })
  await prisma.supportTicket.deleteMany({ where: { messId: { in: ids } } })
  await prisma.auditLog.deleteMany({ where: { messId: { in: ids } } })
  await prisma.mess.deleteMany({ where: { id: { in: ids } } })
  await prisma.$disconnect()
}

for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : `  (${r.info})`}`)
console.log(`\n${results.length - failures}/${results.length} passed`)
process.exit(failures ? 1 : 0)
