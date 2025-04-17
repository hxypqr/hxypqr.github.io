@echo off
setlocal

REM 设置你的网站项目目录（你的路径是 J:\jekyll-homepage）
cd /d J:\jekyll-homepage

REM 获取当前时间作为提交信息
for /f %%i in ('powershell -command "Get-Date -Format yyyy-MM-dd_HH:mm:ss"') do set timestamp=%%i

echo 🚀 正在提交更新: %timestamp%
git add .
git commit -m "update: site content on %timestamp%"
git push

echo 🎉 更新完成！按任意键退出。
pause >nul
