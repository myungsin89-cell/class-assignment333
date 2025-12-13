'use client';

import { useState, useEffect, useCallback } from 'react';

type ModalType = 'alert' | 'confirm';
type AlertType = 'info' | 'success' | 'error' | 'warning';

interface ModalState {
    isOpen: boolean;
    type: ModalType;
    alertType: AlertType;
    message: string;
    resolve?: (value: boolean) => void;
}

// 아이콘 설정
const iconMap: Record<AlertType, { icon: string; color: string }> = {
    info: { icon: 'ℹ️', color: '#3b82f6' },
    success: { icon: '✅', color: '#10b981' },
    error: { icon: '❌', color: '#ef4444' },
    warning: { icon: '⚠️', color: '#f59e0b' },
};

// 메시지에서 알림 타입 추론
function detectAlertType(message: string): AlertType {
    const lowerMsg = message.toLowerCase();
    if (lowerMsg.includes('성공') || lowerMsg.includes('완료') || lowerMsg.includes('저장되었습니다')) {
        return 'success';
    }
    if (lowerMsg.includes('오류') || lowerMsg.includes('실패') || lowerMsg.includes('error')) {
        return 'error';
    }
    if (lowerMsg.includes('경고') || lowerMsg.includes('주의') || lowerMsg.includes('warning')) {
        return 'warning';
    }
    return 'info';
}

// 전역 confirm 함수를 위한 인터페이스
interface GlobalModalInterface {
    showConfirm: (message: string) => Promise<boolean>;
    showAlert: (message: string) => void;
}

// 전역 참조
let globalModalInterface: GlobalModalInterface | null = null;

// 커스텀 confirm 함수 (비동기)
export async function customConfirm(message: string): Promise<boolean> {
    if (globalModalInterface) {
        return globalModalInterface.showConfirm(message);
    }
    // 폴백: 기본 confirm 사용하지 않고 true 반환
    return true;
}

// 커스텀 alert 함수
export function customAlert(message: string): void {
    if (globalModalInterface) {
        globalModalInterface.showAlert(message);
    }
}

export default function GlobalAlert() {
    const [modal, setModal] = useState<ModalState>({
        isOpen: false,
        type: 'alert',
        alertType: 'info',
        message: '',
    });
    const [mounted, setMounted] = useState(false);

    // 클라이언트 마운트 확인
    useEffect(() => {
        setMounted(true);
    }, []);

    const handleClose = useCallback((result: boolean = true) => {
        if (modal.resolve) {
            modal.resolve(result);
        }
        setModal(prev => ({ ...prev, isOpen: false }));
    }, [modal.resolve]);

    // 키보드 이벤트 처리
    useEffect(() => {
        if (!mounted) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (!modal.isOpen) return;

            if (e.key === 'Escape') {
                handleClose(false);
            } else if (e.key === 'Enter') {
                handleClose(true);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [modal.isOpen, handleClose, mounted]);

    useEffect(() => {
        if (!mounted) return;

        // 기존 alert 백업
        const originalAlert = window.alert;

        // 전역 모달 인터페이스 설정
        globalModalInterface = {
            showConfirm: (message: string): Promise<boolean> => {
                return new Promise((resolve) => {
                    setModal({
                        isOpen: true,
                        type: 'confirm',
                        alertType: 'warning',
                        message: String(message),
                        resolve,
                    });
                });
            },
            showAlert: (message: string) => {
                const alertType = detectAlertType(message);
                setModal({
                    isOpen: true,
                    type: 'alert',
                    alertType,
                    message: String(message),
                });
            }
        };

        // alert 오버라이딩 (기본 window.alert도 커스텀 모달 사용)
        window.alert = (msg: string) => {
            const alertType = detectAlertType(msg);
            setModal({
                isOpen: true,
                type: 'alert',
                alertType,
                message: String(msg),
            });
        };

        console.log('[GlobalAlert] mounted and alert overridden');

        // 컴포넌트 언마운트 시 복구
        return () => {
            window.alert = originalAlert;
            globalModalInterface = null;
        };
    }, [mounted]);

    if (!mounted || !modal.isOpen) return null;

    const { icon, color } = modal.type === 'confirm'
        ? { icon: '❓', color: '#8b5cf6' }
        : iconMap[modal.alertType];

    return (
        <div
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0, 0, 0, 0.6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 10000,
                backdropFilter: 'blur(4px)',
            }}
            onClick={() => handleClose(modal.type === 'confirm' ? false : true)}
        >
            <div
                style={{
                    background: '#1e293b',
                    border: '1px solid #475569',
                    padding: '2rem',
                    borderRadius: '16px',
                    maxWidth: '420px',
                    width: '90%',
                    boxShadow: '0 25px 50px rgba(0, 0, 0, 0.5)',
                    textAlign: 'center',
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* 아이콘 */}
                <div
                    style={{
                        width: '60px',
                        height: '60px',
                        margin: '0 auto 1.5rem',
                        borderRadius: '50%',
                        background: `${color}20`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '1.75rem',
                        border: `2px solid ${color}40`,
                    }}
                >
                    {icon}
                </div>

                {/* 메시지 */}
                <p
                    style={{
                        margin: '0 0 1.5rem',
                        fontSize: '1.05rem',
                        whiteSpace: 'pre-wrap',
                        lineHeight: '1.6',
                        color: '#f1f5f9',
                        wordBreak: 'keep-all',
                    }}
                >
                    {modal.message}
                </p>

                {/* 버튼 영역 */}
                <div
                    style={{
                        display: 'flex',
                        gap: '0.75rem',
                        justifyContent: 'center',
                    }}
                >
                    {modal.type === 'confirm' && (
                        <button
                            onClick={() => handleClose(false)}
                            style={{
                                background: '#334155',
                                color: '#f1f5f9',
                                border: '1px solid #475569',
                                padding: '0.75rem 1.75rem',
                                borderRadius: '8px',
                                fontSize: '1rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                            }}
                        >
                            취소
                        </button>
                    )}
                    <button
                        onClick={() => handleClose(true)}
                        autoFocus
                        style={{
                            background: `linear-gradient(135deg, ${color} 0%, ${color}dd 100%)`,
                            color: 'white',
                            border: 'none',
                            padding: '0.75rem 1.75rem',
                            borderRadius: '8px',
                            fontSize: '1rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            boxShadow: `0 4px 12px ${color}40`,
                            minWidth: modal.type === 'confirm' ? '100px' : '120px',
                        }}
                    >
                        확인
                    </button>
                </div>

                {/* 키보드 힌트 */}
                <p
                    style={{
                        marginTop: '1rem',
                        fontSize: '0.8rem',
                        color: '#94a3b8',
                    }}
                >
                    {modal.type === 'confirm' ? 'Enter 확인 · ESC 취소' : 'Enter 또는 ESC로 닫기'}
                </p>
            </div>
        </div>
    );
}
