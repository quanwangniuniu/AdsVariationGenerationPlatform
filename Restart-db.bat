@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul

echo ========================================
echo 🚀 MediaJira 本地数据库 + Docker + Django 超级用户重置脚本
echo ========================================
echo.

REM ===============================
REM 0. 从 .env 文件读取配置
REM ===============================
for /f "tokens=1,2 delims==" %%a in (.env) do (
    set %%a=%%b
)
echo [阶段 0] 配置加载完成
pause

REM ===============================
REM 1. 删除本地数据库
REM ===============================
echo [阶段 1] 删除本地数据库 "%POSTGRES_DB%"...
set PGPASSWORD=%POSTGRES_PASSWORD%
psql -h localhost -U %POSTGRES_USER% -p %POSTGRES_PORT% -d postgres -c "DROP DATABASE IF EXISTS %POSTGRES_DB%;"
if errorlevel 1 (
    echo ⚠️ 删除数据库失败，请确认 PostgreSQL 服务已运行.
    pause
    goto END
)
echo     ✅ 删除完成
pause

REM ===============================
REM 2. 创建本地数据库
REM ===============================
echo [阶段 2] 创建本地数据库 "%POSTGRES_DB%"...
psql -h localhost -U %POSTGRES_USER% -p %POSTGRES_PORT% -d postgres -c "CREATE DATABASE %POSTGRES_DB%;"
if errorlevel 1 (
    echo ❌ 创建数据库失败，请检查配置.
    pause
    goto END
)
echo     ✅ 创建完成
pause


REM ===============================
REM 3. 检查 Docker 是否运行
REM ===============================
echo [阶段 3] 检查 Docker Desktop 是否运行...
docker info >nul 2>&1
if errorlevel 1 (
    echo ⚠️ Docker 未运行，尝试启动 Docker Desktop...
    start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    echo 等待 Docker 启动中（最多 60 秒）...
    
    set /a counter=0
    :WAIT_DOCKER
    timeout /t 3 >nul
    docker info >nul 2>&1
    if errorlevel 1 (
        set /a counter+=3
        if !counter! geq 60 (
            echo ❌ Docker 启动超时，请手动启动.
            pause
            goto END
        )
        goto WAIT_DOCKER
    )
    echo     ✅ Docker 已启动
) else (
    echo     ✅ Docker 已经在运行
)
pause

REM ===============================
REM 4. 启动 Docker 容器
REM ===============================
echo [阶段 4] 启动 docker-compose 容器...
docker compose up -d --build
if errorlevel 1 (
    echo ❌ 启动容器失败，请检查 docker-compose.yml.
    pause
    goto END
)
echo     ✅ 容器已启动
pause

:END
echo ========================================
echo 🎉 全部步骤完成! 按任意键关闭窗口...
pause
endlocal

