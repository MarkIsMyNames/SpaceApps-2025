# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Space Apps 2025 project featuring an image gallery application with a React/TypeScript frontend and Python Flask backend. The app displays images served from the backend in a simple gallery interface.

## Tech Stack

**Frontend:**
- React 19 with TypeScript
- Vite as build tool and dev server
- Axios for HTTP requests
- Tailwind CSS for styling
- ESLint for code quality

**Backend:**
- Python with Flask
- Serves images from `/backend/images/` directory
- Provides REST API endpoints for image listing and serving

## Development Commands

### Frontend (from `/frontend` directory)

```bash
# Install dependencies
npm install

# Start dev server (runs on http://localhost:5173)
npm run dev

# Build for production
npm run build

# Lint code
npm run lint

# Preview production build
npm run preview
```

### Backend (from `/backend` directory)

```bash
# Run Flask server (runs on http://localhost:5000)
python app.py
```

### Running the Full Application

1. Start the backend server first: `cd backend && python app.py`
2. In a separate terminal, start the frontend: `cd frontend && npm run dev`
3. Access the application at `http://localhost:5173`

## Architecture

### API Communication

- Frontend uses Vite proxy to forward `/api/*` requests to `http://localhost:5000`
- Backend exposes two endpoints:
  - `GET /api/images` - Returns list of image filenames
  - `GET /images/<filename>` - Serves individual images
- Frontend directly accesses images via `http://localhost:5000/images/<filename>` (not proxied)

### Project Structure

```
frontend/
├── src/
│   ├── App.tsx          # Main component with image gallery logic
│   ├── main.tsx         # React app entry point
│   ├── App.css          # Component styles
│   └── index.css        # Global styles
├── vite.config.ts       # Vite config with API proxy setup
└── package.json

backend/
├── app.py              # Flask server with image API
└── images/             # Static image directory
```

### State Management

- Currently uses React's `useState` and `useEffect` hooks for simple state management
- No external state management library (Redux, Zustand, etc.) is used

## Development Notes

- Backend serves images from the `backend/images/` directory
- Currently only contains `vite.svg` as a placeholder
- Frontend expects backend to be running on port 5000
- Frontend dev server runs on port 5173
- CORS is implicitly handled via Vite proxy for `/api` routes, but direct image requests go to backend
