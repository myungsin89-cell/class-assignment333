'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { customConfirm } from '@/components/GlobalAlert';

interface ClassData {
  id: number;
  grade: number;
  section_count: number;
  created_at: string;
  has_child_classes?: boolean;
  is_distributed?: number;
  parent_class_id?: number;
}

export default function Dashboard() {
  const [classes, setClasses] = useState<ClassData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [grade, setGrade] = useState('');
  const [sectionCount, setSectionCount] = useState('');
  const [creating, setCreating] = useState(false);
  const router = useRouter();
  const [schoolName, setSchoolName] = useState('');

  useEffect(() => {
    const storedSchoolName = localStorage.getItem('schoolName');
    const schoolId = localStorage.getItem('schoolId');

    if (!schoolId) {
      router.push('/');
      return;
    }

    if (storedSchoolName) {
      setSchoolName(storedSchoolName);
    }

    fetchClasses();
  }, [router]);

  const fetchClasses = async () => {
    try {
      const schoolId = localStorage.getItem('schoolId');
      const response = await fetch(`/api/classes?schoolId=${schoolId}`);

      if (!response.ok) throw new Error('Failed to fetch classes');

      const data = await response.json();
      setClasses(data);
    } catch (error) {
      console.error('Error fetching classes:', error);
      alert('데이터를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!grade || !sectionCount) {
      alert('학년과 반 수를 모두 입력해주세요.');
      return;
    }

    setCreating(true);

    try {
      const schoolId = localStorage.getItem('schoolId');
      const response = await fetch('/api/classes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          school_id: parseInt(schoolId!),
          grade: parseInt(grade),
          section_count: parseInt(sectionCount),
        }),
      });

      if (!response.ok) throw new Error('Failed to create class');

      const data = await response.json();
      const newClass = { ...data, created_at: new Date().toISOString() };
      setClasses(prevClasses => [...prevClasses, newClass]);
      setShowModal(false);
      setGrade('');
      setSectionCount('');

    } catch (error) {
      console.error('Error:', error);
      alert('반 생성 중 오류가 발생했습니다.');
    } finally {
      setCreating(false);
    }
  };

  const handleClassClick = (classId: number) => {
    router.push(`/classes/${classId}`);
  };

  const handleDeleteClass = async (classId: number, e: React.MouseEvent, hasChildClasses?: boolean) => {
    e.stopPropagation(); // Prevent card click

    const confirmMessage = hasChildClasses
      ? '이 학급과 반편성된 새로운반을 모두 삭제하시겠습니까?\n\n삭제 대상:\n- 기존반과 모든 학생 데이터\n- 반편성된 새로운반과 모든 학생 데이터\n\n이 작업은 되돌릴 수 없습니다.'
      : '이 학급을 삭제하시겠습니까?\n모든 학생 데이터도 함께 삭제됩니다.';

    const confirmed = await customConfirm(confirmMessage);
    if (!confirmed) {
      return;
    }

    try {
      const schoolId = localStorage.getItem('schoolId');
      const response = await fetch(`/api/classes?classId=${classId}&schoolId=${schoolId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete class');
      }

      const result = await response.json();
      alert(result.message || '학급이 삭제되었습니다.');
      fetchClasses(); // Refresh the list
    } catch (error) {
      console.error('Error deleting class:', error);
      alert(error instanceof Error ? error.message : '학급 삭제 중 오류가 발생했습니다.');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('schoolId');
    localStorage.removeItem('schoolName');
    router.push('/');
  };

  if (loading) {
    return (
      <div className="container" style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div className="loading"></div>
      </div>
    );
  }

  return (
    <div className="container" style={{ minHeight: '100vh', padding: '2rem' }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem'
      }}>
        <div>
          <h1 style={{ marginBottom: '0.5rem' }}>{schoolName} 반편성 시스템</h1>
          <p style={{ color: '#666' }}>생성된 학급을 클릭하여 학생을 관리하세요</p>
        </div>
        <button
          onClick={handleLogout}
          className="btn"
          style={{
            background: '#fff',
            color: '#666',
            border: '1px solid #ddd'
          }}
        >
          로그아웃
        </button>
      </div>

      {/* 반배정 시작하기 CTA 영역 */}
      <div style={{
        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
        borderRadius: '12px',
        padding: '1.5rem 2rem',
        marginBottom: '2.5rem',
        textAlign: 'center',
        color: 'white',
        boxShadow: '0 4px 16px rgba(16, 185, 129, 0.25)',
        cursor: 'pointer',
        transition: 'all 0.3s ease'
      }}
        onClick={() => setShowModal(true)}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.boxShadow = '0 8px 20px rgba(16, 185, 129, 0.35)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = '0 4px 16px rgba(16, 185, 129, 0.25)';
        }}
      >
        <h2 style={{ fontSize: '1.4rem', marginBottom: '0.3rem', fontWeight: 'bold', marginTop: 0 }}>
          새로운 반배정 시작하기
        </h2>
        <p style={{ fontSize: '0.95rem', opacity: 0.9, marginBottom: '1rem' }}>
          학년과 반 수를 입력하여 새로운 학급을 생성하세요
        </p>
        <div style={{
          display: 'inline-block',
          background: 'rgba(255, 255, 255, 0.2)',
          padding: '0.6rem 1.5rem',
          borderRadius: '8px',
          fontSize: '1rem',
          fontWeight: 'bold',
          backdropFilter: 'blur(10px)'
        }}>
          + 학급 생성하기
        </div>
      </div>

      {/* 구분선 및 섹션 제목 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        marginBottom: '2rem',
        gap: '1rem'
      }}>
        <div style={{
          flex: 1,
          height: '2px',
          background: 'linear-gradient(to right, transparent, #e0e0e0, transparent)'
        }}></div>
        <h2 style={{
          color: '#666',
          fontSize: '1.3rem',
          fontWeight: 'bold',
          margin: 0,
          whiteSpace: 'nowrap'
        }}>
          생성된 학급 목록
        </h2>
        <div style={{
          flex: 1,
          height: '2px',
          background: 'linear-gradient(to left, transparent, #e0e0e0, transparent)'
        }}></div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
        gap: '1.5rem',
        marginBottom: '5rem'
      }}>
        {classes.map((classData) => (
          <div
            key={classData.id}
            onClick={() => handleClassClick(classData.id)}
            className="card"
            style={{
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              border: '2px solid #e0e0e0',
              position: 'relative'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-4px)';
              e.currentTarget.style.boxShadow = '0 8px 16px rgba(0,0,0,0.1)';
              e.currentTarget.style.borderColor = '#007bff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
              e.currentTarget.style.borderColor = '#e0e0e0';
            }}
          >
            <button
              onClick={(e) => handleDeleteClass(classData.id, e, classData.has_child_classes)}
              style={{
                position: 'absolute',
                top: '10px',
                right: '10px',
                background: classData.has_child_classes ? '#ff6b6b' : '#dc3545',
                color: 'white',
                border: 'none',
                borderRadius: '50%',
                width: '30px',
                height: '30px',
                cursor: 'pointer',
                fontSize: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s ease',
                zIndex: 10
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = classData.has_child_classes ? '#ff5252' : '#c82333';
                e.currentTarget.style.transform = 'scale(1.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = classData.has_child_classes ? '#ff6b6b' : '#dc3545';
                e.currentTarget.style.transform = 'scale(1)';
              }}
              title={classData.has_child_classes ? '학급과 반편성된 새로운반을 모두 삭제합니다' : '학급 삭제'}
            >
              ×
            </button>
            <div style={{ textAlign: 'center' }}>
              {classData.has_child_classes && (
                <div style={{
                  display: 'inline-block',
                  background: '#ffc107',
                  color: '#000',
                  padding: '0.25rem 0.75rem',
                  borderRadius: '12px',
                  fontSize: '0.75rem',
                  fontWeight: 'bold',
                  marginBottom: '0.5rem'
                }}>
                  기존반 (보호됨)
                </div>
              )}
              {classData.is_distributed === 1 && (
                <div style={{
                  display: 'inline-block',
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  color: 'white',
                  padding: '0.25rem 0.75rem',
                  borderRadius: '12px',
                  fontSize: '0.75rem',
                  fontWeight: 'bold',
                  marginBottom: '0.5rem'
                }}>
                  새로운반
                </div>
              )}
              <h2 style={{ fontSize: '2rem', marginBottom: '0.5rem', color: '#10b981' }}>
                {classData.grade}학년
              </h2>
              <p style={{ fontSize: '1.1rem', color: '#666', marginBottom: '1rem' }}>
                {classData.section_count}개 반
              </p>
              <p style={{ fontSize: '0.85rem', color: '#999' }}>
                생성일: {new Date(classData.created_at).toLocaleDateString('ko-KR')}
              </p>
            </div>
          </div>
        ))}

        {classes.length === 0 && (
          <div style={{
            gridColumn: '1 / -1',
            textAlign: 'center',
            padding: '3rem',
            color: '#999'
          }}>
            <p style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>아직 생성된 학급이 없습니다.</p>
            <p>왼쪽 하단의 + 버튼을 눌러 새 학급을 만들어보세요!</p>
          </div>
        )}
      </div>

      {showModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000
          }}
          onClick={() => setShowModal(false)}
        >
          <div
            className="card"
            style={{ maxWidth: '500px', width: '90%', margin: '1rem' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ marginBottom: '1.5rem', textAlign: 'center', color: '#10b981' }}>반배정 시작하기</h2>

            <form onSubmit={handleCreateClass}>
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

              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem' }}>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{
                    flex: 1,
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    background: '#10b981',
                    borderColor: '#10b981'
                  }}
                  disabled={creating}
                >
                  {creating ? (
                    <>
                      <span className="loading"></span>
                      <span>생성 중...</span>
                    </>
                  ) : (
                    '학급 생성'
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="btn"
                  style={{
                    flex: 1,
                    background: '#fff',
                    color: '#666',
                    border: '1px solid #ddd',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center'
                  }}
                >
                  취소
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}