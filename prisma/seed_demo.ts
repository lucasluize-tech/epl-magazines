/**
 * Demo seed — clean, presentation-ready data for live demos.
 *
 * Wipes all existing data, then creates:
 *   • 2 users:    magadmin / magTech (ADMIN), mainstaff / libstaff (STAFF)
 *   • 4 branches: Main Library, North Edison, Clara Barton, Bookmobile
 *   • 2 vendor periods (both currently active and overlapping):
 *       - Vendor1-25/26  (Jun 2025 → May 2026)   ~near completion
 *       - Vendor2-26     (Jan 2026 → Dec 2026)   ~early year
 *   • 10 magazines covering all 6 cadences, split 5/5 between vendors
 *   • Receipt history producing — at the active branch (Main):
 *       - 2 "expected this week" cards
 *       - 2 "overdue" cards
 *       - 1 pending incoming transfer
 *       - the rest caught up
 *
 * Usage:  npm run seed:demo
 * WARNING: destroys all existing data in the DB this points at.
 */

import 'dotenv/config'
import bcrypt from 'bcrypt'
import { subDays } from 'date-fns'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { PrismaClient } from '../generated/prisma/client'

const adapter = new PrismaBetterSqlite3({ url: process.env['DATABASE_URL']! })
const db = new PrismaClient({ adapter })

type CadenceType = 'WEEKLY' | 'BI_WEEKLY' | 'MONTHLY' | 'BI_MONTHLY' | 'SEASONAL' | 'YEARLY'
type DemoState = 'caught_up' | 'expected_this_week' | 'overdue' | 'completed'

interface DemoMag {
  name: string
  cadence: CadenceType
  issuesPerYear: number
  vendor: 'V1' | 'V2'
  state: DemoState
  /** Branch codes this magazine is subscribed at */
  branches: string[]
}

// One representative mag per cadence per vendor, so all 6 cadences appear
// somewhere and each vendor has a mix. State distribution is chosen so the
// dashboard demonstrates every UI path: this-week, overdue, caught-up,
// pending-transfer.
const MAGAZINES: DemoMag[] = [
  // Vendor 1 — Jun 2025 → May 2026 (near year-end, ~92% elapsed)
  { name: 'The New Yorker',         cadence: 'WEEKLY',     issuesPerYear: 47, vendor: 'V1', state: 'expected_this_week', branches: ['MAIN', 'NORTH', 'CB'] },
  { name: 'People',                 cadence: 'WEEKLY',     issuesPerYear: 48, vendor: 'V1', state: 'completed',          branches: ['MAIN', 'NORTH'] },
  { name: 'Science News',           cadence: 'BI_WEEKLY',  issuesPerYear: 26, vendor: 'V1', state: 'caught_up',          branches: ['MAIN', 'CB'] },
  { name: 'National Geographic',    cadence: 'MONTHLY',    issuesPerYear: 12, vendor: 'V1', state: 'caught_up',          branches: ['MAIN', 'NORTH', 'CB'] },
  { name: 'Pioneer Woman',          cadence: 'SEASONAL',   issuesPerYear: 4,  vendor: 'V1', state: 'overdue',            branches: ['MAIN'] },

  // Vendor 2 — Jan 2026 → Dec 2026 (early year, ~34% elapsed)
  { name: 'First for Women',        cadence: 'BI_WEEKLY',  issuesPerYear: 26, vendor: 'V2', state: 'expected_this_week', branches: ['MAIN', 'NORTH'] },
  { name: 'The Atlantic',           cadence: 'MONTHLY',    issuesPerYear: 12, vendor: 'V2', state: 'overdue',            branches: ['MAIN', 'CB'] },
  { name: 'Forbes',                 cadence: 'BI_MONTHLY', issuesPerYear: 8,  vendor: 'V2', state: 'caught_up',          branches: ['MAIN'] },
  { name: "Cook's Illustrated",     cadence: 'BI_MONTHLY', issuesPerYear: 6,  vendor: 'V2', state: 'caught_up',          branches: ['MAIN', 'NORTH'] },
  { name: 'Consumer Reports Buying Guide', cadence: 'YEARLY', issuesPerYear: 1, vendor: 'V2', state: 'caught_up',        branches: ['MAIN'] },
]

const CADENCE_DAYS: Record<CadenceType, number> = {
  WEEKLY: 7, BI_WEEKLY: 14, MONTHLY: 30, BI_MONTHLY: 60, SEASONAL: 91, YEARLY: 365,
}

/** Store dates at noon UTC — avoids day-shift in EDT display (project convention). */
function noonUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12, 0, 0))
}

/**
 * Builds a list of receipt dates for a magazine, walking back from a state-driven
 * "last receipt" date by one cadence-interval per receipt, until we hit periodStart.
 * For non-'completed' states, caps at `issuesPerYear - 1` so the dashboard
 * shows the card; 'completed' fills past `issuesPerYear` so it lands in that bucket.
 */
function generateReceiptDates(mag: DemoMag, periodStart: Date, today: Date): Date[] {
  const interval = CADENCE_DAYS[mag.cadence]

  let lastOffset: number
  switch (mag.state) {
    case 'expected_this_week':
      // Last receipt one interval ago minus a few days, so next expected lands within Sun–Sat.
      lastOffset = Math.max(1, interval - 3)
      break
    case 'caught_up':
      // Last receipt recent enough that next expected is still in the future, beyond this week.
      lastOffset = Math.max(1, Math.floor(interval * 0.35))
      break
    case 'overdue':
      // Last receipt 1.4 intervals ago — next expected is comfortably in the past.
      lastOffset = Math.floor(interval * 1.4)
      break
    case 'completed':
      // Recent receipt; fill all the way back to periodStart so the running
      // total reaches/exceeds issuesPerYear and the card moves to "completed".
      lastOffset = Math.max(1, Math.floor(interval * 0.3))
      break
  }

  const cap = mag.state === 'completed'
    ? Number.MAX_SAFE_INTEGER
    : Math.max(0, mag.issuesPerYear - 1)
  const dates: Date[] = []
  let cursor = subDays(today, lastOffset)
  while (cursor >= periodStart && dates.length < cap) {
    dates.push(noonUtc(cursor))
    cursor = subDays(cursor, interval)
  }
  return dates
}

async function wipe() {
  // Order matters: leaf tables first to satisfy FK constraints.
  await db.transfer.deleteMany()
  await db.issueReceipt.deleteMany()
  await db.magazineSubscription.deleteMany()
  await db.subscriptionPeriod.deleteMany()
  await db.branchMagazine.deleteMany()
  await db.magazine.deleteMany()
  await db.user.deleteMany()
  await db.branch.deleteMany()
}

async function main() {
  const today = new Date()
  console.log('Demo seed starting…')

  await wipe()
  console.log('  ✓ Existing data wiped')

  // Users
  const adminHash = await bcrypt.hash('magTech', 10)
  const staffHash = await bcrypt.hash('libstaff', 10)
  const admin = await db.user.create({
    data: { name: 'Tech Admin', username: 'magadmin', passwordHash: adminHash, role: 'ADMIN' },
  })
  const staff = await db.user.create({
    data: { name: 'Main Staff', username: 'mainstaff', passwordHash: staffHash, role: 'STAFF' },
  })
  console.log('  ✓ Users: magadmin (ADMIN), mainstaff (STAFF)')

  // Branches
  const branchData = [
    { name: 'Main Library',                 code: 'MAIN' },
    { name: 'North Edison Branch Library',  code: 'NORTH' },
    { name: 'Clara Barton Branch Library',  code: 'CB' },
    { name: 'Bookmobile',                   code: 'MOBILE' },
  ]
  const branchByCode = new Map<string, string>()
  for (const b of branchData) {
    const branch = await db.branch.create({ data: b })
    branchByCode.set(b.code, branch.id)
  }
  console.log(`  ✓ ${branchData.length} branches`)

  // Subscription periods — both active so dashboard shows two progress bars
  const v1 = await db.subscriptionPeriod.create({
    data: {
      name: 'Vendor1-25/26',
      startDate: new Date('2025-06-01T12:00:00Z'),
      endDate:   new Date('2026-05-31T12:00:00Z'),
      active: true,
    },
  })
  const v2 = await db.subscriptionPeriod.create({
    data: {
      name: 'Vendor2-26',
      startDate: new Date('2026-01-01T12:00:00Z'),
      endDate:   new Date('2026-12-31T12:00:00Z'),
      active: true,
    },
  })
  // Historical/inactive vendor — demonstrates the Inactive badge in the
  // Vendor Periods table. Has no subscriptions.
  await db.subscriptionPeriod.create({
    data: {
      name: 'Vendor1-24/25',
      startDate: new Date('2024-06-01T12:00:00Z'),
      endDate:   new Date('2025-05-31T12:00:00Z'),
      active: false,
    },
  })
  console.log('  ✓ Vendor periods: Vendor1-25/26, Vendor2-26 (active), Vendor1-24/25 (inactive)')

  // Magazines + branch links + subscriptions + receipts
  let receiptTotal = 0
  for (const mag of MAGAZINES) {
    const created = await db.magazine.create({
      data: { name: mag.name, cadence: mag.cadence, language: 'English' },
    })

    for (const code of mag.branches) {
      const branchId = branchByCode.get(code)
      if (!branchId) continue
      await db.branchMagazine.create({
        data: { branchId, magazineId: created.id, quantity: 1 },
      })
    }

    const period = mag.vendor === 'V1' ? v1 : v2
    await db.magazineSubscription.create({
      data: {
        magazineId: created.id,
        periodId: period.id,
        issuesPerYear: mag.issuesPerYear,
        active: true,
      },
    })

    const dates = generateReceiptDates(mag, period.startDate, today)
    for (const d of dates) {
      // Receipt at every branch the mag is subscribed to (keeps progress bars
      // consistent across branches if the demo switches branches).
      for (const code of mag.branches) {
        const branchId = branchByCode.get(code)
        if (!branchId) continue
        await db.issueReceipt.create({
          data: {
            magazineId: created.id,
            branchId,
            receivedById: staff.id,
            receivedDate: d,
          },
        })
        receiptTotal++
      }
    }
  }
  console.log(`  ✓ ${MAGAZINES.length} magazines, ${receiptTotal} receipts`)

  // Pending incoming transfer — Clara Barton → Main, for a magazine that
  // exists at both branches. Showcases the "Receive Transfer" dashboard card.
  const transferMag = await db.magazine.findFirst({ where: { name: 'National Geographic' } })
  if (transferMag) {
    await db.transfer.create({
      data: {
        magazineId: transferMag.id,
        fromBranchId: branchByCode.get('CB')!,
        toBranchId:   branchByCode.get('MAIN')!,
        quantity: 1,
        status: 'PENDING',
        initiatedById: admin.id,
        createdAt: subDays(today, 2),
      },
    })
    console.log('  ✓ Pending transfer: National Geographic (CB → Main)')
  }

  console.log('\n✓ Demo seed complete')
  console.log('  Login: magadmin / magTech   (admin)')
  console.log('         mainstaff / libstaff (staff)')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
