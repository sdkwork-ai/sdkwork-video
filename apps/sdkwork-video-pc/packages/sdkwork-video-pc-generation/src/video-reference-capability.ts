import type { MediaResourceLike } from '@sdkwork/assets-pc-commons';
import type { SdkworkGenerationPricedModel } from './generation-asset-config';

export type VideoReferenceAssetKind = 'image' | 'audio' | 'video';

export type VideoReferenceAssetRole =
  | 'first_frame'
  | 'last_frame'
  | 'reference_image'
  | 'reference_audio'
  | 'reference_video';

export type VideoReferenceMode =
  | 'text_to_video'
  | 'first_frame'
  | 'first_last_frame'
  | 'multi_reference'
  | 'omni_reference';

export interface VideoReferenceCapability {
  enabled: boolean;
  maxAudio: number;
  maxImages: number;
  maxTotalFiles: number;
  maxVideos: number;
  supportedModes: VideoReferenceMode[];
}

export interface VideoReferenceModeUpload {
  accept: string;
  maxFiles: number;
}

export interface VideoReferenceAssetInput {
  kind: VideoReferenceAssetKind;
  role: VideoReferenceAssetRole;
  name: string;
  mimeType?: string;
  resource: MediaResourceLike;
  sizeBytes?: number;
}

export interface VideoGenerationModelOption extends SdkworkGenerationPricedModel {
  id: string;
  catalogKey: string;
  model: string;
  name: string;
  displayName: string;
  desc: string;
  description?: string;
  ver: string;
  versionLabel: string;
  vendorCode: string;
  vendorName: string;
  modalities: string[];
  inputModalities: string[];
  outputModalities: string[];
  capabilities: string[];
  apiFormat?: string;
  contextTokens?: number;
  maxOutputTokens?: number;
  providerCodes: string[];
  supportsStreaming: boolean;
  supportsTools: boolean;
  supportsJsonSchema: boolean;
}

export interface VideoGenerationModelGroup {
  id: string;
  llms: VideoGenerationModelOption[];
  videos: VideoGenerationModelOption[];
}

export const VIDEO_REFERENCE_MODE_ORDER: readonly VideoReferenceMode[] = [
  'text_to_video',
  'first_frame',
  'first_last_frame',
  'multi_reference',
  'omni_reference',
];

export function resolveVideoReferenceCapability(
  model: VideoGenerationModelOption | null | undefined,
): VideoReferenceCapability {
  if (!model) {
    return createTextOnlyVideoReferenceCapability();
  }

  const capabilityTokens = createVideoReferenceTokenSet(model.capabilities);
  const inputTokens = createVideoReferenceTokenSet(model.inputModalities);
  const outputTokens = createVideoReferenceTokenSet(model.outputModalities);
  const descriptorTokens = createVideoReferenceTokenSet([
    model.apiFormat, model.catalogKey, model.displayName, model.id,
    model.model, model.name, model.vendorCode, model.vendorName,
  ]);
  const allTokens = new Set([...capabilityTokens, ...inputTokens, ...outputTokens, ...descriptorTokens]);

  const canOutputVideo = outputTokens.has('video')
    || hasAnyVideoReferenceToken(capabilityTokens, VIDEO_OUTPUT_CAPABILITY_TOKENS)
    || hasAnyVideoReferenceToken(descriptorTokens, VIDEO_OUTPUT_DESCRIPTOR_TOKENS);
  if (!canOutputVideo) {
    return createTextOnlyVideoReferenceCapability();
  }

  const acceptsImage = inputTokens.has('image') || hasAnyVideoReferenceToken(allTokens, IMAGE_REFERENCE_TOKENS);
  const acceptsAudio = inputTokens.has('audio') || hasAnyVideoReferenceToken(allTokens, AUDIO_REFERENCE_TOKENS);
  const acceptsVideo = inputTokens.has('video') || hasAnyVideoReferenceToken(allTokens, VIDEO_REFERENCE_TOKENS);
  const supportsFirstLastFrame = acceptsImage && (hasAnyVideoReferenceToken(allTokens, FIRST_LAST_FRAME_TOKENS) || hasKnownFirstLastFrameModel(descriptorTokens));
  const supportsMultiReference = acceptsImage && (hasAnyVideoReferenceToken(allTokens, MULTI_IMAGE_REFERENCE_TOKENS) || hasKnownMultiImageReferenceModel(descriptorTokens));
  const supportsOmniReference = (acceptsAudio || acceptsVideo) && (hasAnyVideoReferenceToken(allTokens, OMNI_REFERENCE_TOKENS) || hasKnownOmniReferenceModel(descriptorTokens));

  const supportedModes: VideoReferenceMode[] = ['text_to_video'];
  if (acceptsImage) supportedModes.push('first_frame');
  if (supportsFirstLastFrame) supportedModes.push('first_last_frame');
  if (supportsMultiReference) supportedModes.push('multi_reference');
  if (supportsOmniReference) supportedModes.push('omni_reference');

  const maxImages = supportsMultiReference || supportsOmniReference ? 4 : supportsFirstLastFrame ? 2 : acceptsImage ? 1 : 0;
  const maxAudio = acceptsAudio && supportsOmniReference ? 1 : 0;
  const maxVideos = acceptsVideo && supportsOmniReference ? 1 : 0;

  return { enabled: supportedModes.length > 1, maxAudio, maxImages, maxTotalFiles: maxImages + maxAudio + maxVideos, maxVideos, supportedModes };
}

export function resolveVideoReferenceModeUpload(capability: VideoReferenceCapability, mode: VideoReferenceMode): VideoReferenceModeUpload {
  if (!capability.supportedModes.includes(mode)) return { accept: '', maxFiles: 0 };
  switch (mode) {
    case 'first_frame': return { accept: 'image/*', maxFiles: Math.min(1, capability.maxImages) };
    case 'first_last_frame': return { accept: 'image/*', maxFiles: Math.min(2, capability.maxImages) };
    case 'multi_reference': return { accept: 'image/*', maxFiles: capability.maxImages };
    case 'omni_reference': return {
      accept: [capability.maxImages > 0 ? 'image/*' : '', capability.maxAudio > 0 ? 'audio/*' : '', capability.maxVideos > 0 ? 'video/*' : ''].filter(Boolean).join(','),
      maxFiles: capability.maxTotalFiles,
    };
    case 'text_to_video':
    default: return { accept: '', maxFiles: 0 };
  }
}

export function resolveVideoReferenceKindLimit(capability: VideoReferenceCapability, mode: VideoReferenceMode, kind: VideoReferenceAssetKind): number {
  if (!capability.supportedModes.includes(mode)) return 0;
  switch (mode) {
    case 'first_frame': return kind === 'image' ? Math.min(1, capability.maxImages) : 0;
    case 'first_last_frame': return kind === 'image' ? Math.min(2, capability.maxImages) : 0;
    case 'multi_reference': return kind === 'image' ? capability.maxImages : 0;
    case 'omni_reference':
      if (kind === 'image') return capability.maxImages;
      if (kind === 'audio') return capability.maxAudio;
      return capability.maxVideos;
    case 'text_to_video':
    default: return 0;
  }
}

export function resolveVideoReferenceAssetRole(mode: VideoReferenceMode, kind: VideoReferenceAssetKind, kindIndex: number): VideoReferenceAssetRole {
  if (kind === 'audio') return 'reference_audio';
  if (kind === 'video') return 'reference_video';
  if (mode === 'first_frame') return 'first_frame';
  if (mode === 'first_last_frame') return kindIndex === 1 ? 'last_frame' : 'first_frame';
  return 'reference_image';
}

function createTextOnlyVideoReferenceCapability(): VideoReferenceCapability {
  return { enabled: false, maxAudio: 0, maxImages: 0, maxTotalFiles: 0, maxVideos: 0, supportedModes: ['text_to_video'] };
}

function createVideoReferenceTokenSet(values: readonly (string | null | undefined)[]): Set<string> {
  return new Set(values.flatMap(normalizeVideoReferenceTokens));
}

function normalizeVideoReferenceTokens(value: string | null | undefined): string[] {
  const normalized = value?.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (!normalized) return [];
  return [normalized, ...normalized.split('_').filter(Boolean)];
}

function hasAnyVideoReferenceToken(tokens: ReadonlySet<string>, expected: ReadonlySet<string>): boolean {
  return Array.from(expected).some((t) => tokens.has(t));
}

function hasKnownFirstLastFrameModel(tokens: ReadonlySet<string>): boolean {
  return Array.from(tokens).some((t) => t.startsWith('kling_') || t.startsWith('kwaivgi_') || t.startsWith('jimeng_') || t.startsWith('seedance_') || t.startsWith('wan_'));
}

function hasKnownMultiImageReferenceModel(tokens: ReadonlySet<string>): boolean {
  return Array.from(tokens).some((t) => t.startsWith('kling_') || t.startsWith('jimeng_') || t.startsWith('seedance_') || t.startsWith('wan_'));
}

function hasKnownOmniReferenceModel(tokens: ReadonlySet<string>): boolean {
  return Array.from(tokens).some((t) => t.startsWith('jimeng_') || t.startsWith('seedance_') || t.startsWith('omni_'));
}

const VIDEO_OUTPUT_CAPABILITY_TOKENS = new Set(['video', 'video_generation', 'image_to_video', 'text_to_video']);
const VIDEO_OUTPUT_DESCRIPTOR_TOKENS = new Set(['kling', 'jimeng', 'seedance', 'sora', 'wan']);
const IMAGE_REFERENCE_TOKENS = new Set(['first_frame', 'image_to_video', 'i2v', 'image_reference', 'reference_image']);
const AUDIO_REFERENCE_TOKENS = new Set(['audio_reference', 'reference_audio', 'audio_to_video', 'soundtrack_reference']);
const VIDEO_REFERENCE_TOKENS = new Set(['video_reference', 'reference_video', 'video_to_video']);
const FIRST_LAST_FRAME_TOKENS = new Set(['end_frame', 'first_last_frame', 'first_frame_last_frame', 'first_tail_frame', 'last_frame', 'start_end_frame']);
const MULTI_IMAGE_REFERENCE_TOKENS = new Set(['multi_image', 'multi_image_reference', 'multi_reference_image', 'multi_reference', 'multiple_image_reference']);
const OMNI_REFERENCE_TOKENS = new Set(['all_in_one', 'audio_reference', 'multi_modal_reference', 'multimodal_reference', 'omni_reference', 'video_reference']);
