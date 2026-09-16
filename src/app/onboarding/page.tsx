import { Suspense } from 'react';
import { Onboarding } from '@/components/onboarding';
import { Loading } from '@/components/ui';
export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <Onboarding />
    </Suspense>
  );
}
