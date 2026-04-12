import type { CommandHandler } from '../types'
import type { CommandContext } from '../../dto'
import { MealType } from '../../dto'
import type { MealService } from '../../services/meal.service'
import type { MemberRepository } from '../../repositories/member.repository'
import type { TelegramSender } from '../../infrastructure/sender'

const VALID_SLOTS = new Set<string>(Object.values(MealType))

export class MealCommandHandler implements CommandHandler {
  constructor(
    private readonly mealService: MealService,
    private readonly memberRepo: MemberRepository,
    private readonly sender: TelegramSender,
  ) {}

  supports(command: string): boolean {
    return command === '/meal'
  }

  async handle(ctx: CommandContext): Promise<void> {
    if (!ctx.member) {
      await this.sender.sendMessage(ctx.chatId, `❌ Link your account first: \`/link <phone>\``)
      return
    }

    const { member } = ctx
    const today = localDate(ctx.group?.timezone ?? 'Asia/Dhaka')
    const timezone = ctx.group?.timezone ?? 'Asia/Dhaka'
    const cutoffTime = await this.memberRepo.getMessCutoff(member.messId)

    const sub = ctx.args[0]?.toLowerCase()

    // /status via /meal with no args
    if (!sub) {
      const result = await this.mealService.getStatus(member.id, member.messId, today)
      await this.sender.sendMessage(ctx.chatId, result.message)
      return
    }

    if (sub === 'on' || sub === 'off') {
      const result = await this.mealService.toggleAll(
        member.id, member.messId, today, sub === 'on', cutoffTime, timezone,
      )
      await this.sender.sendMessage(ctx.chatId, result.message)
      return
    }

    if (VALID_SLOTS.has(sub)) {
      const result = await this.mealService.toggleSlot(
        member.id, member.messId, today, sub as MealType, cutoffTime, timezone,
      )
      await this.sender.sendMessage(ctx.chatId, result.message)
      return
    }

    if (sub === 'guest') {
      const count = parseInt(ctx.args[1] ?? '', 10)
      const result = await this.mealService.setGuestCount(
        member.id, member.messId, today, count, cutoffTime, timezone,
      )
      await this.sender.sendMessage(ctx.chatId, result.message)
      return
    }

    await this.sender.sendMessage(
      ctx.chatId,
      `❓ Unknown meal sub-command.\n\n*Usage:*\n\`/meal on\` \`/meal off\`\n\`/meal breakfast\` \`/meal lunch\` \`/meal dinner\`\n\`/meal guest N\``,
    )
  }
}

function localDate(timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date())
}
