# GitHub Pagesにデプロイするスクリプト

Write-Host "Starting GitHub Pages deployment..." -ForegroundColor Cyan

# 1. ビルド
Write-Host "`n[1/4] Building application..." -ForegroundColor Yellow
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed!" -ForegroundColor Red
    exit 1
}

Write-Host "Build completed successfully!" -ForegroundColor Green

# 2. distフォルダをステージング
Write-Host "`n[2/4] Staging dist folder..." -ForegroundColor Yellow
git add dist -f

# 3. コミット
Write-Host "`n[3/4] Committing build files..." -ForegroundColor Yellow
$commitMessage = "Deploy to GitHub Pages - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
git commit -m $commitMessage

if ($LASTEXITCODE -ne 0) {
    Write-Host "No changes to commit or commit failed" -ForegroundColor Yellow
}

# 4. gh-pagesブランチを削除して再作成
Write-Host "`n[4/4] Deploying to gh-pages branch..." -ForegroundColor Yellow
Write-Host "Deleting old gh-pages branch..." -ForegroundColor Gray
git push origin :gh-pages 2>$null

Write-Host "Pushing new gh-pages branch..." -ForegroundColor Gray
git subtree push --prefix dist origin gh-pages

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ Deployment successful!" -ForegroundColor Green
    Write-Host "Your app will be available at: https://satoshikosugi.github.io/agile-calender/" -ForegroundColor Cyan
    Write-Host "Note: It may take 2-3 minutes for changes to appear." -ForegroundColor Yellow
} else {
    Write-Host "`n❌ Deployment failed!" -ForegroundColor Red
    exit 1
}
