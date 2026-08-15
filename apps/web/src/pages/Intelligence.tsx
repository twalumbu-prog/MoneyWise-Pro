import React, { useState } from 'react';
import { Layout } from '../components/Layout';
import { BarChart3, Zap } from 'lucide-react';
import { AssistantChat } from '../components/assistant/AssistantChat';

type TabType = 'assistant' | 'insights' | 'automations';

const TABS: Array<{ id: TabType; label: string }> = [
    { id: 'assistant', label: 'Assistant' },
    { id: 'insights', label: 'Data Insights' },
    { id: 'automations', label: 'Automations' },
];

export const Intelligence: React.FC = () => {
    const [activeTab, setActiveTab] = useState<TabType>('assistant');
    // While a conversation is open, AssistantChat renders its own top bar
    // (back button + title) in place of this shared tab row.
    const [assistantInChat, setAssistantInChat] = useState(false);
    const showTabs = !(activeTab === 'assistant' && assistantInChat);

    return (
        <Layout backgroundColor="bg-white" noPadding={true}>
            {/*
              h-full + min-h-0 the whole way down is what lets the message list
              scroll internally instead of the page growing and pushing the
              composer off-screen.
            */}
            <div className="flex min-h-[calc(100vh-120px)] flex-1 flex-col overflow-hidden bg-white md:m-4 md:min-h-0 md:h-[calc(100%-2rem)] md:rounded-[20px]">
                {showTabs && (
                    <div className="flex flex-shrink-0 justify-center px-4 pb-3 pt-5 md:pt-6">
                        <div className="no-scrollbar relative z-20 flex w-full items-center overflow-x-auto rounded-2xl border border-gray-100/50 bg-gray-50/80 p-1 shadow-sm md:w-auto">
                            {TABS.map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`flex-1 whitespace-nowrap rounded-xl px-4 py-2.5 text-[11px] font-black transition-all md:flex-none md:px-8 md:text-[13px] ${
                                        activeTab === tab.id
                                            ? 'bg-white text-brand-navy shadow-sm'
                                            : 'text-gray-400 hover:text-gray-600'
                                    }`}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {activeTab === 'assistant' && <AssistantChat onChatStateChange={setAssistantInChat} />}

                {activeTab === 'insights' && (
                    <Placeholder
                        icon={<BarChart3 size={30} className="text-[#006AFF]" />}
                        tint="bg-blue-50"
                        title="Financial Insights"
                        body="A visual dashboard of trends and forecasting is on the way. In the meantime, ask the Assistant for any chart you need — it can build them on request."
                    />
                )}

                {activeTab === 'automations' && (
                    <Placeholder
                        icon={<Zap size={30} className="text-purple-500" />}
                        tint="bg-purple-50"
                        title="Process Automations"
                        body="Smart workflows for requisition approvals and budget tracking are coming soon."
                    />
                )}
            </div>
        </Layout>
    );
};

const Placeholder: React.FC<{ icon: React.ReactNode; tint: string; title: string; body: string }> = ({
    icon, tint, title, body,
}) => (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-20 text-center">
        <div className={`mb-6 flex h-20 w-20 items-center justify-center rounded-3xl ${tint}`}>{icon}</div>
        <h2 className="mb-2 text-2xl font-black tracking-tight text-brand-navy">{title}</h2>
        <p className="max-w-md text-[14px] font-medium leading-relaxed text-gray-500">{body}</p>
    </div>
);
