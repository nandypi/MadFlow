REM This batch file is used to start the FastAPI server for the VivaFlow project.

@echo off

cd /d "C:\Users\nandy\Documents\Code\VivaFlow"

REM Start the FastAPI server
.venv\Scripts\python.exe -m uvicorn app:app --host 127.0.0.1 --port 8765