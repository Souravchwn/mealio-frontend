/**
 * Seed demo accounts for testing.
 * Run: npm run seed
 *
 * Requires DATABASE_URL and JWT_SECRET in .env.local
 */
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'

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
      name: 'Demo Mess',
      inviteCode: 'MESS-DEMO',
      cutOffTime: new Date('1970-01-01T21:00:00Z'), // only time part stored (@db.Time)
      estimatedMonthlyBudget: 15000,
      isActive: true,
    },
    update: {},
  })
  console.log('✓ Demo Mess')

  const users = [
    { email: 'admin@demo.com',   password: 'admin123',   name: 'Admin Demo',   role: 'ADMIN',   phone: '+8801711000001' },
    { email: 'manager@demo.com', password: 'manager123', name: 'Manager Demo', role: 'MANAGER', phone: '+8801711000002' },
    { email: 'member@demo.com',  password: 'member123',  name: 'Member Demo',  role: 'MEMBER',  phone: '+8801711000003' },
  ]

  for (const u of users) {
    const passwordHash = await bcrypt.hash(u.password, 10)
    try {
      await prisma.member.upsert({
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
        update: { passwordHash, isActive: true },
      })
      console.log(`  ✓ ${u.email}`)
    } catch (err) {
      console.error(`  ✗ ${u.email}:`, err.message)
    }
  }

  // Seed sample expenses for the current month
  const admin = await prisma.member.findUnique({
    where: { email: 'admin@demo.com' },
    select: { id: true },
  })

  if (admin) {
    const today     = new Date().toISOString().slice(0, 10)
    const yearMonth = today.slice(0, 7)

    const expenses = [
      { amount: 850,  category: 'PROTEIN',   description: 'Rui fish — Karwan Bazar' },
      { amount: 320,  category: 'VEGETABLE', description: 'Mixed vegetables'         },
      { amount: 150,  category: 'SPICE',     description: 'Spices and condiments'    },
    ]

    for (const exp of expenses) {
      try {
        await prisma.expense.create({
          data: {
            messId:      DEMO_MESS_ID,
            addedBy:     admin.id,
            expenseDate: new Date(today),
            yearMonth,
            ...exp,
          },
        })
      } catch (err) {
        console.error(`  ✗ expense (${exp.category}):`, err.message)
      }
    }
    console.log('  ✓ Sample expenses')
  }

  console.log('\n✅ Done!\n')
  console.log('Demo credentials:')
  console.log('  admin@demo.com   / admin123')
  console.log('  manager@demo.com / manager123')
  console.log('  member@demo.com  / member123')
  console.log('\nInvite code: MESS-DEMO')
}

seed()
  .catch(err => {
    console.error('❌ Seed failed:', err.message)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
