import 'dotenv/config'
import bcrypt from 'bcrypt'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { PrismaClient } from '../generated/prisma/client'

const adapter = new PrismaBetterSqlite3({ url: process.env['DATABASE_URL']! })
const db = new PrismaClient({ adapter })

async function main() {
  console.log('Seeding database...')

  // Create admin user
  const adminHash = await bcrypt.hash('admin1234', 10)
  const admin = await db.user.upsert({
    where: { email: 'admin@library.org' },
    update: {},
    create: {
      name: 'Library Admin',
      email: 'admin@library.org',
      passwordHash: adminHash,
      role: 'ADMIN',
    },
  })

  // Create staff user
  const staffHash = await bcrypt.hash('staff1234', 10)
  const staff = await db.user.upsert({
    where: { email: 'staff@library.org' },
    update: {},
    create: {
      name: 'Jane Smith',
      email: 'staff@library.org',
      passwordHash: staffHash,
      role: 'STAFF',
    },
  })

  // Create sample magazines and collect them
  const magazineData = [
    { name: 'The Economist', cadence: 'WEEKLY' as const, notes: 'International edition' },
    { name: 'Time Magazine', cadence: 'WEEKLY' as const },
    { name: 'National Geographic', cadence: 'MONTHLY' as const, notes: 'With maps supplement' },
    { name: 'Scientific American', cadence: 'MONTHLY' as const },
    { name: 'The New Yorker', cadence: 'WEEKLY' as const },
    { name: 'Consumer Reports', cadence: 'MONTHLY' as const },
    { name: 'Nature', cadence: 'WEEKLY' as const, notes: 'Academic journal' },
    { name: 'Wired', cadence: 'MONTHLY' as const },
  ]

  const createdMagazines: Array<{ id: string; name: string; cadence: string }> = []
  for (const mag of magazineData) {
    const created = await db.magazine.upsert({
      where: { id: mag.name },
      update: {},
      create: mag,
    }).catch(() => db.magazine.create({ data: mag }))
    createdMagazines.push({ id: created.id, name: created.name, cadence: created.cadence })
  }

  // Create branches
  const branches = await Promise.all([
    db.branch.upsert({
      where: { code: 'MAIN' },
      update: {},
      create: { name: 'Main Library', code: 'MAIN' },
    }),
    db.branch.upsert({
      where: { code: 'NORTH' },
      update: {},
      create: { name: 'North Edison Branch Library', code: 'NORTH' },
    }),
    db.branch.upsert({
      where: { code: 'CB' },
      update: {},
      create: { name: 'Clara Barton Branch Library', code: 'CB' },
    }),
    db.branch.upsert({
      where: { code: 'MOBILE' },
      update: {},
      create: { name: 'Bookmobile', code: 'MOBILE' },
    }),
  ])

  const [main, north, cb, mobile] = branches

  // Assign magazines to branches
  async function assignMagazine(branchId: string, magazineId: string, quantity = 1) {
    await db.branchMagazine.upsert({
      where: { branchId_magazineId: { branchId, magazineId } },
      update: { quantity },
      create: { branchId, magazineId, quantity },
    })
  }

  // Main Library: all magazines, qty 2 for weeklies, 1 for monthlies
  for (const mag of createdMagazines) {
    const qty = mag.cadence === 'WEEKLY' ? 2 : 1
    await assignMagazine(main.id, mag.id, qty)
  }

  // North: all magazines, qty 1
  for (const mag of createdMagazines) {
    await assignMagazine(north.id, mag.id, 1)
  }

  // CB: 5 magazines (skip Nature, Wired, Consumer Reports)
  const cbMags = createdMagazines.filter(m => !['Nature', 'Wired', 'Consumer Reports'].includes(m.name))
  for (const mag of cbMags) {
    await assignMagazine(cb.id, mag.id, 1)
  }

  // Bookmobile: 3 magazines
  const mobileMags = createdMagazines.filter(m => ['Time Magazine', 'National Geographic', 'The New Yorker'].includes(m.name))
  for (const mag of mobileMags) {
    await assignMagazine(mobile.id, mag.id, 1)
  }

  // Create sample receipts (all assigned to Main Library for seed data)
  for (const mag of createdMagazines) {
    const cadence = mag.cadence
    const receiptCount = Math.floor(Math.random() * 3)
    for (let i = receiptCount; i >= 0; i--) {
      const daysAgo = i * (cadence === 'WEEKLY' ? 7 : 30) + Math.floor(Math.random() * 3)
      const receivedDate = new Date()
      receivedDate.setDate(receivedDate.getDate() - daysAgo)

      await db.issueReceipt.create({
        data: {
          magazineId: mag.id,
          receivedById: Math.random() > 0.5 ? admin.id : staff.id,
          branchId: main.id,
          receivedDate,
          notes: i === 0 ? null : 'Received in good condition',
        },
      }).catch(() => {})
    }
  }

  console.log('✓ Seed complete')
  console.log('  Admin: admin@library.org / admin1234')
  console.log('  Staff: staff@library.org / staff1234')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
