/**
 * cash-check.ts — Server-only: count the mess fund against the book.
 *
 * Mealtill never holds money. The manager does, as cash or in a bKash/Nagad/bank
 * account. A cash check compares what they really hold with what the book says they
 * should hold, so the whole mess can see the two match.
 *
 *   book       = all non-voided deposits − all bazaar paid from the fund (all time)
 *   expected   = previous count + (book now − book at the previous count)
 *   difference = counted − expected
 *
 * The first count has no expected amount: it is the opening count that sets the
 * starting point. Comparing with the book at the previous count (instead of with
 * timestamps) means a deposit voided or a bazaar trip edited after a count still
 * moves the next expected amount by exactly the change.
 *
 * Bazaar counts as fund spending only when `bazaarCountsAsDeposit` is off (members
 * shop with deposited money). When it is on, shoppers pay from their own pocket and
 * are credited, so the fund does not pay for bazaar. Uses the mess's current setting.
 *
 * Known gap: money paid back to members at settlement is not recorded in the book,
 * so it shows up as a difference. The manager explains it in the note.
 */

import { prisma } from './prisma'
import { requireMessSettings } from './mess-settings'

const round2 = (n: number) => Math.round(n * 100) / 100

export async function fundBookTotal(messId: string): Promise<{ book: number; bazaarFromFund: boolean }> {
  const settings = await requireMessSettings(messId)
  const bazaarFromFund = !settings.bazaarCountsAsDeposit

  const [deposits, spending] = await Promise.all([
    prisma.ledgerEntry.aggregate({
      where: { messId, entryType: 'CONTRIBUTION', isVoided: false },
      _sum: { amount: true },
    }),
    bazaarFromFund
      ? prisma.expense.aggregate({
          where: { messId, OR: [{ sessionId: null }, { session: { isVoided: false } }] },
          _sum: { amount: true },
        })
      : Promise.resolve(null),
  ])

  const book = Number(deposits._sum.amount ?? 0) - Number(spending?._sum.amount ?? 0)
  return { book: round2(book), bazaarFromFund }
}

/** What the fund should hold now, given the last count. Null before the opening count. */
export function expectedFrom(
  last: { countedAmount: number; bookTotal: number } | null,
  bookNow: number,
): number | null {
  if (!last) return null
  return round2(last.countedAmount + (bookNow - last.bookTotal))
}

export { round2 }
