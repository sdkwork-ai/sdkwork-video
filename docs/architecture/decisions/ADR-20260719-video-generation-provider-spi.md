# ADR-20260719: Video Generation Provider SPI

Status: accepted
Date: 2026-07-19
Owner: SDKWork Video maintainers

## Decision

Use `sdkwork-video-generation-service` as the public L2 entrypoint,
`sdkwork-video-generation-provider-spi` as the transport-neutral L3 port, and
`sdkwork-video-generation-provider-adapter` as the L4 owner of generated SDK routing, DTO mapping,
vendor parameters, errors, and normalization. CloudRouter is an internal generated SDK dependency,
not a vendor or public provider identity.

Pre-release consumers use the canonical service, SPI, and adapter packages directly; no provider
compatibility package is retained.
