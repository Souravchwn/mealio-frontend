# Module 18 — Broadcasts

## What This Module Does

An admin or manager writes a message in **Settings → Mess tab → Broadcast**. Every member of the mess sees it on the **Overview** page until it is 3 days old. It replaces the old Telegram `/announce`, and the automatic "no meals today" notice that Telegram used to send.

Nothing is pushed to phones. A mobile app or widget reads `GET /api/announcements`.

---

## Files

| File | Purpose |
|------|---------|
| `src/app/api/announcements/route.ts` | `GET` (any member), `POST` (Admin/Manager) |
| `src/app/api/announcements/[id]/route.ts` | `DELETE` (Admin/Manager) |
| `src/lib/announcements.ts` | `listActiveAnnouncements()`, `announcementToResponse()` |
| `src/lib/constants.ts` | `ANNOUNCEMENT_MAX_LENGTH` (1000), `ANNOUNCEMENT_VISIBLE_DAYS` (3), `ANNOUNCEMENT_DAILY_LIMIT` (10) |
| `src/lib/api.ts` | `api.announcements.list / create / remove` |
| `src/app/[locale]/(dashboard)/settings/page.tsx` | Compose box and recent list |
| `src/app/[locale]/(dashboard)/overview/page.tsx` | Notice panel under the greeting (newest 5) |
| `prisma/schema.prisma` | `Announcement` model, table `announcements` |

---

## API

### GET `/api/announcements`
Any signed-in member. Returns broadcasts from the last 3 days for the caller's mess, newest first (max 20).
```typescript
{ announcements: [{ id, message, author_name, created_at, expires_at }] }   // client gets camelCase
```

### POST `/api/announcements`
Admin or Manager. Body `{ message }`. The message is trimmed, must not be empty and must be at most 1000 characters.
At most 10 per mess per day (`checkRateLimit('announce', messId, …)`; answers 429). Returns `201 { ok, announcement }`. Audited as `POST_ANNOUNCEMENT`.

### DELETE `/api/announcements/[id]`
Admin or Manager. Takes a broadcast down early. A malformed id, a missing one, or another mess's broadcast all answer 404. Audited as `DELETE_ANNOUNCEMENT`.

### Automatic broadcast
`POST /api/admin/no-cook` also creates a broadcast ("No meals on <date>…" or "Meals are back on…"). It does not count toward the daily limit, and a failure to create it never undoes the meals change (it returns `announced: false`).

---

## Rules

1. **Always scope by `payload.messId`**, never an id from the request.
2. `authorName` is stored on the row, so a broadcast keeps its sender after they leave.
3. **"Active" is computed** from `createdAt`; nothing is purged. Old rows stay in the table.
4. Messages are plain text. React escapes them; never render them as HTML.
5. After changing these routes run `npm run test:broadcasts` (and `test:isolation`): it covers roles, limits, expiry, tenant isolation and the no-cook notice.

## i18n

`settings.broadcast.*`, `overview.broadcast.*`, and the audit labels `audit.actions.POST_ANNOUNCEMENT` / `DELETE_ANNOUNCEMENT`.
