import React, { useState, useRef, useEffect } from 'react';

interface RequisitionInputProps {
    onFileUpload?: (files: FileList) => void;
    onSend: (content: string) => void;
    disabled?: boolean;
    placeholder?: string;
}

const RequisitionInput: React.FC<RequisitionInputProps> = ({ 
    onSend,
    onFileUpload, 
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
        <div className="flex items-end space-x-3 p-3 px-6 bg-white border-t border-blue-100/50 shadow-[0_-4px_20px_rgba(0,0,0,0.03)]">
            
            {onFileUpload && (
                <div className="relative">
                    <input 
                        type="file" 
                        multiple 
                        accept=".pdf,application/pdf,image/jpeg,image/jpg,image/png,image/webp,.heic,.heif"
                        className="hidden" 
                        id="chat-upload-input"
                        onChange={(e) => {
                            if (e.target.files && e.target.files.length > 0) {
                                onFileUpload(e.target.files);
                                e.target.value = '';
                            }
                        }}
                    />
                    <label 
                        htmlFor="chat-upload-input"
                        className={`flex items-center justify-center w-[40px] h-[40px] min-w-[40px] rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 cursor-pointer active:scale-95 transition-all`}
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                    </label>
                </div>
            )}
            <div className="flex-1 relative bg-gray-50 border border-gray-100 rounded-full overflow-hidden focus-within:border-[#006AFF]/20 focus-within:bg-white transition-all duration-200">

                <textarea
                    ref={textareaRef}
                    rows={1}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={disabled}
                    placeholder={placeholder}
                    className="w-full px-5 py-2.5 bg-transparent border-none focus:ring-0 outline-none shadow-none rounded-full text-[13px] font-medium text-gray-800 placeholder:text-gray-400/80 resize-none min-h-[40px] max-h-[150px] leading-relaxed"
                />
            </div>
            <button
                onClick={handleSend}
                disabled={disabled || !message.trim()}
                className="flex items-center justify-center w-[40px] h-[40px] min-w-[40px] bg-[#006AFF] text-white rounded-full hover:bg-[#0052cc] disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed transition-all active:scale-95 shadow-sm hover:shadow-md"
            >
                <svg className="w-5 h-5 transform rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
            </button>
        </div>
    );
};

export default RequisitionInput;
