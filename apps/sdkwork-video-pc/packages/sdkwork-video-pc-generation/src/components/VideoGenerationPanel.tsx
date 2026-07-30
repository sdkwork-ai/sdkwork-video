import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Clapperboard, FileAudio, FileVideo, Image as ImageIcon, SlidersHorizontal, Sparkles, Timer, Upload, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toExternalUrlMediaResource, type MediaResourceLike } from '@sdkwork/assets-pc-commons';
import {
  createDefaultSdkworkGenerationAssetConfig,
  estimateSdkworkGenerationCredits,
  findFirstSdkworkGenerationModelForModality,
  findSdkworkGenerationModelById,
  reconcileSdkworkGenerationAssetConfig,
  serializeSdkworkGenerationAssetConfig,
  updateSdkworkGenerationVideoModeConfig,
  type SdkworkGenerationAssetConfig,
  type SdkworkGenerationCreditEstimate,
} from '../generation-asset-config';
import {
  resolveVideoReferenceCapability,
  resolveVideoReferenceAssetRole,
  resolveVideoReferenceKindLimit,
  resolveVideoReferenceModeUpload,
  VIDEO_REFERENCE_MODE_ORDER,
  type VideoReferenceAssetInput,
  type VideoReferenceAssetKind,
  type VideoReferenceCapability,
  type VideoReferenceMode,
  type VideoReferenceModeUpload,
} from '../video-reference-capability';
import type { VideoGenerationPanelProps } from '../video-generation-panel-types';
import { VideoGenerationModePopup } from './VideoGenerationModePopup';

interface ReferenceAssetPreview {
  id: string;
  metadata: VideoReferenceAssetInput;
  previewSrc: string;
}

export function VideoGenerationPanel({
  placeholderKey,
  modelGroups,
  selectedModelId,
  onSubmitGeneration,
  submitting,
  submitError,
}: VideoGenerationPanelProps) {
  const { t } = useTranslation();
  const [prompt, setPrompt] = useState('');
  const referenceAssetUrlsRef = useRef<string[]>([]);
  const [referenceAssets, setReferenceAssets] = useState<ReferenceAssetPreview[]>([]);
  const [videoReferenceMode, setVideoReferenceMode] = useState<VideoReferenceMode>('text_to_video');
  const [referenceAssetUploadError, setReferenceAssetUploadError] = useState<string | null>(null);
  const [config, setConfig] = useState<SdkworkGenerationAssetConfig>(() =>
    createDefaultSdkworkGenerationAssetConfig('video'),
  );

  const selectedModel = findSdkworkGenerationModelById(modelGroups, selectedModelId)
    ?? findFirstSdkworkGenerationModelForModality(modelGroups, 'video');
  const videoReferenceCapability = resolveVideoReferenceCapability(selectedModel);
  const activeVideoReferenceMode = videoReferenceCapability.supportedModes.includes(videoReferenceMode)
    ? videoReferenceMode
    : videoReferenceCapability.supportedModes[0] ?? 'text_to_video';
  const activeVideoReferenceUpload = resolveVideoReferenceModeUpload(videoReferenceCapability, activeVideoReferenceMode);
  const normalizedPrompt = prompt.trim();
  const canSubmit = normalizedPrompt.length > 0 && !submitting && Boolean(selectedModel);
  const creditEstimate = estimateSdkworkGenerationCredits({
    config,
    modality: 'video',
    model: selectedModel,
    unavailableDetail: 'playground.generationCost.settlement',
  });

  useEffect(() => {
    setConfig((current) => reconcileSdkworkGenerationAssetConfig(current, 'video'));
  }, []);

  useEffect(() => () => {
    referenceAssetUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    referenceAssetUrlsRef.current = [];
  }, []);

  useEffect(() => {
    if (!videoReferenceCapability.supportedModes.includes(videoReferenceMode)) {
      setVideoReferenceMode(videoReferenceCapability.supportedModes[0] ?? 'text_to_video');
    }
  }, [videoReferenceCapability.supportedModes, videoReferenceMode]);

  useEffect(() => {
    setReferenceAssets((current) => {
      const next = normalizeReferenceAssetsForMode(current, activeVideoReferenceMode, videoReferenceCapability);
      if (next === current) return current;
      revokeRemovedReferenceAssetUrls(current, next);
      referenceAssetUrlsRef.current = next.map((a) => a.previewSrc);
      return next;
    });
    setReferenceAssetUploadError(null);
  }, [activeVideoReferenceMode, activeVideoReferenceUpload.maxFiles, videoReferenceCapability.maxAudio, videoReferenceCapability.maxImages, videoReferenceCapability.maxVideos]);

  const replaceReferenceAssets = (updater: (current: ReferenceAssetPreview[]) => ReferenceAssetPreview[]) => {
    setReferenceAssets((current) => {
      const next = updater(current);
      revokeRemovedReferenceAssetUrls(current, next);
      referenceAssetUrlsRef.current = next.map((a) => a.previewSrc);
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    await onSubmitGeneration({
      prompt: normalizedPrompt,
      selectedModality: 'video',
      targetType: 'video',
      selectedModel: selectedModel?.id || undefined,
      generationConfig: serializeSdkworkGenerationAssetConfig(config, 'video'),
      referenceAssets: referenceAssets.map((a) => a.metadata),
      referenceMode: activeVideoReferenceMode,
    });
    setPrompt('');
    setReferenceAssetUploadError(null);
    replaceReferenceAssets(() => []);
  };

  return (
    <div className="sdkwork-studio-panel flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="sdkwork-studio-hero">
        <div className="sdkwork-studio-hero-icon" aria-hidden="true">
          <Clapperboard className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="sdkwork-studio-hero-title">{t('playground.video.studioTitle')}</div>
          <div className="sdkwork-studio-hero-subtitle">{t('playground.video.studioSubtitle')}</div>
        </div>
      </div>

      <div className="sdkwork-studio-scroll custom-scrollbar">
        <div className="sdkwork-studio-body">
          {submitError ? (
            <div className="sdkwork-studio-error" role="alert">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
              <span className="leading-relaxed">{submitError}</span>
            </div>
          ) : null}

          <VideoReferenceAssetUploader
            mode={activeVideoReferenceMode}
            modeUpload={activeVideoReferenceUpload}
            onAddReferenceAssets={(next) => {
              replaceReferenceAssets((current) => normalizeReferenceAssetsForMode([...current, ...next], activeVideoReferenceMode, videoReferenceCapability));
            }}
            onChangeMode={(nextMode) => { setVideoReferenceMode(nextMode); setReferenceAssetUploadError(null); }}
            onRemoveReferenceAsset={(id) => { replaceReferenceAssets((current) => current.filter((a) => a.id !== id)); }}
            onUploadError={setReferenceAssetUploadError}
            referenceAssets={referenceAssets}
            uploadError={referenceAssetUploadError}
            videoReferenceCapability={videoReferenceCapability}
          />

          <div className="sdkwork-studio-prompt">
            <div className="sdkwork-studio-prompt__header">
              <span>{t('playground.video.promptSection')}</span>
              <span className="hidden max-w-[46%] truncate text-[10px] normal-case sm:inline">{t('playground.video.promptHint')}</span>
            </div>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSubmit(); } }}
              className="sdkwork-studio-prompt__textarea custom-scrollbar"
              placeholder={t(placeholderKey)}
            />
            <div className="sdkwork-studio-prompt__footer">
              <span>
                <kbd className="sdkwork-studio-prompt__kbd">Enter</kbd>
                <span className="ml-1.5">{t('playground.promptKeyboard.submit')}</span>
              </span>
              <span className="tabular-nums">{normalizedPrompt.length}</span>
            </div>
          </div>
        </div>
      </div>

      <VideoGenerationBottomBar
        canSubmit={canSubmit}
        config={config}
        creditEstimate={creditEstimate}
        onChangeConfig={setConfig}
        onSubmit={handleSubmit}
        submitting={submitting}
      />
    </div>
  );
}

function VideoGenerationBottomBar({
  canSubmit,
  config,
  creditEstimate,
  onChangeConfig,
  onSubmit,
  submitting,
}: {
  canSubmit: boolean;
  config: SdkworkGenerationAssetConfig;
  creditEstimate: SdkworkGenerationCreditEstimate;
  onChangeConfig: (config: SdkworkGenerationAssetConfig) => void;
  onSubmit: () => Promise<void>;
  submitting: boolean;
}) {
  const { t } = useTranslation();
  const estimateDetail = creditEstimate.detail.startsWith('playground.') ? t(creditEstimate.detail) : creditEstimate.detail;

  return (
    <div className="z-30 shrink-0" title={estimateDetail}>
      {config.videoMode ? (
        <VideoGenerationModePopup
          canGenerate={canSubmit}
          config={config.videoMode}
          isGenerating={submitting}
          onChangeConfig={(videoConfig) => onChangeConfig(updateSdkworkGenerationVideoModeConfig(config, videoConfig))}
          onGenerate={onSubmit}
          showCost={creditEstimate.points ?? undefined}
        />
      ) : null}
    </div>
  );
}

const VIDEO_REFERENCE_MODE_ICONS = { text_to_video: Sparkles, first_frame: ImageIcon, first_last_frame: Timer, multi_reference: ImageIcon, omni_reference: SlidersHorizontal } satisfies Record<VideoReferenceMode, typeof Sparkles>;
const VIDEO_REFERENCE_MODE_LABEL_KEYS = { text_to_video: 'playground.videoReference.mode.textToVideo', first_frame: 'playground.videoReference.mode.firstFrame', first_last_frame: 'playground.videoReference.mode.firstLastFrame', multi_reference: 'playground.videoReference.mode.multiReference', omni_reference: 'playground.videoReference.mode.omniReference' } satisfies Record<VideoReferenceMode, string>;
const VIDEO_REFERENCE_ROLE_LABEL_KEYS = { first_frame: 'playground.videoReference.role.firstFrame', last_frame: 'playground.videoReference.role.lastFrame', reference_image: 'playground.videoReference.role.referenceImage', reference_audio: 'playground.videoReference.role.referenceAudio', reference_video: 'playground.videoReference.role.referenceVideo' } satisfies Record<VideoReferenceAssetInput['role'], string>;

function VideoReferenceAssetUploader({ mode, modeUpload, referenceAssets, uploadError, videoReferenceCapability, onAddReferenceAssets, onChangeMode, onRemoveReferenceAsset, onUploadError }: {
  mode: VideoReferenceMode; modeUpload: VideoReferenceModeUpload; referenceAssets: ReferenceAssetPreview[]; uploadError: string | null;
  videoReferenceCapability: VideoReferenceCapability;
  onAddReferenceAssets: (a: ReferenceAssetPreview[]) => void; onChangeMode: (m: VideoReferenceMode) => void;
  onRemoveReferenceAsset: (id: string) => void; onUploadError: (m: string | null) => void;
}) {
  const { t } = useTranslation();
  const remainingSlots = Math.max(0, modeUpload.maxFiles - referenceAssets.length);
  const canUpload = modeUpload.maxFiles > 0 && remainingSlots > 0 && modeUpload.accept.length > 0;
  const availableModes = VIDEO_REFERENCE_MODE_ORDER.filter((m) => videoReferenceCapability.supportedModes.includes(m));
  const showModeTabs = availableModes.length > 1;

  return (
    <div className="sdkwork-studio-reference">
      {showModeTabs ? (
        <div className="sdkwork-studio-segmented__tabs" role="tablist" aria-label={t('playground.referenceAssets')}>
          {availableModes.map((item) => {
            const selected = item === mode;
            const Icon = VIDEO_REFERENCE_MODE_ICONS[item];
            return (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={selected}
                data-active={selected ? 'true' : 'false'}
                onClick={() => onChangeMode(item)}
                className="sdkwork-studio-segmented__tab"
              >
                <Icon className="sdkwork-studio-segmented__tab-icon h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{t(VIDEO_REFERENCE_MODE_LABEL_KEYS[item])}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      <div className={`flex items-center justify-between gap-3 ${showModeTabs ? '' : ''}`}>
        <div className="min-w-0">
          <div className="sdkwork-image-generation-reference__heading-title">{t('playground.referenceAssets')}</div>
          <div className="sdkwork-image-generation-reference__count">
            {videoReferenceCapability.enabled ? t('playground.referenceAsset.capacity', { count: referenceAssets.length, max: modeUpload.maxFiles }) : t('playground.referenceAsset.unsupported')}
          </div>
        </div>
        <label className={`sdkwork-image-generation-reference__upload-btn inline-flex h-8 shrink-0 items-center gap-1.5 px-2.5 text-xs font-semibold ${canUpload ? 'sdkwork-studio-reference__upload-btn--enabled sdkwork-image-generation-reference__upload-btn--enabled cursor-pointer' : 'sdkwork-studio-reference__upload-btn--disabled sdkwork-image-generation-reference__upload-btn--disabled cursor-not-allowed'}`}>
          <Upload className="h-3.5 w-3.5" />
          <span className="whitespace-nowrap">{t('playground.referenceAsset.upload')}</span>
          <input type="file" accept={modeUpload.accept} multiple={modeUpload.maxFiles > 1} disabled={!canUpload} className="sr-only"
            onChange={(event) => {
              const selectedFiles = Array.from(event.currentTarget.files ?? []);
              const kindCounts = countReferenceAssetsByKind(referenceAssets);
              const accepted: Array<{ file: File; kind: VideoReferenceAssetKind; kindIndex: number }> = [];
              let skippedByKind = false; let skippedByTotal = false;
              selectedFiles.forEach((file) => {
                if (accepted.length >= remainingSlots) { skippedByTotal = true; return; }
                const kind = readReferenceAssetKind(file);
                if (!kind) { skippedByKind = true; return; }
                const kindLimit = resolveVideoReferenceKindLimit(videoReferenceCapability, mode, kind);
                if (kindLimit <= 0 || kindCounts[kind] >= kindLimit) { skippedByKind = true; return; }
                accepted.push({ file, kind, kindIndex: kindCounts[kind] });
                kindCounts[kind] += 1;
              });
              if (skippedByTotal) onUploadError(t('playground.referenceAsset.tooMany', { max: modeUpload.maxFiles }));
              else if (skippedByKind) onUploadError(t('playground.referenceAsset.filteredByMode'));
              else onUploadError(null);
              if (accepted.length > 0) {
                void Promise.all(accepted.map(async ({ file, kind, kindIndex }): Promise<ReferenceAssetPreview> => {
                  const encoded = await readReferenceAssetDataUrl(file);
                  return { id: createReferenceAssetPreviewId(file), metadata: { kind, role: resolveVideoReferenceAssetRole(mode, kind, kindIndex), name: file.name, mimeType: file.type, resource: createUploadedReferenceMediaResource(encoded, kind, file.name, file.type, file.size), sizeBytes: file.size }, previewSrc: URL.createObjectURL(file) };
                })).then(onAddReferenceAssets).catch(() => onUploadError(t('playground.referenceAsset.readFailed')));
              }
              event.currentTarget.value = '';
            }}
          />
        </label>
      </div>

      {modeUpload.maxFiles > 0 ? (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {referenceAssets.map((referenceAsset) => {
            const Icon = referenceAsset.metadata.kind === 'audio' ? FileAudio : referenceAsset.metadata.kind === 'video' ? FileVideo : ImageIcon;
            return (
              <div key={referenceAsset.id} className="sdkwork-image-generation-reference__thumb group relative aspect-square min-h-[104px] overflow-hidden playground-image-canvas">
                {referenceAsset.metadata.kind === 'image' ? (
                  <img src={referenceAsset.previewSrc} alt={referenceAsset.metadata.name || t('playground.referenceAssets')} className="h-full w-full object-cover" />
                ) : (
                  <div className="sdkwork-image-generation-reference__media-placeholder">
                    <Icon className="h-8 w-8" />
                    <span className="sdkwork-image-generation-reference__media-placeholder-label">{referenceAsset.metadata.name}</span>
                  </div>
                )}
                <div className="sdkwork-image-generation-reference__thumb-caption sdkwork-image-generation-reference__thumb-caption--compact">
                  <div className="truncate">{t(VIDEO_REFERENCE_ROLE_LABEL_KEYS[referenceAsset.metadata.role])}</div>
                  <div className="sdkwork-image-generation-reference__thumb-caption-sub">{referenceAsset.metadata.name || t('playground.referenceAssets')}</div>
                </div>
                <button type="button" onClick={() => onRemoveReferenceAsset(referenceAsset.id)} className="sdkwork-image-generation-reference__thumb-remove" title={t('playground.referenceImage.remove')}>
                  <X className="h-4 w-4" />
                </button>
              </div>
            );
          })}
          {canUpload ? (
            <label className="sdkwork-image-generation-reference__add-tile flex aspect-square min-h-[104px] cursor-pointer flex-col items-center justify-center gap-2 p-3 text-center text-xs font-semibold">
              <Upload className="h-5 w-5" />
              <span>{t('playground.referenceAsset.upload')}</span>
              <input type="file" accept={modeUpload.accept} multiple={modeUpload.maxFiles > 1} className="sr-only"
                onChange={(event) => {
                  const selectedFiles = Array.from(event.currentTarget.files ?? []);
                  const kindCounts = countReferenceAssetsByKind(referenceAssets);
                  const accepted: Array<{ file: File; kind: VideoReferenceAssetKind; kindIndex: number }> = [];
                  selectedFiles.forEach((file) => {
                    if (accepted.length >= remainingSlots) return;
                    const kind = readReferenceAssetKind(file);
                    if (!kind) return;
                    const kindLimit = resolveVideoReferenceKindLimit(videoReferenceCapability, mode, kind);
                    if (kindLimit <= 0 || kindCounts[kind] >= kindLimit) return;
                    accepted.push({ file, kind, kindIndex: kindCounts[kind] });
                    kindCounts[kind] += 1;
                  });
                  if (accepted.length > 0) {
                    void Promise.all(accepted.map(async ({ file, kind, kindIndex }): Promise<ReferenceAssetPreview> => {
                      const encoded = await readReferenceAssetDataUrl(file);
                      return { id: createReferenceAssetPreviewId(file), metadata: { kind, role: resolveVideoReferenceAssetRole(mode, kind, kindIndex), name: file.name, mimeType: file.type, resource: createUploadedReferenceMediaResource(encoded, kind, file.name, file.type, file.size), sizeBytes: file.size }, previewSrc: URL.createObjectURL(file) };
                    })).then(onAddReferenceAssets).catch(() => onUploadError(t('playground.referenceAsset.readFailed')));
                  }
                  event.currentTarget.value = '';
                }}
              />
            </label>
          ) : null}
        </div>
      ) : (
        <div className="sdkwork-studio-reference__mode-hint mt-3">
          {t(mode === 'text_to_video' ? 'playground.referenceAsset.textOnly' : 'playground.referenceAsset.unsupported')}
        </div>
      )}
      {uploadError ? <div className="mt-2 text-xs text-red-300">{uploadError}</div> : null}
    </div>
  );
}

function normalizeReferenceAssetsForMode(assets: ReferenceAssetPreview[], mode: VideoReferenceMode, capability: VideoReferenceCapability): ReferenceAssetPreview[] {
  const modeUpload = resolveVideoReferenceModeUpload(capability, mode);
  const kindCounts = { audio: 0, image: 0, video: 0 } as Record<VideoReferenceAssetKind, number>;
  const next: ReferenceAssetPreview[] = [];
  let changed = false;
  assets.forEach((asset) => {
    if (next.length >= modeUpload.maxFiles) { changed = true; return; }
    const kindLimit = resolveVideoReferenceKindLimit(capability, mode, asset.metadata.kind);
    if (kindLimit <= 0 || kindCounts[asset.metadata.kind] >= kindLimit) { changed = true; return; }
    const nextRole = resolveVideoReferenceAssetRole(mode, asset.metadata.kind, kindCounts[asset.metadata.kind]);
    kindCounts[asset.metadata.kind] += 1;
    if (asset.metadata.role !== nextRole) { changed = true; next.push({ ...asset, metadata: { ...asset.metadata, role: nextRole } }); return; }
    next.push(asset);
  });
  return changed ? next : assets;
}

function countReferenceAssetsByKind(assets: readonly ReferenceAssetPreview[]): Record<VideoReferenceAssetKind, number> {
  const counts = { audio: 0, image: 0, video: 0 } as Record<VideoReferenceAssetKind, number>;
  assets.forEach((a) => { counts[a.metadata.kind] += 1; });
  return counts;
}

function revokeRemovedReferenceAssetUrls(previous: readonly ReferenceAssetPreview[], next: readonly ReferenceAssetPreview[]): void {
  const nextUrls = new Set(next.map((a) => a.previewSrc));
  previous.forEach((a) => { if (!nextUrls.has(a.previewSrc)) URL.revokeObjectURL(a.previewSrc); });
}

function createUploadedReferenceMediaResource(encodedReference: string, kind: VideoReferenceAssetKind, fileName: string, mimeType: string, sizeBytes: number): MediaResourceLike {
  const resource = toExternalUrlMediaResource(encodedReference, kind);
  if (!resource) throw new Error('playground.referenceAsset.readFailed');
  return { ...resource, fileName, mimeType: mimeType || undefined, sizeBytes: String(sizeBytes), title: fileName };
}

function readReferenceAssetKind(file: File): VideoReferenceAssetKind | null {
  const mimeType = file.type.toLowerCase();
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('video/')) return 'video';
  return null;
}

function createReferenceAssetPreviewId(file: File): string {
  const safeName = file.name.trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'reference-asset';
  return [safeName, file.size, file.lastModified, Math.random().toString(36).slice(2, 8)].join('-');
}

function readReferenceAssetDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('playground.referenceAsset.readFailed'));
    reader.onload = () => { if (typeof reader.result === 'string') { resolve(reader.result); return; } reject(new Error('playground.referenceAsset.readFailed')); };
    reader.readAsDataURL(file);
  });
}
