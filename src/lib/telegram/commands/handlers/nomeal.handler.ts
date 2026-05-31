import type { CommandHandler } from '../types'
import type { CommandContext } from '../../dto'
import type { NoMealService } from '../../services/nomeal.service'
import type { TelegramSender } from '../../infrastructure/sender'

const PRIVILEGED_ROLES = new Set(['ADMIN', 'MANAGER'])

export class NoMealCommandHandler implements CommandHandler {
  constructor(
    private readonly noMealService: NoMealService,
    private readonly sender: TelegramSender,
  ) {}

  supports(command: string): boolean {
    return command === '/nomeal'
  }

  async handle(ctx: CommandContext): Promise<void> {
    if (!ctx.member) {
      await this.sender.sendMessage(ctx.chatId, `❌ Account not linked. Use \`/link <phone>\``)
      return
    }
    if (!PRIVILEGED_ROLES.has(ctx.member.role)) {
      await this.sender.sendMessage(ctx.chatId, `❌ Only admins and managers can use this command.`)
      return
    }

    const timezone = ctx.group?.timezone ?? 'Asia/Dhaka'
    const [dateArg, ...rest] = ctx.args
    const hasDateArg = isDateArg(dateArg)
    const targetDate = hasDateArg ? parseDateArg(dateArg, timezone) : localDate(timezone)
    const reason = (hasDateArg ? rest : ctx.args).join(' ').trim() || undefined

    const result = await this.noMealService.disableAllMeals(
      ctx.member.messId, targetDate, ctx.member.name, reason,
    )
    await this.sender.sendMessage(ctx.chatId, result.message)
  }
}

export class MealOnCommandHandler implements CommandHandler {
  constructor(
    private readonly noMealService: NoMealService,
    private readonly sender: TelegramSender,
  ) {}

  supports(command: string): boolean {
    return command === '/mealon'
  }

  async handle(ctx: CommandContext): Promise<void> {
    if (!ctx.member) {
      await this.sender.sendMessage(ctx.chatId, `❌ Account not linked. Use \`/link <phone>\``)
      return
    }
    if (!PRIVILEGED_ROLES.has(ctx.member.role)) {
      await this.sender.sendMessage(ctx.chatId, `❌ Only admins and managers can use this command.`)
      return
    }

    const timezone = ctx.group?.timezone ?? 'Asia/Dhaka'
    const targetDate = parseDateArg(ctx.args[0], timezone)
    const result = await this.noMealService.enableAllMeals(ctx.member.messId, targetDate, ctx.member.name)
    await this.sender.sendMessage(ctx.chatId, result.message)
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function localDate(timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date())
}

function isDateArg(arg?: string): boolean {
  if (!arg) return false
  return arg === 'today' || arg === 'tomorrow' || /^\d{4}-\d{2}-\d{2}$/.test(arg)
}

function parseDateArg(arg: string | undefined, timezone: string): string {
  const today = localDate(timezone)
  if (!arg || arg === 'today') return today
  if (arg === 'tomorrow') {
    const d = new Date(today)
    d.setUTCDate(d.getUTCDate() + 1)
    return d.toISOString().slice(0, 10)
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(arg)) return arg
  return today
}
