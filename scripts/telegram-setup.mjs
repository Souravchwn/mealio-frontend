/**
 * Connect the Telegram bot to this app.
 *
 *   npm run telegram:setup -- https://your-public-url        register the webhook, set the command menu, verify
 *   npm run telegram:setup                                    only check the current state
 *   npm run telegram:setup -- --remove                        remove the webhook (stop the bot)
 *
 * Needs TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET in .env.local. The URL must be public HTTPS
 * (your deployed site, or a tunnel to localhost). Nothing secret is ever printed.
 */
const token = process.env.TELEGRAM_BOT_TOKEN
const secret = process.env.TELEGRAM_WEBHOOK_SECRET
const args = process.argv.slice(2)
const remove = args.includes('--remove')
const base = args.find((a) => a.startsWith('http'))

if (!token || !secret) {
  console.error('Set TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET in .env.local first.')
  process.exit(1)
}

const tg = (method, body) =>
  fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  }).then((r) => r.json())

const me = await tg('getMe')
if (!me.ok) {
  console.error(`Telegram does not accept this bot token (${me.description}). Create the bot with @BotFather and paste its token into .env.local.`)
  process.exit(1)
}
console.log(`Bot: @${me.result.username} (${me.result.first_name})`)

const COMMANDS = [
  ['start', 'Welcome message and command list'],
  ['link', 'Link your Mealtill account: /link CODE from web Settings'],
  ['mealtill', '[Admin] Activate me in this group: just send /mealtill'],
  ['status', "Today's meal status"],
  ['meal', 'Toggle meals: /meal on|off|breakfast|lunch|dinner|guest N'],
  ['rate', 'Current meal rate for this period'],
  ['balance', 'Your balance for this period'],
  ['nomeal', '[Admin] Turn off all meals and notify everyone'],
  ['mealon', '[Admin] Restore meals to personal defaults and notify everyone'],
  ['announce', '[Admin] Send a message to all members'],
]

if (remove) {
  const r = await tg('deleteWebhook', { drop_pending_updates: false })
  console.log(r.ok ? 'Webhook removed. The bot no longer reaches the app.' : `Could not remove: ${r.description}`)
} else if (base) {
  if (!base.startsWith('https://')) {
    console.error('Telegram only calls HTTPS addresses. Use your deployed site or an https tunnel URL.')
    process.exit(1)
  }
  const url = `${base.replace(/\/$/, '')}/api/telegram/webhook`
  const set = await tg('setWebhook', { url, secret_token: secret, allowed_updates: ['message', 'my_chat_member'], drop_pending_updates: true })
  console.log(set.ok ? `Webhook set to ${url}` : `setWebhook failed: ${set.description}`)
  const cmds = await tg('setMyCommands', { commands: COMMANDS.map(([command, description]) => ({ command, description })) })
  console.log(cmds.ok ? 'Command menu set.' : `setMyCommands failed: ${cmds.description}`)
  const menu = await tg('setChatMenuButton', { menu_button: { type: 'web_app', text: 'Mealtill', web_app: { url: `${base.replace(/\/$/, '')}/en/tg` } } })
  console.log(menu.ok ? 'Menu button opens the Mini App.' : `setChatMenuButton failed: ${menu.description}`)
  console.log(`
Last step, once, in @BotFather: Bot Settings, Configure Mini App, URL ${base.replace(/\/$/, '')}/en/tg`)
}

const info = (await tg('getWebhookInfo')).result
console.log('')
console.log(`Webhook URL     : ${info.url || '(none)'}`)
console.log(`Pending updates : ${info.pending_update_count}`)
console.log(`Last error      : ${info.last_error_message || 'none'}`)
if (!process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME) {
  console.log(`\nAlso add this to .env.local so the link screen names the bot:\nNEXT_PUBLIC_TELEGRAM_BOT_USERNAME=${me.result.username}`)
}
