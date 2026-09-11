# SDKWork Video PC Application

## Purpose
PC browser/desktop/tablet application root for SDKWork Video.

## Architecture
This application root follows `APP_PC_ARCHITECTURE_SPEC.md` for PC browser, desktop, and large-screen tablet native packaging.

## Directory Structure
```
apps/sdkwork-video-pc/
  .sdkwork/           # Workspace metadata and skills
  bin/                # Cross-platform operational scripts
  config/             # Configuration templates by runtime target
  docs/               # Architecture notes and runbooks
  packages/           # Reusable runtime, shell, app, console, admin packages
  public/             # Browser-served static assets
  scripts/            # Build, validation, generation utilities
  sdks/               # SDK workspaces and generator inputs
  specs/              # Local component/application specs
  src/                # Root shell entry and composition boundary
  tests/              # Application-level integration tests
```

## Package Taxonomy
- `sdkwork-video-pc-core/` - Core runtime, SDK factories, TokenManager binding
- `sdkwork-video-pc-commons/` - Shared PC UI/runtime primitives
- `sdkwork-video-pc-shell/` - App shell, route assembly, layout
- `sdkwork-video-pc-<capability>/` - App/user domain features
- `sdkwork-video-pc-console-<capability>/` - User-facing management console
- `sdkwork-video-pc-admin-<capability>/` - Internal admin operations
- `sdkwork-video-pc-desktop/` - Desktop/Tauri native host

## Related Specs
- `APP_PC_ARCHITECTURE_SPEC.md`
- `APP_PC_REACT_UI_SPEC.md`
- `DESKTOP_APP_ARCHITECTURE_SPEC.md`
- `APP_SDK_INTEGRATION_SPEC.md`
- `CONFIG_SPEC.md`

## Commands
```bash
pnpm install
pnpm dev
pnpm build
pnpm typecheck
pnpm test
pnpm dev:desktop  # When desktop package exists
```