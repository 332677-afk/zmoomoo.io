#!/bin/bash
# Auto-restart server wrapper
while true; do
    echo "[Restart Wrapper] Starting server..."
    npm start
    EXIT_CODE=$?
    if [ $EXIT_CODE -eq 0 ]; then
        echo "[Restart Wrapper] Server exited cleanly, restarting..."
    else
        echo "[Restart Wrapper] Server crashed with code $EXIT_CODE, restarting..."
    fi
    sleep 1
done
