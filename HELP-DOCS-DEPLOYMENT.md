# OTP Relay Portal — Help Docs Auto-Deploy Setup

This repository powers the **OTP Relay Portal** and its **Help Docs deployment pipeline**.

The Help Docs workflow is set up so that documentation changes pushed to GitHub are automatically built on the Raspberry Pi through a **self-hosted GitHub Actions runner** and then synced to the live portal.

## Overview

The setup has 3 roles:

### 1. GitHub repository
This is the **source of truth** for:
- help documentation markdown files
- help documentation assets
- workflow configuration
- build script changes

### 2. Self-hosted runner on the Raspberry Pi
The runner:
- checks out the latest repo code into its own workspace
- builds the help docs
- syncs the generated output to the live portal

### 3. Live deployed portal
The live portal is served from:

```bash
/opt/otp-relay
```

The Help Docs are deployed into:

```bash
/opt/otp-relay/frontend/help
```

## Current working model

Edits are made directly in the **GitHub repo**.

When changes are pushed to `main`, GitHub Actions triggers the workflow and the Pi runner performs the deployment automatically.

Because of this, separate manual backup clones on the Pi are no longer required for normal operation.

The only important Pi directories now are:

```bash
~/actions-runner
/opt/otp-relay
```

## Help Docs source structure

### Source markdown
```bash
docs/help/
```

### Source assets
```bash
docs/help/assets/
```

### Generated output
```bash
frontend/help/
```

### Live deployed output
```bash
/opt/otp-relay/frontend/help/
```

## Important rule for images

All screenshots and help-doc images must be stored in:

```bash
docs/help/assets/
```

Do **not** manually maintain images in:

```bash
frontend/help/assets/
```

That folder is generated automatically by the build script and may be overwritten during deployment.

### Correct workflow for images
1. Add image file to `docs/help/assets/`
2. Reference it inside the markdown file using:

```md
![Description](assets/example.png)
```

3. Commit and push the change
4. The workflow rebuilds the docs
5. The image is copied into `frontend/help/assets/`
6. The live portal is updated

## Build script

The build script used for help docs is:

```bash
scripts/build_help_docs.py
```

It does the following:
- reads markdown files from `docs/help/`
- copies assets from `docs/help/assets/` to `frontend/help/assets/`
- converts markdown into rendered HTML files
- generates `frontend/help/manifest.json`
- rewrites image paths to `/help/assets/...`

## Frontend behavior

The portal frontend loads Help Docs using:

```text
/help/manifest.json
```

Rendered HTML pages are served from:

```text
/help/rendered/<slug>.html
```

Image assets are served from:

```text
/help/assets/<filename>
```

## GitHub Actions workflow

Workflow file:

```bash
.github/workflows/deploy-help-docs.yml
```

### Trigger conditions
The workflow runs on:
- pushes to `main`
- changes to:
  - `docs/help/**`
  - `scripts/build_help_docs.py`
  - `.github/workflows/deploy-help-docs.yml`

It can also be triggered manually through `workflow_dispatch`.

## Current deployment flow

The workflow does the following:

1. Checks out the repository
2. Uses system Python
3. Installs required Python dependencies
4. Builds the Help Docs
5. Confirms generated output
6. Syncs the generated files into the live portal

## Runner details

The self-hosted runner is registered on the Raspberry Pi with labels:

- `self-hosted`
- `Linux`
- `ARM64`

Workflow jobs target:

```yaml
runs-on: [self-hosted, linux, ARM64]
```

## Deployment sync behavior

The deploy step uses `rsync` to copy the generated Help Docs into the live portal.

Because the deployment mirrors generated output, the live folder should be treated as **deployment output**, not as a place for manual edits.

Manual changes inside:

```bash
/opt/otp-relay/frontend/help/
```

may be overwritten by the next deployment.

## Permissions note

The runner must have permission to write into:

```bash
/opt/otp-relay/frontend/help/
```

If deployment fails with `Permission denied` or `rsync code 23`, check ownership and write access for that directory.

## Daily usage instructions

### To update help docs
1. Edit markdown files in:
   ```bash
   docs/help/
   ```
2. Add or update images in:
   ```bash
   docs/help/assets/
   ```
3. Push changes to `main`
4. Wait for the GitHub Actions workflow to complete
5. Refresh the portal and verify the updates

### To update the build process
Edit:

```bash
scripts/build_help_docs.py
```

Then push to `main`. The workflow will rebuild using the updated logic.

### To update deployment behavior
Edit:

```bash
.github/workflows/deploy-help-docs.yml
```

Then push to `main`.

## Troubleshooting

### Workflow ran but portal did not change
Check:
- whether the workflow actually included the sync step
- whether `rsync` completed successfully
- whether the runner had write permissions to `/opt/otp-relay/frontend/help/`

### Images missing from portal
Check:
- image exists in `docs/help/assets/`
- markdown references it as `assets/filename.png`
- the file name matches exactly
- deployment completed successfully

### Runner builds correct files but portal still shows old content
Check:
- the live deployed directory:
  ```bash
  /opt/otp-relay/frontend/help/
  ```
- the runner workspace output:
  ```bash
  ~/actions-runner/_work/.../frontend/help/
  ```

If the runner output is newer than the live folder, the deployment sync is failing.

### Node.js warning in workflow
Use `actions/checkout@v5` instead of `actions/checkout@v4`.

## Operational rules

- GitHub repo is the source of truth
- Pi runner workspace is temporary build space
- `/opt/otp-relay` is the live deployed portal
- do not manually edit generated files unless troubleshooting
- do not store source screenshots in `frontend/help/assets`
- always store source screenshots in `docs/help/assets`

## Recommended final structure

```bash
GitHub repo
  ├── docs/help/
  ├── docs/help/assets/
  ├── scripts/build_help_docs.py
  └── .github/workflows/deploy-help-docs.yml

Pi runner
  └── ~/actions-runner/_work/...

Live portal
  └── /opt/otp-relay/frontend/help/
```

## Summary

This setup supports:
- GitHub-based documentation editing
- automatic Help Docs builds on the Raspberry Pi
- automatic deployment into the live portal
- managed image assets
- clean separation between source, build output, and deployed output
