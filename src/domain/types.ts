import type { UploadStatus } from './uploads';
export type ModelKey = 'draft' | 'train' | 'image' | 'edit' | 'video' | 'motion';
export type JobStatus =
  'queued' | 'submitting' | 'unknown' | 'running' | 'persisting' | 'succeeded' | 'failed';
export type ReferenceKind = 'face' | 'profile' | 'body' | 'expression';
export type CropMode = 'contain' | 'cover';
export interface Character {
  id: string;
  name: string;
  identity: string;
  body: string;
  confirmed: boolean;
  created_at: string;
}
export interface CharacterVersion {
  id: string;
  character_id: string;
  version: number;
  base_model: string;
  status: 'draft' | 'training' | 'ready' | 'failed';
  trigger_word: string;
  weights_asset_id: string | null;
  config_asset_id: string | null;
  identity_snapshot: string;
  body_snapshot: string;
  parameters: Record<string, unknown>;
  test_asset_ids: string[];
}
export interface Asset {
  id: string;
  kind: 'image' | 'video' | 'weights' | 'config' | 'dataset';
  path: string;
  mime: string;
  bytes: number;
  width: number | null;
  height: number | null;
  duration: number | null;
  character_id: string | null;
  job_id: string | null;
  favorite: boolean;
  deleted_at: string | null;
  url?: string;
  demo?: boolean;
}
export interface Reference {
  id: string;
  character_id: string;
  asset_id: string;
  kind: ReferenceKind;
  caption: string;
  approved: boolean;
  generated: boolean;
  crop_mode: CropMode;
  crop_confirmed: boolean;
}
export interface JobInput {
  model: ModelKey;
  characterId?: string;
  versionId?: string;
  sourceAssetId?: string;
  motionAssetId?: string;
  referenceAssetIds?: string[];
  prompt: string;
  scene: string;
  outfit: string;
  pose: string;
  format: '4:5' | '1:1' | '9:16' | '16:9';
  count: number;
  duration: number;
  audio: boolean;
  orientation: 'image' | 'video';
  steps: number;
  resolution: 768 | 1024;
  learningRate: number;
  loraScale: number;
  seed?: number;
}
export interface Quote {
  id: string;
  workspace_id: string;
  user_id: string;
  input: JobInput;
  input_hash: string;
  credits: number;
  estimated_microusd: number;
  pricing_version: string;
  expires_at: string;
  model: ModelKey;
}
export interface Job {
  id: string;
  workspace_id: string;
  user_id: string;
  input: JobInput;
  model: ModelKey;
  status: JobStatus;
  credits: number;
  estimated_microusd: number;
  error_code: string | null;
  created_at: string;
  version_id: string | null;
}
export interface ModelPrice {
  model: ModelKey;
  version: string;
  unit: 'image' | 'megapixel' | 'step' | 'second' | 'job';
  unit_microusd: number;
  audio_multiplier: number;
  resolution_multiplier: number;
  verified_at: string | null;
  enabled: boolean;
  max_parallel: number;
  budget_microusd: number;
}
export interface Template {
  id: string;
  title: string;
  category: string;
  scene: string;
  outfit: string;
  pose: string;
  prompt: string;
  format: JobInput['format'];
  cover: string;
  enabled: boolean;
}
export interface Snapshot {
  mode: 'demo' | 'live';
  workspaceId: string;
  userId: string;
  admin: boolean;
  characters: Character[];
  versions: CharacterVersion[];
  references: Reference[];
  assets: Asset[];
  uploads?: UploadStatus[];
  jobs: Job[];
  templates: Template[];
  prices: ModelPrice[];
  balance: number;
  reserved: number;
  plan: string;
  ledger: { id: string; kind: string; amount: number; created_at: string }[];
}
export interface Actor {
  userId: string;
  workspaceId: string;
  admin: boolean;
}
export interface ProviderAttempt {
  id: string;
  job_id: string;
  request_id: string | null;
  state: 'submitting' | 'unknown' | 'accepted' | 'completed' | 'failed';
  estimated_microusd: number;
  actual_microusd: number | null;
  cost_status: 'unreconciled' | 'confirmed';
  error_code: string | null;
}
export const ACTIVE_STATUSES: JobStatus[] = [
  'queued',
  'submitting',
  'unknown',
  'running',
  'persisting',
];
