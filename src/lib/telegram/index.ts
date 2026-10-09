/**
 * Composition root — constructs and wires all Telegram bot dependencies.
 *
 * The webhook route calls `handleWebhookUpdate()` and nothing else.
 * All wiring happens here; the route stays a thin controller.
 *
 * Singletons are used for stateless services (repositories, handlers).
 * Stateful infrastructure (rate limiter) uses module-level singletons.
 */

import { getTelegramSender } from './infrastructure/sender'
import { getRateLimiter } from './infrastructure/rate-limiter'
import { getIdempotencyGuard } from './infrastructure/idempotency'

import { GroupRepository } from './repositories/group.repository'
import { MemberRepository } from './repositories/member.repository'
import { MealRepository } from './repositories/meal.repository'
import { OtpRepository } from './repositories/otp.repository'
import { PreferenceRepository } from './repositories/preference.repository'
import { MealConfigRepository } from './repositories/meal-config.repository'

import { AccountLinkingService } from './services/linking.service'
import { MealService } from './services/meal.service'
import { NoMealService } from './services/nomeal.service'
import { AnnounceService } from './services/announce.service'
import { ReportService } from './services/report.service'
import { MiniAppService } from './services/mini-app.service'
import { GroupPresenceService } from './services/group-presence.service'

import { StartCommandHandler } from './commands/handlers/start.handler'
import { LinkCommandHandler } from './commands/handlers/link.handler'
import { LinkGroupCommandHandler } from './commands/handlers/linkgroup.handler'
import { MealCommandHandler } from './commands/handlers/meal.handler'
import { StatusCommandHandler } from './commands/handlers/status.handler'
import { NoMealCommandHandler, MealOnCommandHandler } from './commands/handlers/nomeal.handler'
import { AnnounceCommandHandler } from './commands/handlers/announce.handler'
import { RateCommandHandler } from './commands/handlers/rate.handler'
import { BalanceCommandHandler } from './commands/handlers/balance.handler'

import { CommandDispatcher } from './commands/dispatcher'
import type { TelegramUpdate } from './dto'

// ── Singleton repositories (stateless, safe to share) ──────────────────────
const groupRepo = new GroupRepository()
const memberRepo = new MemberRepository()
const mealRepo = new MealRepository()
const otpRepo = new OtpRepository()
const prefRepo = new PreferenceRepository()
const mealConfigRepo = new MealConfigRepository()

// ── Services ────────────────────────────────────────────────────────────────
function buildDispatcher(): CommandDispatcher {
  const sender = getTelegramSender()

  const linkingService = new AccountLinkingService(otpRepo, memberRepo)
  const mealService = new MealService(mealRepo)
  const noMealService = new NoMealService(mealRepo, memberRepo, prefRepo, sender)
  const announceService = new AnnounceService(memberRepo, sender)
  const reportService = new ReportService()
  const miniApp = new MiniAppService(sender, groupRepo)

  const handlers = [
    new StartCommandHandler(sender, linkingService, miniApp),
    new LinkCommandHandler(linkingService, sender),
    new LinkGroupCommandHandler(otpRepo, sender, miniApp),
    new MealCommandHandler(mealService, mealConfigRepo, prefRepo, sender),
    new StatusCommandHandler(mealService, sender),
    new NoMealCommandHandler(noMealService, sender),
    new MealOnCommandHandler(noMealService, sender),
    new AnnounceCommandHandler(announceService, sender),
    new RateCommandHandler(reportService, sender),
    new BalanceCommandHandler(reportService, sender),
  ]

  return new CommandDispatcher(handlers, sender, memberRepo, groupRepo)
}

let _dispatcher: CommandDispatcher | null = null
function getDispatcher(): CommandDispatcher {
  if (!_dispatcher) _dispatcher = buildDispatcher()
  return _dispatcher
}

// ── Public API (called by the webhook route) ─────────────────────────────────

let _presence: GroupPresenceService | null = null
function getPresence(): GroupPresenceService {
  if (!_presence) {
    const sender = getTelegramSender()
    _presence = new GroupPresenceService(sender, memberRepo, groupRepo, new MiniAppService(sender, groupRepo))
  }
  return _presence
}

export async function handleWebhookUpdate(update: TelegramUpdate): Promise<void> {
  // The bot itself was added, removed or promoted: set the group up (or stop using it) on its own
  if (update.my_chat_member) {
    if (!(await getIdempotencyGuard().markProcessed(update.update_id))) return
    try {
      await getPresence().handle(update.my_chat_member)
    } catch (err) {
      console.error(`[Telegram] my_chat_member ${update.update_id} failed:`, err)
    }
    return
  }

  const message = update.message
  if (!message?.from) return

  const idempotency = getIdempotencyGuard()
  const isNew = await idempotency.markProcessed(update.update_id)
  if (!isNew) {
    console.log(`[Telegram] Duplicate update ${update.update_id} skipped`)
    return
  }

  const rateLimiter = getRateLimiter()
  if (!rateLimiter.isAllowed(message.from.id)) {
    const retry = rateLimiter.retryAfterSeconds(message.from.id)
    const sender = getTelegramSender()
    await sender.sendMessage(
      message.chat.id,
      `⚠️ Slow down! Try again in ${retry}s.`,
    )
    return
  }

  try {
    await getDispatcher().dispatch(update)
  } catch (err) {
    console.error(`[Telegram] Unhandled error for update ${update.update_id}:`, err)
    // Never let an error propagate to the webhook — Telegram would retry
  }
}

// Re-export GroupRepository for the /api/mess/link-group route
export { groupRepo, GroupRepository }
