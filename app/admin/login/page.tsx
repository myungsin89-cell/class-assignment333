'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminLogin() {
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!password) {
            alert('비밀번호를 입력해주세요.');
            return;
        }

        setLoading(true);

        try {
            const response = await fetch('/api/admin/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || '로그인에 실패했습니다.');
            }

            // Store admin token in localStorage
            localStorage.setItem('adminToken', data.token);

            alert('관리자 로그인 성공!');
            router.push('/admin/dashboard');
        } catch (error) {
            console.error('Error:', error);
            alert(error instanceof Error ? error.message : '로그인 중 오류가 발생했습니다.');
            setLoading(false);
        }
    };

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem',
            background: 'var(--bg-main)'
        }}>
            <div className="card" style={{
                maxWidth: '400px',
                width: '100%',
                padding: '3rem 2.5rem'
            }}>
                {/* Header */}
                <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔐</div>
                    <h1 style={{
                        fontSize: '1.75rem',
                        marginBottom: '0.5rem',
                        color: 'var(--text-primary)'
                    }}>관리자 로그인</h1>
                    <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.9rem' }}>
                        관리자 비밀번호를 입력하세요
                    </p>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="form-group" style={{ marginBottom: '2rem' }}>
                        <label htmlFor="password" className="form-label" style={{ marginBottom: '0.75rem' }}>
                            🔒 비밀번호
                        </label>
                        <input
                            id="password"
                            type="password"
                            className="form-input"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="관리자 비밀번호 입력"
                            required
                            style={{ padding: '1rem' }}
                            autoFocus
                        />
                    </div>

                    <button
                        type="submit"
                        className="btn btn-primary"
                        style={{
                            width: '100%',
                            padding: '1rem',
                            fontSize: '1.1rem',
                            fontWeight: 600,
                            marginBottom: '1rem'
                        }}
                        disabled={loading}
                    >
                        {loading ? (
                            <>
                                <span className="loading"></span>
                                <span>로그인 중...</span>
                            </>
                        ) : (
                            '로그인'
                        )}
                    </button>

                    <button
                        type="button"
                        onClick={() => router.push('/')}
                        className="btn"
                        style={{
                            width: '100%',
                            padding: '0.75rem',
                            background: 'transparent',
                            color: 'var(--text-muted)',
                            border: 'none'
                        }}
                    >
                        ← 메인으로 돌아가기
                    </button>
                </form>
            </div>
        </div>
    );
}
