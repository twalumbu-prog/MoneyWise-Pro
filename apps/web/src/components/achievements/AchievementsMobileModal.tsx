import React, { useState } from 'react';
import { useAchievements } from '../../context/AchievementsContext';
import { Trophy, CheckCircle2, Play, Award, Zap, ArrowLeft, Lock, Sparkles, ChevronRight } from 'lucide-react';

export const AchievementsMobileModal: React.FC = () => {
    const {
        isMobileModalOpen,
        setMobileModalOpen,
        achievements,
        completedCount,
        totalCount,
        earnedXp,
        startMission,
    } = useAchievements();

    const [activeTab, setActiveTab] = useState<'missions' | 'badges'>('missions');

    if (!isMobileModalOpen) return null;

    const percentage = Math.round((completedCount / totalCount) * 100);

    return (
        <div className="fixed inset-0 z-[200] bg-white flex flex-col font-sans animate-in fade-in duration-200 overflow-hidden">
            {/* Top Navigation Bar */}
            <div className="px-5 py-4 bg-white border-b border-gray-100 flex items-center justify-between sticky top-0 z-10">
                <button
                    type="button"
                    onClick={() => setMobileModalOpen(false)}
                    className="flex items-center gap-2 text-gray-700 active:opacity-60 transition-opacity"
                    aria-label="Back to Inbox"
                >
                    <ArrowLeft size={22} />
                    <span className="font-bold text-lg text-brand-navy">Missions</span>
                </button>

                <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200/60 px-3 py-1 rounded-full">
                    <Zap size={14} className="fill-emerald-500 text-emerald-500" />
                    <span className="text-xs font-black text-emerald-700">{earnedXp} XP</span>
                </div>
            </div>

            {/* Main Scrollable Content */}
            <div className="flex-1 overflow-y-auto pb-12 bg-[#F8FAFC]">
                {/* Hero Banner */}
                <div className="p-6 bg-gradient-to-br from-brand-navy via-[#004BBD] to-[#006AFF] text-white relative overflow-hidden">
                    <div className="absolute -right-6 -bottom-6 w-36 h-36 bg-white/10 rounded-full blur-2xl pointer-events-none" />

                    <div className="relative z-10">
                        <div className="flex items-center gap-2 text-blue-200 font-extrabold text-xs uppercase tracking-widest mb-1">
                            <Sparkles size={14} />
                            Guided Missions
                        </div>
                        <h2 className="text-2xl font-black tracking-tight text-white mb-2">
                            Master MoneyWise Pro
                        </h2>
                        <p className="text-xs text-blue-100 leading-relaxed max-w-xs mb-5">
                            Complete guided missions to explore features, unlock badges, and streamline your workflow.
                        </p>

                        {/* Progress Container */}
                        <div className="bg-white/15 backdrop-blur-md rounded-2xl p-4 border border-white/15">
                            <div className="flex items-center justify-between text-xs font-bold mb-2 text-white">
                                <span>Progress</span>
                                <span>{completedCount} / {totalCount} Completed ({percentage}%)</span>
                            </div>
                            <div className="w-full bg-black/20 h-2.5 rounded-full overflow-hidden mb-3">
                                <div
                                    className="bg-gradient-to-r from-[#03D47C] to-emerald-300 h-full rounded-full transition-all duration-500"
                                    style={{ width: `${percentage}%` }}
                                />
                            </div>

                            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/10 text-center">
                                <div>
                                    <p className="text-[10px] text-blue-200 font-medium">Missions</p>
                                    <p className="text-sm font-black text-white">{completedCount}/{totalCount}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] text-blue-200 font-medium">Badges</p>
                                    <p className="text-sm font-black text-white">{completedCount}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] text-blue-200 font-medium">Total XP</p>
                                    <p className="text-sm font-black text-emerald-300">{earnedXp}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Sub Navbar Tabs */}
                <div className="px-5 pt-4 bg-white border-b border-gray-100 flex gap-4">
                    <button
                        onClick={() => setActiveTab('missions')}
                        className={`pb-3 text-xs font-extrabold border-b-2 transition-all flex items-center gap-1.5 ${
                            activeTab === 'missions'
                                ? 'border-[#006AFF] text-[#006AFF]'
                                : 'border-transparent text-gray-400'
                        }`}
                    >
                        <Trophy size={16} />
                        Missions Objectives ({totalCount - completedCount})
                    </button>
                    <button
                        onClick={() => setActiveTab('badges')}
                        className={`pb-3 text-xs font-extrabold border-b-2 transition-all flex items-center gap-1.5 ${
                            activeTab === 'badges'
                                ? 'border-[#006AFF] text-[#006AFF]'
                                : 'border-transparent text-gray-400'
                        }`}
                    >
                        <Award size={16} />
                        Badges Showcase ({completedCount})
                    </button>
                </div>

                {/* Missions List */}
                <div className="p-5 space-y-4">
                    {activeTab === 'missions' ? (
                        achievements.map((item) => (
                            <div
                                key={item.id}
                                className={`p-4 rounded-3xl border transition-all ${
                                    item.completed
                                        ? 'bg-white border-gray-100 opacity-85 shadow-xs'
                                        : 'bg-white border-[#E8EEF8] shadow-md hover:border-blue-300'
                                }`}
                            >
                                <div className="flex items-start justify-between gap-3 mb-2">
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400">
                                            {item.category.replace('_', ' ')}
                                        </span>
                                        <span className="text-gray-200 text-[9px]">&bull;</span>
                                        <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-1">
                                            <Zap size={11} className="fill-emerald-500 text-emerald-500" />
                                            +{item.xp} XP
                                        </span>
                                    </div>

                                    {item.completed && (
                                        <div className="flex items-center gap-1 text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100">
                                            <CheckCircle2 size={14} />
                                            Completed
                                        </div>
                                    )}
                                </div>

                                <h3 className="text-sm font-bold text-brand-navy mb-1">{item.title}</h3>
                                <p className="text-xs text-gray-500 leading-relaxed mb-4">{item.description}</p>

                                {!item.completed && (
                                    <button
                                        onClick={() => startMission(item.id)}
                                        className="w-full py-3 bg-[#006AFF] hover:bg-[#0058DB] active:scale-98 text-white text-xs font-bold rounded-2xl shadow-md flex items-center justify-center gap-2 transition-all"
                                    >
                                        <Play size={14} className="fill-white" />
                                        Start Mission Now
                                        <ChevronRight size={16} />
                                    </button>
                                )}
                            </div>
                        ))
                    ) : (
                        <div className="grid grid-cols-2 gap-3">
                            {achievements.map((item) => (
                                <div
                                    key={item.id}
                                    className={`p-4 rounded-3xl border text-center transition-all ${
                                        item.completed
                                            ? 'bg-white border-[#E8EEF8] shadow-sm'
                                            : 'bg-gray-50 border-gray-100 opacity-60 grayscale'
                                    }`}
                                >
                                    <div
                                        className="w-14 h-14 mx-auto rounded-3xl flex items-center justify-center mb-3 shadow-md"
                                        style={{
                                            backgroundColor: item.completed ? item.badgeColor : '#9CA3AF',
                                            color: '#FFF',
                                        }}
                                    >
                                        {item.completed ? <Award size={28} /> : <Lock size={24} />}
                                    </div>
                                    <h4 className="text-xs font-bold text-brand-navy truncate">{item.badgeName}</h4>
                                    <p className="text-[10px] font-semibold text-gray-400 mt-1">
                                        {item.completed ? 'Unlocked' : 'Locked Objective'}
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
