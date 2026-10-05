# Module 11 — Telegram Bot

## What This Module Does

A full Telegram bot that lets mess members toggle meals, check status, view balances, and lets admins broadcast messages and run no-cook commands — all via Telegram commands. No page in the frontend — runs as a webhook handler.

---

## Files Overview

```
src/lib/telegram/
├── index.ts                          ← Composition root. Only public export: handleWebhookUpdate()
├── dto/index.ts                      ← All TypeScript interfaces (wire types + DTOs)
├── commands/
│   ├── dispatcher.ts                 ← Routes updates to correct handler
│   ├── types.ts                      ← CommandHandler interface
│   └── handlers/
│       ├── start.handler.ts          ← /start — welcome message
│       ├── link.handler.ts           ← /link <code> — link with a code from web Settings
│       ├── meal.handler.ts           ← /meal [subcommand] — full meal management
│       ├── status.handler.ts         ← /status — today's meal status
│       ├── nomeal.handler.ts         ← /nomeal, /mealon — admin bulk toggle
│       ├── announce.handler.ts       ← /announce <message> — broadcast
│       ├── rate.handler.ts           ← /rate — current meal rate
│       └── balance.handler.ts        ← /balance — personal balance
├── services/
│   ├── meal.service.ts               ← Individual meal slot management
│   ├── nomeal.service.ts             ← Bulk meal toggle + notification
│   ├── linking.service.ts            ← OTP-based account linking
│   ├── announce.service.ts           ← Broadcast messages
│   └── report.service.ts             ← Rate and balance reports
├── repositories/
│   ├── meal.repository.ts            ← DailyLog CRUD
│   ├── meal-config.repository.ts     ← Per-meal cutoff configs
│   ├── member.repository.ts          ← Member lookups + linking
│   ├── preference.repository.ts      ← Meal preferences
│   ├── group.repository.ts           ← TelegramGroup registration
│   └── otp.repository.ts             ← OTP creation + verification
└── infrastructure/
    ├── sender.ts                     ← TelegramSender (HTTP to Telegram Bot API)
    ├── rate-limiter.ts               ← Per-user rate limiting
    └── idempotency.ts                ← Duplicate update_id protection
```

**Webhook entry point:** `src/app/api/telegram/webhook/route.ts` → calls `handleWebhookUpdate(update)`

---

## Architecture: Dependency Injection

The bot uses manual constructor injection. `index.ts` is the composition root:

```
handleWebhookUpdate()
  └── CommandDispatcher
        ├── MealCommandHandler(MealService, MealConfigRepo, PrefRepo, Sender)
        ├── NoMealCommandHandler(NoMealService, Sender)
        ├── LinkCommandHandler(AccountLinkingService, Sender)
        ├── VerifyCommandHandler(AccountLinkingService, Sender)
        ├── StatusCommandHandler(MealService, Sender)
        ├── RateCommandHandler(ReportService, Sender)
        ├── BalanceCommandHandler(ReportService, Sender)
        ├── AnnounceCommandHandler(AnnounceService, Sender)
        └── StartCommandHandler(Sender)
```

**Singletons:** All repos, services, and the dispatcher are module-level singletons (lazy-init via `getDispatcher()`). The `TelegramSender` is also a singleton (one per process).

---

## Infrastructure

### `sender.ts` — TelegramSender

```typescript
class TelegramSender {
  sendMessage(chatId: number, text: string): Promise<void>
  // ↑ Never throws. Swallows errors and logs them.
  // Uses parse_mode: 'Markdown' — use *bold*, _italic_, `code`.

  sendBulkMessages(chatIds: number[], text: string): Promise<{ sent, failed }>
  // Sends in batches of 25. Uses Promise.allSettled — one failure doesn't abort.
}
```

### `rate-limiter.ts` — RateLimiter

In-memory token bucket. Default: 5 requests per user per 10 seconds.
```typescript
rateLimiter.isAllowed(telegramUid: number): boolean
rateLimiter.retryAfterSeconds(telegramUid: number): number
```

### `idempotency.ts` — IdempotencyGuard

In-memory Set of processed `update_id`s. Prevents double-processing if Telegram re-delivers.
```typescript
idempotency.markProcessed(updateId: number): Promise<boolean>
// Returns true if new, false if already seen.
```

---

## `handleWebhookUpdate(update)` — Entry Point Flow

```
1. Extract message from update
2. Check idempotency (skip if duplicate update_id)
3. Check rate limit (warn user if exceeded)
4. dispatcher.dispatch(update)
   a. Parse command from message.text
   b. Parallel DB lookups: findByTelegramUid + findByChatId
   c. Build CommandContext { chatId, telegramUid, command, args, member, group }
   d. Find first handler where handler.supports(command) === true
   e. Call handler.handle(ctx)
5. Catch all errors — NEVER let exceptions propagate (Telegram would retry endlessly)
```

---

## `CommandContext` — Passed to Every Handler

```typescript
interface CommandContext {
  update: TelegramUpdate
  message: TelegramMessage
  chatId: number              // chat where command was sent
  telegramUid: number         // sender's Telegram user ID
  command: string             // "/meal" (lowercase, no @bot suffix)
  args: string[]              // everything after command, split by whitespace
  member: ResolvedMember | null  // null until /link is complete
  group: ResolvedGroup | null    // null for private chats
  timezone: string               // mess timezone from mess settings (group's, then default)
}

interface ResolvedMember { id, messId, name, role }
interface ResolvedGroup  { id, chatId, messId, timezone }
```

**`member` is null** for unlinked users. Every handler that needs a member must check first:
```typescript
if (!ctx.member) {
  await this.sender.sendMessage(ctx.chatId, "❌ Account not linked. Send `/link` to see how.")
  return
}
```

---

## Commands Reference

### `/start`

Welcome message with list of available commands. No member required.

---

### `/link <code>`

`AccountLinkingService.linkWithCode(telegramId, code)`
1. The member gets the code in web **Settings → My Telegram** (`POST /api/members/telegram-link`, logged in — this is what proves ownership)
2. `OtpRepository.consumeLinkCode` — unused, unexpired, claimed atomically (only one redeem wins)
3. Member must still be active
4. Any other member holding this Telegram id is unlinked, then `telegramUid` + `telegramLinked: true` are set

`/link` with no code replies with instructions. There is no `/verify` and no phone-number lookup any more.



### `/meal [subcommand]`

Same rules as the web app (`MealService`): `ensureDailyLogs` runs first so today's row comes from the member's defaults; counts must be whole numbers `0 … maxCount`; a meal switched off for the mess can't be turned on; frozen days are refused; slot cutoffs enforced in the handler; guests `0 … 20`.


Full syntax:
```
/meal              → show today's status
/meal on           → enable next upcoming meal (time-based targeting)
/meal off          → disable next upcoming meal (time-based targeting)
/meal breakfast    → toggle breakfast (current count: 0 → defaultCount, >0 → 0)
/meal lunch        → toggle lunch
/meal dinner       → toggle dinner
/meal lunch 2      → set lunch to 2 portions explicitly
/meal breakfast 0  → disable breakfast explicitly
/meal guest 3      → set guest count to 3
```

**Time-based targeting for `/meal on` / `/meal off`:**
```typescript
const target = await mealConfigRepo.getTargetMeal(member.messId, timezone)
// Sorts enabled meal_configs by cutoff_time ASC
// Returns first where now < cutoff_time
// Returns null if all cutoffs passed
```

Example for default config (B=08:30, L=13:00, D=21:00):
- 07:00 → targets BREAKFAST
- 09:00 → targets LUNCH
- 14:00 → targets DINNER
- 22:00 → null (all passed, rejected)

---

### `/status`

`MealService.getStatus(memberId, messId, today)` → formatted message with all slot counts.

---

### `/nomeal [reason]`

**ADMIN/MANAGER only.** Calls `NoMealService.disableAllMeals()`:
1. Sets all member DailyLogs to `breakfastCount: 0, lunchCount: 0, dinnerCount: 0` (`overrideType: 'ADMIN'`)
2. Broadcasts to all Telegram-linked members: "No meals today — posted by [actorName]. Reason: ..."
3. Returns count of members updated + notified

---

Refused for dates in a closed month. Audited as `NO_COOK` (`via: 'telegram'`).

### `/mealon`

**ADMIN/MANAGER only.** Calls `NoMealService.enableAllMeals()`:
1. Fetches each member's preferences (`getBulkMealDefaults()`)
2. Restores each member to their OWN defaults (not blanket all-1)
3. Sets `isOverride: false, overrideType: null` (like an automatic day)
4. Broadcasts notification

---

Refused for dates in a closed month. Audited as `NO_COOK`.

### `/rate`

`ReportService.getMonthRate(messId, yearMonth)` → formatted message with total expense, total meals, meal rate.

---

### `/balance`

`ReportService.getMemberBalance(memberId, messId, yearMonth)` → personal balance summary.

---

### `/announce <message>`

**ADMIN/MANAGER only.** `AnnounceService.broadcast(messId, message, senderName)` → sends the message to all Telegram-linked members.

---

## Repositories

### `MealRepository`

| Method | Purpose |
|--------|---------|
| `findLog(memberId, messId, date)` | Get single DailyLog |
| `upsertLog(memberId, messId, date, data, defaults?)` | Create or update log |
| `updateLog(id, data)` | Update specific fields on existing log |
| `bulkUpsertLogs(memberIds, messId, date, data, overrideType)` | Bulk update for all members |
| `bulkRestoreFromPrefs(prefsMap, messId, date)` | Restore each member to their own defaults |

### `MealConfigRepository`

| Method | Purpose |
|--------|---------|
| `getMessConfigs(messId)` | All meal configs sorted by cutoff ASC |
| `getTargetMeal(messId, timezone)` | First meal where now < cutoff (or null) |
| `getMealConfig(messId, mealType)` | Config for a specific meal |
| `isCutoffPassed(messId, mealType, timezone)` | Boolean check for a specific slot |

Reads configs from `getMessSettings` (Redis); defaults come from `DEFAULT_MEAL_CONFIGS`.

### `MemberRepository`

| Method | Purpose |
|--------|---------|
| `findByTelegramUid(telegramUid)` | Resolve member from Telegram ID |
| `findActiveById(memberId)` | Member for code linking |
| `linkTelegram(memberId, telegramUid)` | Unlink any previous owner of the Telegram id, then link |
| `findLinkedByMess(messId)` | All Telegram-linked members (for broadcasts) |
| `findAllActiveByMess(messId)` | All active members (for bulk updates) |

### `PreferenceRepository`

Wraps `getBulkMealDefaults()` from `src/lib/meal-preferences.ts`.

| Method | Purpose |
|--------|---------|
| `getMemberPreferences(memberId, messId, date)` | Single member defaults |
| `getBulkPreferences(memberIds, messId, date)` | Map of member → defaults |

### `GroupRepository`

| Method | Purpose |
|--------|---------|
| `findByChatId(chatId)` | Resolve group (for timezone) |
| `register(chatId, chatName, messId, timezone)` | Link/update a Telegram group |

### `OtpRepository`

| Method | Purpose |
|--------|---------|
| `createLinkCode(memberId)` | 8-char code, 10-min TTL, invalidates the member's older codes |
| `consumeLinkCode(code, telegramId)` | Atomic single use → memberId or null |

---

## Adding a New Command

1. Create handler in `src/lib/telegram/commands/handlers/your.handler.ts`
2. Implement `CommandHandler` interface:
   ```typescript
   interface CommandHandler {
     supports(command: string): boolean  // e.g. return command === '/yourcommand'
     handle(ctx: CommandContext): Promise<void>
   }
   ```
3. Register in `index.ts` `buildDispatcher()` array
4. Add enum to `CommandType` in `dto/index.ts`

---

## Common Pitfalls

1. **`member` can be null** in CommandContext — always check before accessing `member.id` or `member.messId`. The only handler that doesn't need a member is `/start`.
2. **`group` can be null** for private chats. Always use `ctx.timezone` (mess settings), never a hard-coded zone.
3. **Never throw in a handler** — errors must be caught internally. If `handleWebhookUpdate` throws, Telegram retries the update, creating infinite loops.
4. **`telegramUid` is stored as `BigInt`** in Prisma (Postgres `bigint`). The repository converts: `BigInt(telegramUid)` when writing. When reading, comparisons work normally.
5. **Markdown in messages** uses Telegram's MarkdownV1 (parse_mode: 'Markdown'): `*bold*`, `_italic_`, `` `code` ``. NOT MarkdownV2. Don't use `**` or `__`.
6. **Rate limiter is in-memory** — resets on server restart (Vercel cold start). This is acceptable for a mess app.
7. **`/rate` and `/balance`** use `calculatePeriodSummary` for the current open period — identical to the web app.
8. **Webhook secret is required.** Without `TELEGRAM_WEBHOOK_SECRET` the webhook rejects every update (503).
