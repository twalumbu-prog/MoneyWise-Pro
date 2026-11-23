import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    OnboardingAchievement,
    MissionStep,
    loadAchievementsState,
    saveAchievementsState,
    apiJson,
} from 'core';
import type { BadgeTier } from 'core';
import { useAuth } from './AuthContext';

/** What the server says about a person's progress (the catalogue of badges, with which are earned, plus XP, points and fee credit). */
export interface ServerBadge { id: string; name: string; description: string; tier: BadgeTier; xp: number; family: 'EXPLORE' | 'MISSION' | 'CONSISTENCY' | 'MONEY'; earned: boolean; earnedAt: string | null; progress: { have: number; need: number } | null; gift: number }
export interface ProgressData {
    level: { level: number; xp: number; nextAt: number | null; toNext: number; thisAt: number };
    xp: number; convertibleXp: number; convertedThisMonth: boolean; nextConvertOn: string | null; points: number; credit: number;
    streak: { current: number; best: number; activeDays: number };
    money: { txnCount: number; volume: number };
    rates: { xpPerPoint: number; pointsPerKwacha: number; giftPoints: Record<BadgeTier, number> };
    badges: ServerBadge[];
    history: { kind: string; points: number; xp_spent: number; credit: number; reason: string | null; created_at: string }[];
    newlyEarned?: { id: string; name: string; tier: BadgeTier; xp: number; gift: number }[];
}

interface AchievementsContextType {
    progress: ProgressData | null;
    refreshProgress: () => Promise<void>;
    convertXp: (xp: number) => Promise<void>;
    redeemPoints: (points: number) => Promise<void>;
    achievements: OnboardingAchievement[];
    activeMission: OnboardingAchievement | null;
    activeStepIndex: number;
    activeStep: MissionStep | null;
    recentlyUnlocked: OnboardingAchievement | null;
    isMobileModalOpen: boolean;
    isDesktopDropdownOpen: boolean;
    completedCount: number;
    totalCount: number;
    totalXp: number;
    earnedXp: number;
    startMission: (missionId: string) => void;
    cancelMission: () => void;
    advanceStep: () => void;
    completeMission: (missionId: string) => void;
    startNextAvailableMission: () => void;
    dismissCelebration: () => void;
    setMobileModalOpen: (open: boolean) => void;
    setDesktopDropdownOpen: (open: boolean) => void;
    toggleMobileModal: () => void;
    toggleDesktopDropdown: () => void;
}

const AchievementsContext = createContext<AchievementsContextType | undefined>(undefined);

export const AchievementsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const { user } = useAuth();

    const [localAchievements, setAchievements] = useState<OnboardingAchievement[]>(() => loadAchievementsState());
    const [progress, setProgress] = useState<ProgressData | null>(null);
    const [activeMissionId, setActiveMissionId] = useState<string | null>(null);
    const [activeStepIndex, setActiveStepIndex] = useState<number>(0);
    const [recentlyUnlocked, setRecentlyUnlocked] = useState<OnboardingAchievement | null>(null);
    const [isMobileModalOpen, setIsMobileModalOpen] = useState(false);
    const [isDesktopDropdownOpen, setIsDesktopDropdownOpen] = useState(false);

    // The server is the truth for what is earned (so it follows the person across devices); the local list only remembers tour progress.
    const earnedIds = new Set((progress?.badges ?? []).filter((b) => b.earned).map((b) => b.id));
    const achievements = localAchievements.map((a) => {
        const sb = progress?.badges.find((b) => b.id === a.id);
        return { ...a, completed: a.completed || earnedIds.has(a.id), tier: sb?.tier ?? a.tier, giftPoints: sb?.gift ?? a.giftPoints };
    });

    // Save on state updates
    useEffect(() => {
        saveAchievementsState(localAchievements);
    }, [localAchievements]);

    /** Sends the server what the person just did and takes back the new picture; celebrates the first badge that was newly earned. */
    const report = useCallback(async (event?: { type: 'visit'; path: string } | { type: 'mission'; id: string }) => {
        try {
            const data = event
                ? await apiJson<ProgressData>('/progress/event', { method: 'POST', body: JSON.stringify(event) })
                : await apiJson<ProgressData>('/progress');
            setProgress(data);
            const first = data.newlyEarned?.[0];
            if (first) {
                const b = data.badges.find((x) => x.id === first.id);
                setRecentlyUnlocked((prev) => prev ?? ({
                    id: first.id, title: b?.name ?? first.name, description: b?.description ?? '', category: 'FIRST_STEPS', icon: 'Award', badgeName: first.name,
                    badgeColor: '#0B57D0', xp: first.xp, steps: [], completed: true, completedAt: new Date().toISOString(), tier: first.tier, giftPoints: first.gift,
                }));
            }
        } catch { /* offline or signed out: nothing to show, nothing lost (the server counts it next time) */ }
    }, []);

    // Opening a page counts as using the app today and may earn a badge. Only asked when it could change something: the first time, a new day,
    // or a page that has a badge still waiting.
    const lastDay = React.useRef<string | null>(null);
    useEffect(() => {
        if (!user) { setProgress(null); lastDay.current = null; return; }
        const today = new Date().toISOString().slice(0, 10);
        const p = location.pathname.replace(/\/+$/, '') || '/';
        const waiting = (progress?.badges ?? []).some((b) => !b.earned && b.family === 'EXPLORE' && (localAchievements.find((a) => a.id === b.id)?.autoVisit ?? []).some((v) => (v === '/' ? p === '/' : p === v || p.startsWith(v + '/'))));
        if (progress && lastDay.current === today && !waiting) return;
        lastDay.current = today;
        void report({ type: 'visit', path: p });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [location.pathname, user]);

    const convertXp = useCallback(async (xp: number) => { setProgress(await apiJson<ProgressData>('/progress/convert', { method: 'POST', body: JSON.stringify({ xp }) })); }, []);
    const redeemPoints = useCallback(async (points: number) => { setProgress(await apiJson<ProgressData>('/progress/redeem', { method: 'POST', body: JSON.stringify({ points }) })); }, []);

    const activeMission = achievements.find(a => a.id === activeMissionId) || null;
    const activeStep = activeMission && activeMission.steps[activeStepIndex] ? activeMission.steps[activeStepIndex] : null;

    const completedCount = achievements.filter(a => a.completed).length;
    const totalCount = achievements.length;
    const totalXp = achievements.reduce((acc, curr) => acc + curr.xp, 0);
    const earnedXp = achievements.filter(a => a.completed).reduce((acc, curr) => acc + curr.xp, 0);

    const startMission = useCallback((missionId: string) => {
        const target = achievements.find(a => a.id === missionId);
        if (!target) return;

        setActiveMissionId(missionId);
        setActiveStepIndex(0);
        setIsMobileModalOpen(false);
        setIsDesktopDropdownOpen(false);

        const firstStep = target.steps[0];
        if (firstStep && firstStep.targetPath && location.pathname !== firstStep.targetPath) {
            navigate(firstStep.targetPath);
        }
    }, [achievements, location.pathname, navigate]);

    const cancelMission = useCallback(() => {
        setActiveMissionId(null);
        setActiveStepIndex(0);
    }, []);

    const completeMission = useCallback((missionId: string) => {
        let completedObj: OnboardingAchievement | null = null;

        void report({ type: 'mission', id: missionId });
        setAchievements(prev => prev.map(a => {
            if (a.id === missionId) {
                completedObj = {
                    ...a,
                    completed: true,
                    completedAt: new Date().toISOString(),
                };
                return completedObj;
            }
            return a;
        }));

        setActiveMissionId(null);
        setActiveStepIndex(0);

        if (completedObj) {
            setRecentlyUnlocked(completedObj);
        }
    }, [report]);

    const advanceStep = useCallback(() => {
        if (!activeMission) return;
        if (activeStepIndex + 1 >= activeMission.steps.length) {
            completeMission(activeMission.id);
        } else {
            const nextIdx = activeStepIndex + 1;
            setActiveStepIndex(nextIdx);
            const nextStep = activeMission.steps[nextIdx];
            if (nextStep && nextStep.targetPath && location.pathname !== nextStep.targetPath) {
                navigate(nextStep.targetPath);
            }
        }
    }, [activeMission, activeStepIndex, completeMission, location.pathname, navigate]);

    const startNextAvailableMission = useCallback(() => {
        setRecentlyUnlocked(null);
        const nextUncompleted = achievements.find(a => !a.completed && a.steps.length > 0);
        if (nextUncompleted) {
            startMission(nextUncompleted.id);
        } else {
            setIsMobileModalOpen(true);
        }
    }, [achievements, startMission]);

    const dismissCelebration = useCallback(() => {
        setRecentlyUnlocked(null);
    }, []);

    const toggleMobileModal = useCallback(() => {
        setIsMobileModalOpen(prev => !prev);
        setIsDesktopDropdownOpen(false);
    }, []);

    const toggleDesktopDropdown = useCallback(() => {
        setIsDesktopDropdownOpen(prev => !prev);
        setIsMobileModalOpen(false);
    }, []);

    return (
        <AchievementsContext.Provider
            value={{
                progress,
                refreshProgress: () => report(),
                convertXp,
                redeemPoints,
                achievements,
                activeMission,
                activeStepIndex,
                activeStep,
                recentlyUnlocked,
                isMobileModalOpen,
                isDesktopDropdownOpen,
                completedCount,
                totalCount,
                totalXp,
                earnedXp,
                startMission,
                cancelMission,
                advanceStep,
                completeMission,
                startNextAvailableMission,
                dismissCelebration,
                setMobileModalOpen: setIsMobileModalOpen,
                setDesktopDropdownOpen: setIsDesktopDropdownOpen,
                toggleMobileModal,
                toggleDesktopDropdown,
            }}
        >
            {children}
        </AchievementsContext.Provider>
    );
};

export const useAchievements = () => {
    const context = useContext(AchievementsContext);
    if (!context) {
        throw new Error('useAchievements must be used within an AchievementsProvider');
    }
    return context;
};
