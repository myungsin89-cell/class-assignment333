'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const [schoolName, setSchoolName] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!schoolName || !password) {
      alert('모든 필드를 입력해주세요.');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/schools/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: schoolName,
          password: password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '로그인에 실패했습니다.');
      }

      // Store school ID in localStorage
      if (data.schoolId) {
        localStorage.setItem('schoolId', data.schoolId.toString());
        localStorage.setItem('schoolName', schoolName);
      }

      router.push('/dashboard');
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
        maxWidth: '450px',
        width: '100%',
        padding: '3rem 2.5rem'
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🏫</div>
          <h1 style={{
            fontSize: '2rem',
            marginBottom: '0.5rem',
            color: 'var(--text-primary)'
          }}>반배정 시스템</h1>
          <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
            학교 계정으로 로그인하세요
          </p>
        </div>

        <form onSubmit={handleLogin}>
          <div className="form-group" style={{ marginBottom: '1.25rem' }}>
            <label htmlFor="schoolName" className="form-label" style={{ marginBottom: '0.75rem' }}>
              📍 학교 이름
            </label>
            <input
              id="schoolName"
              type="text"
              className="form-input"
              value={schoolName}
              onChange={(e) => setSchoolName(e.target.value)}
              placeholder="학교 이름 입력"
              required
              style={{ padding: '1rem' }}
              autoFocus
            />
          </div>

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
              placeholder="비밀번호 입력"
              required
              style={{ padding: '1rem' }}
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
              marginBottom: '1.5rem'
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

          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            margin: '1.5rem 0'
          }}>
            <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
            <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>계정이 없으신가요?</span>
            <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
          </div>

          <button
            type="button"
            onClick={() => router.push('/register')}
            className="btn btn-secondary"
            style={{
              width: '100%',
              padding: '0.875rem',
              marginBottom: '0.75rem'
            }}
          >
            학교 등록하기
          </button>
        </form>

        {/* Admin Link */}
        <div style={{ textAlign: 'center', marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border)' }}>
          <button
            onClick={() => router.push('/admin/login')}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              fontSize: '0.85rem',
              cursor: 'pointer',
              opacity: 0.6,
              padding: '0.5rem'
            }}
          >
            관리자 로그인 →
          </button>
        </div>
      </div>
    </div>
  );
}
