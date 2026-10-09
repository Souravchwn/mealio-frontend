/**
 * Members by name first, invites, claims, default meals and guests per meal.
 *
 *   npm run dev            (in another terminal)
 *   npm run test:roster
 *
 * Builds two throw-away messes and checks, through the real API:
 *   - only an admin adds people by name; a name-only member cannot sign in
 *   - the mess default meals and a per-member override decide a name-only member's meals
 *   - admins and managers change anyone's meals and guests, members only their own, all audited
 *   - guests are per meal (lunch only, dinner only, both) and older days still bill the old way
 *   - personal invites: preview shows only that member, one use, resend cancels, email taken
 *   - join with the code + "I am <name>": waits for the admin, approve moves the account over
 *   - nothing crosses between messes
 * Cleans up after itself. Exit code 1 if anything fails.
 */
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'
import { randomBytes } from 'node:crypto'

const BASE = process.env.TEST_BASE_URL || 'http://localhost:3000'
const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL) })
const tag = randomBytes(4).toString('hex')
const PASSWORD = `Roster-${tag}-pass`

let failures = 0
const results = []
const check = (name, ok, info = '') => { results.push({ name, ok, info }); if (!ok) failures++ }
const status = (name, r, want) => check(name, r.status === want, `status ${r.status} ${JSON.stringify(r.json)?.slice(0, 160)}`)

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
async function login(email, password = PASSWORD) {
  const r = await api('/api/auth/login', { method: 'POST', body: { email, password } })
  return r.json?.access_token ?? null
}

const hash = await bcrypt.hash(PASSWORD, 10)
const messIds = []

async function makeMess(label) {
  const mess = await prisma.mess.create({
    data: {
      name: `Roster ${label} ${tag}`,
      inviteCode: `MESS-R${label}${tag}`.toUpperCase(),
      cutOffTime: new Date('1970-01-01T23:59:00Z'),
      requireJoinApproval: false,
    },
  })
  messIds.push(mess.id)
  // Cutoffs at the end of the day so today's meals and guests are still open
  await prisma.mealConfig.createMany({
    data: ['BREAKFAST', 'LUNCH', 'DINNER'].map((m) => ({ messId: mess.id, mealType: m, cutoffTime: new Date('1970-01-01T23:59:00Z'), enabled: true, maxCount: 10 })),
  })
  const joined = new Date(Date.now() - 20 * 86_400_000)
  const mk = (name, role) => prisma.member.create({
    data: { messId: mess.id, name, email: `ro-${label}-${name.toLowerCase()}-${tag}@test.invalid`, passwordHash: hash, role, joinedAt: joined },
  })
  const admin = await mk('Admin', 'ADMIN')
  const manager = await mk('Manager', 'MANAGER')
  const alice = await mk('Alice', 'MEMBER')
  await prisma.mess.update({ where: { id: mess.id }, data: { ownerId: admin.id } })
  return { mess, admin, manager, alice }
}

try {
  const A = await makeMess('a')
  const B = await makeMess('b')
  const tAdmin = await login(A.admin.email)
  const tManager = await login(A.manager.email)
  const tAlice = await login(A.alice.email)
  const tBAdmin = await login(B.admin.email)

  // ── Mess default meals (admin only), set before adding people ──
  const noBreakfast = { weekday: { breakfast: false, lunch: true, dinner: true }, weekend: { breakfast: false, lunch: true, dinner: true } }
  status('a manager cannot change the mess default meals', await api('/api/mess/settings', { method: 'PUT', token: tManager, body: { default_meals: noBreakfast } }), 403)
  status('a bad default_meals shape is refused', await api('/api/mess/settings', { method: 'PUT', token: tAdmin, body: { default_meals: { weekday: { breakfast: 'no' } } } }), 400)
  let r = await api('/api/mess/settings', { method: 'PUT', token: tAdmin, body: { default_meals: noBreakfast } })
  check('the admin sets the mess default meals', r.status === 200 && r.json?.default_meals?.weekday?.breakfast === false, JSON.stringify(r.json?.default_meals))

  // ── Add by name ──
  status('a member cannot add people', await api('/api/members', { method: 'POST', token: tAlice, body: { name: 'Nope Person' } }), 403)
  status('a manager cannot add people', await api('/api/members', { method: 'POST', token: tManager, body: { name: 'Nope Person' } }), 403)
  status('a one-letter name is refused', await api('/api/members', { method: 'POST', token: tAdmin, body: { name: 'R' } }), 400)
  r = await api('/api/members', { method: 'POST', token: tAdmin, body: { name: 'Rubab Test' } })
  check('the admin adds a member by name', r.status === 200 && r.json?.has_account === false, JSON.stringify(r.json))
  const rubabId = r.json?.id
  status('the same name twice is refused', await api('/api/members', { method: 'POST', token: tAdmin, body: { name: 'rubab test' } }), 400)
  const rubabRow = await prisma.member.findUnique({ where: { id: rubabId }, select: { email: true, passwordHash: true, messId: true } })
  check('a name-only member has no email and no password', rubabRow && rubabRow.email === null && rubabRow.passwordHash === null && rubabRow.messId === A.mess.id)

  r = await api(`/api/members?mess_id=${A.mess.id}`, { token: tAdmin })
  const listed = r.json?.members?.find((m) => m.id === rubabId)
  check('the list shows them as not joined', listed && listed.has_account === false && listed.invited_at === null, JSON.stringify(listed))

  // Their meals today follow the mess default (no breakfast)
  r = await api(`/api/meals/today?member_id=${rubabId}`, { token: tAdmin })
  check('a name-only member eats the mess default today', r.status === 200 && r.json?.breakfast === false && r.json?.lunch === true && r.json?.dinner === true, JSON.stringify(r.json))

  // ── Per-member default meals ──
  status('a member cannot set someone else\'s default meals', await api(`/api/members/${rubabId}/meal-preferences`, { method: 'PUT', token: tAlice, body: { meal_type: 'dinner', day_type: 'WEEKDAY', enabled: false } }), 403)
  status('another mess\'s admin cannot see them', await api(`/api/members/${rubabId}/meal-preferences`, { token: tBAdmin }), 404)
  status('a manager sets someone\'s default meal', await api(`/api/members/${rubabId}/meal-preferences`, { method: 'PUT', token: tManager, body: { meal_type: 'dinner', day_type: 'WEEKEND', enabled: false } }), 200)
  r = await api(`/api/members/${rubabId}/meal-preferences`, { token: tAdmin })
  const prefs = r.json?.preferences ?? []
  const pref = (m, d) => prefs.find((p) => p.meal_type === m && p.day_type === d)
  check('the override is stored and the rest follow the mess default',
    pref('dinner', 'WEEKEND')?.enabled === false && pref('dinner', 'WEEKEND')?.custom === true &&
    pref('breakfast', 'WEEKDAY')?.enabled === false && pref('breakfast', 'WEEKDAY')?.custom === false, JSON.stringify(prefs))
  status('back to the mess default', await api(`/api/members/${rubabId}/meal-preferences`, { method: 'DELETE', token: tAdmin }), 200)
  check('the override is gone', (await prisma.userMealPreference.count({ where: { memberId: rubabId } })) === 0)

  // ── Meals and guests for someone else, with an audit trail ──
  const today = (await api('/api/meals/today', { token: tAlice })).json?.date
  status('a manager turns another member\'s lunch off', await api('/api/meals/toggle', { method: 'POST', token: tManager, body: { member_id: A.alice.id, date: today, slot: 'lunch', status: false } }), 200)
  status('a member cannot change someone else\'s meal', await api('/api/meals/toggle', { method: 'POST', token: tAlice, body: { member_id: rubabId, date: today, slot: 'lunch', status: false } }), 403)
  status('guests need a meal', await api('/api/meals/guest', { method: 'POST', token: tAlice, body: { guest_count: 1 } }), 400)
  status('a manager adds 2 dinner guests for another member', await api('/api/meals/guest', { method: 'POST', token: tManager, body: { member_id: A.alice.id, date: today, slot: 'dinner', guest_count: 2 } }), 200)
  status('a member adds 1 lunch guest for themselves', await api('/api/meals/guest', { method: 'POST', token: tAlice, body: { slot: 'lunch', guest_count: 1 } }), 200)
  status('a member cannot add guests for someone else', await api('/api/meals/guest', { method: 'POST', token: tAlice, body: { member_id: rubabId, slot: 'lunch', guest_count: 3 } }), 403)
  status('another mess\'s admin cannot add guests here', await api('/api/meals/guest', { method: 'POST', token: tBAdmin, body: { member_id: A.alice.id, slot: 'lunch', guest_count: 3 } }), 404)
  r = await api('/api/meals/today', { token: tAlice })
  check('guests are per meal: lunch 1, dinner 2, breakfast 0',
    r.json?.guests?.breakfast === 0 && r.json?.guests?.lunch === 1 && r.json?.guests?.dinner === 2, JSON.stringify(r.json?.guests))
  check('a lunch guest counts even though the host skipped lunch', r.json?.lunch === false && r.json?.guests?.lunch === 1)
  const audits = await prisma.auditLog.findMany({ where: { messId: A.mess.id, actorId: A.manager.id, action: 'TOGGLE_MEAL' } })
  check('the manager\'s changes are in the audit log under their name', audits.length >= 2, `${audits.length} rows`)

  // Headcount uses the same guests
  r = await api('/api/cook/headcount', { token: tAdmin })
  const aliceLunch = r.json?.slots?.lunch?.members?.find((m) => m.id === A.alice.id)
  check('the cook sees Alice\'s lunch guest', aliceLunch?.guest_count === 1 && aliceLunch?.count === 0, JSON.stringify(aliceLunch))

  // Older days: one guest count for every meal the host ate
  const todayObj = new Date(`${today}T00:00:00.000Z`)
  const past = new Date(todayObj.getTime() - 86_400_000)
  const period = await prisma.messMonth.findFirst({ where: { messId: A.mess.id, isClosed: false }, orderBy: { startDate: 'desc' } })
  const pastInPeriod = period && past >= period.startDate
  if (pastInPeriod) {
    await prisma.dailyLog.upsert({
      where: { messId_memberId_logDate: { messId: A.mess.id, memberId: A.alice.id, logDate: past } },
      create: { messId: A.mess.id, memberId: A.alice.id, logDate: past, breakfastCount: 0, lunchCount: 1, dinnerCount: 1, guestCount: 2, isOverride: true, overrideType: 'ADMIN' },
      update: { breakfastCount: 0, lunchCount: 1, dinnerCount: 1, guestCount: 2, guestBreakfast: 0, guestLunch: 0, guestDinner: 0 },
    })
  }
  r = await api(`/api/members?mess_id=${A.mess.id}`, { token: tAdmin })
  const aliceRow = r.json?.members?.find((m) => m.id === A.alice.id)
  const wantGuestMeals = 3 + (pastInPeriod ? 4 : 0)
  check(`guest meals add up (today 3${pastInPeriod ? ' + an older day 2 guests x 2 meals' : ''})`, aliceRow?.guest_meals === wantGuestMeals, `got ${aliceRow?.guest_meals}, want ${wantGuestMeals}`)

  // ── Personal invites ──
  status('a member cannot invite', await api(`/api/members/${rubabId}/invite`, { method: 'POST', token: tAlice, body: {} }), 403)
  status('another mess\'s admin cannot invite them', await api(`/api/members/${rubabId}/invite`, { method: 'POST', token: tBAdmin, body: {} }), 404)
  status('someone who already joined cannot be invited', await api(`/api/members/${A.alice.id}/invite`, { method: 'POST', token: tAdmin, body: {} }), 400)
  status('a bad email is refused', await api(`/api/members/${rubabId}/invite`, { method: 'POST', token: tAdmin, body: { email: 'not-an-email' } }), 400)
  r = await api(`/api/members/${rubabId}/invite`, { method: 'POST', token: tAdmin, body: {} })
  const url1 = r.json?.url ?? ''
  const tok1 = url1.split('/invite/')[1]
  check('the admin gets an invite link', r.status === 200 && !!tok1, JSON.stringify(r.json))
  r = await api(`/api/members/${rubabId}/invite`, { method: 'POST', token: tAdmin, body: {} })
  const tok2 = (r.json?.url ?? '').split('/invite/')[1]
  status('a new invite cancels the old one', await api(`/api/invite/${tok1}`), 404)
  r = await api(`/api/invite/${tok2}`)
  check('the invite page shows their name and own numbers only',
    r.status === 200 && r.json?.name === 'Rubab Test' && typeof r.json?.balance === 'number' &&
    Object.keys(r.json).sort().join(',') === 'balance,deposited,meal_rate,meals,mess_name,name,period_end,period_start', JSON.stringify(r.json))
  status('a made-up invite does not work', await api(`/api/invite/${'x'.repeat(43)}`), 404)
  status('claiming with an email that has an account fails', await api(`/api/invite/${tok2}`, { method: 'POST', body: { email: A.alice.email, password: PASSWORD } }), 400)
  status('a short password is refused', await api(`/api/invite/${tok2}`, { method: 'POST', body: { email: `rubab-${tag}@test.invalid`, password: 'short' } }), 400)
  const rubabEmail = `rubab-${tag}@test.invalid`
  r = await api(`/api/invite/${tok2}`, { method: 'POST', body: { email: rubabEmail, password: PASSWORD } })
  check('Rubab joins through the invite and is signed in', r.status === 200 && !!r.json?.access_token && r.json?.user?.id === rubabId, JSON.stringify(r.json)?.slice(0, 200))
  check('Rubab can sign in afterwards', !!(await login(rubabEmail)))
  status('the invite works only once', await api(`/api/invite/${tok2}`, { method: 'POST', body: { email: `other-${tag}@test.invalid`, password: PASSWORD } }), 404)
  status('once joined, the admin can give Rubab a reset code', await api(`/api/members/${rubabId}/reset-code`, { method: 'POST', token: tAdmin }), 200)

  // ── Join with the code and pick your name ──
  r = await api('/api/members', { method: 'POST', token: tAdmin, body: { name: 'Sumon Test' } })
  const sumonId = r.json?.id
  status('a reset code is refused for someone who has not joined', await api(`/api/members/${sumonId}/reset-code`, { method: 'POST', token: tAdmin }), 400)
  const bName = await api('/api/members', { method: 'POST', token: tBAdmin, body: { name: 'Other Mess Person' } })
  status('the roster needs a real code', await api('/api/auth/roster?code=MESS-NOPE0000'), 400)
  r = await api(`/api/auth/roster?code=${A.mess.inviteCode}`)
  const names = (r.json?.names ?? []).map((n) => n.name)
  check('the roster lists only names that have not joined', r.status === 200 && names.includes('Sumon Test') && !names.includes('Rubab Test') && !names.includes('Alice'), JSON.stringify(names))
  check('the roster shows names only, no balances or contacts', Object.keys(r.json?.names?.[0] ?? {}).sort().join(',') === 'id,name')

  const reg = (body) => api('/api/auth/register', { method: 'POST', body: { mode: 'join', password: PASSWORD, mess_invite_code: A.mess.inviteCode, ...body } })
  status('claiming another mess\'s name is refused', await reg({ name: 'X', email: `x-${tag}@test.invalid`, claim_member_id: bName.json?.id }), 400)
  const sumonEmail = `sumon-${tag}@test.invalid`
  r = await reg({ name: 'Sumon', email: sumonEmail, claim_member_id: sumonId })
  check('"I am Sumon" waits for the admin', r.status === 200 && r.json?.pending === true && r.json?.claim === true, JSON.stringify(r.json))
  status('a second person cannot ask for the same name', await reg({ name: 'Fake Sumon', email: `fake-${tag}@test.invalid`, claim_member_id: sumonId }), 400)
  check('Sumon cannot sign in before approval', !(await login(sumonEmail)))
  r = await api(`/api/auth/roster?code=${A.mess.inviteCode}`)
  check('a name someone asked for leaves the roster', !(r.json?.names ?? []).some((n) => n.id === sumonId))

  r = await api('/api/members/pending', { token: tAdmin })
  const claim = r.json?.claims?.find((c) => c.member_id === sumonId)
  check('the admin sees the request', !!claim && claim.email === sumonEmail, JSON.stringify(r.json?.claims))
  status('a member cannot approve', await api(`/api/members/claims/${claim?.id}`, { method: 'POST', token: tAlice, body: { decision: 'approve' } }), 403)
  status('another mess\'s admin cannot approve', await api(`/api/members/claims/${claim?.id}`, { method: 'POST', token: tBAdmin, body: { decision: 'approve' } }), 404)
  status('the admin approves', await api(`/api/members/claims/${claim?.id}`, { method: 'POST', token: tAdmin, body: { decision: 'approve' } }), 200)
  const tSumon = await login(sumonEmail)
  check('Sumon signs in as the same member, history kept', !!tSumon && (await api('/api/meals/today', { token: tSumon })).json?.member_id === sumonId)
  status('the same request cannot be approved twice', await api(`/api/members/claims/${claim?.id}`, { method: 'POST', token: tAdmin, body: { decision: 'approve' } }), 404)

  // ── A no-cook day clears guests too ──
  status('the admin calls a no-cook day', await api('/api/admin/no-cook', { method: 'POST', token: tAdmin, body: { action: 'off', date: today } }), 200)
  r = await api('/api/meals/today', { token: tAlice })
  check('nobody eats, guests included', r.json?.guest_count === 0 && !r.json?.lunch && !r.json?.dinner, JSON.stringify(r.json?.guests))

  // ── Password reset email: a code and a link, one use between them ──
  {
    const { createHash } = await import('node:crypto')
    const sha = (v) => createHash('sha256').update(v).digest('hex')
    const link = randomBytes(32).toString('base64url')
    const code = 'K7QXM2PD'
    const exp = new Date(Date.now() + 3600_000)
    await prisma.authToken.createMany({
      data: [
        { memberId: A.alice.id, purpose: 'RESET', tokenHash: sha(link), expiresAt: exp },
        { memberId: A.alice.id, purpose: 'RESET', tokenHash: sha(code), expiresAt: exp },
      ],
    })
    status('a wrong reset code fails', await api('/api/auth/reset', { method: 'POST', body: { email: A.alice.email, code: 'AAAA-BBBB', password: `${PASSWORD}-new` } }), 400)
    status('the emailed code resets the password (dash and case do not matter)', await api('/api/auth/reset', { method: 'POST', body: { email: A.alice.email, code: 'k7qx-m2pd', password: `${PASSWORD}-new` } }), 200)
    check('Alice signs in with the new password', !!(await login(A.alice.email, `${PASSWORD}-new`)))
    status('the code works only once', await api('/api/auth/reset', { method: 'POST', body: { email: A.alice.email, code, password: `${PASSWORD}-x` } }), 400)
    status('the old session is signed out after the reset', await api('/api/meals/today', { token: tAlice }), 401)
    status('using the code cancels the emailed link', await api('/api/auth/reset', { method: 'POST', body: { token: link, password: `${PASSWORD}-y` } }), 400)
  }
} catch (err) {
  console.error(err)
  failures++
} finally {
  const members = await prisma.member.findMany({ where: { messId: { in: messIds } }, select: { id: true } })
  await prisma.authToken.deleteMany({ where: { memberId: { in: members.map((m) => m.id) } } })
  await prisma.securityEvent.deleteMany({ where: { messId: { in: messIds } } }).catch(() => {})
  await prisma.mess.deleteMany({ where: { id: { in: messIds } } })
  await prisma.$disconnect()
}

for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : `  (${r.info})`}`)
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`)
process.exit(failures ? 1 : 0)
