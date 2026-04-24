import React, { useState, useEffect, useRef } from 'react';
import { requisitionService, RequisitionMessage, Requisition } from '../../services/requisition.service';
import RequisitionMessageCard from './RequisitionMessageCard';
import RequisitionInput from './RequisitionInput';
import { useAuth } from '../../context/AuthContext';
import { Loader2 } from 'lucide-react';

interface RequisitionChatProps {
    requisition: Requisition;
    canAction: boolean;
    onStatusChange?: () => void;
}

const RequisitionChat: React.FC<RequisitionChatProps> = ({ requisition, canAction, onStatusChange }) => {
    const [messages, setMessages] = useState<RequisitionMessage[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isTyping, setIsTyping] = useState(false);
    const [pendingQueue, setPendingQueue] = useState<RequisitionMessage[]>([]);
    const isTypingRef = useRef(false);
    
    const { user, userRole } = useAuth();
    const scrollRef = useRef<HTMLDivElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const lastMessageIdRef = useRef<string | null>(null);
    const typingTimeoutRef = useRef<any>(null);
    const isProcessingQueueRef = useRef(false);
    const messagesRef = useRef<RequisitionMessage[]>([]);
    const pendingQueueRef = useRef<RequisitionMessage[]>([]);
    const isLoadingMessagesRef = useRef(false);

    // Keep refs in sync with state
    useEffect(() => { messagesRef.current = messages; }, [messages]);
    useEffect(() => { pendingQueueRef.current = pendingQueue; }, [pendingQueue]);
    useEffect(() => { isTypingRef.current = isTyping; }, [isTyping]);

    /**
     * Process the message queue sequentially
     */
    useEffect(() => {
        const processQueue = async () => {
            if (isProcessingQueueRef.current || pendingQueueRef.current.length === 0) return;
            
            isProcessingQueueRef.current = true;
            
            try {
                // Process elements until the queue is empty
                while (pendingQueueRef.current.length > 0) {
                    // Get the first message from the queue reference
                    const nextMsg = pendingQueueRef.current[0];
                    
                    const isSystem = nextMsg.message_type === 'SYSTEM';
                    // Special case: Disbursement summaries should be instant
                    const isSuccessSummary = 
                        nextMsg.content?.startsWith('Funds Disbursed:') || 
                        nextMsg.content?.startsWith('Money successfully sent') ||
                        nextMsg.content?.startsWith('Transaction successfully disbursed') ||
                        nextMsg.metadata?.isSummary === true;
                    
                    const isFromOther = (isSystem && !isSuccessSummary) || (nextMsg.user_id && nextMsg.user_id !== user?.id && !isSuccessSummary);
                    
                    if (isFromOther) {
                        setIsTyping(true);
                        scrollToBottom();
                        await new Promise(r => setTimeout(r, 1800));
                    }

                    // Add message to state
                    setMessages(prev => {
                        if (prev.some(m => m.id === nextMsg.id)) return prev;
                        return [...prev, nextMsg];
                    });
                    
                    // Synchronously update the queue ref, then queue a state update
                    pendingQueueRef.current = pendingQueueRef.current.slice(1);
                    setPendingQueue(pendingQueueRef.current);
                    
                    // If nothing else in queue immediately after popping, hide typing
                    if (pendingQueueRef.current.length === 0) {
                        setIsTyping(false);
                    }
                    
                    // Brief gap before finishing this iteration
                    await new Promise(r => setTimeout(r, 400));
                }
            } catch (err) {
                console.error('Queue processing failed:', err);
            } finally {
                isProcessingQueueRef.current = false;
            }
        };

        processQueue();
    }, [pendingQueue, user?.id]);

    // Auto-transition to Returned if no change identified
    useEffect(() => {
        const checkAutoTransition = async () => {
            const hasNoChangeMessage = messages.some(m => 
                (m.message_type === 'SYSTEM' || m.metadata?.stage === 'EXPENSE_SUMMARY') && 
                m.content?.includes('No change to submit')
            );

            if (requisition.status === 'EXPENSED' && hasNoChangeMessage) {
                try {
                    await requisitionService.updateStatus(requisition.id, 'CHANGE_SUBMITTED');
                    if (onStatusChange) onStatusChange();
                } catch (err) {
                    console.error('Failed to auto-transition status:', err);
                }
            }
        };

        if (messages.length > 0) {
            checkAutoTransition();
        }
    }, [messages, requisition.status, requisition.id, onStatusChange]);

    const loadMessages = async (forceNoAnimation = false) => {
        if (isLoadingMessagesRef.current) return;
        isLoadingMessagesRef.current = true;

        try {
            const data = await requisitionService.getMessages(requisition.id);
            
            if (forceNoAnimation) {
                setMessages(data);
                return;
            }

            // Find TRULY new messages using REFS
            const trulyNew = data.filter(apiMsg => 
                !messagesRef.current.some(m => m.id === apiMsg.id) && 
                !pendingQueueRef.current.some(m => m.id === apiMsg.id)
            );

            // Also check for UPDATED messages (e.g. AI finished thinking)
            const updated = data.filter(apiMsg => {
                const existing = messagesRef.current.find(m => m.id === apiMsg.id);
                return existing && (
                    apiMsg.content !== existing.content || 
                    JSON.stringify(apiMsg.metadata) !== JSON.stringify(existing.metadata)
                );
            });

            if (trulyNew.length > 0) {
                setPendingQueue(prev => [...prev, ...trulyNew]);
            }
            
            if (updated.length > 0) {
                setMessages(prev => prev.map(m => {
                    const update = updated.find(u => u.id === m.id);
                    return update || m;
                }));
            }

            if (trulyNew.length === 0 && isTypingRef.current && pendingQueueRef.current.length === 0) {

                // If we were manually typing but no new messages came, clear it
                setTimeout(() => {
                    if (pendingQueueRef.current.length === 0) {
                        setIsTyping(false);
                    }
                }, 2000);
            }
        } catch (err) {
            console.error('Failed to load messages:', err);
        } finally {
            setIsLoading(false);
            isLoadingMessagesRef.current = false;
        }
    };

    const scrollToBottom = () => {
        setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 50);
    };

    useEffect(() => {
        loadMessages(true); // Initial load without animation
        const interval = setInterval(() => loadMessages(false), 4000);
        return () => {
            clearInterval(interval);
            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        };
    }, [requisition.id]);

    useEffect(() => {
        if (messages.length > 0 || isTyping) {
            scrollToBottom();
            if (messages.length > 0) {
                lastMessageIdRef.current = messages[messages.length - 1].id;
            }
        }
    }, [messages, isTyping]);


    const handleSendMessage = async (content: string) => {
        try {
            const newMessage = await requisitionService.sendMessage(requisition.id, content);
            setMessages(prev => [...prev, newMessage]);
            return newMessage;
        } catch (err) {
            console.error('Failed to send message:', err);
            throw err;
        }
    };

    const handleAction = async (action: string) => {
        if (action === 'APPROVE') {
            try {
                // 1. Send the user's message to the backend FIRST to ensure it gets an older database timestamp
                // We do NOT use handleSendMessage here because we want to defer the UI rendering.
                const msgPromise = requisitionService.sendMessage(requisition.id, 'Approved');
                
                // Give the DB a tiny head start to guarantee timestamp chronology
                await new Promise(r => setTimeout(r, 150));
                
                // 2. Update status on backend (this creates the DISBURSAL system message)
                await requisitionService.updateStatus(requisition.id, 'AUTHORISED');
                
                // 3. Notify parent to visually transform the card to "Approved" state
                onStatusChange?.();
                
                // DELIBERATE UI PAUSE: Give the user time to clearly read the "Requisition Approved... This request was authorized" 
                // feedback on the card before we pop the chat message onto the screen.
                await new Promise(r => setTimeout(r, 1500));
                
                // 4. Await the message and NOW inject it into the UI chat feed
                const newMessage = await msgPromise;
                setMessages(prev => {
                    if (prev.some(m => m.id === newMessage.id)) return prev;
                    return [...prev, newMessage];
                });
                
                // 5. Start typing indicator immediately to show system is "thinking"
                setIsTyping(true);
                scrollToBottom();
                
                // 6. Force a message reload (fetches the DISBURSAL message)
                await loadMessages(false);
            } catch (err) {
                console.error('Approval failed:', err);
                throw err;
            }
        } else if (action === 'REJECT') {
            try {
                // 1. Send message to backend first for chronological integrity
                const msgPromise = requisitionService.sendMessage(requisition.id, 'Rejected');
                await new Promise(r => setTimeout(r, 150));
                
                // 2. Update backend status
                await requisitionService.updateStatus(requisition.id, 'REJECTED');
                
                // 3. Notify parent to transform UI
                onStatusChange?.();
                
                // DELIBERATE UI PAUSE: Give the user time to clearly read the "Requisition Rejected" 
                // feedback on the card before we pop the chat message onto the screen.
                await new Promise(r => setTimeout(r, 1500));
                
                // 4. Inject message into UI chat feed
                const newMessage = await msgPromise;
                setMessages(prev => {
                    if (prev.some(m => m.id === newMessage.id)) return prev;
                    return [...prev, newMessage];
                });
                
                // Start typing indicator immediately
                setIsTyping(true);
                scrollToBottom();
                
                await loadMessages(false);
            } catch (err) {
                console.error('Rejection failed:', err);
                throw err;
            }
        }
    };

    return (
        <div className="flex flex-col h-full bg-[#E6F2FE] relative">
            <div className="flex-1 overflow-y-auto px-8 py-6 scroll-smooth" ref={scrollRef}>
                {isLoading && messages.length === 0 ? (
                    <div className="flex items-center justify-center h-full">
                        <Loader2 className="w-6 h-6 text-[#006AFF] animate-spin" />
                    </div>
                ) : (
                    <div className="space-y-4 max-w-4xl mx-auto">
                        {messages.length === 0 && requisition.status !== 'AUTHORISED' && (
                            <div className="flex flex-col items-center justify-center py-20 text-blue-300">
                                <svg className="w-16 h-16 mb-4 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                </svg>
                                <p className="text-sm font-bold uppercase tracking-widest opacity-40">Activity History</p>
                            </div>
                        )}
                        
                        {messages.map((msg, index) => (
                            <RequisitionMessageCard
                                key={msg.id}
                                isInitial={index === 0}
                                message={msg}
                                isOwn={msg.user_id === user?.id}
                                onAction={(action) => {
                                    if (action === 'REFRESH') {
                                        // Start dots immediately to show something is coming
                                        setIsTyping(true);
                                        scrollToBottom();
                                        loadMessages();
                                        onStatusChange?.();
                                    } else {
                                        return handleAction(action);
                                    }
                                }}
                                canAction={canAction}
                                requisitionData={requisition}
                            />
                        ))}

                        {isTyping && (
                            <div className="flex flex-col mb-8 w-full max-w-2xl animate-in fade-in slide-in-from-left-4 duration-500">
                                <div className="typing-bubble">
                                    <div className="typing-dot" />
                                    <div className="typing-dot" />
                                    <div className="typing-dot" />
                                </div>
                            </div>
                        )}

                        <div ref={messagesEndRef} />
                    </div>
                )}
            </div>

            <RequisitionInput 
                onSend={handleSendMessage} 
                disabled={
                    requisition.status === 'COMPLETED' || 
                    requisition.status === 'ACCOUNTED' || 
                    (!(userRole === 'ADMIN' || userRole === 'ACCOUNTANT' || userRole === 'CASHIER' || userRole === 'MANAGER') && requisition.status === 'CHANGE_SUBMITTED')
                } 
            />
        </div>
    );
};

export default RequisitionChat;
