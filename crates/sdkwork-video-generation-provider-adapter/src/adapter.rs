use cloudrouter_open_sdk::SdkworkAiClient;
use sdkwork_video_generation_provider_spi::{
    NormalizedProviderVideoGenerationResult, VideoGenerationCommand, VideoGenerationProvider,
    VideoGenerationProviderCapability, VideoGenerationProviderDescriptor,
    VideoGenerationProviderError, VideoGenerationProviderResult, VideoProviderDispatchPlan,
    VideoProviderOperation, VideoProviderSubmission, VideoVendorId,
};

use crate::normalization::{
    normalize_kling_generation_task, normalize_openai_video, normalize_vidu_generation_task,
    normalize_vidu_task_creations, normalize_volcengine_create, normalize_volcengine_task,
};
use crate::requests::{
    build_kling_video_generation_request, build_openai_video_create_request,
    build_vidu_image_to_video_request, build_vidu_reference_to_video_request,
    build_vidu_start_end_to_video_request, build_vidu_text_to_video_request,
    build_volcengine_video_generation_request,
};
use crate::routing::{resolve_sdk_operation_route, VIDEO_GENERATION_PROVIDER_ADAPTER_ID};

#[derive(Clone)]
pub struct VideoGenerationProviderAdapter {
    client: SdkworkAiClient,
    descriptor: VideoGenerationProviderDescriptor,
}

impl VideoGenerationProviderAdapter {
    pub fn new(client: SdkworkAiClient) -> Self {
        Self {
            client,
            descriptor: VideoGenerationProviderDescriptor {
                id: VIDEO_GENERATION_PROVIDER_ADAPTER_ID.to_string(),
                vendors: [
                    "vidu",
                    "kling",
                    "volcengine",
                    "doubao",
                    "ark",
                    "openai",
                    "sora",
                    "openai-compatible",
                ]
                .into_iter()
                .map(|vendor| VideoVendorId::new(vendor).expect("static video vendor"))
                .collect(),
                capabilities: vec![
                    VideoGenerationProviderCapability::TextToVideo,
                    VideoGenerationProviderCapability::ImageToVideo,
                    VideoGenerationProviderCapability::ReferenceToVideo,
                    VideoGenerationProviderCapability::StartEndToVideo,
                    VideoGenerationProviderCapability::Polling,
                    VideoGenerationProviderCapability::Webhook,
                ],
            },
        }
    }

    async fn create(
        &self,
        plan: &VideoProviderDispatchPlan,
    ) -> VideoGenerationProviderResult<NormalizedProviderVideoGenerationResult> {
        let result = match plan.provider_operation {
            VideoProviderOperation::ViduTextToVideo => {
                let request = build_vidu_text_to_video_request(plan)?;
                let task = self
                    .client
                    .videos_vidu()
                    .create_ent_v2_text2video(&request)
                    .await
                    .map_err(map_sdk_error)?;
                normalize_vidu_generation_task(plan, task)
            }
            VideoProviderOperation::ViduImageToVideo => {
                let request = build_vidu_image_to_video_request(plan)?;
                let task = self
                    .client
                    .videos_vidu()
                    .create_ent_v2_img2video(&request)
                    .await
                    .map_err(map_sdk_error)?;
                normalize_vidu_generation_task(plan, task)
            }
            VideoProviderOperation::ViduStartEndToVideo => {
                let request = build_vidu_start_end_to_video_request(plan)?;
                let task = self
                    .client
                    .videos_vidu()
                    .create_ent_v2_start_end2video(&request)
                    .await
                    .map_err(map_sdk_error)?;
                normalize_vidu_generation_task(plan, task)
            }
            VideoProviderOperation::ViduReferenceToVideo => {
                let request = build_vidu_reference_to_video_request(plan)?;
                let task = self
                    .client
                    .videos_vidu()
                    .create_ent_v2_reference2video(&request)
                    .await
                    .map_err(map_sdk_error)?;
                normalize_vidu_generation_task(plan, task)
            }
            VideoProviderOperation::KlingVideoGeneration => {
                let request = build_kling_video_generation_request(plan)?;
                let task = self
                    .client
                    .videos_kling()
                    .create_v1_videos_generation(&request)
                    .await
                    .map_err(map_sdk_error)?;
                normalize_kling_generation_task(plan, task)
            }
            VideoProviderOperation::VolcengineContentGeneration => {
                let request = build_volcengine_video_generation_request(plan)?;
                let task = self
                    .client
                    .videos_volcengine()
                    .create_api_v3_contents_generations_task(&request)
                    .await
                    .map_err(map_sdk_error)?;
                normalize_volcengine_create(plan, task)
            }
            VideoProviderOperation::OpenAiVideoGeneration => {
                let request = build_openai_video_create_request(plan)?;
                let task = self
                    .client
                    .video()
                    .create(&request)
                    .await
                    .map_err(map_sdk_error)?;
                normalize_openai_video(plan, task)
            }
            VideoProviderOperation::ProviderNativeVideoGeneration => {
                return Err(VideoGenerationProviderError::UnsupportedCapability(
                    "provider-native video generation".to_string(),
                ));
            }
        };
        result.map_err(invalid_response)
    }

    async fn retrieve_task(
        &self,
        plan: &VideoProviderDispatchPlan,
        provider_task_id: &str,
    ) -> VideoGenerationProviderResult<NormalizedProviderVideoGenerationResult> {
        let result = match plan.provider_operation {
            VideoProviderOperation::ViduTextToVideo
            | VideoProviderOperation::ViduImageToVideo
            | VideoProviderOperation::ViduStartEndToVideo
            | VideoProviderOperation::ViduReferenceToVideo => {
                let task = self
                    .client
                    .videos_vidu()
                    .list_ent_v2_tasks_creations(provider_task_id)
                    .await
                    .map_err(map_sdk_error)?;
                normalize_vidu_task_creations(plan, task)
            }
            VideoProviderOperation::KlingVideoGeneration => {
                let task = self
                    .client
                    .videos_kling()
                    .list_v1_videos_generations(provider_task_id)
                    .await
                    .map_err(map_sdk_error)?;
                normalize_kling_generation_task(plan, task)
            }
            VideoProviderOperation::VolcengineContentGeneration => {
                let task = self
                    .client
                    .videos_volcengine()
                    .list_api_v3_contents_generations_tasks(provider_task_id)
                    .await
                    .map_err(map_sdk_error)?;
                normalize_volcengine_task(plan, task)
            }
            VideoProviderOperation::OpenAiVideoGeneration => {
                let task = self
                    .client
                    .video()
                    .retrieve(provider_task_id)
                    .await
                    .map_err(map_sdk_error)?;
                normalize_openai_video(plan, task)
            }
            VideoProviderOperation::ProviderNativeVideoGeneration => {
                return Err(VideoGenerationProviderError::UnsupportedCapability(
                    "task retrieval".to_string(),
                ));
            }
        };
        result.map_err(invalid_response)
    }
}

#[async_trait::async_trait]
impl VideoGenerationProvider for VideoGenerationProviderAdapter {
    fn descriptor(&self) -> &VideoGenerationProviderDescriptor {
        &self.descriptor
    }

    fn validate(&self, command: &VideoGenerationCommand) -> VideoGenerationProviderResult<()> {
        if !self.descriptor.supports_vendor(&command.vendor) {
            return Err(VideoGenerationProviderError::UnsupportedVendor(
                command.vendor.to_string(),
            ));
        }
        let plan =
            sdkwork_video_generation_provider_spi::plan_unified_video_generation_provider_dispatch(
                command,
            )
            .map_err(|message| VideoGenerationProviderError::InvalidRequest(message.to_string()))?;
        if resolve_sdk_operation_route(plan.provider_operation).is_none() {
            return Err(VideoGenerationProviderError::UnsupportedCapability(
                plan.provider_operation.as_str().to_string(),
            ));
        }
        Ok(())
    }

    async fn generate(
        &self,
        command: &VideoGenerationCommand,
    ) -> VideoGenerationProviderResult<VideoProviderSubmission> {
        self.validate(command)?;
        let mut dispatch_plan =
            sdkwork_video_generation_provider_spi::plan_unified_video_generation_provider_dispatch(
                command,
            )
            .map_err(|message| VideoGenerationProviderError::InvalidRequest(message.to_string()))?;
        dispatch_plan.provider_id = self.descriptor.id.clone();
        let result = self.create(&dispatch_plan).await?;
        Ok(VideoProviderSubmission {
            dispatch_plan,
            result,
        })
    }

    async fn retrieve(
        &self,
        dispatch_plan: &VideoProviderDispatchPlan,
        provider_task_id: &str,
    ) -> VideoGenerationProviderResult<NormalizedProviderVideoGenerationResult> {
        if resolve_sdk_operation_route(dispatch_plan.provider_operation).is_none() {
            return Err(VideoGenerationProviderError::UnsupportedCapability(
                "task retrieval".to_string(),
            ));
        }
        self.retrieve_task(dispatch_plan, provider_task_id).await
    }
}

fn map_sdk_error(error: cloudrouter_open_sdk::SdkworkError) -> VideoGenerationProviderError {
    match error {
        cloudrouter_open_sdk::SdkworkError::Http(error) if error.is_timeout() => {
            VideoGenerationProviderError::Timeout(error.to_string())
        }
        cloudrouter_open_sdk::SdkworkError::Http(error) => {
            VideoGenerationProviderError::Transport(error.to_string())
        }
        cloudrouter_open_sdk::SdkworkError::HttpStatus { status: 408, body } => {
            VideoGenerationProviderError::Timeout(body)
        }
        cloudrouter_open_sdk::SdkworkError::HttpStatus { status: 429, body } => {
            VideoGenerationProviderError::RateLimited(body)
        }
        cloudrouter_open_sdk::SdkworkError::HttpStatus { status, body } if status >= 500 => {
            VideoGenerationProviderError::ProviderUnavailable(format!(
                "http status {status}: {body}"
            ))
        }
        cloudrouter_open_sdk::SdkworkError::HttpStatus { status, body } => {
            VideoGenerationProviderError::Rejected(format!("http status {status}: {body}"))
        }
        cloudrouter_open_sdk::SdkworkError::Serialization(error) => {
            VideoGenerationProviderError::InvalidProviderResponse(error.to_string())
        }
        error @ (cloudrouter_open_sdk::SdkworkError::InvalidHeaderName(_)
        | cloudrouter_open_sdk::SdkworkError::InvalidHeaderValue(_)
        | cloudrouter_open_sdk::SdkworkError::InvalidHttpMethod(_)) => {
            VideoGenerationProviderError::Configuration(error.to_string())
        }
    }
}

fn invalid_response(message: &'static str) -> VideoGenerationProviderError {
    VideoGenerationProviderError::InvalidProviderResponse(message.to_string())
}
