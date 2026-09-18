export interface MissionStep {
    id: string;
    title: string;
    description: string;
    targetPath: string;
    targetSelector: string;
    arrowPosition?: 'top' | 'bottom' | 'left' | 'right';
}

export interface OnboardingAchievement {
    id: string;
    title: string;
    description: string;
    category: 'ONBOARDING' | 'EXPLORER' | 'POWER_USER';
    icon: string;
    badgeName: string;
    badgeColor: string;
    xp: number;
    steps: MissionStep[];
    completed: boolean;
    completedAt?: string;
}

export const INITIAL_ACHIEVEMENTS: OnboardingAchievement[] = [
    {
        id: 'add_team_member',
        title: 'Build Your Team',
        description: 'Invite your team members to collaborate on requisitions and financial approvals.',
        category: 'ONBOARDING',
        icon: 'Users',
        badgeName: 'Team Builder',
        badgeColor: '#006AFF',
        xp: 100,
        completed: false,
        steps: [
            {
                id: 'step_nav_settings',
                title: 'Press Settings Menu',
                description: 'Press the Settings icon in the navigation menu to access organization settings.',
                targetPath: '/requisitions',
                targetSelector: 'data-tour-target="nav-settings"',
                arrowPosition: 'right',
            },
            {
                id: 'step_click_team_tab',
                title: 'Press Team Members Tab',
                description: 'Press the Team Members tab at the top of the Settings screen.',
                targetPath: '/settings',
                targetSelector: 'data-tour-target="settings-team-tab"',
                arrowPosition: 'bottom',
            },
            {
                id: 'step_click_add_member',
                title: 'Press Add Member',
                description: 'Press the + Add Member button to open the user invitation dialog.',
                targetPath: '/settings',
                targetSelector: 'data-tour-target="add-team-btn"',
                arrowPosition: 'bottom',
            },
            {
                id: 'step_submit_add_user',
                title: 'Press Add User',
                description: 'Fill in the team member details and press the Add User button to finish inviting your colleague.',
                targetPath: '/settings',
                targetSelector: 'data-tour-target="modal-submit-add-user"',
                arrowPosition: 'top',
            },
        ],
    },
    {
        id: 'create_first_requisition',
        title: 'Create Your First Request',
        description: 'Submit an outflow requisition request for team expenses or purchasing.',
        category: 'ONBOARDING',
        icon: 'FilePlus',
        badgeName: 'Request Starter',
        badgeColor: '#10B981',
        xp: 150,
        completed: false,
        steps: [
            {
                id: 'step_click_new_request',
                title: 'Press New Request',
                description: 'Press the "+ New Request" button on your Inbox page.',
                targetPath: '/requisitions',
                targetSelector: 'data-tour-target="new-request-btn"',
                arrowPosition: 'bottom',
            },
            {
                id: 'step_fill_description',
                title: 'Describe Your Request',
                description: 'Enter the purpose and details of your requisition request.',
                targetPath: '/requisitions/new',
                targetSelector: 'data-tour-target="req-input-description"',
                arrowPosition: 'bottom',
            },
            {
                id: 'step_submit_request',
                title: 'Press Submit Requisition',
                description: 'Press the Submit Requisition button to send your request.',
                targetPath: '/requisitions/new',
                targetSelector: 'data-tour-target="req-submit-btn"',
                arrowPosition: 'top',
            },
        ],
    },
    {
        id: 'explore_bi',
        title: 'Explore Business Intelligence',
        description: 'Discover real-time analytics, spending trends, and AI-powered financial forecasts.',
        category: 'EXPLORER',
        icon: 'Sparkles',
        badgeName: 'Data Voyager',
        badgeColor: '#8B5CF6',
        xp: 120,
        completed: false,
        steps: [
            {
                id: 'step_nav_bi',
                title: 'Press Business Intelligence',
                description: 'Press Business Intelligence in the navigation menu.',
                targetPath: '/requisitions',
                targetSelector: 'data-tour-target="nav-bi-tab"',
                arrowPosition: 'right',
            },
            {
                id: 'step_explore_insights',
                title: 'Press Data Insights',
                description: 'Press the Data Insights tab to view visual financial trends and charts.',
                targetPath: '/intelligence',
                targetSelector: 'data-tour-target="bi-insight-card"',
                arrowPosition: 'bottom',
            },
        ],
    },
    {
        id: 'check_wallet_inflows',
        title: 'Inspect Cash & Inflows',
        description: 'Track incoming payments, sales deposits, and customer invoices in one place.',
        category: 'EXPLORER',
        icon: 'ArrowDownLeft',
        badgeName: 'Cash Commander',
        badgeColor: '#F59E0B',
        xp: 100,
        completed: false,
        steps: [
            {
                id: 'step_click_inflows_tab',
                title: 'Press Inflows Tab',
                description: 'Press the "Inflows" tab in your Inbox to view incoming cash entries.',
                targetPath: '/requisitions',
                targetSelector: 'data-tour-target="inbox-mode-inflows"',
                arrowPosition: 'bottom',
            },
        ],
    },
    {
        id: 'schedule_payment',
        title: 'Check Schedules & Calendar',
        description: 'Set up automated recurring payments, deadlines, and notification alerts.',
        category: 'POWER_USER',
        icon: 'Calendar',
        badgeName: 'Automation Pro',
        badgeColor: '#EC4899',
        xp: 200,
        completed: false,
        steps: [
            {
                id: 'step_click_schedules',
                title: 'Press Schedules Calendar',
                description: 'Press the Schedules icon to manage recurring events and reminders.',
                targetPath: '/requisitions',
                targetSelector: 'data-tour-target="nav-schedules-tab"',
                arrowPosition: 'right',
            },
            {
                id: 'step_click_new_schedule',
                title: 'Press Add to Schedule',
                description: 'Press the + Add to Schedule button to create a recurring payment reminder.',
                targetPath: '/schedules',
                targetSelector: 'data-tour-target="new-schedule-btn"',
                arrowPosition: 'bottom',
            },
            {
                id: 'step_save_schedule',
                title: 'Press Save Schedule',
                description: 'Enter your schedule details and press Add to Schedule to register your item.',
                targetPath: '/schedules',
                targetSelector: 'data-tour-target="save-schedule-btn"',
                arrowPosition: 'top',
            },
        ],
    },
];

const STORAGE_KEY = 'moneywise_achievements_v1';

export function loadAchievementsState(): OnboardingAchievement[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return INITIAL_ACHIEVEMENTS;
        const saved: Record<string, { completed: boolean; completedAt?: string }> = JSON.parse(raw);
        return INITIAL_ACHIEVEMENTS.map((item) => ({
            ...item,
            completed: saved[item.id]?.completed ?? false,
            completedAt: saved[item.id]?.completedAt,
        }));
    } catch {
        return INITIAL_ACHIEVEMENTS;
    }
}

export function saveAchievementsState(achievements: OnboardingAchievement[]): void {
    try {
        const payload: Record<string, { completed: boolean; completedAt?: string }> = {};
        achievements.forEach((a) => {
            if (a.completed) {
                payload[a.id] = { completed: true, completedAt: a.completedAt };
            }
        });
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {
        console.error('Failed to save achievements state:', e);
    }
}
