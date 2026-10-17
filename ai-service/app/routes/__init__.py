"""Routes package initialization."""
from app.routes.health import router as health_router
from app.routes.crop import router as crop_router
from app.routes.price import router as price_router
from app.routes.demand import router as demand_router
from app.routes.disease import router as disease_router
from app.routes.market_trends import router as market_trends_router
from app.routes.chat import router as chat_router

__all__ = [
    "health_router",
    "crop_router",
    "price_router",
    "demand_router",
    "disease_router",
    "market_trends_router",
    "chat_router",
]

