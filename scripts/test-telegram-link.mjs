/**
 * Telegram test: linking (/link, /start CODE, /linkgroup), the bot setting itself up in groups
 * (my_chat_member, /mealtill) and the Mini App's identity check, including the ways they could be abused.
 *
 *   npm run dev            (in another terminal)
 *   npm run test:telegram
 *
 * Plays Telegram by posting updates to the real webhook with the real secret. The bot's replies
 * go to made-up chat ids, so nothing is delivered to anyone. Cleans up after itself.
 */
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'
import { createHmac, randomBytes, randomInt } from 'node:crypto'

const BASE = process.env.TEST_BASE_URL || 'http://localhost:3000'
const SECRET = process.env.TELEGRAM_WEBHOOK_SECRET
if (!SECRET) { console.error('TELEGRAM_WEBHOOK_SECRET is not set'); process.exit(1) }
const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL) })
const tag = randomBytes(4).toString('hex')
const PASSWORD = `Tg-${tag}-pass`
let failures = 0
const results = []
const check = (name, ok, info = '') => { results.push({ name, ok, info }); if (!ok) failures++ }

let updateId = Date.now() % 1_000_000_000
const uid = () => randomInt(100_000_000, 900_000_000)
const GROUP_CHAT = -(1_000_000_000_000 + randomInt(1, 900_000_000))
const OTHER_GROUP = GROUP_CHAT - 1

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined })
  let json = null; try { json = await res.json() } catch { /* empty */ }
  return { status: res.status, json }
}
async function login(email) {
  const r = await api('/api/auth/login', { method: 'POST', body: { email, password: PASSWORD } })
  if (!r.json?.access_token) throw new Error(`login failed ${email}: ${r.status}`)
  return r.json.access_token
}
/** Send a Telegram update to the webhook. chat.type 'private' or 'supergroup'. */
async function say(fromId, chatId, text, type = 'supergroup') {
  const res = await fetch(BASE + '/api/telegram/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-telegram-bot-api-secret-token': SECRET },
    body: JSON.stringify({ update_id: ++updateId, message: { message_id: updateId, date: Math.floor(Date.now() / 1000), from: { id: fromId, first_name: 'T' }, chat: { id: chatId, type, title: 'House group' }, text } }),
  })
  await new Promise((r) => setTimeout(r, 400)) // let the handler finish
  return res.status
}
const linkedGroup = (chatId) => prisma.telegramGroup.findFirst({ where: { chatId: String(chatId), isActive: true } })

const hash = await bcrypt.hash(PASSWORD, 10)
async function makeMess(label) {
  const mess = await prisma.mess.create({ data: { name: `Tg ${label} ${tag}`, inviteCode: `TG-${label}-${tag}`.toUpperCase(), cutOffTime: new Date('1970-01-01T21:00:00Z'), requireJoinApproval: false } })
  const mk = (name, role, telegramUid) => prisma.member.create({
    data: { messId: mess.id, name, email: `tg-${label}-${name.toLowerCase()}-${tag}@test.invalid`, passwordHash: hash, role, telegramUid: telegramUid ? BigInt(telegramUid) : null, telegramLinked: !!telegramUid },
  })
  return { mess, mk }
}

try {
  const A = await makeMess('a')
  const adminUid = uid(), memberUid = uid(), strangerUid = uid()
  const admin = await A.mk('Admin', 'ADMIN', adminUid)
  const plain = await A.mk('Plain', 'MEMBER', memberUid)
  const B = await makeMess('b')
  const bAdminUid = uid()
  const bAdmin = await B.mk('Admin', 'ADMIN', bAdminUid)
  await prisma.mess.update({ where: { id: A.mess.id }, data: { ownerId: admin.id } })
  const tAdmin = await login(admin.email)
  const tPlain = await login(plain.email)
  const tBAdmin = await login(bAdmin.email)


  // Only an admin can ask for a group code
  let r = await api('/api/admin/telegram-group/code', { method: 'POST', token: tPlain })
  check('a plain member cannot get a group code', r.status === 403, `status ${r.status}`)
  r = await api('/api/admin/telegram-group/code', { method: 'POST', token: tAdmin })
  check('the admin gets a group code', r.status === 200 && /^[A-Z0-9]{8}$/.test(r.json?.code ?? ''), JSON.stringify(r.json))
  check('it says the admin is linked', r.json?.admin_telegram_linked === true)
  const code = r.json.code

  // A forged update (wrong secret) must be ignored even with a valid code from a linked admin
  await fetch(BASE + '/api/telegram/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-telegram-bot-api-secret-token': 'not-the-secret' },
    body: JSON.stringify({ update_id: ++updateId, message: { message_id: 1, date: 1, from: { id: adminUid, first_name: 'T' }, chat: { id: GROUP_CHAT, type: 'supergroup', title: 'House group' }, text: `/linkgroup ${code}` } }),
  })
  await new Promise((r) => setTimeout(r, 400))
  check('a forged update with the wrong secret is ignored', !(await linkedGroup(GROUP_CHAT)))

  // Abuse attempts that must NOT link the group
  await say(adminUid, adminUid, `/linkgroup ${code}`, 'private')
  check('/linkgroup in a private chat does nothing', !(await linkedGroup(adminUid)) && !(await linkedGroup(GROUP_CHAT)))
  await say(strangerUid, GROUP_CHAT, `/linkgroup ${code}`)
  check('a stranger with the code cannot link the group', !(await linkedGroup(GROUP_CHAT)))
  await say(memberUid, GROUP_CHAT, `/linkgroup ${code}`)
  check('a plain member with the code cannot link the group', !(await linkedGroup(GROUP_CHAT)))
  await say(bAdminUid, GROUP_CHAT, `/linkgroup ${code}`)
  check("another mess's admin cannot use this mess's code", !(await linkedGroup(GROUP_CHAT)))
  await say(adminUid, GROUP_CHAT, '/linkgroup AAAAAAAA')
  check('a wrong code does nothing', !(await linkedGroup(GROUP_CHAT)))

  // A group code must not link a person, and a member code must not link a group
  await say(strangerUid, strangerUid, `/link ${code}`, 'private')
  check('a group code cannot link a personal account', (await prisma.member.count({ where: { telegramUid: BigInt(strangerUid) } })) === 0)
  r = await api('/api/members/telegram-link', { method: 'POST', token: tPlain })
  const memberCode = r.json?.code
  await say(memberUid, GROUP_CHAT, `/linkgroup ${memberCode}`)
  check('a personal link code cannot link a group', !(await linkedGroup(GROUP_CHAT)))

  // The real thing
  await say(adminUid, GROUP_CHAT, `/linkgroup ${code}`)
  const g = await linkedGroup(GROUP_CHAT)
  check('the admin links the group with the code', !!g && g.messId === A.mess.id, g ? '' : 'no group row')
  check('the group takes the house name', g?.chatName === 'House group')
  await say(adminUid, GROUP_CHAT, `/linkgroup ${code}`)
  check('the code works only once', (await prisma.telegramGroup.count({ where: { chatId: String(GROUP_CHAT), messId: A.mess.id } })) === 1)

  // Another mess cannot take the group over
  r = await api('/api/admin/telegram-group/code', { method: 'POST', token: tBAdmin })
  await say(bAdminUid, GROUP_CHAT, `/linkgroup ${r.json.code}`)
  const after = await linkedGroup(GROUP_CHAT)
  check('another mess cannot take over a linked group', after?.messId === A.mess.id)

  // The group can be replaced by the same mess; only one stays active
  r = await api('/api/admin/telegram-group/code', { method: 'POST', token: tAdmin })
  await say(adminUid, OTHER_GROUP, `/linkgroup ${r.json.code}`)
  check('the admin can move the mess to a new group', (await linkedGroup(OTHER_GROUP))?.messId === A.mess.id && !(await linkedGroup(GROUP_CHAT)))

  // Member linking still works as before
  r = await api('/api/members/telegram-link', { method: 'POST', token: tPlain })
  const freshUid = uid()
  await say(freshUid, freshUid, `/link ${r.json.code}`, 'private')
  const linked = await prisma.member.findUnique({ where: { id: plain.id }, select: { telegramUid: true } })
  check('a member can still link with /link', linked?.telegramUid === BigInt(freshUid))

  // ── Mini App: identity comes only from Telegram's signature ─────────────────
  const TOKEN = process.env.TELEGRAM_BOT_TOKEN
  const sign = (user, { authDate = Math.floor(Date.now() / 1000), token = TOKEN } = {}) => {
    const fields = { auth_date: String(authDate), query_id: `AAH${tag}`, user: JSON.stringify(user) }
    const dataCheck = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join('\n')
    const key = createHmac('sha256', 'WebAppData').update(token).digest()
    return new URLSearchParams({ ...fields, hash: createHmac('sha256', key).update(dataCheck).digest('hex') }).toString()
  }
  const home = async (initData) => {
    const res = await fetch(BASE + '/api/tg/home', { headers: initData ? { 'X-Telegram-Init-Data': initData } : {} })
    let json = null; try { json = await res.json() } catch { /* empty */ }
    return { status: res.status, json }
  }
  r = await home(null)
  check('Mini App without Telegram data is refused', r.status === 401, `status ${r.status}`)
  r = await home(sign({ id: freshUid, first_name: 'P' }, { token: '123456:not-our-bot' }))
  check('Mini App data signed by another bot is refused', r.status === 401, `status ${r.status}`)
  const genuine = sign({ id: freshUid, first_name: 'P' })
  r = await home(genuine.replace(encodeURIComponent(`"id":${freshUid}`), encodeURIComponent(`"id":${adminUid}`)))
  check('Mini App data with a swapped user id is refused', r.status === 401, `status ${r.status}`)
  r = await home(sign({ id: freshUid, first_name: 'P' }, { authDate: Math.floor(Date.now() / 1000) - 25 * 3600 }))
  check('Mini App data older than a day is refused', r.status === 401, `status ${r.status}`)
  r = await home(sign({ id: strangerUid, first_name: 'S' }))
  check('a stranger in the Mini App sees only the link card', r.status === 200 && r.json?.linked === false && !r.json?.money, JSON.stringify(r.json).slice(0, 120))
  r = await home(genuine)
  check('a linked member sees their own mess', r.status === 200 && r.json?.linked === true && r.json?.member?.name === 'Plain' && r.json?.mess?.name === A.mess.name)
  check('...with today, money and who is eating', !!r.json?.today && typeof r.json?.money?.balance === 'number' && !!r.json?.headcount?.lunch)
  r = await home(sign({ id: bAdminUid, first_name: 'B' }))
  check("another mess's member sees only their own mess", r.json?.mess?.name === B.mess.name)

  // ── The bot sets itself up when added to a group (my_chat_member) ────────────
  const botUser = { id: 999_000_111, is_bot: true, first_name: 'Mealtill' }
  async function joined(fromId, chatId, oldStatus, newStatus, { type = 'supergroup', secret = SECRET } = {}) {
    await fetch(BASE + '/api/telegram/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-telegram-bot-api-secret-token': secret },
      body: JSON.stringify({ update_id: ++updateId, my_chat_member: {
        chat: { id: chatId, type, title: 'New house' }, from: { id: fromId, first_name: 'T' }, date: Math.floor(Date.now() / 1000),
        old_chat_member: { status: oldStatus, user: botUser }, new_chat_member: { status: newStatus, user: botUser },
      } }),
    })
    await new Promise((res) => setTimeout(res, 400))
  }
  const G3 = OTHER_GROUP - 7, G4 = OTHER_GROUP - 8
  await joined(adminUid, G3, 'left', 'member', { secret: 'forged' })
  check('a forged "bot added" event is ignored', !(await linkedGroup(G3)))
  await joined(freshUid, G3, 'left', 'member')
  check('a plain member adding the bot does not connect the group', !(await linkedGroup(G3)))
  await joined(strangerUid, G3, 'left', 'member')
  check('a stranger adding the bot does not connect the group', !(await linkedGroup(G3)))
  await joined(adminUid, adminUid, 'kicked', 'member', { type: 'private' })
  check('a private chat event connects nothing', !(await linkedGroup(adminUid)))
  await joined(adminUid, G3, 'left', 'member')
  let g3 = await linkedGroup(G3)
  check('an admin adding the bot connects the group by itself', g3?.messId === A.mess.id && g3?.chatName === 'New house')
  await joined(adminUid, G3, 'member', 'administrator')
  check('making the bot an admin keeps it connected', (await prisma.telegramGroup.count({ where: { chatId: String(G3), isActive: true } })) === 1)
  await joined(bAdminUid, G3, 'left', 'member')
  check("another mess's admin cannot take the group by re-adding the bot", (await linkedGroup(G3))?.messId === A.mess.id)
  await joined(adminUid, G3, 'administrator', 'left')
  check('removing the bot disconnects the group', !(await linkedGroup(G3)))
  await joined(adminUid, G3, 'left', 'member')
  check('adding it back connects it again', (await linkedGroup(G3))?.messId === A.mess.id)

  // ── /mealtill in a group ───────────────────────────────────────────────────────
  await say(freshUid, G4, '/mealtill')
  check('/mealtill from a plain member does not connect a new group', !(await linkedGroup(G4)))
  await say(adminUid, G4, '/mealtill')
  check('/mealtill from the admin connects the group', (await linkedGroup(G4))?.messId === A.mess.id)
  await say(freshUid, G4, '/mealio')
  check('the old /mealio still works in a connected group and keeps it as it is', (await prisma.telegramGroup.count({ where: { chatId: String(G4), isActive: true, messId: A.mess.id } })) === 1)

  // ── /start CODE: one-tap linking, private chats only ─────────────────────────
  const third = await A.mk('Third', 'MEMBER', null)
  const tThird = await login(third.email)
  const startCode = (await api('/api/members/telegram-link', { method: 'POST', token: tThird })).json?.code
  const thirdUid = uid()
  await say(thirdUid, GROUP_CHAT, `/start ${startCode}`)
  check('/start CODE in a group does not link anyone', (await prisma.member.findUnique({ where: { id: third.id } }))?.telegramUid === null)
  await say(thirdUid, thirdUid, `/start ${startCode}`, 'private')
  check('/start CODE in a private chat links the account', (await prisma.member.findUnique({ where: { id: third.id } }))?.telegramUid === BigInt(thirdUid))
} catch (err) {
  console.error(err)
  failures++
} finally {
  const messes = await prisma.mess.findMany({ where: { name: { endsWith: tag } }, select: { id: true } })
  const ids = messes.map((m) => m.id)
  await prisma.telegramGroup.deleteMany({ where: { messId: { in: ids } } })
  await prisma.telegramOtp.deleteMany({ where: { OR: [{ messId: { in: ids } }, { memberId: { in: (await prisma.member.findMany({ where: { messId: { in: ids } }, select: { id: true } })).map((m) => m.id) } }] } })
  await prisma.securityEvent.deleteMany({ where: { OR: [{ messId: { in: ids } }, { email: { endsWith: `${tag}@test.invalid` } }] } })
  await prisma.auditLog.deleteMany({ where: { messId: { in: ids } } })
  await prisma.mess.deleteMany({ where: { id: { in: ids } } })
  await prisma.$disconnect()
}

for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : `  (${r.info})`}`)
console.log(`\n${results.length - failures}/${results.length} passed`)
process.exit(failures ? 1 : 0)
