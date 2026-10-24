'use client';

import dynamic from 'next/dynamic';

// นำเข้า BusMap แบบปิด Server-Side Rendering (SSR) ป้องกันปัญหา window is not defined
const BusMap = dynamic(() => import('@/components/BusMap'), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen w-full flex-col items-center justify-center bg-gray-50">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
      <p className="mt-4 text-sm font-medium text-gray-600">กำลังโหลดแผนที่ระบบขนส่ง...</p>
    </div>
  ),
});

export default function Home() {
  return (
    <main className="h-screen w-full overflow-hidden">
      <BusMap />
    </main>
  );
}