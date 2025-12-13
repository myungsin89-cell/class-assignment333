'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Register() {
  const [schoolName, setSchoolName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!schoolName || !password || !confirmPassword) {
      alert('모든 필드를 입력해주세요.');
      return;
    }

    if (password !== confirmPassword) {
      alert('비밀번호가 일치하지 않습니다.');
      return;
    }

    if (password.length < 4) {
      alert('비밀번호는 최소 4자 이상이어야 합니다.');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/schools/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: schoolName,
          password: password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '학교 등록에 실패했습니다.');
      }

      alert('학교가 성공적으로 등록되었습니다!');
      router.push('/login');
    } catch (error) {
      console.error('Error:', error);
      alert(error instanceof Error ? error.message : '학교 등록 중 오류가 발생했습니다.');
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
        top: '15%',
        right: '20%',
        width: '300px',
        height: '300px',
        background: 'radial-gradient(circle, rgba(16, 185, 129, 0.1) 0%, transparent 70%)',
        borderRadius: '50%',
        filter: 'blur(60px)'
      }} />
      <div style={{
        position: 'absolute',
        bottom: '25%',
        left: '15%',
        width: '250px',
        height: '250px',
        background: 'radial-gradient(circle, rgba(99, 102, 241, 0.1) 0%, transparent 70%)',
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
          }}>🏫</div>
          <h1 style={{
            fontSize: '2rem',
            marginBottom: '0.5rem',
            background: 'linear-gradient(135deg, #10b981 0%, #6366f1 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text'
          }}>학교 등록하기</h1>
          <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
            무료로 학교를 등록하고 반배정을 시작하세요
          </p>
        </div>

        <form onSubmit={handleSubmit}>
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
              placeholder="예: OO초등학교"
              required
              style={{ padding: '1rem' }}
            />
          </div>

          <div className="form-group" style={{ marginBottom: '1.25rem' }}>
            <label htmlFor="password" className="form-label" style={{ marginBottom: '0.75rem' }}>
              🔒 비밀번호
            </label>
            <input
              id="password"
              type="password"
              className="form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="비밀번호를 입력하세요 (4자 이상)"
              required
              style={{ padding: '1rem' }}
            />
          </div>

          <div className="form-group" style={{ marginBottom: '2rem' }}>
            <label htmlFor="confirmPassword" className="form-label" style={{ marginBottom: '0.75rem' }}>
              🔒 비밀번호 확인
            </label>
            <input
              id="confirmPassword"
              type="password"
              className="form-input"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="비밀번호를 다시 입력하세요"
              required
              style={{ padding: '1rem' }}
            />
          </div>

          <button
            type="submit"
            className="btn btn-success"
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
                <span>등록 중...</span>
              </>
            ) : (
              '🚀 학교 등록하기'
            )}
          </button>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            margin: '1.5rem 0'
          }}>
            <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
            <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>이미 등록하셨나요?</span>
            <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
          </div>

          <button
            type="button"
            onClick={() => router.push('/login')}
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
            로그인하기
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
