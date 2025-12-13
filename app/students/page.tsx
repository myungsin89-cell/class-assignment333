'use client';

import { Suspense } from 'react';
import StudentsPage from './StudentsPageInner';

export default function StudentsPageWrapper() {
  return (
    <Suspense fallback={<div>로딩 중...</div>}>
      <StudentsPage />
    </Suspense>
  );
}
