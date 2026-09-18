import React from 'react';
import { useAchievements } from '../../context/AchievementsContext';
import Confetti from '../Confetti';
import { Award, CheckCircle2, Zap, ArrowRight, X } from 'lucide-react';

export const AchievementUnlockedOverlay: React.FC = () => {
    const { recentlyUnlocked, dismissCelebration, startNextAvailableMission } = useAchievements();

    if (!recentlyUnlocked) return null;

    return (
        <>
            {/* Confetti Animation Burst */}
            <Confetti rainMs={3000} burstCount={110} />

            {/* Modal Backdrop Overlay */}
            <div className="fixed inset-0 z-[450] bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
                <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-gray-100 p-6 text-center overflow-hidden animate-in zoom-in-95 duration-200">
                    {/* Close Button */}
                    <button
                        onClick={dismissCelebration}
                        className="absolute top-4 right-4 w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors"
                        aria-label="Close"
                    >
                        <X size={16} />
                    </button>

                    {/* Glowing Badge Emblem */}
                    <div className="relative my-4 flex justify-center">
                        <div
                            className="w-24 h-24 rounded-3xl flex items-center justify-center shadow-xl animate-pulse"
                            style={{
                                backgroundColor: recentlyUnlocked.badgeColor,
                                color: '#FFF',
                            }}
                        >
                            <Award size={48} />
                        </div>
                        <div className="absolute -bottom-2 bg-emerald-500 text-white rounded-full p-1.5 shadow-lg border-2 border-white">
                            <CheckCircle2 size={20} />
                        </div>
                    </div>

                    {/* Celebration Header */}
                    <div className="inline-flex items-center gap-1.5 text-xs font-black text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full mb-2">
                        <Zap size={14} className="fill-emerald-500 text-emerald-500" />
                        MISSION COMPLETE • +{recentlyUnlocked.xp} XP
                    </div>

                    <h2 className="text-2xl font-black text-brand-navy tracking-tight mb-1">
                        Congratulations!
                    </h2>
                    <p className="text-sm font-bold text-gray-700 mb-2">
                        You unlocked "{recentlyUnlocked.title}"
                    </p>
                    <p className="text-xs text-gray-500 leading-relaxed px-4 mb-6">
                        {recentlyUnlocked.description}
                    </p>

                    {/* Unlocked Badge Pill */}
                    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-2xl p-3 mb-6 flex items-center justify-center gap-2">
                        <Award size={18} className="text-[#006AFF]" />
                        <span className="text-xs font-black text-brand-navy">
                            Badge Unlocked: <span className="text-[#006AFF]">{recentlyUnlocked.badgeName}</span>
                        </span>
                    </div>

                    {/* Action Buttons */}
                    <div className="space-y-2">
                        <button
                            onClick={startNextAvailableMission}
                            className="w-full py-3.5 bg-[#006AFF] hover:bg-[#0058DB] active:scale-98 text-white font-bold text-sm rounded-2xl shadow-lg flex items-center justify-center gap-2 transition-all"
                        >
                            Try Next Challenge
                            <ArrowRight size={18} />
                        </button>

                        <button
                            onClick={dismissCelebration}
                            className="w-full py-2.5 text-xs font-bold text-gray-500 hover:text-brand-navy transition-colors"
                        >
                            View Achievements & Exit
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
};
