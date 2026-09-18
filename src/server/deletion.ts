import { adminClient } from './database';
import { check } from './repository';
import { BUCKET } from './media/storage';
import { alert } from './alerts';
export async function purgeDeletedAssets() {
  const db = adminClient();
  check(await db.rpc('cleanup_ephemeral'));
  const rows = check(
    await db
      .from('assets')
      .select('id,path')
      .not('deleted_at', 'is', null)
      .is('purged_at', null)
      .limit(100),
  );
  for (const row of rows) {
    check(await db.storage.from(BUCKET).remove([row.path]));
    check(await db.from('assets').update({ purged_at: new Date().toISOString() }).eq('id', row.id));
  }
  const requests = check(
    await db.from('deletion_requests').select('*').eq('state', 'pending').limit(50),
  );
  for (const r of requests) {
    const pending = check(
      await db
        .from('assets')
        .select('id')
        .eq('workspace_id', r.workspace_id)
        .not('deleted_at', 'is', null)
        .is('purged_at', null)
        .limit(1),
    );
    if (pending.length) continue;
    if (r.kind === 'character' || r.kind === 'workspace') {
      let cs = db
        .from('characters')
        .update({ name: 'Gelöscht', identity: '', body: '', confirmed: false })
        .eq('workspace_id', r.workspace_id);
      if (r.kind === 'character') cs = cs.eq('id', r.target_id);
      check(await cs);
      let vs = db
        .from('character_versions')
        .update({
          identity_snapshot: '',
          body_snapshot: '',
          parameters: {},
          dataset_snapshot: [],
          test_asset_ids: [],
        })
        .eq('workspace_id', r.workspace_id);
      if (r.kind === 'character') vs = vs.eq('character_id', r.target_id);
      check(await vs);
      let rs = db.from('character_references').delete().eq('workspace_id', r.workspace_id);
      if (r.kind === 'character') rs = rs.eq('character_id', r.target_id);
      check(await rs);
      const jobs = check(
        await db.from('jobs').select('id,input').eq('workspace_id', r.workspace_id),
      );
      for (const j of jobs)
        if (r.kind === 'workspace' || j.input.characterId === r.target_id)
          check(
            await db
              .from('jobs')
              .update({ input: { redacted: true }, context: {} })
              .eq('id', j.id),
          );
      check(
        await db
          .from('quotes')
          .delete()
          .eq('workspace_id', r.workspace_id)
          .not(
            'id',
            'in',
            `(${
              check(await db.from('jobs').select('quote_id').eq('workspace_id', r.workspace_id))
                .map((j) => j.quote_id)
                .join(',') || '00000000-0000-0000-0000-000000000000'
            })`,
          ),
      );
      let qs = db
        .from('quotes')
        .update({ input: { redacted: true }, context: {} })
        .eq('workspace_id', r.workspace_id);
      if (r.kind === 'character') qs = qs.eq('input->>characterId', r.target_id);
      check(await qs);
    }
    // Higgsfield has its own provider-side retention lifecycle; expose an explicit review handoff.
    await alert('PROVIDER_RETENTION_REVIEW', r.id);
    check(
      await db
        .from('deletion_requests')
        .update({ state: 'local_complete_provider_review' })
        .eq('id', r.id),
    );
  }
  check(
    await db
      .from('webhook_inbox')
      .update({ payload: { redacted: true } })
      .not('processed_at', 'is', null)
      .lt('created_at', new Date(Date.now() - 7 * 86400000).toISOString()),
  );
  return { purged: rows.length };
}
