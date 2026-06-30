@echo off
title Server Absensi Konveksi
cd /d "%~dp0"
echo ===============================================
echo  Menjalankan Server Absensi + Konveksi...
echo  Folder: %cd%
echo ===============================================
echo.

:loop
node backend_terpadu_absensi_konveksi.js
echo.
echo [PERINGATAN] Server berhenti / crash. Restart otomatis dalam 5 detik...
timeout /t 5 /nobreak >nul
goto loop
