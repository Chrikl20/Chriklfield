import { adminClient } from './database';
import { check } from './repository';
export async function alert(code: string, jobId: string) {
  check(
    await adminClient()
      .from('alerts')
      .upsert(
        { code, event_key: `${code}:${jobId}`, details: { jobId } },
        { onConflict: 'event_key' },
      ),
  );
}
