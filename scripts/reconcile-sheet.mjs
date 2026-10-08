/**
 * Reconcile the running site against the sheet an import came from.
 *
 *   npm run reconcile:sheet -- scripts/data/green-home-b5-june-2026.local.json
 *
 * Signs in as every member through the real API (passwords come from the credentials file the
 * import wrote, never printed) and compares what the site reports with the sheet's own numbers:
 * meals per person, total meals, total expense, meal rate, deposits and every balance.
 * Needs `npm run dev` running. Exit code 1 if any figure differs by more than half a paisa.
 */
import fs from 'node:fs'

const BASE = process.env.TEST_BASE_URL || 'http://localhost:3000'
const file = process.argv[2]
if (!file) {
  console.error('Usage: npm run reconcile:sheet -- <data.json>')
  process.exit(1)
}
const data = JSON.parse(fs.readFileSync(file, 'utf8'))
const creds = fs.readFileSync(file.replace(/\.json$/, '') + '.credentials.txt', 'utf8')
const password = /Password[^:]*: (\S+)/.exec(creds)?.[1]
if (!password) throw new Error('No password found in the credentials file')

const ym = data.mess.period.yearMonth
const S = data.sheetTotals
let failures = 0
const rows = []
function check(label, got, want, tol = 0.005) {
  const ok = Math.abs(got - want) <= tol
  if (!ok) failures++
  rows.push({ label, got, want, ok })
}

async function call(path, token, init = {}) {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  })
  const json = await res.json().catch(() => null)
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${JSON.stringify(json)}`)
  return json
}

async function login(slug) {
  const j = await call('/api/auth/login', null, { method: 'POST', body: JSON.stringify({ email: `${slug}@greenhome-b5.local`, password }) })
  return j.access_token
}

const admin = data.members.find((m) => m.role === 'ADMIN')
const adminToken = await login(admin.slug)

// ── Mess level ───────────────────────────────────────────────────────────────
const sessions = await call(`/api/expenses/sessions?year_month=${ym}&limit=50`, adminToken)
check('Total expense (bazaar list)', sessions.total_expense, S.totalExpense)
check('Meal rate (bazaar list)', sessions.live_meal_rate, S.mealRate, 0.0001)
const rate = await call(`/api/expenses/meal-rate?year_month=${ym}`, adminToken)
check('Meal rate (meal-rate route)', rate.meal_rate, S.mealRate, 0.0001)
const deps = await call(`/api/contributions?year_month=${ym}&limit=100`, adminToken)
check('Total deposited', deps.total_contributed, S.totalDeposit)

// ── Member level: what each person sees in My Summary, and what the admin sees in Members ──
const list = await call('/api/members?include_inactive=1', adminToken)
for (const m of data.members) {
  const row = list.members.find((x) => x.name === m.name)
  if (!row) { failures++; rows.push({ label: `${m.name}: missing from Members`, got: NaN, want: 0, ok: false }); continue }
  check(`${m.name}: meals (Members page)`, row.meal_count, S.meals[m.name], 0)
  check(`${m.name}: balance (Members page)`, row.balance, S.balances[m.name])

  const me = await call(`/api/members/me?year_month=${ym}`, await login(m.slug))
  check(`${m.name}: meals (My Summary)`, me.my_meal_count, S.meals[m.name], 0)
  check(`${m.name}: meal rate (My Summary)`, me.meal_rate, S.mealRate, 0.0001)
  check(`${m.name}: balance (My Summary)`, me.balance, S.balances[m.name])
}

const w = Math.max(...rows.map((r) => r.label.length))
for (const r of rows) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.label.padEnd(w)}  site ${Number(r.got).toFixed(4).padStart(12)}   sheet ${Number(r.want).toFixed(4).padStart(12)}`)
}
console.log(`\n${rows.length - failures}/${rows.length} figures match the sheet`)
process.exit(failures ? 1 : 0)
