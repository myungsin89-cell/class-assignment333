'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Login() {
  const [schoolName, setSchoolName] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!schoolName || !password) {
      alert('학교 이름과 비밀번호를 입력해주세요.');
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

      alert('로그인 성공!');
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
      background: 'linear-gradient(180deg, var(--bg-main) 0%, var(--bg-secondary) 100%)',
      position: 'relative'
    }}>
      {/* Background decoration */}
      <div style={{
        position: 'absolute',
        top: '20%',
        left: '20%',
        width: '300px',
        height: '300px',
        background: 'radial-gradient(circle, rgba(99, 102, 241, 0.1) 0%, transparent 70%)',
        borderRadius: '50%',
        filter: 'blur(60px)'
      }} />
      <div style={{
        position: 'absolute',
        bottom: '20%',
        right: '20%',
        width: '250px',
        height: '250px',
        background: 'radial-gradient(circle, rgba(236, 72, 153, 0.1) 0%, transparent 70%)',
        borderRadius: '50%',
        filter: 'blur(60px)'
      }} />

      <div className="card fade-in" style={{
        maxWidth: '450px',
        width: '100%',
        padding: '3rem 2.5rem',
        position: 'relative',
        zIndex: 1
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <div style={{
            fontSize: '3rem',
            marginBottom: '1rem'
          }}>🎓</div>
          <h1 style={{
            fontSize: '2rem',
            marginBottom: '0.5rem',
            background: 'linear-gradient(135deg, #10b981 0%, #14b8a6 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text'
          }}>반배정 시스템</h1>
          <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
            학교 계정으로 로그인하세요
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ marginBottom: '1.5rem' }}>
            <label htmlFor="schoolName" className="form-label" style={{ marginBottom: '0.75rem' }}>
              📍 학교 이름
            </label>
            <input
              id="schoolName"
              type="text"
              className="form-input"
              value={schoolName}
              onChange={(e) => setSchoolName(e.target.value)}
              placeholder="학교 이름을 입력하세요"
              required
              style={{ padding: '1rem' }}
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
              placeholder="비밀번호를 입력하세요"
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
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: '0.5rem'
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
            <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>또는</span>
            <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
          </div>

          <button
            type="button"
            onClick={() => router.push('/register')}
            className="btn btn-secondary"
            style={{
              width: '100%',
              padding: '0.875rem',
              marginBottom: '0.75rem',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center'
            }}
          >
            새 학교 등록하기
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
              border: 'none',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center'
            }}
          >
            ← 메인으로 돌아가기
          </button>
        </form>
      </div>
    </div>
  );
}
