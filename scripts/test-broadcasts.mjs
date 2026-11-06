/**
 * Broadcasts and timezone test.
 *
 *   npm run dev            (in another terminal)
 *   npm run test:broadcasts
 *
 * Covers what replaced the Telegram bot: broadcasts (Settings -> Broadcast, shown on Overview) and
 * the mess timezone (Settings -> Timezone). Creates two throw-away messes directly in the database,
 * signs in through the real API and checks who may send, read and remove, that mess B can never see
 * or touch mess A's broadcasts, the daily limit, expiry, the automatic no-cook notice, and that the
 * old Telegram routes are gone. Cleans up afterwards. Exit code 1 if anything fails.
 */
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'
import { randomBytes } from 'node:crypto'

const BASE = process.env.TEST_BASE_URL || 'http://localhost:3000'
const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL) })
const tag = randomBytes(4).toString('hex')
const PASSWORD = `Broadcast-${tag}-pass`

let failures = 0
const results = []
function check(name, ok, info = '') {
  results.push({ name, ok, info })
  if (!ok) failures++
}

async function api(path, { method = 'GET', token, body, raw } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
  })
  let json = null
  try { json = await res.json() } catch { /* empty */ }
  return { status: res.status, json }
}

async function makeMess(label) {
  const passwordHash = await bcrypt.hash(PASSWORD, 10)
  const mess = await prisma.mess.create({
    data: {
      name: `Broadcast ${label} ${tag}`,
      inviteCode: `BRD-${label}-${tag}`.toUpperCase(),
      cutOffTime: new Date('1970-01-01T21:00:00Z'),
      requireJoinApproval: false,
    },
  })
  const mk = (role, name) => prisma.member.create({
    data: { messId: mess.id, name: `${name} ${label}`, email: `brd-${label}-${role.toLowerCase()}-${tag}@test.invalid`, passwordHash, role },
  })
  const admin = await mk('ADMIN', 'Admin')
  const manager = await mk('MANAGER', 'Manager')
  const member = await mk('MEMBER', 'Member')
  await prisma.mess.update({ where: { id: mess.id }, data: { ownerId: admin.id } })
  return { mess, admin, manager, member }
}

async function login(email) {
  const r = await api('/api/auth/login', { method: 'POST', body: { email, password: PASSWORD } })
  if (!r.json?.access_token) throw new Error(`login failed for ${email}: ${r.status} ${JSON.stringify(r.json)}`)
  return r.json.access_token
}

const list = async (token) => (await api('/api/announcements', { token })).json?.announcements ?? []
const denied = (s) => s === 401 || s === 403 || s === 404

try {
  const A = await makeMess('a')
  const B = await makeMess('b')
  const tokenA = await login(A.admin.email)
  const tokenManagerA = await login(A.manager.email)
  const tokenMemberA = await login(A.member.email)
  const tokenB = await login(B.admin.email)

  // ── Timezone ──────────────────────────────────────────────────────────────
  let r = await api('/api/mess/settings', { token: tokenA })
  check('a new mess starts on Asia/Dhaka', r.status === 200 && r.json?.timezone === 'Asia/Dhaka', JSON.stringify(r.json?.timezone))

  r = await api('/api/mess/settings', { method: 'PUT', token: tokenA, body: { timezone: 'Asia/Kolkata' } })
  check('admin can change the timezone', r.status === 200 && r.json?.timezone === 'Asia/Kolkata', `status ${r.status}`)
  check('the timezone is stored on the mess', (await prisma.mess.findUnique({ where: { id: A.mess.id } })).timezone === 'Asia/Kolkata')

  r = await api('/api/mess/settings', { token: tokenMemberA })
  check('members read the new timezone', r.json?.timezone === 'Asia/Kolkata')

  for (const bad of ['Mars/Phobos', '', '   ', 42, null, 'drop table messes']) {
    r = await api('/api/mess/settings', { method: 'PUT', token: tokenA, body: { timezone: bad } })
    check(`rejects timezone ${JSON.stringify(bad)}`, r.status === 400, `status ${r.status}`)
  }
  check('a rejected timezone changes nothing', (await prisma.mess.findUnique({ where: { id: A.mess.id } })).timezone === 'Asia/Kolkata')

  r = await api('/api/mess/settings', { method: 'PUT', token: tokenManagerA, body: { timezone: 'Europe/London' } })
  check('a manager cannot change the timezone', denied(r.status), `status ${r.status}`)
  r = await api('/api/mess/settings', { method: 'PUT', token: tokenMemberA, body: { timezone: 'Europe/London' } })
  check('a member cannot change the timezone', denied(r.status), `status ${r.status}`)

  r = await api('/api/mess/settings', { token: tokenB })
  check('mess B keeps its own timezone', r.json?.timezone === 'Asia/Dhaka', JSON.stringify(r.json?.timezone))

  r = await api('/api/meals/today', { token: tokenMemberA })
  check('meals/today still works with a mess timezone', r.status === 200, `status ${r.status}`)
  r = await api('/api/cook/headcount', { token: tokenA })
  check('headcount still works with a mess timezone', r.status === 200, `status ${r.status}`)
  r = await api('/api/cook/notes', { token: tokenA })
  check('cook notes read the mess timezone', r.status === 200, `status ${r.status}`)

  // ── Broadcast: who may do what ─────────────────────────────────────────────
  r = await api('/api/announcements')
  check('signed-out visitors cannot read broadcasts', r.status === 401, `status ${r.status}`)
  r = await api('/api/announcements', { method: 'POST', body: { message: 'hi' } })
  check('signed-out visitors cannot send broadcasts', r.status === 401, `status ${r.status}`)

  check('a new mess has no broadcasts', (await list(tokenMemberA)).length === 0)

  r = await api('/api/announcements', { method: 'POST', token: tokenMemberA, body: { message: 'I am only a member' } })
  check('a member cannot send a broadcast', r.status === 403, `status ${r.status}`)

  r = await api('/api/announcements', { method: 'POST', token: tokenA, body: { message: '  Bazaar is done, all three meals confirmed.  ' } })
  const sentId = r.json?.announcement?.id
  check('admin can send a broadcast', r.status === 201 && !!sentId, `status ${r.status}`)
  check('the message is trimmed', r.json?.announcement?.message === 'Bazaar is done, all three meals confirmed.')
  check('the sender name is stored', r.json?.announcement?.author_name === 'Admin a', r.json?.announcement?.author_name)

  r = await api('/api/announcements', { method: 'POST', token: tokenManagerA, body: { message: 'Fish tonight' } })
  const managerPostId = r.json?.announcement?.id
  check('a manager can send a broadcast', r.status === 201 && !!managerPostId, `status ${r.status}`)

  let seen = await list(tokenMemberA)
  check('a member sees both broadcasts, newest first',
    seen.length === 2 && seen[0].message === 'Fish tonight' && seen[1].message.startsWith('Bazaar is done'),
    JSON.stringify(seen.map((a) => a.message)))
  check('each broadcast says when it stops showing',
    seen.every((a) => new Date(a.expires_at).getTime() - new Date(a.created_at).getTime() === 3 * 24 * 60 * 60 * 1000))

  // ── Broadcast: validation ──────────────────────────────────────────────────
  for (const [label, body] of [['an empty message', { message: '' }], ['a blank message', { message: '   \n ' }],
    ['a missing message', {}], ['a number', { message: 42 }], ['a list', { message: ['a'] }], ['null', { message: null }]]) {
    r = await api('/api/announcements', { method: 'POST', token: tokenA, body })
    check(`rejects ${label}`, r.status === 400, `status ${r.status}`)
  }
  r = await api('/api/announcements', { method: 'POST', token: tokenA, body: { message: 'x'.repeat(1001) } })
  check('rejects a message over 1000 characters', r.status === 400, `status ${r.status}`)
  r = await api('/api/announcements', { method: 'POST', token: tokenA, body: { message: 'y'.repeat(1000) } })
  const maxId = r.json?.announcement?.id
  check('accepts a message of exactly 1000 characters', r.status === 201 && !!maxId, `status ${r.status}`)
  r = await api('/api/announcements', { method: 'POST', token: tokenA, body: 'not json', raw: true })
  check('rejects a body that is not JSON', r.status === 400, `status ${r.status}`)

  const markup = '<script>alert(1)</script> & "quotes" \'too\' 🍽 বাজার শেষ'
  r = await api('/api/announcements', { method: 'POST', token: tokenA, body: { message: markup } })
  check('markup and Bangla are stored exactly as written (escaped when shown)', r.json?.announcement?.message === markup)
  const markupId = r.json?.announcement?.id

  // ── Broadcast: tenant isolation ────────────────────────────────────────────
  check('mess B sees none of mess A\'s broadcasts', (await list(tokenB)).length === 0)
  r = await api(`/api/announcements/${sentId}`, { method: 'DELETE', token: tokenB })
  check('mess B admin cannot remove mess A\'s broadcast', r.status === 404, `status ${r.status}`)
  check('...and it is still there', !!(await prisma.announcement.findUnique({ where: { id: sentId } })))
  r = await api('/api/announcements', { method: 'POST', token: tokenB, body: { message: 'From B', mess_id: A.mess.id, messId: A.mess.id } })
  check('a mess id in the body is ignored: the broadcast lands in B', r.status === 201 &&
    (await prisma.announcement.findUnique({ where: { id: r.json.announcement.id } })).messId === B.mess.id)
  check('...and A does not see it', !(await list(tokenA)).some((a) => a.message === 'From B'))

  // ── Broadcast: removing ────────────────────────────────────────────────────
  r = await api(`/api/announcements/${sentId}`, { method: 'DELETE', token: tokenMemberA })
  check('a member cannot remove a broadcast', r.status === 403, `status ${r.status}`)
  r = await api(`/api/announcements/${sentId}`, { method: 'DELETE' })
  check('signed-out visitors cannot remove a broadcast', r.status === 401, `status ${r.status}`)
  for (const id of ['nope', '123', '../x', '00000000-0000-0000-0000-000000000000']) {
    r = await api(`/api/announcements/${encodeURIComponent(id)}`, { method: 'DELETE', token: tokenA })
    check(`removing ${JSON.stringify(id)} answers 404, not a server error`, r.status === 404, `status ${r.status}`)
  }
  r = await api(`/api/announcements/${sentId}`, { method: 'DELETE', token: tokenManagerA })
  check('a manager can remove a broadcast', r.status === 200, `status ${r.status}`)
  check('a removed broadcast disappears for everyone', !(await list(tokenMemberA)).some((a) => a.id === sentId))
  r = await api(`/api/announcements/${sentId}`, { method: 'DELETE', token: tokenA })
  check('removing it twice answers 404', r.status === 404, `status ${r.status}`)

  // ── Broadcast: expiry, audit, order ────────────────────────────────────────
  await prisma.announcement.update({ where: { id: maxId }, data: { createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000) } })
  check('a broadcast older than 3 days stops showing', !(await list(tokenMemberA)).some((a) => a.id === maxId))
  await prisma.announcement.update({ where: { id: markupId }, data: { createdAt: new Date(Date.now() - (3 * 24 * 60 * 60 * 1000 - 60 * 1000)) } })
  check('...but one just under 3 days old still shows', (await list(tokenMemberA)).some((a) => a.id === markupId))

  const audits = await prisma.auditLog.findMany({ where: { messId: A.mess.id, action: { in: ['POST_ANNOUNCEMENT', 'DELETE_ANNOUNCEMENT'] } } })
  check('sending and removing are audited',
    audits.some((a) => a.action === 'POST_ANNOUNCEMENT' && a.actorId === A.admin.id) &&
    audits.some((a) => a.action === 'DELETE_ANNOUNCEMENT' && a.actorId === A.manager.id),
    JSON.stringify(audits.map((a) => a.action)))
  r = await api('/api/admin/audit', { token: tokenA })
  check('the audit screen can load those entries', r.status === 200, `status ${r.status}`)

  // ── Broadcast: daily limit (10 per mess per day) ───────────────────────────
  await prisma.announcement.deleteMany({ where: { messId: A.mess.id } })
  const C = await makeMess('c')
  const tokenC = await login(C.admin.email)
  const statuses = []
  for (let i = 0; i < 12; i++) statuses.push((await api('/api/announcements', { method: 'POST', token: tokenC, body: { message: `n${i}` } })).status)
  check('the 11th broadcast in a day is refused (429)', statuses.slice(0, 10).every((s) => s === 201) && statuses[10] === 429 && statuses[11] === 429, statuses.join(','))
  check('the limit is per mess: mess B can still send', (await api('/api/announcements', { method: 'POST', token: tokenB, body: { message: 'still fine' } })).status === 201)

  // ── The automatic notice when meals are switched off ───────────────────────
  const D = await makeMess('d')
  const tokenD = await login(D.admin.email)
  const day = new Date().toISOString().slice(0, 10)
  r = await api('/api/admin/no-cook', { method: 'POST', token: tokenD, body: { action: 'off', date: day, reason: 'Cook is ill' } })
  check('no-cook still works', r.status === 200 && r.json?.ok === true, `status ${r.status}`)
  check('no-cook reports that it announced it', r.json?.announced === true && r.json?.telegram_notified === undefined, JSON.stringify(r.json))
  let notices = await list(tokenD)
  check('members get "No meals" with the reason and date',
    notices.length === 1 && notices[0].message === `No meals on ${day}. All meals are turned off for the day. Reason: Cook is ill`, JSON.stringify(notices.map((n) => n.message)))
  check('the notice names the person who did it', notices[0]?.author_name === 'Admin d')
  r = await api('/api/admin/no-cook', { method: 'POST', token: tokenD, body: { action: 'on', date: day } })
  notices = await list(tokenD)
  check('switching back posts "Meals are back on"', r.status === 200 && notices.some((n) => n.message.startsWith(`Meals are back on for ${day}`)))

  // ── Telegram is gone, nothing else broke ───────────────────────────────────
  for (const [method, path] of [['POST', '/api/telegram/webhook'], ['GET', '/api/tg/home'], ['GET', '/api/members/telegram-link'],
    ['POST', '/api/members/telegram-link'], ['GET', '/api/admin/telegram-group'], ['POST', '/api/admin/telegram-group'], ['GET', '/api/platform/telegram'],
    ['GET', '/en/tg'], ['GET', '/bn/tg']]) {
    r = await api(path, { method, token: tokenA, body: method === 'POST' ? {} : undefined })
    // /api/members/telegram-link now falls into the generic /api/members/[id] route, which only has PUT: 405
    const gone = r.status === 404 || (path === '/api/members/telegram-link' && r.status === 405)
    check(`${method} ${path} is gone`, gone, `status ${r.status}`)
  }
  r = await api('/api/members', { token: tokenA })
  check('the members list no longer carries telegram fields', r.status === 200 && !JSON.stringify(r.json).includes('telegram'))
  r = await api('/api/me', { token: tokenMemberA })
  check('the data export no longer carries telegram fields', r.status === 200 && !JSON.stringify(r.json).includes('telegram'))
  const docs = await (await fetch(BASE + '/api-docs')).text()
  check('the API docs describe broadcasts and no longer mention the bot', docs.includes('/announcements') && !/telegram/i.test(docs))
} catch (err) {
  console.error(err)
  failures++
} finally {
  // Clean up everything this run created
  const messes = await prisma.mess.findMany({ where: { name: { endsWith: tag } }, select: { id: true } })
  const messIds = messes.map((m) => m.id)
  const emails = { endsWith: `${tag}@test.invalid` }
  await prisma.securityEvent.deleteMany({ where: { OR: [{ messId: { in: messIds } }, { email: emails }] } })
  await prisma.auditLog.deleteMany({ where: { messId: { in: messIds } } })
  await prisma.mess.deleteMany({ where: { id: { in: messIds } } }) // announcements go with it (cascade)
  await prisma.$disconnect()
}

for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : `  (${r.info})`}`)
console.log(`\n${results.length - failures}/${results.length} passed`)
process.exit(failures ? 1 : 0)
