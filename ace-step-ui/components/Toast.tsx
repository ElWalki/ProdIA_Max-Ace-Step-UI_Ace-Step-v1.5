import React, { useEffect } from 'react';
import { CheckCircle, AlertCircle, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

interface ToastProps {
    message: string;
    type?: ToastType;
    isVisible: boolean;
    onClose: () => void;
    duration?: number;
}

export const Toast: React.FC<ToastProps> = ({
    message,
    type = 'success',
    isVisible,
    onClose,
    duration = 3000
}) => {
    useEffect(() => {
        if (isVisible && duration > 0) {
            const timer = setTimeout(() => {
                onClose();
            }, duration);
            return () => clearTimeout(timer);
        }
    }, [isVisible, duration, onClose]);

    if (!isVisible) return null;

    const bgColors = {
        success: 'bg-zinc-900 border-green-500/50 text-white',
        error: 'bg-zinc-900 border-red-500/50 text-white',
        info: 'bg-zinc-900 border-blue-500/50 text-white',
    };

    const icons = {
        success: <CheckCircle className="text-green-500" size={20} />,
        error: <AlertCircle className="text-red-500" size={20} />,
        info: <AlertCircle className="text-blue-500" size={20} />,
    };

    return (
        <div className={`fixed top-6 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 px-6 py-4 rounded-full shadow-2xl border ${bgColors[type]} animate-in slide-in-from-top-4 fade-in duration-300`}>
            {icons[type]}
            <span className="font-medium text-sm">{message}</span>
            <button onClick={onClose} className="ml-2 hover:opacity-70">
                <X size={16} />
            </button>
        </div>
    );
};
