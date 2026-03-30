import React, { useState, useRef, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { Plus, Send, X, Bot, BarChart3, Zap, User } from 'lucide-react';
import { supabase } from '../lib/supabase';
import ReactMarkdown from 'react-markdown';

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');

type TabType = 'assistant' | 'insights' | 'automations';

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
}

const TEMPLATE_PROMPTS = [
    "How much did we spend last week on canteen food?",
    "How much did we spend last week on canteen food?", // Duplicate in screenshot, but I'll add variation
    "How much did we spend last week on canteen food?",
    "Are there any opportunities for our business to Save Money?",
    "How much did we spend last week on canteen food?"
];

export const Intelligence: React.FC = () => {
    const [activeTab, setActiveTab] = useState<TabType>('assistant');
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSend = async (text: string = inputValue) => {
        if (!text.trim() || isLoading) return;

        const userMsg: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: text,
            timestamp: new Date()
        };

        setMessages(prev => [...prev, userMsg]);
        setInputValue('');
        setIsLoading(true);

        try {
            const { data: session } = await supabase.auth.getSession();
            const token = session.session?.access_token;

            const response = await fetch(`${API_URL}/ai/assistant`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ message: text })
            });

            if (!response.ok) throw new Error('Failed to get response');
            const data = await response.json();

            const assistantMsg: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: data.reply || "I'm sorry, I couldn't process that request.",
                timestamp: new Date()
            };

            setMessages(prev => [...prev, assistantMsg]);
        } catch (error) {
            console.error('Chat error:', error);
            const errorMsg: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: "I'm having trouble connecting right now. Please try again later.",
                timestamp: new Date()
            };
            setMessages(prev => [...prev, errorMsg]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleReset = () => {
        setMessages([]);
        setInputValue('');
    };

    const isChatActive = messages.length > 0;

    return (
        <Layout backgroundColor="bg-white" noPadding={true}>
            <div className="flex-1 flex flex-col bg-white min-h-[calc(100vh-120px)]">
                {/* SUB-NAVIGATION TOGGLES */}
                <div className="flex justify-center pt-8 pb-4">
                    <div className="bg-gray-50/80 p-1 rounded-2xl flex items-center border border-gray-100/50 shadow-sm relative z-20">
                        <button
                            onClick={() => setActiveTab('assistant')}
                            className={`px-8 py-2.5 rounded-xl text-[13px] font-black transition-all
                                ${activeTab === 'assistant' 
                                    ? 'bg-white text-brand-navy shadow-sm' 
                                    : 'text-gray-400 hover:text-gray-600'}`}
                        >
                            Assistant
                        </button>
                        <button
                            onClick={() => setActiveTab('insights')}
                            className={`px-8 py-2.5 rounded-xl text-[13px] font-bold transition-all
                                ${activeTab === 'insights' 
                                    ? 'bg-white text-brand-navy shadow-sm' 
                                    : 'text-gray-400 hover:text-gray-600'}`}
                        >
                            Data Insights
                        </button>
                        <button
                            onClick={() => setActiveTab('automations')}
                            className={`px-8 py-2.5 rounded-xl text-[13px] font-bold transition-all
                                ${activeTab === 'automations' 
                                    ? 'bg-white text-brand-navy shadow-sm' 
                                    : 'text-gray-400 hover:text-gray-600'}`}
                        >
                            Automations
                        </button>
                    </div>
                </div>

                {activeTab === 'assistant' && (
                    <div className="flex-1 flex flex-col w-full max-w-[1440px] mx-auto px-6 md:px-24 relative">
                        <div className="flex-1 bg-white flex flex-col relative overflow-hidden">
                            {/* RESET BUTTON */}
                            {isChatActive && (
                                <button 
                                    onClick={handleReset}
                                    className="absolute top-4 right-0 z-10 p-2 text-gray-400 hover:text-gray-600 transition-colors bg-gray-50 rounded-full"
                                >
                                    <X size={20} />
                                </button>
                            )}

                        {!isChatActive ? (
                            /* INITIAL HERO STATE */
                            <div className="flex-1 flex flex-col items-center justify-center py-20 px-4">
                                <div className="flex items-center space-x-4 mb-12">
                                    <h1 className="text-[48px] font-black text-brand-navy tracking-tight">
                                        How Can I Help You Today?
                                    </h1>
                                    <span className="px-3 py-1 bg-[#006AFF]/10 text-[#006AFF] text-[12px] font-black rounded-full border border-[#006AFF]/20 tracking-widest">
                                        BETA
                                    </span>
                                </div>

                                {/* INPUT ROW (CENTERED) */}
                                <div className="w-full max-w-2xl flex items-center space-x-4 mb-10">
                                    <button className="p-4 text-gray-300 hover:text-gray-500 transition-colors">
                                        <Plus size={24} />
                                    </button>
                                    
                                    <div className="flex-1 relative">
                                        <input
                                            type="text"
                                            value={inputValue}
                                            onChange={(e) => setInputValue(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                                            placeholder="Ask Anything"
                                            className="w-full py-5 px-8 rounded-full border border-gray-100 shadow-sm text-[16px] focus:outline-none focus:ring-4 focus:ring-blue-500/5 focus:border-blue-200 transition-all placeholder:text-gray-300"
                                        />
                                        <button 
                                            onClick={() => handleSend()}
                                            disabled={!inputValue.trim() || isLoading}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 p-3 bg-gray-50 rounded-full text-gray-400 hover:bg-blue-50 hover:text-[#006AFF] transition-all disabled:opacity-50"
                                        >
                                            <Send size={20} />
                                        </button>
                                    </div>
                                </div>

                                {/* TEMPLATE PROMPTS */}
                                <div className="flex flex-wrap justify-center gap-3 max-w-3xl">
                                    {TEMPLATE_PROMPTS.map((prompt, idx) => (
                                        <button
                                            key={idx}
                                            onClick={() => handleSend(prompt)}
                                            className="px-6 py-3 bg-gray-50/50 hover:bg-gray-100 rounded-full text-[12px] font-bold text-gray-500 transition-all border border-gray-100/50"
                                        >
                                            {prompt}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            /* CHAT CONVERSATION STATE */
                            <div className="flex-1 flex flex-col py-8 overflow-hidden">
                                <div className="flex-1 overflow-y-auto space-y-8 no-scrollbar pb-32">
                                    {messages.map((msg) => (
                                        <div 
                                            key={msg.id}
                                            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                                        >
                                            <div className={`flex max-w-[90%] md:max-w-[80%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'} items-start space-x-2`}>
                                                <div className={`flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center 
                                                    ${msg.role === 'user' ? 'bg-blue-50 ml-4' : 'bg-gray-50 border border-gray-100 mr-4'}`}>
                                                    {msg.role === 'user' ? <User size={20} className="text-[#006AFF]" /> : <Bot size={20} className="text-gray-600" />}
                                                </div>
                                                <div className={`px-8 py-6 rounded-3xl text-[15px] leading-relaxed
                                                    ${msg.role === 'user' 
                                                        ? 'bg-[#006AFF] text-white shadow-xl shadow-blue-500/10' 
                                                        : 'bg-white border border-gray-100/80 text-gray-800 shadow-[0_4px_20px_rgba(0,0,0,0.03)] opacity-100 relative after:absolute after:inset-0 after:bg-gray-50/5 after:rounded-3xl after:-z-10'}`}>
                                                    <div className="analytics-report overflow-x-auto">
                                                        <ReactMarkdown 
                                                            components={{
                                                                p: ({node, ...props}) => <p className="mb-4 last:mb-0 leading-[1.6]" {...props} />,
                                                                ul: ({node, ...props}) => <ul className="list-disc ml-6 mb-4 space-y-2" {...props} />,
                                                                ol: ({node, ...props}) => <ol className="list-decimal ml-6 mb-4 space-y-2" {...props} />,
                                                                li: ({node, ...props}) => <li className="pl-1" {...props} />,
                                                                h1: ({node, ...props}) => <h1 className="text-2xl font-black mb-4 text-brand-navy tracking-tight" {...props} />,
                                                                h2: ({node, ...props}) => <h2 className="text-xl font-black mb-3 text-brand-navy tracking-tight" {...props} />,
                                                                h3: ({node, ...props}) => <h3 className="text-lg font-black mb-2 text-brand-navy" {...props} />,
                                                                strong: ({node, ...props}) => <strong className="font-black text-brand-navy border-b-2 border-blue-100" {...props} />,
                                                                table: ({node, ...props}) => (
                                                                    <div className="my-6 overflow-hidden rounded-2xl border border-gray-100 bg-gray-50/50">
                                                                        <table className="w-full border-collapse text-left" {...props} />
                                                                    </div>
                                                                ),
                                                                thead: ({node, ...props}) => <thead className="bg-[#006AFF]/5 border-b border-[#006AFF]/10" {...props} />,
                                                                th: ({node, ...props}) => <th className="px-5 py-4 text-xs font-black uppercase tracking-widest text-[#006AFF]/60" {...props} />,
                                                                td: ({node, ...props}) => <td className="px-5 py-4 text-sm text-gray-600 border-b border-gray-100/50" {...props} />,
                                                                tr: ({node, ...props}) => <tr className="hover:bg-white/80 transition-colors last:border-0" {...props} />,
                                                            }}
                                                        >
                                                            {msg.content}
                                                        </ReactMarkdown>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    {isLoading && (
                                        <div className="flex justify-start">
                                            <div className="flex max-w-[90%] md:max-w-[80%] flex-row items-start space-x-2">
                                                <div className="flex-shrink-0 h-10 w-10 rounded-full bg-gray-50 border border-gray-100 flex items-center justify-center mr-4 z-10">
                                                    <Bot size={20} className="text-gray-600" />
                                                </div>
                                                <div className="typing-bubble animate-in fade-in slide-in-from-left-4 duration-500" style={{ transformOrigin: 'top left', marginTop: '2px' }}>
                                                    <div className="typing-dot" />
                                                    <div className="typing-dot" />
                                                    <div className="typing-dot" />
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                    <div ref={messagesEndRef} />
                                </div>

                                {/* STICKY BOTTOM INPUT */}
                                <div className="absolute bottom-10 left-6 right-6 flex justify-center pointer-events-none">
                                    <div className="w-full max-w-3xl flex items-center space-x-4 bg-white/80 backdrop-blur-md p-4 rounded-[40px] border border-gray-100 shadow-2xl pointer-events-auto ring-8 ring-white/50">
                                        <button className="p-3 text-gray-300 hover:text-gray-500 transition-colors">
                                            <Plus size={22} />
                                        </button>
                                        <input
                                            type="text"
                                            value={inputValue}
                                            onChange={(e) => setInputValue(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                                            placeholder="Ask a follow up..."
                                            className="flex-1 py-3 px-2 text-[15px] focus:outline-none transition-all placeholder:text-gray-300"
                                        />
                                        <button 
                                            onClick={() => handleSend()}
                                            disabled={!inputValue.trim() || isLoading}
                                            className={`p-3 rounded-full transition-all disabled:opacity-50
                                                ${inputValue.trim() ? 'bg-[#006AFF] text-white shadow-lg shadow-blue-200' : 'bg-gray-100 text-gray-400'}`}
                                        >
                                            <Send size={18} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                        </div>
                    </div>
                )}

                {activeTab === 'insights' && (
                    <div className="flex-1 flex flex-col w-full max-w-[1440px] mx-auto px-6 md:px-24">
                        <div className="flex-1 flex flex-col items-center justify-center text-center py-20">
                            <div className="h-20 w-20 bg-blue-50 rounded-3xl flex items-center justify-center mb-6">
                                <BarChart3 size={32} className="text-[#006AFF]" />
                            </div>
                            <h2 className="text-2xl font-black text-brand-navy mb-2 tracking-tight">Financial Insights</h2>
                            <p className="text-gray-500 max-w-md font-medium">
                                We're preparing your visual data dashboard. Soon you'll be able to see trend analysis and expense forecasting.
                            </p>
                        </div>
                    </div>
                )}

                {activeTab === 'automations' && (
                    <div className="flex-1 flex flex-col w-full max-w-[1440px] mx-auto px-6 md:px-24">
                        <div className="flex-1 flex flex-col items-center justify-center text-center py-20">
                            <div className="h-20 w-20 bg-purple-50 rounded-3xl flex items-center justify-center mb-6">
                                <Zap size={32} className="text-purple-500" />
                            </div>
                            <h2 className="text-2xl font-black text-brand-navy mb-2 tracking-tight">Process Automations</h2>
                            <p className="text-gray-500 max-w-md font-medium">
                                Smart workflows to automate your requisition approvals and budget tracking are coming soon.
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </Layout>
    );
};
