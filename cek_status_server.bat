@echo off
title Cek Status Server Absensi
echo ===============================================
echo  Mengecek status Server Absensi Konveksi...
echo ===============================================
echo.

powershell -NoProfile -Command ^
  "try { $r = Invoke-RestMethod -Uri 'http://localhost:8081/api/status' -TimeoutSec 5; " ^
  "Write-Host ''; Write-Host '[OK] Server AKTIF' -ForegroundColor Green; " ^
  "Write-Host ('Status      : ' + $r.status); " ^
  "Write-Host ('Total Log   : ' + $r.totalLogs); " ^
  "Write-Host ('Waktu Server: ' + $r.serverTime); " ^
  "} catch { " ^
  "Write-Host ''; Write-Host '[GAGAL] Server TIDAK AKTIF atau tidak bisa dijangkau.' -ForegroundColor Red; " ^
  "Write-Host 'Pastikan sudah dijalankan: start_absensi_server.bat'; " ^
  "}"

echo.
echo ===============================================
pause
