use async_trait::async_trait;
use axum::{body::Body, http::Request, Router};
use rmcp::{transport::streamable_http_server::StreamableHttpServerConfig, ServerHandler};
use sdkwork_video_generation_mcp_service::{
    streamable_http_service, GenerateVideoInput, VideoGenerationMcpService,
};
use sdkwork_video_generation_service::{
    NormalizedProviderVideoGenerationResult, VideoGenerationCommand,
    VideoGenerationProviderDescriptor, VideoGenerationProviderResult, VideoGenerationServicePort,
    VideoProviderDispatchPlan, VideoProviderSubmission,
};
use std::sync::Arc;
use tower::ServiceExt;

struct FakeService;
#[async_trait]
impl VideoGenerationServicePort for FakeService {
    async fn generate(
        &self,
        _: VideoGenerationCommand,
    ) -> VideoGenerationProviderResult<VideoProviderSubmission> {
        unreachable!()
    }
    async fn retrieve(
        &self,
        _: &VideoProviderDispatchPlan,
        _: &str,
    ) -> VideoGenerationProviderResult<NormalizedProviderVideoGenerationResult> {
        unreachable!()
    }
    async fn cancel(
        &self,
        _: &VideoProviderDispatchPlan,
        _: &str,
    ) -> VideoGenerationProviderResult<NormalizedProviderVideoGenerationResult> {
        unreachable!()
    }
    fn provider_descriptors(&self) -> Vec<VideoGenerationProviderDescriptor> {
        Vec::new()
    }
}
fn service() -> VideoGenerationMcpService {
    VideoGenerationMcpService::new(Arc::new(FakeService))
}

#[test]
fn public_contract_is_provider_neutral() {
    let service = service();
    let names = service
        .tools()
        .into_iter()
        .map(|tool| tool.name.to_string())
        .collect::<Vec<_>>();
    assert_eq!(
        names,
        [
            "video.cancel",
            "video.capabilities",
            "video.generate",
            "video.retrieve"
        ]
    );
    let contract = serde_json::to_string(&service.tools())
        .unwrap()
        .to_ascii_lowercase();
    for forbidden in [
        "cloudrouter",
        "open-sdk",
        "generated/server-openapi",
        "provider_operation",
        "providerid",
    ] {
        assert!(
            !contract.contains(forbidden),
            "public MCP contract leaked {forbidden}"
        );
    }
    let info = service.get_info();
    assert!(
        info.capabilities.tools.is_some()
            && info.capabilities.resources.is_some()
            && info.capabilities.prompts.is_some()
    );
}

#[tokio::test]
async fn streamable_http_initialize_uses_sse() {
    let app = Router::new().nest_service(
        "/mcp",
        streamable_http_service(service(), StreamableHttpServerConfig::default()),
    );
    let response = app
        .oneshot(
            Request::post("/mcp")
                .header("host", "localhost")
                .header("content-type", "application/json")
                .header("accept", "application/json, text/event-stream")
                .body(Body::from(initialize_body()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    assert!(response
        .headers()
        .get("content-type")
        .unwrap()
        .to_str()
        .unwrap()
        .contains("text/event-stream"));
}
fn initialize_body() -> &'static str {
    r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"sdkwork-contract-test","version":"1.0.0"}}}"#
}

#[test]
fn unified_input_maps_vendor_extensions_without_sdk_dtos() {
    let input: GenerateVideoInput = serde_json::from_value(serde_json::json!({
        "vendor": "Example_Vendor",
        "prompt": "camera orbit",
        "vendorParameters": { "schema": "urn:example:video:v1", "values": { "seed": 7 } }
    }))
    .unwrap();
    let command: VideoGenerationCommand = input.try_into().unwrap();
    assert_eq!(command.vendor.as_str(), "example-vendor");
    assert_eq!(
        command.vendor_parameters.unwrap().schema,
        "urn:example:video:v1"
    );
}
