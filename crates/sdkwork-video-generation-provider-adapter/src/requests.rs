use std::collections::HashMap;

use cloudrouter_open_sdk::{
    KlingVideoGenerationRequest, OpenAiVideoCreateRequest, ViduImageToVideoRequest,
    ViduReferenceToVideoRequest, ViduStartEndToVideoRequest, ViduTextToVideoRequest,
    VolcengineContentGenerationTaskCreateRequest, VolcengineContentPart,
};
use sdkwork_video_generation_provider_spi::{
    VideoGenerationProviderError, VideoGenerationProviderResult, VideoProviderDispatchPlan,
};

#[derive(Default, serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct ViduVendorParameters {
    seed: Option<i64>,
    payload: Option<String>,
}

#[derive(Default, serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct KlingVendorParameters {
    cfg_scale: Option<f64>,
}

#[derive(Default, serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct MetadataVendorParameters {
    metadata: Option<HashMap<String, String>>,
}

pub fn build_vidu_text_to_video_request(
    plan: &VideoProviderDispatchPlan,
) -> VideoGenerationProviderResult<ViduTextToVideoRequest> {
    let parameters: ViduVendorParameters =
        decode_vendor_parameters(plan, "vidu.video-generation.v1")?;
    Ok(ViduTextToVideoRequest {
        aspect_ratio: plan.aspect_ratio.clone(),
        callback_url: plan.callback_url.clone(),
        duration: plan.duration_seconds.map(i64::from),
        model: model_or_vendor(plan),
        movement_amplitude: plan.motion_strength.clone(),
        payload: parameters.payload.or_else(|| provider_payload(plan)),
        prompt: plan.prompt.clone(),
        resolution: plan.resolution.clone(),
        seed: parameters.seed,
    })
}

pub fn build_vidu_image_to_video_request(
    plan: &VideoProviderDispatchPlan,
) -> VideoGenerationProviderResult<ViduImageToVideoRequest> {
    let parameters: ViduVendorParameters =
        decode_vendor_parameters(plan, "vidu.video-generation.v1")?;
    Ok(ViduImageToVideoRequest {
        aspect_ratio: plan.aspect_ratio.clone(),
        callback_url: plan.callback_url.clone(),
        duration: plan.duration_seconds.map(i64::from),
        images: plan.source_images.clone(),
        model: model_or_vendor(plan),
        movement_amplitude: plan.motion_strength.clone(),
        payload: parameters.payload.or_else(|| provider_payload(plan)),
        prompt: Some(plan.prompt.clone()),
        resolution: plan.resolution.clone(),
        seed: parameters.seed,
    })
}

pub fn build_vidu_start_end_to_video_request(
    plan: &VideoProviderDispatchPlan,
) -> VideoGenerationProviderResult<ViduStartEndToVideoRequest> {
    let parameters: ViduVendorParameters =
        decode_vendor_parameters(plan, "vidu.video-generation.v1")?;
    Ok(ViduStartEndToVideoRequest {
        aspect_ratio: plan.aspect_ratio.clone(),
        callback_url: plan.callback_url.clone(),
        duration: plan.duration_seconds.map(i64::from),
        images: plan.source_images.clone(),
        model: model_or_vendor(plan),
        movement_amplitude: plan.motion_strength.clone(),
        payload: parameters.payload.or_else(|| provider_payload(plan)),
        prompt: Some(plan.prompt.clone()),
        resolution: plan.resolution.clone(),
        seed: parameters.seed,
    })
}

pub fn build_vidu_reference_to_video_request(
    plan: &VideoProviderDispatchPlan,
) -> VideoGenerationProviderResult<ViduReferenceToVideoRequest> {
    let parameters: ViduVendorParameters =
        decode_vendor_parameters(plan, "vidu.video-generation.v1")?;
    Ok(ViduReferenceToVideoRequest {
        aspect_ratio: plan.aspect_ratio.clone(),
        callback_url: plan.callback_url.clone(),
        duration: plan.duration_seconds.map(i64::from),
        images: plan.source_images.clone(),
        model: model_or_vendor(plan),
        movement_amplitude: plan.motion_strength.clone(),
        payload: parameters.payload.or_else(|| provider_payload(plan)),
        prompt: Some(plan.prompt.clone()),
        resolution: plan.resolution.clone(),
        seed: parameters.seed,
    })
}

pub fn build_kling_video_generation_request(
    plan: &VideoProviderDispatchPlan,
) -> VideoGenerationProviderResult<KlingVideoGenerationRequest> {
    let parameters: KlingVendorParameters =
        decode_vendor_parameters(plan, "kling.video-generation.v1")?;
    Ok(KlingVideoGenerationRequest {
        aspect_ratio: plan.aspect_ratio.clone(),
        callback_url: plan.callback_url.clone(),
        cfg_scale: parameters.cfg_scale,
        duration: plan.duration_seconds.map(i64::from),
        image: plan
            .start_image
            .clone()
            .or_else(|| plan.source_images.first().cloned()),
        image_tail: plan.end_image.clone(),
        mode: plan.motion_strength.clone(),
        model: plan.model.clone(),
        negative_prompt: plan.negative_prompt.clone(),
        prompt: plan.prompt.clone(),
    })
}

pub fn build_volcengine_video_generation_request(
    plan: &VideoProviderDispatchPlan,
) -> VideoGenerationProviderResult<VolcengineContentGenerationTaskCreateRequest> {
    let parameters: MetadataVendorParameters =
        decode_vendor_parameters(plan, "volcengine.video-generation.v1")?;
    let mut content = vec![VolcengineContentPart {
        file_id: None,
        image_url: None,
        text: Some(plan.prompt.clone()),
        r#type: "text".to_string(),
        video_url: None,
    }];
    content.extend(
        plan.source_images
            .iter()
            .map(|image| VolcengineContentPart {
                file_id: None,
                image_url: Some(image.clone()),
                text: None,
                r#type: "image_url".to_string(),
                video_url: None,
            }),
    );
    Ok(VolcengineContentGenerationTaskCreateRequest {
        callback_url: plan.callback_url.clone(),
        content,
        metadata: merge_metadata(plan, parameters.metadata),
        model: model_or_vendor(plan),
    })
}

pub fn build_openai_video_create_request(
    plan: &VideoProviderDispatchPlan,
) -> VideoGenerationProviderResult<OpenAiVideoCreateRequest> {
    let parameters: MetadataVendorParameters =
        decode_vendor_parameters(plan, "openai.video-generation.v1")?;
    Ok(OpenAiVideoCreateRequest {
        image: plan
            .start_image
            .clone()
            .or_else(|| plan.source_images.first().cloned()),
        metadata: merge_metadata(plan, parameters.metadata),
        model: model_or_vendor(plan),
        prompt: plan.prompt.clone(),
        seconds: plan.duration_seconds.map(i64::from),
        size: plan.resolution.clone(),
        video: None,
    })
}

fn decode_vendor_parameters<T>(
    plan: &VideoProviderDispatchPlan,
    expected_schema: &str,
) -> VideoGenerationProviderResult<T>
where
    T: serde::de::DeserializeOwned + Default,
{
    let Some(parameters) = plan.vendor_parameters.as_ref() else {
        return Ok(T::default());
    };
    if parameters.schema.trim() != expected_schema {
        return Err(VideoGenerationProviderError::UnsupportedParameter(format!(
            "vendor parameter schema {} is not valid for {}",
            parameters.schema, plan.provider_code
        )));
    }
    serde_json::from_value(parameters.values.clone()).map_err(|error| {
        VideoGenerationProviderError::InvalidRequest(format!(
            "invalid {} vendor parameters: {error}",
            plan.provider_code
        ))
    })
}

fn provider_payload(plan: &VideoProviderDispatchPlan) -> Option<String> {
    let mut payload = serde_json::Map::new();
    payload.insert(
        "scene".to_string(),
        serde_json::Value::String(plan.scene.clone()),
    );
    if let Some(idempotency_key) = normalized_text(plan.idempotency_key.as_deref()) {
        payload.insert(
            "idempotencyKey".to_string(),
            serde_json::Value::String(idempotency_key),
        );
    }
    Some(serde_json::Value::Object(payload).to_string())
}

fn merge_metadata(
    plan: &VideoProviderDispatchPlan,
    supplied: Option<HashMap<String, String>>,
) -> Option<HashMap<String, String>> {
    let mut metadata = supplied.unwrap_or_default();
    metadata.insert("scene".to_string(), plan.scene.clone());
    if let Some(idempotency_key) = normalized_text(plan.idempotency_key.as_deref()) {
        metadata.insert("idempotencyKey".to_string(), idempotency_key);
    }
    Some(metadata)
}

fn model_or_vendor(plan: &VideoProviderDispatchPlan) -> String {
    normalized_text(plan.model.as_deref()).unwrap_or_else(|| plan.provider_code.clone())
}

fn normalized_text(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}
