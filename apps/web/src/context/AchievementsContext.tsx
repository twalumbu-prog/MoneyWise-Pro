import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    OnboardingAchievement,
    MissionStep,
    loadAchievementsState,
    saveAchievementsState,
} from 'core';

interface AchievementsContextType {
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

    const [achievements, setAchievements] = useState<OnboardingAchievement[]>(() => loadAchievementsState());
    const [activeMissionId, setActiveMissionId] = useState<string | null>(null);
    const [activeStepIndex, setActiveStepIndex] = useState<number>(0);
    const [recentlyUnlocked, setRecentlyUnlocked] = useState<OnboardingAchievement | null>(null);
    const [isMobileModalOpen, setIsMobileModalOpen] = useState(false);
    const [isDesktopDropdownOpen, setIsDesktopDropdownOpen] = useState(false);

    // Save on state updates
    useEffect(() => {
        saveAchievementsState(achievements);
    }, [achievements]);

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
    }, []);

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
        const nextUncompleted = achievements.find(a => !a.completed);
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
