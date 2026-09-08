import { Suspense } from 'react';
import { GenerationStudio } from '@/components/generation-studio';
import { Loading } from '@/components/ui';
export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <GenerationStudio />
    </Suspense>
  );
}
