# Colossal Captures

A high-performance image file viewer for displaying large Mars images with dynamic loading and caching.

## Getting Started

Follow these steps to get your application running locally.

### 1. Clone the Repository
```bash
git clone https://github.com/MarkIsMyNames/SpaceApps-2025.git
cd SpaceApps-2025
```

### 2. Python Backend Setup

1. **Navigate to the Backend Directory**
    ```bash
    cd backend
    ```

2. **Install Required Packages**
    ```bash
    pip install Flask flask-cors Pillow watchdog
    ```

3. **Run the Python Server**
    ```bash
    python app.py
    ```
    Backend will be running at http://localhost:5000

### 3. React Frontend Setup

1. **Navigate to the Frontend Directory**
    ```bash
    cd frontend
    ```

2. **Install Dependencies**
    ```bash
    npm install
    ```

3. **Start the Development Server**
    ```bash
    npm run dev
    ```
    Frontend will be running at http://localhost:5173


## Project Dependencies

| Dependency | Version | Link | Purpose |
|------------|---------|------|---------|
| **Flask** | 3.1.2 | [https://flask.palletsprojects.com/](https://flask.palletsprojects.com/) | Web framework for serving API endpoints and files |
| **flask-cors** | 6.0.1 | [https://flask-cors.readthedocs.io/](https://flask-cors.readthedocs.io/) | Handle Cross-Origin Resource Sharing (CORS) for frontend-backend communication |
| **Pillow** | 11.0.0 | [https://pillow.readthedocs.io/](https://pillow.readthedocs.io/) | Read image dimensions from files and validate image formats |
| **watchdog** | 6.0.0 | [https://github.com/gorakhargosh/watchdog](https://github.com/gorakhargosh/watchdog) | Monitor file directories for new/modified files and automatically update database |
| **react** | ^19.1.1 | [https://react.dev/](https://react.dev/) | UI component framework for building the file viewer interface |
| **react-dom** | ^19.1.1 | [https://react.dev/](https://react.dev/) | React renderer for DOM manipulation |
| **axios** | ^1.12.2 | [https://axios-http.com/](https://axios-http.com/) | HTTP client for fetching file metadata from backend API |
| **vite** | ^7.1.7 | [https://vitejs.dev/](https://vitejs.dev/) | Fast build tool and development server with HMR |
| **typescript** | ~5.9.3 | [https://www.typescriptlang.org/](https://www.typescriptlang.org/) | Type-safe JavaScript for better code quality |
| **@vitejs/plugin-react** | ^5.0.4 | [https://github.com/vitejs/vite-plugin-react](https://github.com/vitejs/vite-plugin-react) | Vite plugin for React Fast Refresh support |
| **@types/react** | ^19.1.16 | [https://www.npmjs.com/package/@types/react](https://www.npmjs.com/package/@types/react) | TypeScript type definitions for React |
| **@types/react-dom** | ^19.1.9 | [https://www.npmjs.com/package/@types/react-dom](https://www.npmjs.com/package/@types/react-dom) | TypeScript type definitions for ReactDOM |
| **@types/node** | ^24.6.0 | [https://www.npmjs.com/package/@types/node](https://www.npmjs.com/package/@types/node) | TypeScript type definitions for Node.js APIs |
| **eslint** | ^9.36.0 | [https://eslint.org/](https://eslint.org/) | JavaScript/TypeScript linter for code quality |
| **@eslint/js** | ^9.36.0 | [https://eslint.org/](https://eslint.org/) | ESLint JavaScript rules configuration |
| **typescript-eslint** | ^8.45.0 | [https://typescript-eslint.io/](https://typescript-eslint.io/) | ESLint plugin for TypeScript support |
| **eslint-plugin-react-hooks** | ^5.2.0 | [https://www.npmjs.com/package/eslint-plugin-react-hooks](https://www.npmjs.com/package/eslint-plugin-react-hooks) | ESLint rules for React Hooks best practices |
| **eslint-plugin-react-refresh** | ^0.4.22 | [https://github.com/ArnaudBarre/eslint-plugin-react-refresh](https://github.com/ArnaudBarre/eslint-plugin-react-refresh) | ESLint plugin for React Fast Refresh compatibility |
| **globals** | ^16.4.0 | [https://github.com/sindresorhus/globals](https://github.com/sindresorhus/globals) | Global variable definitions for ESLint |

| Table of Reference|
|-------------------|
| **Mars Viking MDIM21 Color Mosaic Global 232m** | NASA Solar System Treks Project (SSTP), Jet Propulsion Laboratory (JPL), California Institute of Technology | [https://trek.nasa.gov/tiles/apidoc/trekAPI.html?body=mars](https://trek.nasa.gov/tiles/apidoc/trekAPI.html?body=mars) | Global color mosaic of Mars generated from Viking Orbiter imagery, provided via NASA Trek Web Map Tile Service (WMTS). Accessed October 2025. |
