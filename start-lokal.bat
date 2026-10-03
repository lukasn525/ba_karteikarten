@echo off
rem Startet die Karteikarten lokal und oeffnet den Browser.
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (py scripts\lokal.py %*) else (python scripts\lokal.py %*)
pause
