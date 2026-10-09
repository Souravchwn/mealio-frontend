/**
 * Tenant isolation test: an admin of mess A must never read or change mess B.
 *
 *   npm run dev            (in another terminal)
 *   npm run test:isolation
 *
 * Creates two throw-away messes directly in the database (no sign-up rate
 * limits involved), signs in as the admin of mess A through the real API, and
 * attacks every ID-based route with mess B's IDs. Cleans up afterwards.
 * Exit code 1 if any attack succeeds.
 */
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'
import { randomBytes } from 'node:crypto'

const BASE = process.env.TEST_BASE_URL || 'http://localhost:3000'
const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL) })
const tag = randomBytes(4).toString('hex')
const PASSWORD = `Isolation-${tag}-pass`

let failures = 0
const results = []
function check(name, ok, info = '') {
  results.push({ name, ok, info })
  if (!ok) failures++
}

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

async function makeMess(label) {
  const passwordHash = await bcrypt.hash(PASSWORD, 10)
  const mess = await prisma.mess.create({
    data: {
      name: `Isolation ${label} ${tag}`,
      inviteCode: `ISO-${label}-${tag}`.toUpperCase(),
      cutOffTime: new Date('1970-01-01T21:00:00Z'),
      requireJoinApproval: false,
    },
  })
  const admin = await prisma.member.create({
    data: { messId: mess.id, name: `Admin ${label}`, email: `iso-${label}-admin-${tag}@test.invalid`, passwordHash, role: 'ADMIN' },
  })
  const member = await prisma.member.create({
    data: { messId: mess.id, name: `Member ${label}`, email: `iso-${label}-member-${tag}@test.invalid`, passwordHash, role: 'MEMBER' },
  })
  const pending = await prisma.member.create({
    data: { messId: mess.id, name: `Pending ${label}`, email: `iso-${label}-pending-${tag}@test.invalid`, passwordHash, role: 'MEMBER', isActive: false, joinStatus: 'PENDING' },
  })
  await prisma.mess.update({ where: { id: mess.id }, data: { ownerId: admin.id } })
  return { mess, admin, member, pending }
}

async function login(email) {
  const r = await api('/api/auth/login', { method: 'POST', body: { email, password: PASSWORD } })
  if (!r.json?.access_token) throw new Error(`login failed for ${email}: ${r.status} ${JSON.stringify(r.json)}`)
  return r.json.access_token
}

// 1x1 PNG used as a stand-in memo photo
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

const denied = (s) => s === 401 || s === 403 || s === 404

try {
  const A = await makeMess('a')
  const B = await makeMess('b')
  const tokenA = await login(A.admin.email)
  const tokenB = await login(B.admin.email)

  // Data that belongs to mess B
  const sessionB = await api('/api/expenses/sessions', {
    method: 'POST', token: tokenB,
    body: { date: new Date().toISOString().slice(0, 10), items: [{ category: 'PROTEIN', amount: 500, description: 'B fish' }], shoppers: [] },
  })
  const sessionBId = sessionB.json?.id
  const depositB = await api('/api/contributions', {
    method: 'POST', token: tokenB,
    body: { member_id: B.member.id, amount: 1000, date: new Date().toISOString().slice(0, 10) },
  })
  const depositBId = depositB.json?.id
  const ticketB = await api('/api/support/tickets', {
    method: 'POST', token: tokenB, body: { category: 'OTHER', subject: 'Private B ticket', message: 'Only mess B should see this.' },
  })
  const ticketBId = ticketB.json?.id
  check('setup: mess B data created', !!(sessionBId && depositBId && ticketBId), JSON.stringify({ sessionBId, depositBId, ticketBId }))

  // A memo-total trip with a photo in mess B
  const memoSessionB = await api('/api/expenses/sessions', {
    method: 'POST', token: tokenB,
    body: { date: new Date().toISOString().slice(0, 10), mode: 'MEMO_TOTAL', total: 750, memos: [{ data: PNG_B64 }], shoppers: [] },
  })
  const memoSessionBId = memoSessionB.json?.id
  const memoBId = memoSessionB.json?.memos?.[0]?.id
  check('setup: memo trip created in mess B', memoSessionB.status === 201 && !!memoBId && memoSessionB.json?.total === 750, `status ${memoSessionB.status}`)

  const today = new Date().toISOString().slice(0, 10)

  // ── Memo photos ──
  let r = await api(`/api/expenses/sessions/${memoSessionBId}/memos/${memoBId}`, { token: tokenA })
  check('read B memo photo', denied(r.status), `status ${r.status}`)
  r = await api(`/api/expenses/sessions/${memoSessionBId}/memos/${memoBId}`, { token: tokenB })
  check('B can read its own memo photo', r.status === 200)
  r = await api(`/api/expenses/sessions/${memoSessionBId}/memos`, { method: 'POST', token: tokenA, body: { memos: [{ data: PNG_B64 }] } })
  check('add photo to B trip', denied(r.status), `status ${r.status}`)
  r = await api('/api/expenses/sessions', { method: 'POST', token: tokenA, body: { date: today, mode: 'MEMO_TOTAL', total: 100, memos: [{ data: Buffer.from('not an image at all').toString('base64') }], shoppers: [] } })
  check('non-image upload rejected', r.status === 400, `status ${r.status}`)
  r = await api('/api/expenses/sessions', { method: 'POST', token: tokenA, body: { date: today, mode: 'MEMO_TOTAL', total: 100, memos: [], shoppers: [] } })
  check('memo trip without photo rejected', r.status === 400, `status ${r.status}`)
  r = await api('/api/expenses/sessions', { method: 'POST', token: tokenA, body: { date: today, mode: 'MEMO_TOTAL', memos: [{ data: PNG_B64 }], shoppers: [] } })
  check('memo trip without total rejected', r.status === 400, `status ${r.status}`)
  r = await api('/api/expenses/sessions', { method: 'POST', token: await login(A.member.email), body: { date: today, mode: 'MEMO_TOTAL', total: 100, memos: [{ data: PNG_B64 }], shoppers: [] } })
  check('plain member cannot add a trip', denied(r.status), `status ${r.status}`)

  // ── Reads ──
  r = await api(`/api/expenses/sessions/${sessionBId}`, { token: tokenA })
  check('read B bazaar session', denied(r.status), `status ${r.status}`)

  r = await api(`/api/members?mess_id=${B.mess.id}`, { token: tokenA })
  check('list members with ?mess_id=B returns only A', r.status === 200 && !JSON.stringify(r.json).includes(B.member.id))

  r = await api(`/api/admin/matrix?mess_id=${B.mess.id}`, { token: tokenA })
  check('matrix with ?mess_id=B stays on A', r.status === 200 && r.json?.mess_id === A.mess.id)

  r = await api(`/api/expenses/sessions?mess_id=${B.mess.id}`, { token: tokenA })
  check('bazaar list with ?mess_id=B shows nothing from B', r.status === 200 && !JSON.stringify(r.json).includes(sessionBId))

  r = await api(`/api/meals/today?member_id=${B.member.id}`, { token: tokenA })
  check('read B member meals', denied(r.status), `status ${r.status}`)

  r = await api(`/api/support/tickets/${ticketBId}`, { token: tokenA })
  check('read B support ticket', denied(r.status), `status ${r.status}`)

  r = await api('/api/members/pending', { token: tokenA })
  check('pending list has no B requests', r.status === 200 && !JSON.stringify(r.json).includes(B.pending.id))

  // ── Writes ──
  r = await api(`/api/expenses/sessions/${sessionBId}`, { method: 'PUT', token: tokenA, body: { note: 'hacked' } })
  check('edit B bazaar session', denied(r.status), `status ${r.status}`)

  r = await api(`/api/expenses/sessions/${sessionBId}`, { method: 'DELETE', token: tokenA, body: { reason: 'hacked' } })
  check('void B bazaar session', denied(r.status), `status ${r.status}`)

  r = await api(`/api/contributions/${depositBId}`, { method: 'DELETE', token: tokenA, body: { reason: 'hacked' } })
  check('void B deposit', denied(r.status), `status ${r.status}`)

  r = await api('/api/meals/toggle', { method: 'POST', token: tokenA, body: { member_id: B.member.id, date: today, slot: 'dinner', status: false } })
  check('toggle B member meal', denied(r.status), `status ${r.status}`)

  r = await api('/api/meals/guest', { method: 'POST', token: tokenA, body: { member_id: B.member.id, date: today, slot: 'lunch', guest_count: 5 } })
  check('add guests to B member', denied(r.status), `status ${r.status}`)

  r = await api('/api/admin/meals', { method: 'PUT', token: tokenA, body: { member_id: B.member.id, date: today, slot: 'lunch', count: 0 } })
  check('admin-edit B member meal', denied(r.status), `status ${r.status}`)

  r = await api(`/api/members/${B.member.id}`, { method: 'PUT', token: tokenA, body: { role: 'ADMIN' } })
  check('change B member role', denied(r.status), `status ${r.status}`)

  r = await api(`/api/members/${B.member.id}/reset-code`, { method: 'POST', token: tokenA })
  check('issue reset code for B member', denied(r.status), `status ${r.status}`)

  r = await api(`/api/members/${B.pending.id}/join`, { method: 'POST', token: tokenA, body: { decision: 'approve' } })
  check('approve B join request', denied(r.status), `status ${r.status}`)

  r = await api('/api/contributions', { method: 'POST', token: tokenA, body: { member_id: B.member.id, amount: 1, date: today } })
  check('record deposit for B member', denied(r.status), `status ${r.status}`)

  r = await api('/api/expenses', { method: 'POST', token: tokenA, body: { mess_id: B.mess.id, amount: 9999, category: 'OTHER', date: today } })
  const bExpenses = await prisma.expense.count({ where: { messId: B.mess.id, amount: 9999 } })
  check('expense with mess_id=B lands in A, not B', bExpenses === 0, `status ${r.status}`)

  r = await api('/api/admin/close-month', { method: 'POST', token: tokenA, body: { mess_id: B.mess.id, year_month: today.slice(0, 7) } })
  const bClosed = await prisma.messMonth.count({ where: { messId: B.mess.id, isClosed: true } })
  check('close-month with mess_id=B never closes B', bClosed === 0, `status ${r.status}`)

  r = await api(`/api/mess/${B.mess.id}/switch`, { token: tokenA })
  check('switch into mess B', denied(r.status), `status ${r.status}`)

  // ── Role and token boundaries ──
  const tokenMemberA = await login(A.member.email)
  r = await api(`/api/members/${A.admin.id}`, { method: 'PUT', token: tokenMemberA, body: { is_active: false } })
  check('member cannot deactivate their admin', denied(r.status), `status ${r.status}`)

  r = await api('/api/platform/stats', { token: tokenA })
  check('mess admin token cannot open the platform console', denied(r.status), `status ${r.status}`)

  r = await api('/api/auth/login', { method: 'POST', body: { email: A.pending.email, password: PASSWORD } })
  check('pending member cannot sign in', r.status === 403 && r.json?.code === 'PENDING_APPROVAL', `status ${r.status}`)

  await prisma.mess.update({ where: { id: B.mess.id }, data: { suspendedAt: new Date(), suspendedReason: 'test' } })
  r = await api('/api/members/me', { token: tokenB })
  check('suspended mess token stops working', denied(r.status), `status ${r.status}`)
} catch (err) {
  console.error(err)
  failures++
} finally {
  // Clean up everything this run created
  const messes = await prisma.mess.findMany({ where: { name: { endsWith: tag } }, select: { id: true } })
  const messIds = messes.map((m) => m.id)
  const emails = { endsWith: `${tag}@test.invalid` }
  await prisma.supportTicket.deleteMany({ where: { OR: [{ messId: { in: messIds } }, { email: emails }] } })
  await prisma.securityEvent.deleteMany({ where: { OR: [{ messId: { in: messIds } }, { email: emails }] } })
  await prisma.auditLog.deleteMany({ where: { messId: { in: messIds } } })
  await prisma.mess.deleteMany({ where: { id: { in: messIds } } })
  await prisma.$disconnect()
}

for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : `  (${r.info})`}`)
console.log(`\n${results.length - failures}/${results.length} passed`)
process.exit(failures ? 1 : 0)
