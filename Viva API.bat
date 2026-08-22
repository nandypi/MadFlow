REM This batch file is used to start the FastAPI server for the VivaFlow project.

@echo off

cd /d "C:\Users\nandy\Documents\Code\VivaFlow"

REM Activate the virtual environment
call ".venv\Scripts\activate.bat"

REM Start the FastAPI server
uvicorn app:app --host 127.0.0.1 --port 8765