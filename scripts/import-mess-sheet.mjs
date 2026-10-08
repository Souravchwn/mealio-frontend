/**
 * Import a mess's real meal sheet (members, daily meals, bazaar, deposits).
 *
 *   npm run import:sheet -- scripts/data/green-home-b5-june-2026.local.json [--replace] [--allow-remote]
 *
 * - Refuses to touch a database that is not on this machine unless --allow-remote.
 * - Refuses to run twice for the same mess name unless --replace (which deletes that mess first).
 * - Members get random passwords. They are written to <data file>.credentials.txt next to the data
 *   (git-ignored) and never printed.
 * - Before writing anything it checks the sheet against its own totals (meals per person, total
 *   expense, total deposit), so a typo in the data is caught here and not in the books.
 *
 * Sheet model: one number per person per day = meals eaten that day. It is stored as lunch + dinner
 * (lunch gets the extra one when odd). Days with no entry are stored as 0 so the automatic daily
 * fill never invents meals for them.
 */
import fs from 'node:fs'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'

const args = process.argv.slice(2)
const file = args.find((a) => !a.startsWith('--'))
const replace = args.includes('--replace')
const allowRemote = args.includes('--allow-remote')
if (!file) {
  console.error('Usage: npm run import:sheet -- <data.json> [--replace] [--allow-remote]')
  process.exit(1)
}
const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL is not set (expected in .env.local)')
  process.exit(1)
}
const host = new URL(url).hostname
if (!['localhost', '127.0.0.1', '::1'].includes(host) && !allowRemote) {
  console.error(`DATABASE_URL points at ${host}, which is not this machine. Pass --allow-remote if you really mean it.`)
  process.exit(1)
}

const data = JSON.parse(fs.readFileSync(file, 'utf8'))
const names = data.members.map((m) => m.name)
const round2 = (n) => Math.round(n * 100) / 100

// ── Check the sheet against its own totals ───────────────────────────────────
const mealTotals = Object.fromEntries(names.map((n) => [n, 0]))
for (const [date, counts] of Object.entries(data.meals)) {
  if (counts.length !== names.length) throw new Error(`${date}: expected ${names.length} numbers, got ${counts.length}`)
  counts.forEach((c, i) => { mealTotals[names[i]] += c })
}
for (const n of names) {
  if (mealTotals[n] !== data.sheetTotals.meals[n]) {
    throw new Error(`Meals for ${n}: data adds up to ${mealTotals[n]} but the sheet says ${data.sheetTotals.meals[n]}`)
  }
}
const totalExpense = data.expenses.reduce((s, e) => s + e.amount, 0)
const totalDeposit = Object.values(data.deposits).reduce((s, v) => s + v, 0)
if (totalExpense !== data.sheetTotals.totalExpense) throw new Error(`Expenses add up to ${totalExpense}, sheet says ${data.sheetTotals.totalExpense}`)
if (totalDeposit !== data.sheetTotals.totalDeposit) throw new Error(`Deposits add up to ${totalDeposit}, sheet says ${data.sheetTotals.totalDeposit}`)
for (const e of data.expenses) for (const s of e.shoppers) if (!names.includes(s)) throw new Error(`Unknown shopper "${s}"`)
console.log('Sheet checks out: meals per person, total expense and total deposit all match.')

const prisma = new PrismaClient({ adapter: new PrismaPg(url) })
const d = (s) => new Date(`${s}T00:00:00.000Z`)

try {
  const existing = await prisma.mess.findFirst({ where: { name: data.mess.name }, select: { id: true } })
  if (existing && !replace) throw new Error(`"${data.mess.name}" already exists. Use --replace to delete it and import again.`)
  if (existing) {
    await prisma.member.deleteMany({ where: { messId: existing.id } })
    await prisma.mess.delete({ where: { id: existing.id } })
    console.log('Removed the previous copy.')
  }

  const password = randomBytes(9).toString('base64url')
  const passwordHash = await bcrypt.hash(password, 10)
  const { period } = data.mess
  const joinedAt = new Date(`${period.start}T00:00:00.000Z`)
  joinedAt.setUTCDate(joinedAt.getUTCDate() - 16) // joined before the period, so no day is ignored as "before joining"

  const result = await prisma.$transaction(async (tx) => {
    const code = `MESS-${randomBytes(6).toString('hex').toUpperCase().slice(0, 8)}`
    const mess = await tx.mess.create({
      data: {
        name: data.mess.name,
        inviteCode: code,
        cutOffTime: new Date('1970-01-01T21:00:00.000Z'),
        monthStartDay: data.mess.monthStartDay,
        weekendDays: '5,6',
        guestMealPolicy: 'HOST',
        bazaarCountsAsDeposit: false, // the sheet pays bazaar from deposits, so no extra credit
        carryForwardBalance: true,
        requireJoinApproval: true,
        isActive: true,
      },
    })
    await tx.mealConfig.createMany({
      data: [['BREAKFAST', '08:30'], ['LUNCH', '13:00'], ['DINNER', '21:00']].map(([mealType, t]) => ({
        messId: mess.id, mealType, cutoffTime: new Date(`1970-01-01T${t}:00.000Z`), enabled: true, maxCount: 10,
      })),
    })

    const members = {}
    for (const m of data.members) {
      const row = await tx.member.create({
        data: {
          messId: mess.id,
          name: m.name,
          email: `${m.slug}@greenhome-b5.local`,
          passwordHash,
          role: m.role,
          isActive: true,
          joinStatus: 'APPROVED',
          joinedAt,
        },
      })
      members[m.name] = row
      await tx.messMembership.create({ data: { memberId: row.id, messId: mess.id, role: m.role, isActive: true, joinedAt } })
    }
    const admin = members[data.members.find((m) => m.role === 'ADMIN').name]
    await tx.mess.update({ where: { id: mess.id }, data: { ownerId: admin.id } })

    const month = await tx.messMonth.create({
      data: { messId: mess.id, yearMonth: period.yearMonth, startDate: d(period.start), endDate: d(period.end), isClosed: false },
    })

    // Daily meals: every member, every day of the period
    const logs = []
    for (let t = d(period.start).getTime(); t <= d(period.end).getTime(); t += 86400000) {
      const day = new Date(t)
      const key = day.toISOString().slice(0, 10)
      const row = data.meals[key]
      names.forEach((name, i) => {
        const n = row ? row[i] : 0
        logs.push({
          messId: mess.id, memberId: members[name].id, logDate: day,
          breakfastCount: 0, lunchCount: Math.ceil(n / 2), dinnerCount: Math.floor(n / 2),
          guestCount: 0, frozen: false, isOverride: true, overrideType: 'ADMIN',
        })
      })
    }
    await tx.dailyLog.createMany({ data: logs })

    // Bazaar trips: one session + one expense each
    for (const e of data.expenses) {
      const shoppers = e.shoppers.map((n) => ({ id: members[n].id, name: n }))
      const session = await tx.bazaarSession.create({
        data: {
          messId: mess.id, sessionDate: d(e.date), yearMonth: e.date.slice(0, 7), shoppers,
          note: 'Imported from the June sheet', createdBy: admin.id, entryMode: 'ITEMIZED',
        },
      })
      await tx.expense.create({
        data: {
          messId: mess.id, addedBy: members[e.shoppers[0]].id, sessionId: session.id, amount: e.amount,
          category: 'OTHER', description: 'Bazaar (from sheet)', expenseDate: d(e.date), yearMonth: e.date.slice(0, 7),
        },
      })
    }

    // Deposits: the sheet has totals but no dates, so they sit on the first day of the period
    for (const [name, amount] of Object.entries(data.deposits)) {
      await tx.ledgerEntry.create({
        data: {
          messId: mess.id, messMonthId: null, memberId: members[name].id, entryType: 'CONTRIBUTION', amount,
          note: 'Deposit total from the June sheet (date not recorded)', createdBy: admin.id,
          createdAt: new Date(`${period.start}T12:00:00.000Z`),
        },
      })
    }

    await tx.auditLog.create({
      data: {
        messId: mess.id, actorId: admin.id, action: 'IMPORT_SHEET', targetTable: 'mess_months', targetId: month.id,
        newValue: { source: path.basename(file), members: names.length, expenses: data.expenses.length, deposits: Object.keys(data.deposits).length },
      },
    })
    return { mess, code }
  })

  const credFile = file.replace(/\.json$/, '') + '.credentials.txt'
  const lines = [
    `Mess: ${data.mess.name}`,
    `Invite code: ${result.code}`,
    `Password for every member below (development only): ${password}`,
    '',
    ...data.members.map((m) => `${m.role.padEnd(8)} ${m.name.padEnd(10)} ${m.slug}@greenhome-b5.local`),
  ]
  fs.writeFileSync(credFile, lines.join('\n') + '\n')
  console.log(`Imported "${data.mess.name}": ${names.length} members, ${Object.keys(data.meals).length} meal days, ${data.expenses.length} bazaar trips, ${Object.keys(data.deposits).length} deposits.`)
  console.log(`Logins written to ${credFile}`)
  console.log(`Expected from the sheet: meal rate ${round2(data.sheetTotals.mealRate)}, total meals ${data.sheetTotals.totalMeals}.`)
} finally {
  await prisma.$disconnect()
}
