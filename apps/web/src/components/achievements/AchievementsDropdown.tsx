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
            <div className="absolute right-0 mt-3 w-96 bg-white rounded-2xl shadow-xl border border-[#E8EEF8] z-50 overflow-hidden transform origin-top-right animate-in fade-in slide-in-from-top-2 duration-200">
                {/* Header */}
                <div className="p-5 bg-white border-b border-[#E8EEF8]">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 rounded-xl bg-[#006AFF]/10 flex items-center justify-center">
                                <Trophy size={16} className="text-[#006AFF]" />
                            </div>
                            <div>
                                <h3 className="font-bold text-sm leading-tight text-brand-navy">Guided Missions</h3>
                                <p className="text-[11px] text-gray-400 font-medium">Learn MoneyWise Pro, step by step</p>
                            </div>
                        </div>
                        <button
                            onClick={() => setDesktopDropdownOpen(false)}
                            className="w-7 h-7 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors"
                        >
                            <X size={14} />
                        </button>
                    </div>

                    {/* Progress Bar & XP */}
                    <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
                        <span className="text-gray-600">{completedCount} of {totalCount} missions completed</span>
                        <span className="text-gray-400 font-medium">{earnedXp} / {totalXp} XP</span>
                    </div>
                    <div className="w-full bg-[#E8EEF8] h-1.5 rounded-full overflow-hidden">
                        <div
                            className="bg-[#006AFF] h-full rounded-full transition-all duration-500 ease-out"
                            style={{ width: `${percentage}%` }}
                        />
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
                                        <div className="flex items-center gap-1.5 mb-1">
                                            <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400">
                                                {item.category.replace('_', ' ')}
                                            </span>
                                            <span className="text-gray-200 text-[9px]">&bull;</span>
                                            <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-0.5">
                                                <Zap size={10} className="fill-emerald-500 text-emerald-500" />
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
                                            ? 'bg-white border-[#E8EEF8] shadow-xs'
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
                        Complete missions to master MoneyWise Pro, one feature at a time.
                    </p>
                </div>
            </div>
        </>
    );
};
