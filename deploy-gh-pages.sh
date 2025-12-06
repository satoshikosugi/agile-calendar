#!/bin/bash
# GitHub Pagesにデプロイするスクリプト (macOS/Linux用)

echo -e "\033[0;36mStarting GitHub Pages deployment...\033[0m"

# 1. ビルド
echo -e "\n\033[0;33m[1/4] Building application...\033[0m"
npm run build

if [ $? -ne 0 ]; then
    echo -e "\033[0;31mBuild failed!\033[0m"
    exit 1
fi

echo -e "\033[0;32mBuild completed successfully!\033[0m"

# 2. distフォルダをステージング
echo -e "\n\033[0;33m[2/4] Staging dist folder...\033[0m"
git add dist -f

# 3. コミット
echo -e "\n\033[0;33m[3/4] Committing build files...\033[0m"
commitMessage="Deploy to GitHub Pages - $(date '+%Y-%m-%d %H:%M:%S')"
git commit -m "$commitMessage"

if [ $? -ne 0 ]; then
    echo -e "\033[0;33mNo changes to commit or commit failed\033[0m"
fi

# 4. gh-pagesブランチを削除して再作成
echo -e "\n\033[0;33m[4/4] Deploying to gh-pages branch...\033[0m"
echo -e "\033[0;90mDeleting old gh-pages branch...\033[0m"
git push origin :gh-pages 2>/dev/null

echo -e "\033[0;90mPushing new gh-pages branch...\033[0m"
git subtree push --prefix dist origin gh-pages

if [ $? -eq 0 ]; then
    echo -e "\n\033[0;32m✅ Deployment successful!\033[0m"
    echo -e "\033[0;36mYour app will be available at: https://satoshikosugi.github.io/agile-calender/\033[0m"
    echo -e "\033[0;33mNote: It may take 2-3 minutes for changes to appear.\033[0m"
else
    echo -e "\n\033[0;31m❌ Deployment failed!\033[0m"
    exit 1
fi
