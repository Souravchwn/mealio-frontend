import {
    AuthResponse,
    HeadcountResponse,
    ExpenseResponse,
    MonthMatrixResponse,
    User,
    Role,
    ExpenseCategory,
} from "@/types";

// Mock user data - Demo accounts
export const demoUsers = {
    admin: {
        email: "admin@demo.com",
        password: "admin123",
        user: {
            id: "user-admin",
            name: "Admin Demo",
            email: "admin@demo.com",
            role: Role.ADMIN,
            messId: "mess-1",
            messName: "Downtown Mess",
        },
    },
    manager: {
        email: "manager@demo.com",
        password: "manager123",
        user: {
            id: "user-manager",
            name: "Manager Demo",
            email: "manager@demo.com",
            role: Role.MANAGER,
            messId: "mess-1",
            messName: "Downtown Mess",
        },
    },
    member: {
        email: "member@demo.com",
        password: "member123",
        user: {
            id: "user-member",
            name: "Member Demo",
            email: "member@demo.com",
            role: Role.MEMBER,
            messId: "mess-1",
            messName: "Downtown Mess",
        },
    },
};

export const mockUser: User = demoUsers.admin.user;

// Mock auth response
export const mockAuthResponse: AuthResponse = {
    accessToken: "mock-access-token-12345",
    refreshToken: "mock-refresh-token-67890",
    user: mockUser,
};

// Mock headcount response
export const mockHeadcountResponse: HeadcountResponse = {
    messName: "Downtown Mess",
    date: new Date().toISOString().split("T")[0],
    memberCount: 12,
    guestCount: 3,
    totalHeadcount: 15,
    source: "database",
};

const MOCK_MESS_ID = "11111111-1111-1111-1111-111111111111";
const MOCK_MEMBER_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

// Mock expenses
export const mockExpenses: ExpenseResponse[] = [
    {
        id: "exp-1",
        messId: MOCK_MESS_ID,
        memberId: MOCK_MEMBER_ID,
        memberName: "Admin Demo",
        amount: 2500,
        category: ExpenseCategory.PROTEIN,
        description: "Chicken - 5kg",
        date: "2025-03-10",
        createdAt: "2025-03-10T10:00:00Z",
        liveMealRate: 85.5,
    },
    {
        id: "exp-2",
        messId: MOCK_MESS_ID,
        memberId: MOCK_MEMBER_ID,
        memberName: "Admin Demo",
        amount: 1200,
        category: ExpenseCategory.CARB,
        description: "Rice - 10kg",
        date: "2025-03-10",
        createdAt: "2025-03-10T11:00:00Z",
        liveMealRate: 85.5,
    },
    {
        id: "exp-3",
        messId: MOCK_MESS_ID,
        memberId: MOCK_MEMBER_ID,
        memberName: "Admin Demo",
        amount: 800,
        category: ExpenseCategory.VEGETABLE,
        description: "Mixed vegetables",
        date: "2025-03-11",
        createdAt: "2025-03-11T10:00:00Z",
        liveMealRate: 86.2,
    },
    {
        id: "exp-4",
        messId: MOCK_MESS_ID,
        memberId: MOCK_MEMBER_ID,
        memberName: "Admin Demo",
        amount: 500,
        category: ExpenseCategory.OIL,
        description: "Cooking oil - 5L",
        date: "2025-03-11",
        createdAt: "2025-03-11T11:00:00Z",
        liveMealRate: 86.2,
    },
    {
        id: "exp-5",
        messId: MOCK_MESS_ID,
        memberId: MOCK_MEMBER_ID,
        memberName: "Admin Demo",
        amount: 300,
        category: ExpenseCategory.SPICE,
        description: "Spices and condiments",
        date: "2025-03-12",
        createdAt: "2025-03-12T10:00:00Z",
        liveMealRate: 87.1,
    },
];

const makeDayEntry = (date: string, breakfast: boolean, lunch: boolean, dinner: boolean, guestCount: number, memberId: string, memberName: string) => ({
    logId: `log-${date}-${memberId}`,
    memberId,
    memberName,
    date,
    breakfastCount: breakfast ? 1 : 0,
    lunchCount: lunch ? 1 : 0,
    dinnerCount: dinner ? 1 : 0,
    breakfast,
    lunch,
    dinner,
    guestCount,
    frozen: false,
});

// Mock meal matrix data
export const mockMonthMatrix: MonthMatrixResponse = {
    messId: MOCK_MESS_ID,
    messName: "Downtown Mess",
    yearMonth: "2025-03",
    mealRate: 85.75,
    totalExpense: 45000,
    totalMeals: 524,
    members: [
        {
            memberId: "mem-1",
            memberName: "John Doe",
            memberRole: "ADMIN",
            isGuest: false,
            days: [
                makeDayEntry("2025-03-01", true, true, true, 0, "mem-1", "John Doe"),
                makeDayEntry("2025-03-02", true, true, false, 1, "mem-1", "John Doe"),
                makeDayEntry("2025-03-03", true, true, true, 0, "mem-1", "John Doe"),
            ],
            totalMeals: 9,
            totalAmount: 771.75,
            balance: 0,
        },
        {
            memberId: "mem-2",
            memberName: "Jane Smith",
            memberRole: "MEMBER",
            isGuest: false,
            days: [
                makeDayEntry("2025-03-01", true, true, true, 0, "mem-2", "Jane Smith"),
                makeDayEntry("2025-03-02", false, true, true, 0, "mem-2", "Jane Smith"),
                makeDayEntry("2025-03-03", true, true, true, 2, "mem-2", "Jane Smith"),
            ],
            totalMeals: 10,
            totalAmount: 857.5,
            balance: 50,
        },
        {
            memberId: "mem-3",
            memberName: "Mike Johnson",
            memberRole: "MEMBER",
            isGuest: false,
            days: [
                makeDayEntry("2025-03-01", true, true, true, 1, "mem-3", "Mike Johnson"),
                makeDayEntry("2025-03-02", true, true, true, 0, "mem-3", "Mike Johnson"),
                makeDayEntry("2025-03-03", true, false, true, 0, "mem-3", "Mike Johnson"),
            ],
            totalMeals: 9,
            totalAmount: 771.75,
            balance: -25,
        },
    ],
};

// Helper function to get mock data based on endpoint
export const getMockData = (endpoint: string, method: string = "GET", body?: unknown) => {
    const key = `${method} ${endpoint}`;

    // Handle login with demo credentials
    if (key === "POST /api/auth/login" && body) {
        const { email, password } = body as { email: string; password: string };
        
        // Check demo users
        const demoUser = Object.values(demoUsers).find(
            (demo) => demo.email === email && demo.password === password
        );

        if (demoUser) {
            return {
                accessToken: `mock-token-${demoUser.user.role.toLowerCase()}`,
                refreshToken: `mock-refresh-${demoUser.user.role.toLowerCase()}`,
                user: demoUser.user,
            };
        }

        // Return error for invalid credentials
        throw new Error("Invalid email or password");
    }

    const mockDataMap: Record<string, unknown> = {
        "POST /api/auth/register": mockAuthResponse,
        "GET /api/cook/headcount": mockHeadcountResponse,
        "GET /api/expenses": mockExpenses,
        "POST /api/expenses": mockExpenses[0],
        "GET /api/expenses/meal-rate": {
            messId: "mess-1",
            yearMonth: "2025-03",
            mealRate: 85.75,
        },
        "GET /api/admin/matrix": mockMonthMatrix,
        "POST /api/admin/close-month": { success: true },
        "POST /api/meals/toggle": { success: true },
        "POST /api/meals/guest": { success: true },
        "POST /api/telegram/webhook": { success: true },
    };

    return mockDataMap[key] || null;
};
