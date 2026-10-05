@echo off
setlocal

echo.
echo ============================================================
echo  Agentia Local Quality Gate - PromotionProof
echo ============================================================
echo.

set "ROOT=%~dp0"

powershell.exe ^
  -NoProfile ^
  -ExecutionPolicy Bypass ^
  -File "%ROOT%promotion-proof\check.ps1"

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
