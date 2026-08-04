use cloudrouter_open_sdk::{
    KlingVideoGenerationTask, OpenAiVideo, ProviderGeneratedMedia, ProviderTaskError, ViduCreation,
    ViduTaskCreationsResponse, ViduVideoGenerationTask, VolcengineContentGenerationTask,
    VolcengineContentGenerationTaskCreateResponse, VolcengineContentPart,
};
use sdkwork_video_generation_provider_spi::{
    normalize_provider_task_video_generation_result, NormalizedProviderVideoGenerationResult,
    ProviderGeneratedVideoAsset, ProviderTaskErrorSnapshot, ProviderTaskSnapshot,
    VideoProviderDispatchPlan,
};

pub(crate) fn normalize_kling_generation_task(
    plan: &VideoProviderDispatchPlan,
    task: KlingVideoGenerationTask,
) -> Result<NormalizedProviderVideoGenerationResult, &'static str> {
    normalize_provider_task_video_generation_result(
        &plan.provider_code,
        ProviderTaskSnapshot {
            task_id: task.task_id,
            id: task.id,
            status: task.status,
            state: task.state,
            model: task.model,
            videos: provider_assets(task.videos.unwrap_or_default()),
            error: task.error.map(provider_error),
        },
    )
}

pub(crate) fn normalize_vidu_generation_task(
    plan: &VideoProviderDispatchPlan,
    task: ViduVideoGenerationTask,
) -> Result<NormalizedProviderVideoGenerationResult, &'static str> {
    normalize_provider_task_video_generation_result(
        &plan.provider_code,
        ProviderTaskSnapshot {
            task_id: task.task_id,
            id: None,
            status: task.state.clone(),
            state: task.state,
            model: task.model,
            videos: vidu_assets(task.creations.unwrap_or_default()),
            error: None,
        },
    )
}

pub(crate) fn normalize_vidu_task_creations(
    plan: &VideoProviderDispatchPlan,
    task: ViduTaskCreationsResponse,
) -> Result<NormalizedProviderVideoGenerationResult, &'static str> {
    normalize_provider_task_video_generation_result(
        &plan.provider_code,
        ProviderTaskSnapshot {
            task_id: task.task_id,
            id: None,
            status: task.state.clone(),
            state: task.state,
            model: task.model,
            videos: vidu_assets(task.creations.unwrap_or_default()),
            error: None,
        },
    )
}

pub(crate) fn normalize_openai_video(
    plan: &VideoProviderDispatchPlan,
    video: OpenAiVideo,
) -> Result<NormalizedProviderVideoGenerationResult, &'static str> {
    let video_id = video.id;
    let videos = video
        .url
        .or(video.content_url)
        .map(|url| ProviderGeneratedVideoAsset {
            id: Some(video_id.clone()),
            uri: Some(format!(
                "provider://{}/videos/{video_id}",
                plan.provider_code
            )),
            url: Some(url),
            mime_type: None,
            width: None,
            height: None,
            duration_seconds: video.seconds.and_then(|value| i32::try_from(value).ok()),
        })
        .into_iter()
        .collect();
    normalize_provider_task_video_generation_result(
        &plan.provider_code,
        ProviderTaskSnapshot {
            task_id: Some(video_id.clone()),
            id: Some(video_id),
            status: Some(video.status),
            state: None,
            model: video.model,
            videos,
            error: None,
        },
    )
}

pub(crate) fn normalize_volcengine_create(
    plan: &VideoProviderDispatchPlan,
    task: VolcengineContentGenerationTaskCreateResponse,
) -> Result<NormalizedProviderVideoGenerationResult, &'static str> {
    normalize_provider_task_video_generation_result(
        &plan.provider_code,
        ProviderTaskSnapshot {
            task_id: task.task_id,
            id: task.id,
            status: task.status,
            state: None,
            model: plan.model.clone(),
            videos: Vec::new(),
            error: None,
        },
    )
}

pub(crate) fn normalize_volcengine_task(
    plan: &VideoProviderDispatchPlan,
    task: VolcengineContentGenerationTask,
) -> Result<NormalizedProviderVideoGenerationResult, &'static str> {
    let mut videos = task.videos.unwrap_or_default();
    videos.extend(media_from_content(task.content.unwrap_or_default()));
    let result_status = task
        .result
        .as_ref()
        .and_then(|result| result.status.clone());
    if let Some(result) = task.result {
        videos.extend(result.videos.unwrap_or_default());
        videos.extend(media_from_content(result.content.unwrap_or_default()));
    }
    normalize_provider_task_video_generation_result(
        &plan.provider_code,
        ProviderTaskSnapshot {
            task_id: task.task_id,
            id: task.id,
            status: result_status.or(task.status),
            state: task.state,
            model: task.model,
            videos: provider_assets(videos),
            error: task.error.map(provider_error),
        },
    )
}

fn provider_assets(assets: Vec<ProviderGeneratedMedia>) -> Vec<ProviderGeneratedVideoAsset> {
    assets
        .into_iter()
        .map(|asset| ProviderGeneratedVideoAsset {
            id: asset.id,
            uri: asset.uri,
            url: asset.url,
            mime_type: asset.mime_type,
            width: asset.width,
            height: asset.height,
            duration_seconds: asset.duration.map(|value| value.round() as i32),
        })
        .collect()
}

fn vidu_assets(creations: Vec<ViduCreation>) -> Vec<ProviderGeneratedVideoAsset> {
    creations
        .into_iter()
        .filter_map(|creation| {
            let kind = creation
                .r#type
                .as_deref()
                .unwrap_or_default()
                .to_ascii_lowercase();
            if kind.contains("image") || kind.contains("audio") {
                return None;
            }
            let url = creation.video_url.or(creation.url)?;
            Some(ProviderGeneratedVideoAsset {
                id: creation.id,
                uri: creation.uri,
                url: Some(url),
                mime_type: Some("video/mp4".to_string()),
                width: creation.width,
                height: creation.height,
                duration_seconds: creation.duration.map(|value| value.round() as i32),
            })
        })
        .collect()
}

fn media_from_content(content: Vec<VolcengineContentPart>) -> Vec<ProviderGeneratedMedia> {
    content
        .into_iter()
        .filter_map(|part| {
            part.video_url.map(|url| ProviderGeneratedMedia {
                id: part.file_id,
                url: Some(url),
                mime_type: Some("video/mp4".to_string()),
                ..ProviderGeneratedMedia::default()
            })
        })
        .collect()
}

fn provider_error(error: ProviderTaskError) -> ProviderTaskErrorSnapshot {
    ProviderTaskErrorSnapshot {
        code: error.code,
        message: error.message,
        error_type: error.r#type,
    }
}
