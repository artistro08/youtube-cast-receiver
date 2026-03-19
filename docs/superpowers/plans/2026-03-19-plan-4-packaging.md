# Plan 4: Build Pipeline & Packaging

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the `build.ps1` PowerShell script that builds the frontend and backend, downloads Linux x86_64 binaries for Node.js and yt-dlp, and packages everything into a Decky-format ZIP file. Also create a LICENSE file.

**Architecture:** The build script runs on Windows (developer machine) and produces a ZIP containing Linux binaries for Steam Deck deployment. The ZIP follows the Decky plugin distribution format.

**Tech Stack:** PowerShell, pnpm, Node.js 20 LTS (linux-x64), yt-dlp (linux)

**Reference:**
- Design spec: `docs/superpowers/specs/2026-03-19-youtube-cast-receiver-design.md` (lines 228-294)
- Decky plugin ZIP format: https://github.com/SteamDeckHomebrew/decky-plugin-template

**ZIP structure (target output):**
```
youtube-cast-receiver/
├── dist/
│   └── index.js
├── backend/
│   ├── out/
│   │   ├── server.js
│   │   └── package.json       # CJS override ({"type":"commonjs"})
│   └── xml/
│       ├── app-desc.xml
│       └── device-desc.xml
├── bin/
│   ├── node                    # Node.js 20 LTS linux-x64 binary
│   └── yt-dlp                  # yt-dlp linux binary
├── package.json
├── plugin.json
├── main.py
└── LICENSE
```

---

## File Structure (created by this plan)

```
youtube-cast-receiver/
├── build.ps1                   # CREATE — PowerShell build + package script
└── LICENSE                     # CREATE — BSD-3-Clause license
```

---

### Task 1: Create LICENSE File

**Files:**
- Create: `LICENSE`

- [ ] **Step 1: Create `LICENSE`**

```
BSD 3-Clause License

Copyright (c) 2026, artistro08

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its
   contributors may be used to endorse or promote products derived from
   this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

- [ ] **Step 2: Commit**

```bash
git add LICENSE
git commit -m "chore: add BSD-3-Clause license"
```

---

### Task 2: Create build.ps1

**Files:**
- Create: `build.ps1`

PowerShell script that:
1. Installs dependencies
2. Builds frontend and backend
3. Downloads Node.js 20 LTS (linux-x64) binary
4. Downloads yt-dlp (linux) binary
5. Assembles and ZIPs everything in Decky format

- [ ] **Step 1: Create `build.ps1`**

```powershell
# build.ps1 — Build and package YouTube Cast Receiver for Decky Loader
# Usage: powershell -ExecutionPolicy Bypass -File build.ps1
# Or:    pnpm run package

$ErrorActionPreference = "Stop"

$PluginName = "youtube-cast-receiver"
$NodeVersion = "v20.18.3"
$NodeUrl = "https://nodejs.org/dist/$NodeVersion/node-$NodeVersion-linux-x64.tar.xz"
$YtdlpUrl = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BinDir = Join-Path $ScriptDir "bin"
$StagingDir = Join-Path $ScriptDir "staging"
$PluginDir = Join-Path $StagingDir $PluginName
$ZipPath = Join-Path $ScriptDir "$PluginName.zip"

Write-Host "=== YouTube Cast Receiver Build Script ===" -ForegroundColor Cyan

# --- Step 1: Install dependencies ---
Write-Host "`n[1/6] Installing dependencies..." -ForegroundColor Yellow
Push-Location $ScriptDir
pnpm install --frozen-lockfile
if ($LASTEXITCODE -ne 0) { throw "pnpm install failed" }
Pop-Location

# --- Step 2: Build frontend ---
Write-Host "`n[2/6] Building frontend..." -ForegroundColor Yellow
Push-Location $ScriptDir
pnpm run build
if ($LASTEXITCODE -ne 0) { throw "Frontend build failed" }
Pop-Location

# --- Step 3: Build backend ---
Write-Host "`n[3/6] Building backend..." -ForegroundColor Yellow
Push-Location $ScriptDir
pnpm run build:backend
if ($LASTEXITCODE -ne 0) { throw "Backend build failed" }
Pop-Location

# --- Step 4: Download Node.js binary (linux-x64) ---
Write-Host "`n[4/6] Downloading Node.js $NodeVersion (linux-x64)..." -ForegroundColor Yellow
if (!(Test-Path $BinDir)) { New-Item -ItemType Directory -Path $BinDir | Out-Null }

$NodeBin = Join-Path $BinDir "node"
if (!(Test-Path $NodeBin)) {
    $TarXzPath = Join-Path $ScriptDir "node-linux-x64.tar.xz"
    $TarPath = Join-Path $ScriptDir "node-linux-x64.tar"
    $ExtractDir = Join-Path $ScriptDir "node-extract"

    Write-Host "  Downloading $NodeUrl..."
    Invoke-WebRequest -Uri $NodeUrl -OutFile $TarXzPath -UseBasicParsing

    # Extract .tar.xz — requires 7-Zip or tar
    Write-Host "  Extracting Node.js binary..."
    if (Get-Command "tar" -ErrorAction SilentlyContinue) {
        # Windows 10+ has built-in tar
        if (!(Test-Path $ExtractDir)) { New-Item -ItemType Directory -Path $ExtractDir | Out-Null }
        tar -xf $TarXzPath -C $ExtractDir
    } else {
        throw "tar command not found. Install tar or 7-Zip to extract .tar.xz files."
    }

    # Find and copy the node binary
    $NodeSrc = Get-ChildItem -Path $ExtractDir -Recurse -Filter "node" | Where-Object { $_.FullName -like "*bin/node" -or $_.FullName -like "*bin\node" } | Select-Object -First 1
    if (!$NodeSrc) { throw "Could not find node binary in extracted archive" }
    Copy-Item $NodeSrc.FullName $NodeBin

    # Cleanup
    Remove-Item -Recurse -Force $ExtractDir -ErrorAction SilentlyContinue
    Remove-Item -Force $TarXzPath -ErrorAction SilentlyContinue
    Remove-Item -Force $TarPath -ErrorAction SilentlyContinue

    Write-Host "  Node.js binary saved to bin/node" -ForegroundColor Green
} else {
    Write-Host "  bin/node already exists, skipping download" -ForegroundColor DarkGray
}

# --- Step 5: Download yt-dlp binary (linux) ---
Write-Host "`n[5/6] Downloading yt-dlp (linux)..." -ForegroundColor Yellow
$YtdlpBin = Join-Path $BinDir "yt-dlp"
if (!(Test-Path $YtdlpBin)) {
    Write-Host "  Downloading $YtdlpUrl..."
    Invoke-WebRequest -Uri $YtdlpUrl -OutFile $YtdlpBin -UseBasicParsing
    Write-Host "  yt-dlp binary saved to bin/yt-dlp" -ForegroundColor Green
} else {
    Write-Host "  bin/yt-dlp already exists, skipping download" -ForegroundColor DarkGray
}

# --- Step 6: Package into ZIP ---
Write-Host "`n[6/6] Packaging into $PluginName.zip..." -ForegroundColor Yellow

# Clean staging
if (Test-Path $StagingDir) { Remove-Item -Recurse -Force $StagingDir }
New-Item -ItemType Directory -Path $PluginDir | Out-Null

# Copy required files
Copy-Item (Join-Path $ScriptDir "dist") (Join-Path $PluginDir "dist") -Recurse
Copy-Item (Join-Path $ScriptDir "backend/out") (Join-Path $PluginDir "backend/out") -Recurse
Copy-Item (Join-Path $ScriptDir "backend/xml") (Join-Path $PluginDir "backend/xml") -Recurse
Copy-Item $BinDir (Join-Path $PluginDir "bin") -Recurse
Copy-Item (Join-Path $ScriptDir "package.json") (Join-Path $PluginDir "package.json")
Copy-Item (Join-Path $ScriptDir "plugin.json") (Join-Path $PluginDir "plugin.json")
Copy-Item (Join-Path $ScriptDir "main.py") (Join-Path $PluginDir "main.py")
Copy-Item (Join-Path $ScriptDir "LICENSE") (Join-Path $PluginDir "LICENSE")

# Create ZIP
if (Test-Path $ZipPath) { Remove-Item -Force $ZipPath }
Compress-Archive -Path $PluginDir -DestinationPath $ZipPath

# Clean staging
Remove-Item -Recurse -Force $StagingDir

$ZipSize = (Get-Item $ZipPath).Length / 1MB
Write-Host "`n=== Build complete! ===" -ForegroundColor Green
Write-Host "Output: $ZipPath ($([math]::Round($ZipSize, 1)) MB)" -ForegroundColor Green
Write-Host "Install: Copy ZIP to Steam Deck and install via Decky developer options" -ForegroundColor Cyan
```

- [ ] **Step 2: Update .gitignore**

Add these lines to `.gitignore` to exclude build artifacts:
```
staging/
node-extract/
node-linux-x64.tar.xz
node-linux-x64.tar
```

- [ ] **Step 3: Commit**

```bash
git add build.ps1 .gitignore
git commit -m "feat: add build.ps1 packaging script for Decky ZIP distribution"
```

---

### Task 3: Test the Build Script

**Files:** None new — runs the build script end-to-end.

- [ ] **Step 1: Run the build script**

Run:
```powershell
powershell -ExecutionPolicy Bypass -File build.ps1
```

Expected output:
- Steps 1-3: install + build succeed (already verified in prior plans)
- Step 4: Downloads Node.js ~24MB tarball, extracts the `node` binary to `bin/node`
- Step 5: Downloads yt-dlp ~10MB binary to `bin/yt-dlp`
- Step 6: Creates `youtube-cast-receiver.zip` (~35-50MB)

If any step fails, fix the issue in `build.ps1` and re-run.

- [ ] **Step 2: Verify ZIP contents**

Run:
```powershell
# List ZIP contents
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::OpenRead("youtube-cast-receiver.zip").Entries | Select-Object FullName, Length | Format-Table -AutoSize
```

Expected structure inside the ZIP:
```
youtube-cast-receiver/dist/index.js
youtube-cast-receiver/backend/out/server.js
youtube-cast-receiver/backend/out/package.json
youtube-cast-receiver/backend/xml/app-desc.xml
youtube-cast-receiver/backend/xml/device-desc.xml
youtube-cast-receiver/bin/node
youtube-cast-receiver/bin/yt-dlp
youtube-cast-receiver/package.json
youtube-cast-receiver/plugin.json
youtube-cast-receiver/main.py
youtube-cast-receiver/LICENSE
```

- [ ] **Step 3: Verify `pnpm run package` alias works**

Run:
```bash
pnpm run package
```

Expected: Same result as running `build.ps1` directly. Since binaries are already downloaded, steps 4-5 should say "already exists, skipping download."

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: address packaging script issues"
```

(Only if fixes were needed.)

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "chore: Plan 4 complete — build pipeline and packaging ready"
```
