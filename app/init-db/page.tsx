'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function InitDbPage() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  const handleInitialize = async () => {
    setLoading(true);
    setMessage('');
    setError('');

    try {
      const response = await fetch('/api/init-db');
      const data = await response.json();

      if (data.success) {
        setMessage('✅ ' + data.message);
        setTimeout(() => {
          router.push('/');
        }, 2000);
      } else {
        setError('❌ ' + data.error);
      }
    } catch (err) {
      setError('❌ 초기화 중 오류가 발생했습니다: ' + (err instanceof Error ? err.message : '알 수 없는 오류'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
    }}>
      <div style={{
        background: 'white',
        padding: '3rem',
        borderRadius: '16px',
        maxWidth: '600px',
        width: '90%',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
      }}>
        <h1 style={{ margin: '0 0 1rem 0', color: '#667eea' }}>🔧 데이터베이스 초기화</h1>

        <div style={{
          background: '#f0f4ff',
          padding: '1.5rem',
          borderRadius: '8px',
          marginBottom: '2rem',
          border: '1px solid #667eea'
        }}>
          <h3 style={{ margin: '0 0 1rem 0', color: '#333' }}>이 페이지는 무엇을 하나요?</h3>
          <p style={{ margin: '0 0 0.5rem 0', color: '#666' }}>
            새로운 Neon 데이터베이스에 연결했을 때, 필요한 테이블과 컬럼을 자동으로 생성합니다.
          </p>
          <ul style={{ margin: '0.5rem 0 0 1.5rem', color: '#666' }}>
            <li>schools, classes, students 테이블 생성</li>
            <li>모든 필수 컬럼 추가</li>
            <li>기존 테이블이 있어도 안전하게 업데이트</li>
          </ul>
        </div>

        <div style={{
          background: '#fff3cd',
          padding: '1rem',
          borderRadius: '8px',
          marginBottom: '2rem',
          border: '1px solid #ffc107'
        }}>
          <p style={{ margin: 0, color: '#856404' }}>
            ⚠️ <strong>주의:</strong> .env.local 파일에 DATABASE_URL이 올바르게 설정되어 있는지 확인하세요.
          </p>
        </div>

        <button
          onClick={handleInitialize}
          disabled={loading}
          style={{
            width: '100%',
            padding: '1rem',
            background: loading ? '#ccc' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '1.1rem',
            fontWeight: 'bold',
            cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'all 0.3s'
          }}
        >
          {loading ? '초기화 중...' : '🚀 데이터베이스 초기화 시작'}
        </button>

        {message && (
          <div style={{
            marginTop: '1.5rem',
            padding: '1rem',
            background: '#d4edda',
            border: '1px solid #c3e6cb',
            borderRadius: '8px',
            color: '#155724'
          }}>
            {message}
          </div>
        )}

        {error && (
          <div style={{
            marginTop: '1.5rem',
            padding: '1rem',
            background: '#f8d7da',
            border: '1px solid #f5c6cb',
            borderRadius: '8px',
            color: '#721c24'
          }}>
            {error}
          </div>
        )}

        <div style={{ marginTop: '2rem', textAlign: 'center' }}>
          <button
            onClick={() => router.push('/')}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#667eea',
              cursor: 'pointer',
              textDecoration: 'underline'
            }}
          >
            ← 메인으로 돌아가기
          </button>
        </div>
      </div>
    </div>
  );
}
