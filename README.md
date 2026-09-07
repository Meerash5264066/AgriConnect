# AgriConnect — New Technology Stack

This package keeps the supplied AgriConnect Farmer and Buyer UI unchanged while placing it inside a modern application structure.

## Included

### Frontend
- Next.js
- React
- TypeScript
- Tailwind CSS dependency/config-ready
- Font Awesome
- Chart.js
- TanStack Query
- Zod
- React Hook Form

The original UI is preserved verbatim at `frontend/public/agriconnect-ui.html`. The Next.js page displays that exact UI so no existing Farmer/Buyer screens, modules, buttons, charts, forms, or tools are removed or redesigned.

### Backend
- NestJS
- Fastify
- TypeScript
- REST API
- JWT dependency-ready
- HTTP-only cookie architecture-ready
- Swagger

### Database
- PostgreSQL
- Supabase
- Prisma
- pgvector SQL setup

### AI
- Python
- FastAPI
- pandas
- NumPy
- scikit-learn
- PyTorch
- OpenCV
- Pillow
- YOLO-ready endpoint

### External service
- Open-Meteo can be connected from the backend/AI service for live weather.

## Run

1. Frontend:
   `cd frontend`
   `npm install`
   `npm run dev`

2. Backend:
   `cd backend`
   `npm install`
   `npx prisma generate`
   `npm run start:dev`

3. AI service:
   `cd ai-service`
   `python -m venv .venv`
   Activate the environment, then:
   `pip install -r requirements.txt`
   `uvicorn main:app --reload --port 8000`

## Important

The original HTML currently contains its own browser-side demo/authentication and UI state. This migration intentionally preserves that behavior and visual output. The NestJS/Prisma/Supabase/JWT integration is scaffolded separately so the UI can be connected to the real database without redesigning it.

The supplied file already contains Farmer and Buyer authentication, registration, dashboards, side navigation, crop/contract tools and AI-related modules; those UI elements are retained in the preserved HTML.
