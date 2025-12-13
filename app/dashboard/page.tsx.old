'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const [grade, setGrade] = useState('');
  const [sectionCount, setSectionCount] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!grade || !sectionCount) {
      alert('학년과 반 수를 모두 입력해주세요.');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/classes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grade: parseInt(grade),
          section_count: parseInt(sectionCount),
        }),
      });

      if (!response.ok) throw new Error('Failed to create class');

      const data = await response.json();
      router.push(`/students?classId=${data.id}`);
    } catch (error) {
      console.error('Error:', error);
      alert('반 생성 중 오류가 발생했습니다.');
      setLoading(false);
    }
  };

  return (
    <div className="container" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="card fade-in" style={{ maxWidth: '500px', width: '100%' }}>
        <h1 style={{ textAlign: 'center', marginBottom: '2rem' }}>학생 관리 시스템</h1>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="grade" className="form-label">학년</label>
            <input
              id="grade"
              type="number"
              min="1"
              max="6"
              className="form-input"
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              placeholder="학년을 입력하세요 (예: 3)"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="sectionCount" className="form-label">반 수</label>
            <input
              id="sectionCount"
              type="number"
              min="1"
              max="20"
              className="form-input"
              value={sectionCount}
              onChange={(e) => setSectionCount(e.target.value)}
              placeholder="반 수를 입력하세요 (예: 5)"
              required
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '1rem' }}
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="loading"></span>
                <span>처리 중...</span>
              </>
            ) : (
              '학생 입력 시작'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
