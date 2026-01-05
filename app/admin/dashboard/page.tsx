'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface School {
    id: number;
    name: string;
    created_at: string;
}

export default function AdminDashboard() {
    const [schools, setSchools] = useState<School[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedSchool, setSelectedSchool] = useState<School | null>(null);
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [newPassword, setNewPassword] = useState('');
    const [actionLoading, setActionLoading] = useState(false);
    const router = useRouter();

    useEffect(() => {
        // Check if admin is logged in
        const adminToken = localStorage.getItem('adminToken');
        if (!adminToken) {
            router.push('/admin/login');
            return;
        }

        fetchSchools();
    }, [router]);

    const fetchSchools = async () => {
        try {
            const response = await fetch('/api/admin/schools');
            const data = await response.json();

            if (response.ok) {
                setSchools(data.schools);
            } else {
                alert('학교 목록 조회 실패');
            }
        } catch (error) {
            console.error('Error fetching schools:', error);
            alert('학교 목록 조회 중 오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
    };

    const handlePasswordChange = async () => {
        if (!selectedSchool || !newPassword) {
            alert('새 비밀번호를 입력해주세요.');
            return;
        }

        if (newPassword.length < 4) {
            alert('비밀번호는 최소 4자 이상이어야 합니다.');
            return;
        }

        setActionLoading(true);

        try {
            const response = await fetch('/api/admin/schools', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    schoolId: selectedSchool.id,
                    newPassword
                })
            });

            const data = await response.json();

            if (response.ok) {
                alert('비밀번호가 성공적으로 변경되었습니다!');
                setShowPasswordModal(false);
                setNewPassword('');
                setSelectedSchool(null);
            } else {
                alert(data.error || '비밀번호 변경 실패');
            }
        } catch (error) {
            console.error('Error changing password:', error);
            alert('비밀번호 변경 중 오류가 발생했습니다.');
        } finally {
            setActionLoading(false);
        }
    };

    const handleDeleteSchool = async () => {
        if (!selectedSchool) return;

        setActionLoading(true);

        try {
            const response = await fetch('/api/admin/schools', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    schoolId: selectedSchool.id
                })
            });

            const data = await response.json();

            if (response.ok) {
                alert('학교 및 모든 데이터가 삭제되었습니다.');
                setShowDeleteModal(false);
                setSelectedSchool(null);
                fetchSchools(); // Refresh list
            } else {
                alert(data.error || '학교 삭제 실패');
            }
        } catch (error) {
            console.error('Error deleting school:', error);
            alert('학교 삭제 중 오류가 발생했습니다.');
        } finally {
            setActionLoading(false);
        }
    };

    const handleLogout = () => {
        localStorage.removeItem('adminToken');
        router.push('/admin/login');
    };

    if (loading) {
        return (
            <div style={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--bg-main)'
            }}>
                <div className="loading"></div>
            </div>
        );
    }

    return (
        <div style={{ minHeight: '100vh', background: 'var(--bg-main)', padding: '2rem' }}>
            {/* Header */}
            <div style={{
                maxWidth: '1200px',
                margin: '0 auto 2rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                <h1 style={{ fontSize: '2rem', color: 'var(--text-primary)' }}>
                    🔐 관리자 대시보드
                </h1>
                <div style={{ display: 'flex', gap: '1rem' }}>
                    <button
                        onClick={() => router.push('/')}
                        className="btn btn-secondary"
                        style={{ padding: '0.5rem 1rem' }}
                    >
                        메인으로
                    </button>
                    <button
                        onClick={handleLogout}
                        className="btn"
                        style={{
                            padding: '0.5rem 1rem',
                            background: 'var(--danger)',
                            color: 'white'
                        }}
                    >
                        로그아웃
                    </button>
                </div>
            </div>

            {/* Schools Table */}
            <div className="card" style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
                <h2 style={{ fontSize: '1.5rem', marginBottom: '1.5rem', color: 'var(--text-primary)' }}>
                    등록된 학교 목록 ({schools.length}개)
                </h2>

                {schools.length === 0 ? (
                    <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>
                        등록된 학교가 없습니다.
                    </p>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{
                            width: '100%',
                            borderCollapse: 'collapse'
                        }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid var(--border)' }}>
                                    <th style={{
                                        padding: '1rem',
                                        textAlign: 'left',
                                        color: 'var(--text-primary)',
                                        fontWeight: 600
                                    }}>ID</th>
                                    <th style={{
                                        padding: '1rem',
                                        textAlign: 'left',
                                        color: 'var(--text-primary)',
                                        fontWeight: 600
                                    }}>학교명</th>
                                    <th style={{
                                        padding: '1rem',
                                        textAlign: 'left',
                                        color: 'var(--text-primary)',
                                        fontWeight: 600
                                    }}>등록일시</th>
                                    <th style={{
                                        padding: '1rem',
                                        textAlign: 'center',
                                        color: 'var(--text-primary)',
                                        fontWeight: 600
                                    }}>관리</th>
                                </tr>
                            </thead>
                            <tbody>
                                {schools.map((school) => (
                                    <tr key={school.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                        <td style={{ padding: '1rem', color: 'var(--text-secondary)' }}>
                                            {school.id}
                                        </td>
                                        <td style={{ padding: '1rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                                            {school.name}
                                        </td>
                                        <td style={{ padding: '1rem', color: 'var(--text-secondary)' }}>
                                            {new Date(school.created_at).toLocaleString('ko-KR')}
                                        </td>
                                        <td style={{ padding: '1rem', textAlign: 'center' }}>
                                            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                                                <button
                                                    onClick={() => {
                                                        setSelectedSchool(school);
                                                        setShowPasswordModal(true);
                                                    }}
                                                    className="btn btn-secondary"
                                                    style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
                                                >
                                                    비밀번호 변경
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setSelectedSchool(school);
                                                        setShowDeleteModal(true);
                                                    }}
                                                    className="btn"
                                                    style={{
                                                        padding: '0.5rem 1rem',
                                                        fontSize: '0.9rem',
                                                        background: 'var(--danger)',
                                                        color: 'white'
                                                    }}
                                                >
                                                    삭제
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Password Change Modal */}
            {showPasswordModal && selectedSchool && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0, 0, 0, 0.7)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1000,
                    padding: '1rem'
                }}>
                    <div className="card" style={{ maxWidth: '500px', width: '100%', padding: '2rem' }}>
                        <h3 style={{ fontSize: '1.5rem', marginBottom: '1rem', color: 'var(--text-primary)' }}>
                            비밀번호 변경
                        </h3>
                        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
                            <strong>{selectedSchool.name}</strong>의 비밀번호를 변경합니다.
                        </p>

                        <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                            <label className="form-label" style={{ marginBottom: '0.5rem' }}>
                                새 비밀번호
                            </label>
                            <input
                                type="password"
                                className="form-input"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                placeholder="새 비밀번호 입력 (4자 이상)"
                                style={{ padding: '0.75rem' }}
                                autoFocus
                            />
                        </div>

                        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                            <button
                                onClick={() => {
                                    setShowPasswordModal(false);
                                    setNewPassword('');
                                    setSelectedSchool(null);
                                }}
                                className="btn btn-secondary"
                                style={{ padding: '0.75rem 1.5rem' }}
                                disabled={actionLoading}
                            >
                                취소
                            </button>
                            <button
                                onClick={handlePasswordChange}
                                className="btn btn-primary"
                                style={{ padding: '0.75rem 1.5rem' }}
                                disabled={actionLoading}
                            >
                                {actionLoading ? '변경 중...' : '변경'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {showDeleteModal && selectedSchool && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0, 0, 0, 0.7)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1000,
                    padding: '1rem'
                }}>
                    <div className="card" style={{ maxWidth: '500px', width: '100%', padding: '2rem' }}>
                        <h3 style={{ fontSize: '1.5rem', marginBottom: '1rem', color: 'var(--danger)' }}>
                            ⚠️ 학교 삭제
                        </h3>
                        <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem', lineHeight: 1.6 }}>
                            <strong style={{ color: 'var(--text-primary)' }}>{selectedSchool.name}</strong>을(를) 삭제하시겠습니까?
                        </p>
                        <div style={{
                            background: 'rgba(239, 68, 68, 0.1)',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            borderRadius: '8px',
                            padding: '1rem',
                            marginBottom: '1.5rem'
                        }}>
                            <p style={{ color: 'var(--danger)', margin: 0, fontSize: '0.9rem', lineHeight: 1.6 }}>
                                <strong>경고:</strong> 이 작업은 되돌릴 수 없습니다.<br />
                                학교와 관련된 모든 데이터(학급, 학생 정보 등)가 영구적으로 삭제됩니다.
                            </p>
                        </div>

                        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                            <button
                                onClick={() => {
                                    setShowDeleteModal(false);
                                    setSelectedSchool(null);
                                }}
                                className="btn btn-secondary"
                                style={{ padding: '0.75rem 1.5rem' }}
                                disabled={actionLoading}
                            >
                                취소
                            </button>
                            <button
                                onClick={handleDeleteSchool}
                                className="btn"
                                style={{
                                    padding: '0.75rem 1.5rem',
                                    background: 'var(--danger)',
                                    color: 'white'
                                }}
                                disabled={actionLoading}
                            >
                                {actionLoading ? '삭제 중...' : '삭제'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
