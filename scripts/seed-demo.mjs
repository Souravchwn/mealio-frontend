/**
 * Seed demo accounts for testing.
 * Run: npm run seed -- --yes
 *
 * Requires DATABASE_URL and JWT_SECRET in .env.local
 *
 * ⚠️ Creates accounts with PUBLIC passwords (admin123, …) and the invite code
 * MESS-DEMO. Never run this against the production database.
 */
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'

if (!process.argv.includes('--yes')) {
  console.error('⚠️  This creates demo accounts with publicly known passwords (admin123, manager123, member123).')
  console.error('    Only run it against a development database. To continue: npm run seed -- --yes')
  process.exit(1)
}

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  console.error('❌ Missing DATABASE_URL in .env.local')
  process.exit(1)
}

const adapter = new PrismaPg(databaseUrl)
const prisma = new PrismaClient({ adapter })

const DEMO_MESS_ID = 'aaaaaaaa-0000-0000-0000-000000000001'

async function seed() {
  console.log('🌱 Seeding demo data...\n')

  // Ensure demo mess exists
  await prisma.mess.upsert({
    where: { id: DEMO_MESS_ID },
    create: {
      id: DEMO_MESS_ID,
      name: 'Bashundhara Mess',
      inviteCode: 'MESS-DEMO',
      cutOffTime: new Date('1970-01-01T21:00:00Z'), // only time part stored (@db.Time)
      estimatedMonthlyBudget: 18000,
      isActive: true,
    },
    update: { name: 'Bashundhara Mess' },
  })
  console.log('✓ Demo Mess: Bashundhara Mess')

  // Real-looking Bangladeshi member data
  const users = [
    { email: 'admin@demo.com',   password: 'admin123',   name: 'Rafiqul Islam',    role: 'ADMIN',   phone: '+8801711000001' },
    { email: 'manager@demo.com', password: 'manager123', name: 'Sohel Rana',       role: 'MANAGER', phone: '+8801711000002' },
    { email: 'member1@demo.com', password: 'member123',  name: 'Tanvir Ahmed',     role: 'MEMBER',  phone: '+8801711000003' },
    { email: 'member2@demo.com', password: 'member123',  name: 'Mahmudul Hasan',   role: 'MEMBER',  phone: '+8801711000004' },
    { email: 'member3@demo.com', password: 'member123',  name: 'Jakir Hossain',    role: 'MEMBER',  phone: '+8801711000005' },
    { email: 'member4@demo.com', password: 'member123',  name: 'Ariful Islam',     role: 'MEMBER',  phone: '+8801711000006' },
    { email: 'member5@demo.com', password: 'member123',  name: 'Shahadat Hossain', role: 'MEMBER',  phone: '+8801711000007' },
  ]

  const memberIds = {}

  for (const u of users) {
    const passwordHash = await bcrypt.hash(u.password, 10)
    try {
      const m = await prisma.member.upsert({
        where: { email: u.email },
        create: {
          messId: DEMO_MESS_ID,
          email: u.email,
          name: u.name,
          role: u.role,
          phone: u.phone,
          passwordHash,
          isActive: true,
          telegramLinked: false,
        },
        update: { name: u.name, passwordHash, isActive: true },
      })
      memberIds[u.email] = m.id
      console.log(`  ✓ ${u.name} (${u.role}) — ${u.email}`)
    } catch (err) {
      console.error(`  ✗ ${u.email}:`, err.message)
    }
  }

  const adminId = memberIds['admin@demo.com']
  const managerId = memberIds['manager@demo.com']

  if (!adminId) {
    console.error('❌ Admin member not found, aborting further seed')
    return
  }

  // ── Meal configs ──────────────────────────────────────────────────────────────
  const mealConfigs = [
    { mealType: 'BREAKFAST', cutoffTime: new Date('1970-01-01T08:30:00Z') },
    { mealType: 'LUNCH',     cutoffTime: new Date('1970-01-01T10:00:00Z') },
    { mealType: 'DINNER',    cutoffTime: new Date('1970-01-01T21:00:00Z') },
  ]
  for (const mc of mealConfigs) {
    await prisma.mealConfig.upsert({
      where: { messId_mealType: { messId: DEMO_MESS_ID, mealType: mc.mealType } },
      create: { messId: DEMO_MESS_ID, ...mc, enabled: true, maxCount: 10 },
      update: {},
    })
  }
  console.log('\n  ✓ Meal configs (breakfast 08:30 / lunch 10:00 / dinner 21:00)')

  // ── Sample expenses (bazaar sessions) for current month ───────────────────────
  const today     = new Date().toISOString().slice(0, 10)
  const yearMonth = today.slice(0, 7)

  const expenses = [
    { amount: 850,  category: 'PROTEIN',   description: 'Rui fish — Karwan Bazar',        addedBy: adminId },
    { amount: 320,  category: 'VEGETABLE', description: 'Mixed vegetables',                addedBy: managerId || adminId },
    { amount: 150,  category: 'SPICE',     description: 'Spices and condiments',           addedBy: adminId },
    { amount: 1200, category: 'PROTEIN',   description: 'Chicken — wholesale market',      addedBy: managerId || adminId },
    { amount: 480,  category: 'CARB',      description: 'Rice 5kg',                        addedBy: adminId },
    { amount: 95,   category: 'OIL',       description: 'Soybean oil',                     addedBy: adminId },
    { amount: 200,  category: 'UTILITY',   description: 'Gas cylinder refill (partial)',   addedBy: managerId || adminId },
  ]

  let expenseCount = 0
  for (const exp of expenses) {
    try {
      await prisma.expense.create({
        data: {
          messId:      DEMO_MESS_ID,
          addedBy:     exp.addedBy,
          expenseDate: new Date(today),
          yearMonth,
          amount:      exp.amount,
          category:    exp.category,
          description: exp.description,
        },
      })
      expenseCount++
    } catch (err) {
      console.error(`  ✗ expense (${exp.category}):`, err.message)
    }
  }
  console.log(`  ✓ ${expenseCount} sample expenses`)

  // ── Deposit seed data — real cash contributions ────────────────────────────────
  // These simulate admin/manager recording cash received from members.
  // They flow directly into each member's monthly balance via LedgerEntry.CONTRIBUTION
  const memberDeposits = [
    { email: 'member1@demo.com', amount: 3000, note: 'Monthly advance — full',          daysAgo: 12 },
    { email: 'member2@demo.com', amount: 2000, note: 'Partial payment',                 daysAgo: 10 },
    { email: 'member2@demo.com', amount: 1000, note: 'Remaining balance',               daysAgo: 3  },
    { email: 'member3@demo.com', amount: 3000, note: 'Monthly advance',                 daysAgo: 8  },
    { email: 'member4@demo.com', amount: 1500, note: 'First installment',               daysAgo: 14 },
    { email: 'member5@demo.com', amount: 2500, note: 'Monthly contribution',            daysAgo: 6  },
    { email: 'admin@demo.com',   amount: 3000, note: 'Admin self-deposit',              daysAgo: 15 },
    { email: 'manager@demo.com', amount: 3000, note: 'Manager contribution',            daysAgo: 11 },
  ]

  let depositCount = 0
  for (const dep of memberDeposits) {
    const memberId = memberIds[dep.email]
    if (!memberId) continue
    const depDate = new Date()
    depDate.setDate(depDate.getDate() - dep.daysAgo)
    const depYearMonth = depDate.toISOString().slice(0, 7)
    // Only seed for current month
    if (depYearMonth !== yearMonth) continue
    try {
      await prisma.ledgerEntry.create({
        data: {
          messId:     DEMO_MESS_ID,
          memberId,
          entryType:  'CONTRIBUTION',
          amount:     dep.amount,
          note:       dep.note,
          createdBy:  adminId,
          createdAt:  depDate,
        },
      })
      depositCount++
    } catch (err) {
      console.error(`  ✗ deposit for ${dep.email}:`, err.message)
    }
  }
  console.log(`  ✓ ${depositCount} sample deposits (cash contributions)`)

  // ── Meal preferences — default all meals ON for all members ──────────────────
  const allMemberIds = Object.values(memberIds)
  let prefCount = 0
  for (const memberId of allMemberIds) {
    for (const mealType of ['BREAKFAST', 'LUNCH', 'DINNER']) {
      for (const dayType of ['WEEKDAY', 'WEEKEND']) {
        try {
          await prisma.userMealPreference.upsert({
            where: { memberId_messId_mealType_dayType: { memberId, messId: DEMO_MESS_ID, mealType, dayType } },
            create: { memberId, messId: DEMO_MESS_ID, mealType, dayType, enabled: true, defaultCount: 1 },
            update: {},
          })
          prefCount++
        } catch { /* skip if exists */ }
      }
    }
  }
  console.log(`  ✓ Meal preferences set (${prefCount} rows)`)

  console.log('\n✅ Done!\n')
  console.log('Demo credentials:')
  console.log('  admin@demo.com    / admin123   (Rafiqul Islam — Admin)')
  console.log('  manager@demo.com  / manager123 (Sohel Rana — Manager)')
  console.log('  member1@demo.com  / member123  (Tanvir Ahmed)')
  console.log('  member2@demo.com  / member123  (Mahmudul Hasan)')
  console.log('  member3@demo.com  / member123  (Jakir Hossain)')
  console.log('  member4@demo.com  / member123  (Ariful Islam)')
  console.log('  member5@demo.com  / member123  (Shahadat Hossain)')
  console.log('\nInvite code: MESS-DEMO')
  console.log('\nGo to /deposits to see recorded cash deposits.')
}

seed()
  .catch(err => {
    console.error('❌ Seed failed:', err.message)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
