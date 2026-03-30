import React, { useState, useRef, useEffect } from 'react';

interface RequisitionInputProps {
    onSend: (content: string) => void;
    disabled?: boolean;
    placeholder?: string;
}

const RequisitionInput: React.FC<RequisitionInputProps> = ({ 
    onSend, 
    disabled, 
    placeholder = 'Type a message...' 
}) => {
    const [message, setMessage] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const handleSend = () => {
        if (message.trim()) {
            onSend(message.trim());
            setMessage('');
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`;
        }
    }, [message]);

    return (
        <div className="flex items-end space-x-3 p-6 bg-white border-t border-blue-100/50 shadow-[0_-4px_20px_rgba(0,0,0,0.03)] z-10">
            <div className="flex-1 relative bg-gray-50 border border-gray-100 rounded-full overflow-hidden focus-within:border-[#006AFF]/20 focus-within:bg-white transition-all duration-200">
                <textarea
                    ref={textareaRef}
                    rows={1}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={disabled}
                    placeholder={placeholder}
                    className="w-full px-7 py-4 bg-transparent border-none focus:ring-0 outline-none shadow-none rounded-full text-[15px] font-medium text-gray-800 placeholder:text-gray-400/80 resize-none min-h-[56px] max-h-[150px] leading-relaxed"
                />
            </div>
            <button
                onClick={handleSend}
                disabled={disabled || !message.trim()}
                className="flex items-center justify-center w-[56px] h-[56px] bg-[#006AFF] text-white rounded-full hover:bg-[#0052cc] disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed transition-all active:scale-95 shadow-sm hover:shadow-md"
            >
                <svg className="w-6 h-6 transform rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
            </button>
        </div>
    );
};

export default RequisitionInput;
