import React, { useState } from 'react';
import { useAchievements } from '../../context/AchievementsContext';
import { Trophy, CheckCircle2, Play, Award, Zap, X, Lock } from 'lucide-react';

export const AchievementsDropdown: React.FC = () => {
    const {
        achievements,
        completedCount,
        totalCount,
        earnedXp,
        totalXp,
        startMission,
        setDesktopDropdownOpen,
    } = useAchievements();

    const [tab, setTab] = useState<'missions' | 'badges'>('missions');
    const percentage = Math.round((completedCount / totalCount) * 100);

    return (
        <>
            {/* Backdrop for closing */}
            <div
                className="fixed inset-0 z-40"
                onClick={() => setDesktopDropdownOpen(false)}
            />

            {/* Dropdown Container */}
            <div className="absolute right-0 mt-3 w-96 bg-white rounded-3xl shadow-2xl border border-[#E8EEF8] z-50 overflow-hidden transform origin-top-right animate-in fade-in slide-in-from-top-2 duration-200">
                {/* Header Banner */}
                <div className="p-5 bg-gradient-to-r from-brand-navy via-[#004BBD] to-[#006AFF] text-white">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-xl bg-white/15 backdrop-blur-md flex items-center justify-center">
                                <Trophy size={18} className="text-yellow-300" />
                            </div>
                            <div>
                                <h3 className="font-bold text-sm leading-tight text-white">Achievements & Missions</h3>
                                <p className="text-[10px] text-blue-100 font-medium">Gamified Onboarding Guide</p>
                            </div>
                        </div>
                        <button
                            onClick={() => setDesktopDropdownOpen(false)}
                            className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/80 hover:text-white transition-colors"
                        >
                            <X size={14} />
                        </button>
                    </div>

                    {/* Progress Bar & XP */}
                    <div className="bg-white/10 rounded-2xl p-3 border border-white/10 backdrop-blur-xs">
                        <div className="flex items-center justify-between text-xs font-bold mb-1.5">
                            <span className="text-white/90">{completedCount} of {totalCount} Missions Completed</span>
                            <span className="text-yellow-300 flex items-center gap-1 text-[11px]">
                                <Zap size={12} className="fill-yellow-300" /> {earnedXp} / {totalXp} XP
                            </span>
                        </div>
                        <div className="w-full bg-black/20 h-2 rounded-full overflow-hidden">
                            <div
                                className="bg-gradient-to-r from-yellow-400 to-amber-300 h-full rounded-full transition-all duration-500 ease-out"
                                style={{ width: `${percentage}%` }}
                            />
                        </div>
                    </div>
                </div>

                {/* Sub-tabs */}
                <div className="flex border-b border-[#E8EEF8] bg-[#F8FAFC] px-4 pt-2">
                    <button
                        onClick={() => setTab('missions')}
                        className={`flex-1 py-2 text-xs font-bold border-b-2 transition-all flex items-center justify-center gap-1.5 ${
                            tab === 'missions'
                                ? 'border-[#006AFF] text-[#006AFF]'
                                : 'border-transparent text-gray-400 hover:text-gray-600'
                        }`}
                    >
                        <Trophy size={14} />
                        Missions ({totalCount - completedCount} Left)
                    </button>
                    <button
                        onClick={() => setTab('badges')}
                        className={`flex-1 py-2 text-xs font-bold border-b-2 transition-all flex items-center justify-center gap-1.5 ${
                            tab === 'badges'
                                ? 'border-[#006AFF] text-[#006AFF]'
                                : 'border-transparent text-gray-400 hover:text-gray-600'
                        }`}
                    >
                        <Award size={14} />
                        Badges Gallery ({completedCount})
                    </button>
                </div>

                {/* Content Body */}
                <div className="p-4 max-h-[360px] overflow-y-auto space-y-3">
                    {tab === 'missions' ? (
                        achievements.map((item) => (
                            <div
                                key={item.id}
                                className={`p-3.5 rounded-2xl border transition-all ${
                                    item.completed
                                        ? 'bg-gray-50/70 border-gray-100 opacity-80'
                                        : 'bg-white border-[#E8EEF8] hover:border-blue-200 hover:shadow-sm'
                                }`}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span
                                                className="text-[9px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full"
                                                style={{
                                                    backgroundColor: `${item.badgeColor}15`,
                                                    color: item.badgeColor,
                                                }}
                                            >
                                                {item.category}
                                            </span>
                                            <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-md flex items-center gap-0.5">
                                                <Zap size={10} className="fill-amber-500 text-amber-500" />
                                                +{item.xp} XP
                                            </span>
                                        </div>
                                        <h4 className="text-xs font-bold text-gray-900 leading-snug">{item.title}</h4>
                                        <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-2">{item.description}</p>
                                    </div>

                                    {item.completed ? (
                                        <div className="flex items-center gap-1 text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1.5 rounded-xl border border-emerald-100 flex-shrink-0">
                                            <CheckCircle2 size={14} />
                                            Completed
                                        </div>
                                    ) : (
                                        <button
                                            onClick={() => startMission(item.id)}
                                            className="flex items-center gap-1 text-xs font-bold text-white bg-[#006AFF] hover:bg-[#0058DB] active:scale-95 px-3 py-1.5 rounded-xl shadow-sm transition-all flex-shrink-0"
                                        >
                                            <Play size={12} className="fill-white" />
                                            Start Now
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="grid grid-cols-2 gap-2.5">
                            {achievements.map((item) => (
                                <div
                                    key={item.id}
                                    className={`p-3 rounded-2xl border text-center transition-all ${
                                        item.completed
                                            ? 'bg-gradient-to-b from-blue-50/50 to-white border-blue-100'
                                            : 'bg-gray-50 border-gray-100 opacity-50 grayscale'
                                    }`}
                                >
                                    <div
                                        className="w-10 h-10 mx-auto rounded-2xl flex items-center justify-center mb-2 shadow-xs"
                                        style={{
                                            backgroundColor: item.completed ? item.badgeColor : '#9CA3AF',
                                            color: '#FFF',
                                        }}
                                    >
                                        {item.completed ? <Award size={20} /> : <Lock size={18} />}
                                    </div>
                                    <h5 className="text-xs font-bold text-gray-900 truncate">{item.badgeName}</h5>
                                    <p className="text-[9px] font-semibold text-gray-400 mt-0.5">
                                        {item.completed ? 'Unlocked' : 'Locked'}
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer Note */}
                <div className="p-3 bg-[#F8FAFC] border-t border-[#E8EEF8] text-center">
                    <p className="text-[10px] font-medium text-gray-400">
                        Guided missions show you how to master MoneyWise Pro.
                    </p>
                </div>
            </div>
        </>
    );
};
