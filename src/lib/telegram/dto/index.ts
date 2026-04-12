// ─── Telegram Wire Types ────────────────────────────────────────────────────

export interface TelegramUser {
  id: number
  first_name: string
  last_name?: string
  username?: string
  is_bot?: boolean
}

export interface TelegramChat {
  id: number
  type: 'private' | 'group' | 'supergroup' | 'channel'
  title?: string
}

export interface TelegramMessage {
  message_id: number
  from?: TelegramUser
  chat: TelegramChat
  text?: string
  date: number
}

export interface TelegramUpdate {
  update_id: number
  message?: TelegramMessage
}

// ─── Application Enums ──────────────────────────────────────────────────────

export enum MealType {
  BREAKFAST = 'breakfast',
  LUNCH = 'lunch',
  DINNER = 'dinner',
}

export enum UserRole {
  ADMIN = 'ADMIN',
  MANAGER = 'MANAGER',
  MEMBER = 'MEMBER',
  GUEST = 'GUEST',
}

export enum CommandType {
  START = '/start',
  LINK = '/link',
  VERIFY = '/verify',
  STATUS = '/status',
  MEAL = '/meal',
  NOMEAL = '/nomeal',
  MEALON = '/mealon',
  ANNOUNCE = '/announce',
  RATE = '/rate',
  BALANCE = '/balance',
}

// ─── Resolved Context (passed to every handler) ─────────────────────────────

export interface ResolvedMember {
  id: string
  messId: string
  name: string
  role: string
}

export interface ResolvedGroup {
  id: string
  chatId: string
  messId: string
  timezone: string
}

export interface CommandContext {
  update: TelegramUpdate
  message: TelegramMessage
  chatId: number
  telegramUid: number
  /** e.g. "/meal" — always lowercase, without bot suffix */
  command: string
  /** everything after the command word, split by whitespace */
  args: string[]
  /** null until /link is complete */
  member: ResolvedMember | null
  /** null for private chats not registered as a group */
  group: ResolvedGroup | null
}

// ─── Service DTOs ────────────────────────────────────────────────────────────

export interface MealToggleRequest {
  memberId: string
  messId: string
  date: string
  slot: MealType | 'all'
  value: boolean
  timezone: string
}

export interface NoMealRequest {
  messId: string
  date: string
  actorName: string
  reason?: string
}

export interface BroadcastRequest {
  messId: string
  message: string
  senderName: string
}

export interface LinkRequest {
  telegramId: number
  phone: string
}

export interface VerifyRequest {
  telegramId: number
  otp: string
}

export interface BalanceResult {
  memberName: string
  month: string
  contributed: number
  mealCost: number
  balance: number
}

export interface RateResult {
  month: string
  totalExpense: number
  totalMeals: number
  mealRate: number
}
