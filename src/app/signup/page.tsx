import { Suspense } from 'react';
import { AccountForm } from '@/components/account-form';
import { Loading } from '@/components/ui';
export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <AccountForm view="signup" />
    </Suspense>
  );
}
