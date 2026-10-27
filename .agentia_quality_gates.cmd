@echo off
setlocal EnableExtensions

cd /d "%~dp0"

echo.
echo ============================================================
echo  Agentia Local Quality Gate - PromotionProof Plugin
echo ============================================================
echo.

call agentia promotion-proof check --story US-0000025

set "PP_EXIT=%ERRORLEVEL%"

echo.

if not "%PP_EXIT%"=="0" (
    echo ============================================================
    echo  PromotionProof BLOCKED the Agentia workflow.
    echo  Exit code: %PP_EXIT%
    echo ============================================================
    exit /b %PP_EXIT%
)

echo ============================================================
echo  PromotionProof PASSED.
echo ============================================================

exit /b 0