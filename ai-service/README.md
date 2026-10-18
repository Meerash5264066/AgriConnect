# AgriConnect AI Service (Phase 13: Foundation)

This service provides an independent, modular Python FastAPI microservice architecture designed to host and serve machine learning inference pipelines for the AgriConnect platform.

> [!NOTE]
> **Phase 13 Status**: The AI service foundation, route schemas, validation rules, model registry, and testing harness are fully operational. ML models are **not yet trained**; dataset ingestion, model training, evaluation, and serialized artifact generation are scheduled for **Phase 14**. Unimplemented model endpoints deterministically return HTTP 501 Not Implemented and will **never** return fake, synthetic, or fabricated predictions.

---

## Architecture Overview

```
Frontend (Next.js 16 + React 19)
       │
       ▼ (HTTP REST)
Backend Gateway (NestJS 11 + Fastify)
       │
       ▼ (Internal HTTP REST)
AI Service (Python 3.12+ FastAPI Microservice)
       ├── Soil & Climate Crop Recommendation (scikit-learn / LightGBM)
       ├── Mandi Commodity Price Prediction (XGBoost)
       ├── Regional Produce Demand Forecasting (scikit-learn / Time-series)
       └── Leaf Disease Vision Diagnosis (YOLO / PyTorch)
```

In the target architecture:
- The Next.js frontend interacts directly with the NestJS API gateway.
- The NestJS backend coordinates business logic, authentication, and persistence (Supabase PostgreSQL via Prisma), calling the FastAPI AI service over internal networking.
- The AI service remains completely isolated, stateless, and independently testable.

---

## Directory Structure

```
ai-service/
├── app/
│   ├── __init__.py
│   ├── main.py                  # FastAPI application entrypoint & middleware
│   ├── core/
│   │   ├── __init__.py
│   │   └── config.py            # Pydantic Settings configuration & CORS
│   ├── schemas/
│   │   ├── __init__.py
│   │   └── common.py            # Pydantic request, response, and error models
│   ├── services/
│   │   ├── __init__.py
│   │   └── model_registry.py    # Model artifact tracking, lazy caching & state
│   └── routes/
│       ├── __init__.py
│       ├── health.py            # Liveness (/health) and readiness (/ready) probes
│       ├── crop.py              # Crop recommendation route (/api/v1/crop/recommend)
│       ├── price.py             # Mandi price prediction route (/api/v1/price/predict)
│       ├── demand.py            # Produce demand prediction route (/api/v1/demand/predict)
│       └── disease.py           # Leaf image disease route (/api/v1/disease/detect)
├── datasets/
│   ├── crop_recommendation/     # Raw soil/climate datasets (Phase 14, git-ignored)
│   ├── price/                   # Historical Mandi price data (Phase 14, git-ignored)
│   ├── demand/                  # Regional transaction & demand data (Phase 14, git-ignored)
│   └── disease/                 # Leaf image datasets (Phase 14, git-ignored)
├── models/                      # Serialized ML model weights (.joblib, .pt) (git-ignored)
├── training/
│   └── README.md                # Phase 14 training pipeline roadmap & standards
├── tests/
│   ├── __init__.py
│   └── test_health.py           # Pytest test suite for probes, schemas & errors
├── .env.example                 # Template for environment variables
├── .gitignore                   # Excludes venv, cached models, and datasets
├── requirements.txt             # Pinned Python package dependencies
├── main.py                      # Compatibility shim
└── README.md                    # Service documentation
```

---

## Prerequisites

- **Python**: Version 3.12 or 3.13 recommended.
- **Git** (for version control).
- **PowerShell** (Windows) or **Bash** (macOS/Linux).

---

## Setup & Installation

### 1. Windows (PowerShell)

Open PowerShell and navigate to the `ai-service` directory:

```powershell
cd d:\AgriConnect\AgriConnect\ai-service

# Create virtual environment
python -m venv .venv

# Activate virtual environment
.\.venv\Scripts\Activate.ps1

# Upgrade pip and install dependencies
python -m pip install --upgrade pip
pip install -r requirements.txt
```

> [!TIP]
> If script execution is restricted on Windows PowerShell, run:
> `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` before activating the virtual environment.

### 2. macOS / Linux (Bash)

```bash
cd ai-service

# Create virtual environment
python3 -m venv .venv

# Activate virtual environment
source .venv/bin/activate

# Upgrade pip and install dependencies
python -m pip install --upgrade pip
pip install -r requirements.txt
```

---

## Configuration

The service uses `pydantic-settings` to load configuration from environment variables or a `.env` file.

Copy the provided template:

```powershell
# Windows PowerShell
Copy-Item .env.example .env

# macOS / Linux
cp .env.example .env
```

### Configuration Variables

| Variable | Default Value | Description |
| :--- | :--- | :--- |
| `APP_NAME` | `AgriConnect AI Service` | Service display name in docs and logs |
| `APP_VERSION` | `1.0.0` | Application semantic version |
| `APP_ENV` | `development` | Deployment environment (`development`, `production`) |
| `AI_HOST` | `127.0.0.1` | Local listening host |
| `AI_PORT` | `8000` | Local port number |
| `AI_API_PREFIX` | `/api/v1` | URL prefix for AI inference endpoints |
| `LOG_LEVEL` | `INFO` | Logging level (`DEBUG`, `INFO`, `WARNING`, `ERROR`) |
| `FRONTEND_URL` | `http://localhost:3000` | Allowed origin for frontend requests |
| `BACKEND_URL` | `http://localhost:3001` | Allowed origin for backend gateway |
| `MODEL_DIR` | `models` | Directory path containing trained model binaries |
| `DATASET_DIR` | `datasets` | Directory path containing raw dataset files |
| `MAX_UPLOAD_SIZE_MB` | `10` | Maximum allowed image upload size in MB |
| `PRICE_TRENDS_DB_PATH` | `None` | Custom path to `price_trends.sqlite` (e.g. on Render Persistent Disk `/var/data/price_trends.sqlite`) |
| `PRICE_TRENDS_DOWNLOAD_URL` | `None` | Download URL to fetch `price_trends.sqlite` during Render build |

---

## Market Trends Dataset Deployment (Render / Cloud)

The historical APMC market trends database `price_trends.sqlite` contains **5,814,165 records** (~1.63 GB). Because it exceeds GitHub's 100 MB file limit, it is excluded from Git via `.gitignore`.

To provide `price_trends.sqlite` on Render:

### Option A: Render Persistent Disk (Recommended)
1. In your Render Dashboard, add a **Persistent Disk** (e.g. 5 GB or 10 GB) with Mount Path `/var/data`.
2. Copy `price_trends.sqlite` into `/var/data/price_trends.sqlite`.
3. Set the Environment Variable:
   ```
   PRICE_TRENDS_DB_PATH=/var/data/price_trends.sqlite
   ```
   The service automatically detects and indexes this persistent location across restarts.

### Option B: Cloud Storage / Release Asset Download
1. Host `price_trends.sqlite` as a GitHub Release asset (supports up to 2 GB per file) or in an S3/R2 bucket.
2. In your Render Environment Variables, set:
   ```
   PRICE_TRENDS_DOWNLOAD_URL=https://.../price_trends.sqlite
   ```
3. Update your Render Build Command:
   ```bash
   pip install -r requirements.txt && python scripts/download_price_trends.py
   ```

---

## Running the Service

### Development Mode (with hot-reload)

```powershell
# From the ai-service directory:
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### Production / Container Mode

To bind on all interfaces inside a Docker container:

```bash
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
```

---

## Interactive Documentation & Endpoints

Once running, access the following URLs in your browser:

- **Root Info**: [http://127.0.0.1:8000/](http://127.0.0.1:8000/)
- **Liveness Probe**: [http://127.0.0.1:8000/health](http://127.0.0.1:8000/health)
- **Readiness Probe**: [http://127.0.0.1:8000/ready](http://127.0.0.1:8000/ready)
- **Interactive Swagger Docs**: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
- **ReDoc UI**: [http://127.0.0.1:8000/redoc](http://127.0.0.1:8000/redoc)
- **OpenAPI JSON**: [http://127.0.0.1:8000/openapi.json](http://127.0.0.1:8000/openapi.json)

### Available API Endpoints

| Method | Endpoint | Description | Phase 13 Expected Status |
| :--- | :--- | :--- | :--- |
| `GET` | `/` | Root info & service directory | `200 OK` |
| `GET` | `/health` | Basic service liveness | `200 OK` (`{"status": "healthy"}`) |
| `GET` | `/ready` | Readiness check with model status | `200 OK` (`"status": "ready"`, all models `"not_trained"`) |
| `POST` | `/api/v1/crop/recommend` | Soil & climate crop recommendation | `501 Not Implemented` (valid input) / `422` (invalid input) |
| `POST` | `/api/v1/price/predict` | Agricultural Mandi price forecast | `501 Not Implemented` (valid input) / `422` (invalid input) |
| `POST` | `/api/v1/demand/predict` | Regional produce demand prediction | `501 Not Implemented` (valid input) / `422` (invalid input) |
| `POST` | `/api/v1/disease/detect` | Crop leaf image disease detection | `501 Not Implemented` (valid image) / `415` (bad type) / `413` (too large) |

---

## Running the Automated Test Suite

Run pytest to execute the comprehensive test suite:

```powershell
# Ensure virtual environment is activated:
python -m pytest tests/ -v
```

The test suite validates:
1. Root `/` endpoint metadata.
2. Liveness (`/health`) payload.
3. Readiness (`/ready`) model status schema.
4. Registration of all routes in OpenAPI specification.
5. Deterministic `501 Not Implemented` response for unimplemented models (strictly checking that no fake predictions are returned).
6. Strict validation and rejection (HTTP 422) of invalid numeric inputs (negative values, out-of-range pH, non-numeric strings).
7. Image file validation (HTTP 415 on bad file formats / corrupt images, and HTTP 501 on valid images pending trained models).

---

## Dataset and Model Storage Policy

To keep the repository lightweight and secure:
- **No large datasets or binaries in Git**: `datasets/` and `models/` contain `.gitkeep` markers so the folder hierarchy is committed, but all CSVs, JSONs, images, `.joblib`, `.pkl`, and `.pt` weights are strictly ignored in `.gitignore`.
- **No fake model stubs**: Empty or dummy `.pkl` files are forbidden. The `ModelRegistry` detects artifact presence directly.

---

## Roadmap: Phase 14 & Phase 15

### Phase 14: Model Training & Evaluation
1. Download verified agricultural datasets into `datasets/<task>/`.
2. Implement data preprocessing, exploratory data analysis, and feature scaling.
3. Train scikit-learn / LightGBM models for crop recommendation.
4. Train regression models for commodity price forecasting and regional demand.
5. Train or fine-tune YOLO / CNN vision models for leaf disease detection.
6. Export serialized model weights into `models/`.
7. Implement inference pipelines in the FastAPI routes to load models and serve predictions.

### Phase 15: NestJS Gateway Integration
1. Configure NestJS `AiModule` and HTTP client service connecting to `AI_SERVICE_URL`.
2. Add rate limiting, authentication, and caching at the NestJS layer.
3. Wire UI components in Next.js to the NestJS AI endpoints.
