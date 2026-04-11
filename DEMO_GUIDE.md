# 🎭 Mealio Demo Guide

Welcome to the Mealio demo! This guide will help you explore all the features.

## 🔐 Demo Login Credentials

### Admin Account (Full Access)
```
Email: admin@demo.com
Password: admin123
```
**Can access:** Everything including matrix, member management, audit logs, settings

### Manager Account (Operations)
```
Email: manager@demo.com
Password: manager123
```
**Can access:** Expenses, headcount, meal toggles, overview

### Member Account (Basic)
```
Email: member@demo.com
Password: member123
```
**Can access:** Personal meals, headcount, overview

## 🎯 Feature Tour

### 1. Landing Page
- Beautiful hero section with gradient text
- Feature cards showcasing all capabilities
- Role-based access explanation
- Demo credentials displayed at bottom
- Theme toggle (light/dark mode)
- Language switcher (English/বাংলা)

### 2. Login & Authentication
- Use any demo account above
- Automatic redirect to dashboard on success
- Auth state persisted in localStorage
- Protected routes (redirects to login if not authenticated)

### 3. Dashboard Overview
- **Stats Cards:** Meal rate, balance, expenses, headcount
- **Today's Meals:** Quick view of breakfast/lunch/dinner status
- **Quick Actions:** Fast navigation to key features
- **Recent Expenses:** Latest spending with categories
- Responsive design for mobile/tablet/desktop

### 4. Navigation
- **Sidebar (Desktop):** Full navigation with icons
- **Top Bar:** Page title, theme toggle, language switcher, notifications
- **Bottom Nav (Mobile):** Quick access to main features
- **User Card:** Shows name, role, logout button

### 5. Theme System
- Toggle between light and dark modes
- Smooth transitions
- Consistent across all pages
- Persisted preference

### 6. Internationalization
- Switch between English and Bengali
- All UI text translated
- Number and currency formatting
- Date formatting

## 🎨 UI/UX Highlights

### Design System
- Custom CSS variables for theming
- Consistent spacing and typography
- Smooth animations and transitions
- Glassmorphism effects
- Gradient accents

### Responsive Breakpoints
- Mobile: < 640px
- Tablet: 640px - 1024px
- Desktop: > 1024px

### Color Palette
- **Primary:** Indigo (#6366f1)
- **Accent:** Amber (#f59e0b)
- **Success:** Emerald (#10b981)
- **Danger:** Red (#ef4444)
- **Info:** Blue (#3b82f6)

### Typography
- **English:** Inter (Google Fonts)
- **Bengali:** Hind Siliguri (Google Fonts)
- **Monospace:** JetBrains Mono / Fira Code

## 🔄 Mock Data Flow

1. **Login Request** → Checks demo credentials → Returns mock user + token
2. **API Calls** → Intercepted by mock data layer → Returns realistic data
3. **State Management** → AuthContext stores user/token → Persists to localStorage
4. **Protected Routes** → Check auth state → Redirect if needed

## 🚀 Testing Scenarios

### Scenario 1: Admin Workflow
1. Login as admin
2. View overview dashboard
3. Check monthly matrix (if page exists)
4. Manage members (if page exists)
5. View audit logs (if page exists)
6. Logout

### Scenario 2: Manager Workflow
1. Login as manager
2. View today's headcount
3. Add new expense
4. Toggle meals for members
5. Check expense reports
6. Logout

### Scenario 3: Member Workflow
1. Login as member
2. View personal balance
3. Toggle own meals
4. Add guest count
5. View headcount
6. Logout

### Scenario 4: Theme & Language
1. Start on landing page
2. Toggle dark mode
3. Switch to Bengali
4. Login with any account
5. Verify theme persists
6. Verify language persists
7. Navigate between pages
8. Check consistency

## 🐛 Known Limitations (Mock Mode)

- No real data persistence (refreshes reset to mock data)
- No actual API calls (all intercepted)
- No real-time updates
- No file uploads
- No email notifications
- No Telegram integration

## 🔧 Switching to Production

1. Set up backend API
2. Update `.env.local`:
   ```bash
   NEXT_PUBLIC_USE_MOCK_DATA=false
   API_BASE_URL=http://your-api-url:8080
   ```
3. Restart dev server
4. Test with real API endpoints

## 📱 Mobile Testing

1. Open dev tools (F12)
2. Toggle device toolbar (Ctrl+Shift+M)
3. Select mobile device
4. Test responsive layout
5. Check bottom navigation
6. Test touch interactions

## 🎓 Tips for Demo

- **Fast Navigation:** Use quick actions on overview
- **Theme Toggle:** Top-right corner on all pages
- **Language Switch:** Next to theme toggle
- **Logout:** Click logout icon in sidebar footer
- **Mobile View:** Resize browser or use dev tools
- **Dark Mode:** Perfect for presentations

## 🌟 Impressive Features to Showcase

1. **Smooth Animations:** Fade-in, slide-in effects
2. **Gradient Text:** Hero title with animated gradient
3. **Glassmorphism:** Navbar blur effect on scroll
4. **Role-Based Access:** Different features per role
5. **Bilingual Support:** Seamless language switching
6. **Dark Mode:** Beautiful dark theme
7. **Responsive Design:** Works on all devices
8. **Mock Data System:** Realistic demo without backend

---

Enjoy exploring Mealio! 🍽️
