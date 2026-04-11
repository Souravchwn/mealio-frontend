# Mealio — Smart Mess Management

Automate meal tracking, expense splitting, and monthly settlements for shared living. Built for the mess culture of Bangladesh & India.

## 🚀 Quick Start

### Prerequisites
- Node.js 20+ 
- npm or yarn

### Installation

```bash
# Install dependencies
npm install

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## 🎭 Demo Accounts

The app is currently running with **mock data** for demonstration. Use these credentials to explore different user roles:

| Role | Email | Password | Access Level |
|------|-------|----------|--------------|
| **Admin** | `admin@demo.com` | `admin123` | Full access to all features including matrix, members, audit logs |
| **Manager** | `manager@demo.com` | `manager123` | Can manage expenses, view headcount, toggle meals |
| **Member** | `member@demo.com` | `member123` | Can toggle own meals, view headcount |

### Features by Role

**Admin:**
- View monthly matrix with all member meal data
- Manage members and settings
- Close monthly accounts
- View audit trails
- All manager and member features

**Manager:**
- Add and view expenses
- View headcount for cooking
- Toggle meals for all members
- View overview dashboard

**Member:**
- Toggle own meals (breakfast, lunch, dinner)
- Add guest counts
- View personal balance
- View headcount

## 🎨 Features

- **Meal Toggle** — Mark meals on/off before cutoff time
- **Expense Tracking** — Categorized expense management
- **Headcount** — Real-time meal planning for cooks
- **Monthly Matrix** — Complete meal and expense breakdown
- **Multi-language** — English & Bengali (বাংলা)
- **Dark Mode** — Beautiful light/dark themes
- **Responsive** — Works on mobile, tablet, and desktop

## 🔧 Configuration

### Enable/Disable Mock Data

Edit `.env.local`:

```bash
# Use mock data (for demo/development)
NEXT_PUBLIC_USE_MOCK_DATA=true

# Use real API (for production)
NEXT_PUBLIC_USE_MOCK_DATA=false
API_BASE_URL=http://your-api-url:8080
```

### Mock Data Location

All mock data is in `src/lib/mockData.ts`. You can customize:
- Demo user accounts
- Sample expenses
- Monthly matrix data
- Headcount information

## 📁 Project Structure

```
src/
├── app/
│   └── [locale]/
│       ├── (auth)/          # Login, Register
│       ├── (dashboard)/     # Protected dashboard pages
│       └── page.tsx         # Landing page
├── components/
│   ├── ui/                  # Reusable UI components
│   └── composed/            # Complex composed components
├── contexts/
│   └── AuthContext.tsx      # Authentication state management
├── lib/
│   ├── api.ts              # API client with mock fallback
│   ├── mockData.ts         # Demo data
│   └── utils.ts            # Utility functions
└── types/
    └── index.ts            # TypeScript type definitions
```

## 🌐 Internationalization

Switch between English and Bengali using the language switcher in the navbar.

Translation files: `messages/en.json` and `messages/bn.json`

## 🎯 Production Deployment

1. Set up your backend API
2. Update `.env.local` with production API URL
3. Set `NEXT_PUBLIC_USE_MOCK_DATA=false`
4. Build and deploy:

```bash
npm run build
npm start
```

## 🛠 Tech Stack

- **Framework:** Next.js 16 (App Router)
- **Language:** TypeScript
- **Styling:** CSS Modules
- **i18n:** next-intl
- **UI:** Custom design system
- **State:** React Context API
- **Icons:** Lucide React

## 📝 License

Private project for mess management.

---

Made with 🍽 for Bangladesh 🇧🇩 and India 🇮🇳
