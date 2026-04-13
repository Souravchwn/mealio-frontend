#!/usr/bin/env node
/**
 * Seed demo accounts for testing.
 * Run: npm run seed
 *
 * Requires DATABASE_URL in .env.local
 */
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'

const adapter = new PrismaPg(process.env.DATABASE_URL!)
const prisma = new PrismaClient({ adapter })

const DEMO_MESS_ID = 'aaaaaaaa-0000-0000-0000-000000000001'

async function seed() {
  console.log('Seeding demo data...')

  await prisma.mess.upsert({
    where: { id: DEMO_MESS_ID },
    create: {
      id: DEMO_MESS_ID,
      name: 'Demo Mess',
      inviteCode: 'MESS-DEMO',
      cutOffTime: new Date('1970-01-01T21:00:00.000Z'),
      estimatedMonthlyBudget: 15000,
      isActive: true,
    },
    update: {},
  })

  const users = [
    { email: 'admin@demo.com', password: 'admin123', name: 'Admin Demo', role: 'ADMIN', phone: '+8801711000001' },
    { email: 'manager@demo.com', password: 'manager123', name: 'Manager Demo', role: 'MANAGER', phone: '+8801711000002' },
    { email: 'member@demo.com', password: 'member123', name: 'Member Demo', role: 'MEMBER', phone: '+8801711000003' },
  ]

  for (const u of users) {
    const passwordHash = await bcrypt.hash(u.password, 10)
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
      update: { passwordHash },
    })
    console.log(`✓ ${u.email}`)
  }

  const admin = await prisma.member.findUnique({
    where: { email: 'admin@demo.com' },
    select: { id: true },
  })

  if (admin) {
    const today = new Date().toISOString().slice(0, 10)
    const yearMonth = today.slice(0, 7)
    const todayObj = new Date(`${today}T00:00:00.000Z`)

    const sampleExpenses = [
      { amount: 850, category: 'PROTEIN', description: 'Rui fish — Karwan Bazar' },
      { amount: 320, category: 'VEGETABLE', description: 'Mixed vegetables' },
      { amount: 150, category: 'SPICE', description: 'Spices and condiments' },
    ]

    for (const exp of sampleExpenses) {
      await prisma.expense.create({
        data: {
          messId: DEMO_MESS_ID,
          addedBy: admin.id,
          amount: exp.amount,
          category: exp.category,
          description: exp.description,
          expenseDate: todayObj,
          yearMonth,
        },
      })
    }
    console.log('✓ Sample expenses seeded')
  }

  console.log('\nDemo credentials:')
  console.log('  admin@demo.com / admin123')
  console.log('  manager@demo.com / manager123')
  console.log('  member@demo.com / member123')
  console.log('\nInvite code: MESS-DEMO')
  console.log('Done!')

  await prisma.$disconnect()
}

seed().catch((err) => {
  console.error(err)
  process.exit(1)
})
