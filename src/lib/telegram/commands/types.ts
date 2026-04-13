import type { CommandContext } from '../dto'

/**
 * CommandHandler — the contract every bot command must implement.
 *
 * `supports()` answers: "is this command mine?"
 * `handle()`   does the work and sends a reply via ctx or the injected sender.
 *
 * Handlers are registered in order; the first matching handler wins.
 * This eliminates if-else chains and makes adding new commands O(1).
 */
export interface CommandHandler {
  supports(command: string): boolean
  handle(ctx: CommandContext): Promise<void>
}
