'use client';

interface StepCardProps {
    step: number;
    title: string;
    description: string;
    icon: string;
    status: 'completed' | 'active' | 'pending';
    bgGradient?: string;
    iconBg?: string;
    onClick?: () => void;
}

export default function StepCard({
    step,
    title,
    description,
    icon,
    status,
    bgGradient,
    iconBg,
    onClick
}: StepCardProps) {
    const getStatusStyle = () => {
        switch (status) {
            case 'completed':
                return {
                    background: bgGradient || 'linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(37, 99, 235, 0.05) 100%)',
                    border: '1px solid rgba(59, 130, 246, 0.3)',
                    opacity: 0.8
                };
            case 'active':
                return {
                    background: bgGradient || 'linear-gradient(135deg, rgba(168, 85, 247, 0.15) 0%, rgba(139, 92, 246, 0.1) 100%)',
                    border: '2px solid rgba(168, 85, 247, 0.4)',
                    boxShadow: '0 0 20px rgba(168, 85, 247, 0.3)',
                    transform: 'scale(1.02)'
                };
            case 'pending':
            default:
                return {
                    background: 'rgba(30, 41, 59, 0.4)',
                    border: '1px solid var(--border)',
                    opacity: 0.5
                };
        }
    };

    const getBadgeStyle = () => {
        switch (status) {
            case 'completed':
                return {
                    background: '#10b981',
                    color: 'white',
                    content: '✓'
                };
            case 'active':
                return {
                    background: 'white',
                    color: '#a855f7',
                    content: step.toString(),
                    animation: 'pulse 2s ease-in-out infinite'
                };
            case 'pending':
            default:
                return {
                    background: 'rgba(255,255,255,0.1)',
                    color: 'rgba(255,255,255,0.8)',
                    border: '1px solid rgba(255,255,255,0.2)',
                    content: step.toString()
                };
        }
    };

    const statusStyle = getStatusStyle();
    const badgeStyle = getBadgeStyle();

    return (
        <div
            className="stat-card"
            style={{
                ...statusStyle,
                flexDirection: 'column',
                alignItems: 'flex-start',
                position: 'relative',
                overflow: 'hidden',
                transition: 'all 0.3s ease',
                cursor: onClick ? 'pointer' : 'default'
            }}
            onClick={onClick}
        >
            {/* 번호 뱃지 */}
            <div style={{
                position: 'absolute',
                top: '1.5rem',
                right: '1.5rem',
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.2rem',
                fontWeight: 'bold',
                boxShadow: status === 'completed' || status === 'active' ? '0 4px 6px rgba(0,0,0,0.1)' : 'none',
                ...badgeStyle
            }}>
                {badgeStyle.content}
            </div>

            {/* 아이콘 */}
            <div
                className="stat-icon"
                style={{
                    background: iconBg || (status === 'pending' ? 'var(--bg-tertiary)' : '#10b981'),
                    color: status === 'pending' ? 'var(--text-muted)' : 'white',
                    marginBottom: '1rem'
                }}
            >
                {icon}
            </div>

            {/* 제목 */}
            <h3 style={{
                margin: '0 0 0.5rem 0',
                fontSize: '1.2rem',
                color: status === 'pending' ? 'var(--text-muted)' : (status === 'active' ? '#e9d5ff' : 'var(--text-primary)')
            }}>
                {title}
            </h3>

            {/* 설명 */}
            <p style={{
                margin: 0,
                fontSize: '0.9rem',
                color: status === 'pending' ? 'var(--text-muted)' : (status === 'active' ? '#c4b5fd' : 'var(--text-secondary)'),
                marginBottom: '1rem'
            }}>
                {description}
            </p>

            <style jsx>{`
                @keyframes pulse {
                    0%, 100% {
                        transform: scale(1);
                        opacity: 1;
                    }
                    50% {
                        transform: scale(1.05);
                        opacity: 0.9;
                    }
                }
            `}</style>
        </div>
    );
}
