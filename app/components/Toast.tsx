'use client';

import { useEffect } from 'react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastProps {
    message: string;
    type?: ToastType;
    duration?: number;
    onClose: () => void;
}

export default function Toast({ message, type = 'info', duration = 3000, onClose }: ToastProps) {
    useEffect(() => {
        const timer = setTimeout(() => {
            onClose();
        }, duration);

        return () => clearTimeout(timer);
    }, [duration, onClose]);

    const getToastStyle = () => {
        switch (type) {
            case 'success':
                return {
                    background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.95) 0%, rgba(21, 128, 61, 0.95) 100%)',
                    border: '2px solid rgba(34, 197, 94, 1)',
                    icon: '✅'
                };
            case 'error':
                return {
                    background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.95) 0%, rgba(220, 38, 38, 0.95) 100%)',
                    border: '2px solid rgba(239, 68, 68, 1)',
                    icon: '❌'
                };
            case 'warning':
                return {
                    background: 'linear-gradient(135deg, rgba(234, 179, 8, 0.95) 0%, rgba(202, 138, 4, 0.95) 100%)',
                    border: '2px solid rgba(234, 179, 8, 1)',
                    icon: '⚠️'
                };
            case 'info':
            default:
                return {
                    background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.95) 0%, rgba(37, 99, 235, 0.95) 100%)',
                    border: '2px solid rgba(59, 130, 246, 1)',
                    icon: 'ℹ️'
                };
        }
    };

    const style = getToastStyle();

    return (
        <div
            style={{
                position: 'fixed',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                zIndex: 9999,
                minWidth: '300px',
                maxWidth: '500px',
                background: style.background,
                border: style.border,
                borderRadius: '12px',
                padding: '1.5rem 2rem',
                boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
                animation: 'toastFadeIn 0.3s ease-out'
            }}
        >
            <span style={{ fontSize: '2rem' }}>{style.icon}</span>
            <div style={{ flex: 1 }}>
                <div style={{
                    color: '#fff',
                    fontSize: '1rem',
                    fontWeight: '600',
                    lineHeight: '1.5'
                }}>
                    {message}
                </div>
            </div>
            <button
                onClick={onClose}
                style={{
                    background: 'rgba(255, 255, 255, 0.2)',
                    border: '1px solid rgba(255, 255, 255, 0.3)',
                    borderRadius: '50%',
                    width: '28px',
                    height: '28px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    color: '#fff',
                    fontSize: '1.2rem',
                    lineHeight: 1,
                    transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
                }}
            >
                ×
            </button>

            <style jsx global>{`
                @keyframes toastFadeIn {
                    from {
                        opacity: 0;
                        transform: translate(-50%, -45%);
                    }
                    to {
                        opacity: 1;
                        transform: translate(-50%, -50%);
                    }
                }
            `}</style>
        </div>
    );
}
