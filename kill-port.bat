@echo off
echo Matando processos na porta 3000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do (
    echo Matando processo %%a
    taskkill /F /PID %%a 2>nul
)
echo Pronto! Pressione qualquer tecla para sair.
pause >nul