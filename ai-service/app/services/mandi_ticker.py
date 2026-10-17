"""APMC Mandi Price Ticker Service.

Provides traceable agricultural commodity price records sourced from official
government APMC daily arrivals (Agmarknet / Open Government Data Platform).
Enforces correct unit conversion (₹/kg = ₹/quintal ÷ 100) and explicit freshness disclosures.
Supports live government API integration via DATA_GOV_IN_API_KEY with verified baseline fallback.
"""

import logging
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
import pandas as pd
import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)

# Preferred broad selection of commodities requested for the expanded ticker (35+ commodities)
PRIORITY_COMMODITIES = [
    "Tomato",
    "Onion",
    "Potato",
    "Wheat",
    "Paddy (Common)",
    "Paddy (Dhan)(Common)",
    "Maize",
    "Cotton",
    "Groundnut",
    "Soyabean",
    "Turmeric",
    "Dry Chillies",
    "Green Chilli",
    "Banana",
    "Mango",
    "Brinjal",
    "Cabbage",
    "Cauliflower",
    "Bengal Gram (Gram)(Whole)",
    "Moong (Green Gram)",
    "Urad (Black Gram)",
    "Gur (Jaggery)",
    "Bottle gourd",
    "Garlic",
    "Ginger (Green)",
    "Mustard",
    "Carrot",
    "Apple",
    "Lemon",
    "Capsicum",
    "Papaya",
    "Coriander (Leaves)",
    "Pomegranate",
    "Watermelon",
    "Grapes",
    "Coconut",
    "Jute",
]

# Government of India Open Government Data (data.gov.in) Agmarknet Daily Mandi Arrivals Resource ID
OGD_AGMARKNET_RESOURCE_ID = "9ef84268-d588-465a-a308-a864a43d0070"
OGD_BASE_URL = f"https://api.data.gov.in/resource/{OGD_AGMARKNET_RESOURCE_ID}"


class MandiTickerService:
    """Service serving expanded APMC mandi price ticker data."""

    def __init__(self, csv_path: Optional[Path] = None):
        self._custom_csv_path = csv_path
        self._cached_records: Optional[List[Dict[str, Any]]] = None
        self._cached_meta: Optional[Dict[str, Any]] = None
        self._last_loaded_timestamp: float = 0.0
        self._cache_ttl_seconds: int = 900  # 15 minutes periodic cache TTL

    def _resolve_dataset_path(self) -> Path:
        if self._custom_csv_path and self._custom_csv_path.is_file():
            return self._custom_csv_path

        settings = get_settings()
        package_root = Path(__file__).resolve().parent.parent.parent

        candidate_paths = [
            settings.dataset_path / "price" / "price_history_latest.csv",
            package_root / "datasets" / "price" / "price_history_latest.csv",
            Path.cwd() / "datasets" / "price" / "price_history_latest.csv",
            Path.cwd() / "ai-service" / "datasets" / "price" / "price_history_latest.csv",
        ]

        for p in candidate_paths:
            if p.is_file():
                return p

        raise FileNotFoundError(f"Price history dataset not found at any of: {[str(p) for p in candidate_paths]}")

    def _fetch_live_agmarknet_api(self, api_key: str, state_filter: Optional[str] = None) -> Optional[List[Dict[str, Any]]]:
        """Attempt to fetch latest live mandi records from Government OGD platform."""
        try:
            params: Dict[str, Any] = {
                "api-key": api_key,
                "format": "json",
                "limit": 100,
            }
            if state_filter:
                params["filters[state]"] = state_filter

            logger.info("Attempting live Agmarknet fetch from official OGD API with limit=100")
            with httpx.Client(timeout=4.0) as client:
                res = client.get(OGD_BASE_URL, params=params)
                if res.status_code == 200:
                    data = res.json()
                    records_raw = data.get("records", [])
                    if records_raw and len(records_raw) >= 5:
                        parsed: List[Dict[str, Any]] = []
                        seen_comm = set()
                        for r in records_raw:
                            comm = str(r.get("commodity") or r.get("Commodity") or "").strip()
                            if not comm or comm.lower() in seen_comm:
                                continue

                            qtl_modal = float(r.get("modal_price") or r.get("Modal_Price") or 0)
                            if qtl_modal <= 0:
                                continue

                            qtl_min = float(r.get("min_price") or r.get("Min_Price") or qtl_modal)
                            qtl_max = float(r.get("max_price") or r.get("Max_Price") or qtl_modal)
                            arr_date_raw = str(r.get("arrival_date") or r.get("Arrival_Date") or "")

                            # Format date as YYYY-MM-DD
                            try:
                                dt = pd.to_datetime(arr_date_raw, dayfirst=True)
                                arr_date = dt.strftime("%Y-%m-%d")
                            except Exception:
                                arr_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")

                            kg_modal = round(qtl_modal / 100.0, 2)
                            kg_min = round(qtl_min / 100.0, 2)
                            kg_max = round(qtl_max / 100.0, 2)

                            parsed.append({
                                "commodity": comm,
                                "state": str(r.get("state") or r.get("State") or ""),
                                "district": str(r.get("district") or r.get("District") or ""),
                                "market": str(r.get("market") or r.get("Market") or "APMC Mandi"),
                                "modal_price_per_kg": kg_modal,
                                "min_price_per_kg": kg_min,
                                "max_price_per_kg": kg_max,
                                "modal_price_per_quintal": round(qtl_modal, 2),
                                "min_price_per_quintal": round(qtl_min, 2),
                                "max_price_per_quintal": round(qtl_max, 2),
                                "price_unit": "₹/kg",
                                "original_unit": "₹/quintal",
                                "arrival_date": arr_date,
                                "source": "Agmarknet APMC Daily Arrivals (Govt. of India)",
                                "freshness": "Live APMC Mandi Observation",
                                "is_live_stream": True,
                            })
                            seen_comm.add(comm.lower())
                            if len(parsed) >= 45:
                                break

                        if parsed:
                            logger.info("Successfully retrieved %d live records from Agmarknet OGD API", len(parsed))
                            return parsed
        except Exception as exc:
            logger.warning("Live Agmarknet OGD API call failed or timed out: %s. Using verified dataset.", exc)
        return None

    def load_ticker_records(self, state_filter: Optional[str] = None, force_refresh: bool = False) -> List[Dict[str, Any]]:
        """Load and curate traceable APMC commodity price records."""
        now = time.time()
        # Check cache if valid and not force_refresh
        if not force_refresh and state_filter is None and self._cached_records is not None:
            if (now - self._last_loaded_timestamp) < self._cache_ttl_seconds:
                return self._cached_records

        # 1. Attempt live Agmarknet API if configured
        api_key = os.getenv("DATA_GOV_IN_API_KEY") or os.getenv("AGMARKNET_API_KEY")
        if api_key:
            live_records = self._fetch_live_agmarknet_api(api_key=api_key, state_filter=state_filter)
            if live_records:
                if state_filter is None:
                    self._cached_records = live_records
                    self._last_loaded_timestamp = now
                    self._cached_meta = {"is_live": True}
                return live_records

        # 2. Verified baseline dataset from price_history_latest.csv
        dataset_path = self._resolve_dataset_path()
        logger.info("Loading APMC ticker data from verified dataset: %s", dataset_path)

        df = pd.read_csv(dataset_path)

        # Columns expected: State, District, Market, Commodity, Arrival_Date, Modal_Price
        df["Arrival_Date"] = pd.to_datetime(df["Arrival_Date"], errors="coerce")
        df = df.dropna(subset=["Commodity", "Modal_Price", "Arrival_Date"])
        df = df[df["Modal_Price"] > 0]

        if state_filter:
            df = df[df["State"].str.lower() == state_filter.strip().lower()]

        # Sort descending by Arrival_Date to get the latest available market observations
        df = df.sort_values(by="Arrival_Date", ascending=False)

        curated_records: List[Dict[str, Any]] = []
        seen_commodities = set()

        # Step 1: Gather latest observation for priority commodities
        for commodity in PRIORITY_COMMODITIES:
            match = df[df["Commodity"].str.lower() == commodity.lower()]
            if not match.empty:
                row = match.iloc[0]
                qtl_price = float(row["Modal_Price"])
                kg_price = round(qtl_price / 100.0, 2)
                arr_date = row["Arrival_Date"].strftime("%Y-%m-%d")

                curated_records.append({
                    "commodity": str(row["Commodity"]),
                    "state": str(row["State"]),
                    "district": str(row["District"]),
                    "market": str(row["Market"]),
                    "modal_price_per_kg": kg_price,
                    "modal_price_per_quintal": round(qtl_price, 2),
                    "price_unit": "₹/kg",
                    "original_unit": "₹/quintal",
                    "arrival_date": arr_date,
                    "source": "Agmarknet APMC Daily Arrivals (Govt. of India)",
                    "freshness": "Latest Recorded APMC Arrivals",
                    "is_live_stream": False,
                })
                seen_commodities.add(str(row["Commodity"]).lower())

        # Step 2: Include additional high-volume commodities if available up to 45 items
        for _, row in df.iterrows():
            comm_lower = str(row["Commodity"]).lower()
            if comm_lower not in seen_commodities and len(curated_records) < 45:
                qtl_price = float(row["Modal_Price"])
                kg_price = round(qtl_price / 100.0, 2)
                arr_date = row["Arrival_Date"].strftime("%Y-%m-%d")

                curated_records.append({
                    "commodity": str(row["Commodity"]),
                    "state": str(row["State"]),
                    "district": str(row["District"]),
                    "market": str(row["Market"]),
                    "modal_price_per_kg": kg_price,
                    "modal_price_per_quintal": round(qtl_price, 2),
                    "price_unit": "₹/kg",
                    "original_unit": "₹/quintal",
                    "arrival_date": arr_date,
                    "source": "Agmarknet APMC Daily Arrivals (Govt. of India)",
                    "freshness": "Latest Recorded APMC Arrivals",
                    "is_live_stream": False,
                })
                seen_commodities.add(comm_lower)

        if state_filter is None:
            self._cached_records = curated_records
            self._last_loaded_timestamp = now
            self._cached_meta = {"is_live": False}

        return curated_records

    def get_ticker_payload(self, state_filter: Optional[str] = None, force_refresh: bool = False) -> Dict[str, Any]:
        """Generate structured API response with verified metadata and freshness disclosures."""
        records = self.load_ticker_records(state_filter=state_filter, force_refresh=force_refresh)
        now_iso = datetime.now(timezone.utc).isoformat()

        # Determine latest market date across records
        latest_market_date = max((r["arrival_date"] for r in records), default="2025-12-30")
        is_live = any(r.get("is_live_stream") for r in records)

        freshness_label = "Live APMC Mandi Observations" if is_live else f"Latest Available Mandi Records ({latest_market_date})"

        return {
            "status": "success",
            "count": len(records),
            "retrieved_at": now_iso,
            "latest_market_date": latest_market_date,
            "is_live": is_live,
            "data_source": "Agmarknet APMC Daily Arrivals Dataset (Government of India)",
            "data_freshness_label": freshness_label,
            "freshness_badge": "Live Mandi Stream" if is_live else "Latest Recorded APMC Arrivals",
            "unit_standard": "All prices converted to ₹/kg from standard APMC ₹/quintal records (₹/kg = ₹/quintal ÷ 100)",
            "disclaimer": (
                "Market prices reflect official recorded APMC mandi arrival modal prices. "
                "Baseline records are displayed with actual arrival observation dates."
            ),
            "cache_ttl_seconds": self._cache_ttl_seconds,
            "records": records,
        }


_ticker_service: Optional[MandiTickerService] = None


def get_mandi_ticker_service() -> MandiTickerService:
    """Retrieve singleton instance of MandiTickerService."""
    global _ticker_service
    if _ticker_service is None:
        _ticker_service = MandiTickerService()
    return _ticker_service
