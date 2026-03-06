import React from 'react';

interface ToastProps {
  message: string;
  type: 'success' | 'error' | 'info';
  onClose: () => void;
}

export default function Toast({ message, type, onClose }: ToastProps) {
  const colors = {
    success: 'bg-green-600/90 text-white',
    error: 'bg-red-600/90 text-white',
    info: 'bg-surface-700/90 text-white',
  };

  React.useEffect(() => {
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-[9999] px-4 py-2 rounded-lg shadow-lg text-sm animate-slide-up ${colors[type]}`}>
      {message}
    </div>
  );
}
