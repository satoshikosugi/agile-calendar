# GitHub Pages Deployment Script

$ErrorActionPreference = "Stop"

Write-Host "Starting GitHub Pages deployment..." -ForegroundColor Cyan

# 1. Build
Write-Host "`n[1/3] Building application..." -ForegroundColor Yellow
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed!" -ForegroundColor Red
    exit 1
}

# 2. Prepare dist folder
Write-Host "`n[2/3] Preparing deployment..." -ForegroundColor Yellow

# Save current directory
$root = Get-Location
$dist = Join-Path $root "dist"

if (-not (Test-Path $dist)) {
    Write-Host "Dist folder not found!" -ForegroundColor Red
    exit 1
}

Set-Location $dist

# Initialize a new git repo in dist
# We need to remove existing .git folder if it exists
if (Test-Path .git) {
    Remove-Item .git -Recurse -Force
}

git init
git checkout -b gh-pages
git add -A
git commit -m "deploy: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"

# 3. Push to gh-pages
Write-Host "`n[3/3] Pushing to GitHub..." -ForegroundColor Yellow

# Push to the remote repository
git push -f git@github.com:satoshikosugi/agile-calendar.git gh-pages

# Return to project root
Set-Location $root

Write-Host "`n✅ Deployment successful!" -ForegroundColor Green
Write-Host "Your app will be available at: https://satoshikosugi.github.io/agile-calendar/" -ForegroundColor Cyan
