'use client';

export interface ConfirmModalProps {
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void;
    onCancel: () => void;
    type?: 'warning' | 'danger' | 'info';
}

export default function ConfirmModal({
    title,
    message,
    confirmText = '확인',
    cancelText = '취소',
    onConfirm,
    onCancel,
    type = 'warning'
}: ConfirmModalProps) {
    const getModalStyle = () => {
        switch (type) {
            case 'danger':
                return {
                    icon: '⚠️',
                    confirmBg: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                    confirmBorder: '#ef4444'
                };
            case 'info':
                return {
                    icon: 'ℹ️',
                    confirmBg: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                    confirmBorder: '#3b82f6'
                };
            case 'warning':
            default:
                return {
                    icon: '⚠️',
                    confirmBg: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                    confirmBorder: '#f59e0b'
                };
        }
    };

    const style = getModalStyle();

    return (
        <>
            {/* 반투명 배경 */}
            <div
                style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0, 0, 0, 0.6)',
                    zIndex: 10000,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    animation: 'fadeIn 0.2s ease-out'
                }}
                onClick={onCancel}
            >
                {/* 모달 */}
                <div
                    style={{
                        background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
                        borderRadius: '16px',
                        padding: '2rem',
                        minWidth: '400px',
                        maxWidth: '500px',
                        boxShadow: '0 25px 50px rgba(0, 0, 0, 0.5)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        animation: 'modalSlideIn 0.3s ease-out'
                    }}
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* 아이콘 */}
                    <div style={{
                        fontSize: '3rem',
                        textAlign: 'center',
                        marginBottom: '1rem'
                    }}>
                        {style.icon}
                    </div>

                    {/* 제목 */}
                    <h3 style={{
                        margin: '0 0 1rem 0',
                        fontSize: '1.5rem',
                        fontWeight: '700',
                        textAlign: 'center',
                        color: '#fff'
                    }}>
                        {title}
                    </h3>

                    {/* 메시지 */}
                    <div style={{
                        color: 'rgba(255, 255, 255, 0.8)',
                        fontSize: '0.95rem',
                        lineHeight: '1.6',
                        textAlign: 'center',
                        marginBottom: '2rem',
                        whiteSpace: 'pre-line'
                    }}>
                        {message}
                    </div>

                    {/* 버튼 */}
                    <div style={{
                        display: 'flex',
                        gap: '0.75rem',
                        justifyContent: 'center'
                    }}>
                        <button
                            onClick={onCancel}
                            style={{
                                padding: '0.75rem 1.5rem',
                                borderRadius: '8px',
                                border: '1px solid rgba(255, 255, 255, 0.2)',
                                background: 'rgba(255, 255, 255, 0.1)',
                                color: '#fff',
                                fontSize: '1rem',
                                fontWeight: '600',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                minWidth: '100px'
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                            }}
                        >
                            {cancelText}
                        </button>
                        <button
                            onClick={onConfirm}
                            style={{
                                padding: '0.75rem 1.5rem',
                                borderRadius: '8px',
                                border: `2px solid ${style.confirmBorder}`,
                                background: style.confirmBg,
                                color: '#fff',
                                fontSize: '1rem',
                                fontWeight: '600',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                minWidth: '100px',
                                boxShadow: `0 4px 12px ${style.confirmBorder}40`
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.transform = 'translateY(-2px)';
                                e.currentTarget.style.boxShadow = `0 6px 16px ${style.confirmBorder}60`;
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.transform = 'translateY(0)';
                                e.currentTarget.style.boxShadow = `0 4px 12px ${style.confirmBorder}40`;
                            }}
                        >
                            {confirmText}
                        </button>
                    </div>
                </div>
            </div>

            <style jsx global>{`
                @keyframes fadeIn {
                    from {
                        opacity: 0;
                    }
                    to {
                        opacity: 1;
                    }
                }

                @keyframes modalSlideIn {
                    from {
                        opacity: 0;
                        transform: translateY(-20px) scale(0.95);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0) scale(1);
                    }
                }
            `}</style>
        </>
    );
}
