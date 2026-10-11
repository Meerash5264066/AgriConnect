"""Price history baseline service for agricultural commodity price lookups."""

import logging
import math
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional
import pandas as pd

from app.core.config import get_settings

logger = logging.getLogger(__name__)

REQUIRED_COLUMNS = {"State", "District", "Market", "Commodity", "Arrival_Date", "Modal_Price"}


class PriceHistoryError(Exception):
    """Base exception for price history lookup failures."""
    pass


class PriceHistoryFileNotFoundError(PriceHistoryError):
    """Raised when the price history dataset file cannot be located."""
    pass


class MalformedPriceDatasetError(PriceHistoryError):
    """Raised when the price dataset is corrupt, empty, or missing required columns."""
    pass


class PriceRecordNotFoundError(PriceHistoryError):
    """Raised when no historical price record matches the requested crop and market."""
    def __init__(self, crop: str, market: str, state_or_region: Optional[str] = None):
        super().__init__(f"No price records found for crop '{crop}' at market '{market}'.")
        self.crop = crop
        self.market = market
        self.state_or_region = state_or_region


class AmbiguousMarketMatchError(PriceHistoryError):
    """Raised when a market exists in multiple states and state_or_region was not specified."""
    def __init__(self, crop: str, market: str, candidate_states: List[str]):
        super().__init__(
            f"Market '{market}' exists in multiple states ({', '.join(candidate_states)}). "
            "Please specify state_or_region to disambiguate."
        )
        self.crop = crop
        self.market = market
        self.candidate_states = candidate_states


class AmbiguousDistrictMatchError(PriceHistoryError):
    """Raised when a market in the same state matches multiple distinct districts."""
    def __init__(self, crop: str, market: str, state: str, candidate_districts: List[str]):
        super().__init__(
            f"Market '{market}' in state '{state}' corresponds to multiple districts ({', '.join(candidate_districts)}). "
            "Cannot disambiguate without district specification."
        )
        self.crop = crop
        self.market = market
        self.state = state
        self.candidate_districts = candidate_districts


class InvalidPriceRecordError(PriceHistoryError):
    """Raised when matched dataset record contains invalid price value or date."""
    pass


class PriceHistoryService:
    """Service providing latest observed price lookups from historical APMC mandi arrivals."""

    def __init__(self, csv_path: Optional[Path] = None):
        self._custom_csv_path = csv_path
        self._df: Optional[pd.DataFrame] = None
        self._resolved_path: Optional[Path] = None

    def resolve_dataset_path(self) -> Path:
        """Resolve dataset file path reliably regardless of current working directory."""
        if self._custom_csv_path is not None:
            if self._custom_csv_path.is_file():
                return self._custom_csv_path
            raise PriceHistoryFileNotFoundError(
                f"Custom price lookup dataset not found at: {self._custom_csv_path}"
            )

        settings = get_settings()
        package_root = Path(__file__).resolve().parent.parent.parent

        candidate_paths = [
            settings.dataset_path / "price" / "price_history_latest.csv",
            package_root / "datasets" / "price" / "price_history_latest.csv",
            Path.cwd() / "datasets" / "price" / "price_history_latest.csv",
            Path.cwd() / "ai-service" / "datasets" / "price" / "price_history_latest.csv",
        ]

        for path in candidate_paths:
            if path.is_file():
                self._resolved_path = path
                return path

        raise PriceHistoryFileNotFoundError(
            f"Price history lookup file 'price_history_latest.csv' not found. "
            f"Checked paths: {[str(p) for p in candidate_paths]}"
        )

    def load_data(self) -> pd.DataFrame:
        """Load and cache the price history lookup CSV into memory."""
        if self._df is not None:
            return self._df

        resolved_path = self.resolve_dataset_path()
        logger.info("Loading price history dataset from: %s", resolved_path)

        try:
            df = pd.read_csv(resolved_path)
        except Exception as exc:
            logger.error("Failed to read price history CSV: %s", exc)
            raise MalformedPriceDatasetError(f"Failed to read price history CSV at {resolved_path}: {exc}") from exc

        missing_cols = REQUIRED_COLUMNS - set(df.columns)
        if missing_cols:
            raise MalformedPriceDatasetError(
                f"Price history dataset at {resolved_path} is missing required columns: {missing_cols}"
            )

        if df.empty:
            raise MalformedPriceDatasetError(f"Price history dataset at {resolved_path} is empty.")

        # Create normalized columns for fast case-insensitive & whitespace-stripped matching
        df["_norm_commodity"] = df["Commodity"].astype(str).str.strip().str.lower()
        df["_norm_market"] = df["Market"].astype(str).str.strip().str.lower()
        df["_norm_state"] = df["State"].astype(str).str.strip().str.lower()

        self._df = df
        logger.info("Successfully loaded %d price history records into memory.", len(df))
        return self._df

    def get_latest_price(
        self,
        crop: str,
        market: str,
        state_or_region: Optional[str] = None,
        requested_date: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Look up latest observed modal price for a given commodity and market."""
        df = self.load_data()

        norm_crop = crop.strip().lower()
        norm_market = market.strip().lower()
        norm_state = state_or_region.strip().lower() if state_or_region else None

        # Filter strictly by commodity and market
        matches = df[(df["_norm_commodity"] == norm_crop) & (df["_norm_market"] == norm_market)]

        if norm_state:
            matches = matches[matches["_norm_state"] == norm_state]

        if matches.empty:
            raise PriceRecordNotFoundError(crop=crop, market=market, state_or_region=state_or_region)

        # Ambiguity checks
        unique_states = matches["State"].unique().tolist()
        if len(unique_states) > 1:
            raise AmbiguousMarketMatchError(
                crop=crop,
                market=market,
                candidate_states=sorted(unique_states),
            )

        unique_districts = matches["District"].unique().tolist()
        if len(unique_districts) > 1:
            raise AmbiguousDistrictMatchError(
                crop=crop,
                market=market,
                state=unique_states[0],
                candidate_districts=sorted(unique_districts),
            )

        # If multiple records within same state and district, take the latest arrival date
        if len(matches) > 1:
            matches = matches.sort_values(by="Arrival_Date", ascending=False)

        selected_row = matches.iloc[0]

        # Validate modal price
        try:
            modal_price = float(selected_row["Modal_Price"])
            if modal_price <= 0.0 or not math.isfinite(modal_price):
                raise ValueError(f"Non-positive or non-finite price: {modal_price}")
        except Exception as exc:
            raise InvalidPriceRecordError(
                f"Invalid modal price '{selected_row.get('Modal_Price')}' in dataset: {exc}"
            ) from exc

        # Validate date
        arrival_date_str = str(selected_row["Arrival_Date"]).strip()
        try:
            datetime.strptime(arrival_date_str, "%Y-%m-%d")
        except ValueError as exc:
            raise InvalidPriceRecordError(
                f"Invalid arrival date '{arrival_date_str}' in dataset: {exc}"
            ) from exc

        # Handle data freshness and requested date disclosure
        clean_requested_date = requested_date.strip() if requested_date else None
        if clean_requested_date:
            freshness_note = (
                f"The requested forecast date is '{clean_requested_date}', but the latest available historical "
                f"observation in the dataset is from '{arrival_date_str}' (2025 records). This value is an unadjusted "
                f"historical baseline from {arrival_date_str}, NOT an evaluated prediction or forward-looking forecast for {clean_requested_date}."
            )
        else:
            freshness_note = (
                f"Latest observed historical arrival price from '{arrival_date_str}' (2025 dataset). "
                "Not a live real-time quote or future price forecast."
            )

        return {
            "crop": str(selected_row["Commodity"]).strip(),
            "market": str(selected_row["Market"]).strip(),
            "state": str(selected_row["State"]).strip(),
            "district": str(selected_row["District"]).strip(),
            "modal_price": modal_price,
            "currency": "INR",
            "unit": "unverified (typically per quintal in Mandi arrival reports)",
            "arrival_date": arrival_date_str,
            "requested_date": clean_requested_date,
            "is_historical_baseline": True,
            "data_freshness_note": freshness_note,
            "source": "AgriConnect Previous-Price Baseline",
            "disclaimer": (
                "This value is the latest observed historical modal price from the 2025 dataset. "
                "It is an unadjusted baseline reference and does not guarantee current market prices "
                "or future price movements."
            ),
        }


# Singleton service instance
_service_instance: Optional[PriceHistoryService] = None


def get_price_history_service() -> PriceHistoryService:
    """Return singleton PriceHistoryService instance."""
    global _service_instance
    if _service_instance is None:
        _service_instance = PriceHistoryService()
    return _service_instance
