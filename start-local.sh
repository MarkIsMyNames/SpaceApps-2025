#!/bin/bash
# Local development startup script

# Start backend
echo "Starting backend..."
cd backend || { echo "Could not find backend directory"; exit 1; }
python app.py &
BACKEND_PID=$!
cd ..

# Start frontend
echo "Installing frontend dependencies and starting frontend..."
cd frontend || { echo "Could not find frontend directory"; exit 1; }
npm install
npm run dev &
FRONTEND_PID=$!
cd ..

# Wait for services to be ready
echo "Waiting for services to start..."
sleep 5

# Check health
echo "Checking service health..."
if curl -f http://localhost:5000/api/tiles/meta > /dev/null 2>&1; then
    echo "Backend is healthy"
else
    echo "Backend might not be ready yet"
fi

if curl -f http://localhost:3000/ > /dev/null 2>&1; then
    echo "Frontend is healthy"
else
    echo "Frontend might not be ready yet"
fi

echo ""
echo "   Application is running!"
