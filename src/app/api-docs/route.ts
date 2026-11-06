/**
 * GET /api-docs
 * Serves Swagger UI with the full Manager Babu OpenAPI 3.0 spec.
 * No npm packages required — Swagger UI loaded from CDN.
 */

const spec = {
  openapi: '3.0.3',
  info: {
    title: 'Manager Babu API',
    description:
      'REST API for the Manager Babu mess-management platform. All protected routes require a Bearer JWT obtained from `/api/auth/login`.',
    version: '1.0.0',
    contact: { name: 'Manager Babu' },
  },
  servers: [{ url: '/api', description: 'Next.js API routes' }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT token from POST /api/auth/login → access_token',
      },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: { detail: { type: 'string', example: 'Invalid email or password' } },
      },
      User: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string', example: 'Rahul Ahmed' },
          email: { type: 'string', format: 'email' },
          role: { type: 'string', enum: ['ADMIN', 'MANAGER', 'MEMBER'] },
          mess_id: { type: 'string', format: 'uuid' },
          mess_name: { type: 'string', example: 'Dhaka Mess' },
        },
      },
      AuthResponse: {
        type: 'object',
        properties: {
          access_token: { type: 'string', description: 'JWT (30-day expiry)' },
          refresh_token: { type: 'string', description: 'Same as access_token for now' },
          user: { $ref: '#/components/schemas/User' },
        },
      },
      MealLog: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          member_id: { type: 'string', format: 'uuid' },
          date: { type: 'string', format: 'date', example: '2026-04-08' },
          breakfast: { type: 'boolean' },
          lunch: { type: 'boolean' },
          dinner: { type: 'boolean' },
          guest_count: { type: 'integer', minimum: 0 },
          frozen: { type: 'boolean' },
          cut_off_time: { type: 'string', example: '21:00' },
          cut_off_passed: { type: 'boolean' },
        },
      },
      Expense: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          mess_id: { type: 'string', format: 'uuid' },
          amount: { type: 'number', example: 850 },
          category: {
            type: 'string',
            enum: ['PROTEIN', 'CARB', 'VEGETABLE', 'SPICE', 'OIL', 'UTILITY', 'OTHER'],
          },
          description: { type: 'string', example: 'Chicken from bazaar' },
          date: { type: 'string', format: 'date' },
          added_by_name: { type: 'string' },
          year_month: { type: 'string', example: '2026-04' },
        },
      },
      Member: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          phone: { type: 'string', nullable: true },
          role: { type: 'string', enum: ['ADMIN', 'MANAGER', 'MEMBER'] },
          balance: { type: 'number', description: 'Positive = overpaid, negative = owes' },
        },
      },
      Announcement: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          message: { type: 'string' },
          author_name: { type: 'string' },
          created_at: { type: 'string', format: 'date-time' },
          expires_at: { type: 'string', format: 'date-time', description: 'When it stops showing (3 days after it was sent)' },
        },
      },
      MatrixDay: {
        type: 'object',
        properties: {
          date: { type: 'string', format: 'date' },
          breakfast: { type: 'boolean' },
          lunch: { type: 'boolean' },
          dinner: { type: 'boolean' },
          guest_count: { type: 'integer' },
          frozen: { type: 'boolean' },
        },
      },
      MatrixMember: {
        type: 'object',
        properties: {
          member_id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          days: { type: 'array', items: { $ref: '#/components/schemas/MatrixDay' } },
          total_meals: { type: 'integer' },
          meal_cost: { type: 'number' },
          balance: { type: 'number' },
        },
      },
    },
  },
  paths: {
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Login with email and password',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email', example: 'admin@demo.com' },
                  password: { type: 'string', minLength: 8, example: 'admin123' },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'JWT token and user object',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } } },
          },
          401: { description: 'Invalid credentials', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Register a new member using a mess invite code',
        description:
          'The first member to register with an invite code becomes ADMIN. Subsequent registrations become MEMBER.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'email', 'password', 'mess_invite_code'],
                properties: {
                  name: { type: 'string', example: 'Rahul Ahmed' },
                  email: { type: 'string', format: 'email', example: 'rahul@example.com' },
                  phone: { type: 'string', example: '+8801712345678' },
                  password: { type: 'string', minLength: 8, example: 'secret123' },
                  mess_invite_code: { type: 'string', example: 'MESS-ABC1' },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Account created, JWT token returned',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } } },
          },
          400: { description: 'Invalid invite code, email already taken, or weak password', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/meals/today': {
      get: {
        tags: ['Meals'],
        summary: "Get or auto-create a member's meal log for a given date",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'member_id', in: 'query', required: false, schema: { type: 'string', format: 'uuid' }, description: 'Defaults to the authenticated user' },
          { name: 'log_date', in: 'query', required: false, schema: { type: 'string', format: 'date' }, description: 'Defaults to today (UTC)' },
        ],
        responses: {
          200: { description: 'Meal log', content: { 'application/json': { schema: { $ref: '#/components/schemas/MealLog' } } } },
          401: { description: 'Unauthorized' },
        },
      },
    },
    '/meals/toggle': {
      post: {
        tags: ['Meals'],
        summary: 'Toggle a single meal slot on/off',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['member_id', 'date', 'slot', 'status'],
                properties: {
                  member_id: { type: 'string', format: 'uuid' },
                  date: { type: 'string', format: 'date', example: '2026-04-08' },
                  slot: { type: 'string', enum: ['BREAKFAST', 'LUNCH', 'DINNER'] },
                  status: { type: 'boolean' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Toggle applied', content: { 'application/json': { schema: { type: 'object', properties: { ok: { type: 'boolean' } } } } } },
          400: { description: 'Invalid slot' },
          401: { description: 'Unauthorized' },
          403: { description: 'Cut-off passed or day frozen' },
        },
      },
    },
    '/meals/guest': {
      post: {
        tags: ['Meals'],
        summary: 'Update the guest count for a meal log',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['log_id', 'guest_count'],
                properties: {
                  log_id: { type: 'string', format: 'uuid' },
                  guest_count: { type: 'integer', minimum: 0 },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Guest count updated' },
          401: { description: 'Unauthorized' },
        },
      },
    },
    '/expenses': {
      get: {
        tags: ['Expenses'],
        summary: 'List expenses for a mess by month',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'mess_id', in: 'query', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'year_month', in: 'query', required: false, schema: { type: 'string', example: '2026-04' }, description: 'Defaults to current month' },
        ],
        responses: {
          200: { description: 'Expense list', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Expense' } } } } },
          401: { description: 'Unauthorized' },
        },
      },
      post: {
        tags: ['Expenses'],
        summary: 'Add a new expense (ADMIN or MANAGER only)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['mess_id', 'amount', 'category', 'date'],
                properties: {
                  mess_id: { type: 'string', format: 'uuid' },
                  amount: { type: 'number', minimum: 0.01, example: 850 },
                  category: { type: 'string', enum: ['PROTEIN', 'CARB', 'VEGETABLE', 'SPICE', 'OIL', 'UTILITY', 'OTHER'] },
                  description: { type: 'string', example: 'Chicken from bazaar' },
                  date: { type: 'string', format: 'date' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Created expense', content: { 'application/json': { schema: { $ref: '#/components/schemas/Expense' } } } },
          401: { description: 'Unauthorized' },
          403: { description: 'Forbidden. The MEMBER role cannot add expenses.' },
        },
      },
    },
    '/expenses/meal-rate': {
      get: {
        tags: ['Expenses'],
        summary: 'Calculate live meal rate for a month',
        description: 'meal_rate = total_expenses / total_meal_slots (including guests)',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'mess_id', in: 'query', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'year_month', in: 'query', required: false, schema: { type: 'string', example: '2026-04' } },
        ],
        responses: {
          200: {
            description: 'Meal rate',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    mess_id: { type: 'string' },
                    year_month: { type: 'string' },
                    meal_rate: { type: 'number', example: 87.5 },
                  },
                },
              },
            },
          },
          401: { description: 'Unauthorized' },
        },
      },
    },
    '/cook/headcount': {
      get: {
        tags: ['Cook'],
        summary: "Today's lunch headcount for the cook",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'mess_id', in: 'query', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          200: {
            description: 'Headcount breakdown',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    mess_id: { type: 'string' },
                    date: { type: 'string', format: 'date' },
                    members: { type: 'integer', example: 8 },
                    guests: { type: 'integer', example: 2 },
                    total: { type: 'integer', example: 10 },
                    source: { type: 'string', enum: ['database'] },
                  },
                },
              },
            },
          },
          401: { description: 'Unauthorized' },
        },
      },
    },
    '/members': {
      get: {
        tags: ['Members'],
        summary: 'List all members in a mess with balances (ADMIN only)',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'mess_id', in: 'query', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          200: {
            description: 'Member list',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    mess_name: { type: 'string' },
                    members: { type: 'array', items: { $ref: '#/components/schemas/Member' } },
                  },
                },
              },
            },
          },
          401: { description: 'Unauthorized' },
        },
      },
    },
    '/admin/matrix': {
      get: {
        tags: ['Admin'],
        summary: 'Full monthly matrix of all members and days (ADMIN or MANAGER)',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'mess_id', in: 'query', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'year_month', in: 'query', required: false, schema: { type: 'string', example: '2026-04' } },
        ],
        responses: {
          200: {
            description: 'Month matrix with totals and balances',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    year_month: { type: 'string' },
                    meal_rate: { type: 'number' },
                    total_expense: { type: 'number' },
                    members: { type: 'array', items: { $ref: '#/components/schemas/MatrixMember' } },
                  },
                },
              },
            },
          },
          401: { description: 'Unauthorized' },
          403: { description: 'Forbidden. ADMIN only.' },
        },
      },
    },
    '/admin/close-month': {
      post: {
        tags: ['Admin'],
        summary: 'Freeze all logs and compute final balances for a month (ADMIN only)',
        description: '⚠️ Irreversible. Freezes all daily_logs for the month and stamps final balances.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['mess_id', 'year_month'],
                properties: {
                  mess_id: { type: 'string', format: 'uuid' },
                  year_month: { type: 'string', example: '2026-03' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Month closed', content: { 'application/json': { schema: { type: 'object', properties: { ok: { type: 'boolean' } } } } } },
          401: { description: 'Unauthorized' },
          403: { description: 'Forbidden. ADMIN only.' },
        },
      },
    },
    '/announcements': {
      get: {
        tags: ['Broadcasts'],
        summary: 'Broadcasts from the last few days, newest first (any member)',
        description: 'Admins and managers send these from Settings. Each stays visible for 3 days. Nothing is pushed to phones: apps and widgets read this list.',
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'Active broadcasts',
            content: { 'application/json': { schema: { type: 'object', properties: { announcements: { type: 'array', items: { $ref: '#/components/schemas/Announcement' } } } } } },
          },
          401: { description: 'Unauthorized' },
        },
      },
      post: {
        tags: ['Broadcasts'],
        summary: 'Send a broadcast to the whole mess (ADMIN or MANAGER)',
        description: 'At most 10 per mess per day. Messages are up to 1000 characters.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['message'], properties: { message: { type: 'string', maxLength: 1000 } } } } },
        },
        responses: {
          201: {
            description: 'Sent',
            content: { 'application/json': { schema: { type: 'object', properties: { ok: { type: 'boolean' }, announcement: { $ref: '#/components/schemas/Announcement' } } } } },
          },
          400: { description: 'Empty or too long' },
          401: { description: 'Unauthorized' },
          403: { description: 'Forbidden. ADMIN or MANAGER only.' },
          429: { description: 'Daily limit reached' },
        },
      },
    },
    '/announcements/{id}': {
      delete: {
        tags: ['Broadcasts'],
        summary: 'Remove a broadcast early (ADMIN or MANAGER)',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          200: { description: 'Removed', content: { 'application/json': { schema: { type: 'object', properties: { ok: { type: 'boolean' } } } } } },
          401: { description: 'Unauthorized' },
          403: { description: 'Forbidden. ADMIN or MANAGER only.' },
          404: { description: 'Not found' },
        },
      },
    },
  },
}

export async function GET(): Promise<Response> {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Manager Babu API Docs</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  <style>
    body { margin: 0; background: #fafafa; }
    .swagger-ui .topbar { background: #1a1a2e; }
    .swagger-ui .topbar .download-url-wrapper { display: none; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-standalone-preset.js"></script>
  <script>
    window.onload = function () {
      SwaggerUIBundle({
        spec: ${JSON.stringify(spec)},
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
        plugins: [SwaggerUIBundle.plugins.DownloadUrl],
        layout: 'StandaloneLayout',
        defaultModelsExpandDepth: 1,
        defaultModelExpandDepth: 2,
        tryItOutEnabled: true,
      })
    }
  </script>
</body>
</html>`

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}
