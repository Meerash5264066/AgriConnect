"""Agricultural Market Trend Analysis service.

Processes APMC mandi arrival records to compute historical price movements,
temporal aggregations (daily, weekly, monthly), period-over-period percentage changes,
standardized trend classifications, peer market comparisons, and farmer insights.
"""

import logging
import math
import os
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from app.core.config import get_settings
from app.schemas.common import (
    MarketComparisonItem,
    MarketFilterOptionsResponse,
    MarketTrendPoint,
    MarketTrendsResponse,
)

logger = logging.getLogger(__name__)

TREND_THRESHOLD_PERCENT = 3.0

POPULAR_COMMODITIES = [
    "Tomato",
    "Onion",
    "Potato",
    "Wheat",
    "Rice",
    "Banana",
    "Green Chilli",
    "Brinjal",
    "Cauliflower",
    "Cabbage",
    "Apple",
    "Maize",
]


class MarketTrendsServiceError(Exception):
    """Base exception for market trend service operations."""
    pass


class DatasetUnavailableError(MarketTrendsServiceError):
    """Raised when the underlying price dataset or sqlite index is not found."""

    def __init__(self, message: str, checked_paths: Optional[List[str]] = None):
        super().__init__(message)
        self.message = message
        self.checked_paths = checked_paths or []


class InvalidFilterError(MarketTrendsServiceError):
    """Raised when input parameters (e.g. aggregation, dates) are invalid."""
    pass


class MarketTrendsService:
    """Service providing historical APMC price trend analysis and peer market comparisons."""

    def __init__(self, db_path: Optional[Path] = None):
        self._custom_db_path = db_path
        self._resolved_db_path: Optional[Path] = None
        self._options_cache: Dict[Tuple[Optional[str], Optional[str], Optional[str]], MarketFilterOptionsResponse] = {}
        self._all_commodities_cache: Optional[List[str]] = None

    def get_candidate_paths(self) -> List[Path]:
        """Return list of candidate paths to search for price_trends.sqlite."""
        settings = get_settings()
        package_root = Path(__file__).resolve().parent.parent.parent

        raw_candidates: List[Path] = []

        if self._custom_db_path is not None:
            raw_candidates.append(Path(self._custom_db_path))

        env_db_path = settings.PRICE_TRENDS_DB_PATH or os.environ.get("PRICE_TRENDS_DB_PATH")
        if env_db_path:
            raw_candidates.append(Path(env_db_path).resolve())

        raw_candidates.append(settings.dataset_path / "price" / "price_trends.sqlite")
        raw_candidates.append(package_root / "datasets" / "price" / "price_trends.sqlite")
        raw_candidates.append(package_root / "ai-service" / "datasets" / "price" / "price_trends.sqlite")
        raw_candidates.append(Path.cwd() / "datasets" / "price" / "price_trends.sqlite")
        raw_candidates.append(Path.cwd() / "ai-service" / "datasets" / "price" / "price_trends.sqlite")
        raw_candidates.append(Path("/opt/render/project/src/ai-service/datasets/price/price_trends.sqlite"))
        raw_candidates.append(Path("/opt/render/project/src/datasets/price/price_trends.sqlite"))
        raw_candidates.append(Path("/var/data/price_trends.sqlite"))
        raw_candidates.append(Path("/var/data/datasets/price/price_trends.sqlite"))
        raw_candidates.append(Path("/data/price_trends.sqlite"))

        seen = set()
        deduped: List[Path] = []
        for p in raw_candidates:
            p_str = str(p)
            if p_str not in seen:
                seen.add(p_str)
                deduped.append(p)

        return deduped

    def check_availability(self) -> Tuple[bool, Optional[Path], List[Path]]:
        """Check if market trends SQLite index is present without raising an exception."""
        if self._custom_db_path is not None:
            p = Path(self._custom_db_path)
            if p.is_file():
                self._resolved_db_path = p
                return True, p, [p]
            return False, None, [p]

        candidate_paths = self.get_candidate_paths()
        for p in candidate_paths:
            if p.is_file():
                self._resolved_db_path = p
                return True, p, candidate_paths
        return False, None, candidate_paths

    def get_database_status(self) -> Dict[str, Any]:
        """Return diagnostic status of the price trends database."""
        available, db_path, candidate_paths = self.check_availability()
        checked_strs = [str(c) for c in candidate_paths]
        if not available or db_path is None:
            return {
                "available": False,
                "name": "price_trends.sqlite",
                "resolved_path": None,
                "size_bytes": 0,
                "size_mb": 0.0,
                "checked_locations": checked_strs,
                "message": f"Price trends database index 'price_trends.sqlite' not found. Checked: {checked_strs}",
            }

        try:
            size_bytes = db_path.stat().st_size
            size_mb = round(size_bytes / (1024 * 1024), 2)
            return {
                "available": True,
                "name": "price_trends.sqlite",
                "resolved_path": str(db_path),
                "size_bytes": size_bytes,
                "size_mb": size_mb,
                "checked_locations": checked_strs,
                "message": "Market price trends database index is available and accessible.",
            }
        except Exception as exc:
            return {
                "available": False,
                "name": "price_trends.sqlite",
                "resolved_path": str(db_path),
                "size_bytes": 0,
                "size_mb": 0.0,
                "checked_locations": checked_strs,
                "message": f"Failed to access database at {db_path}: {exc}",
            }

    def resolve_db_path(self) -> Path:
        """Resolve path to SQLite market price database index."""
        if self._custom_db_path is not None:
            p = Path(self._custom_db_path)
            if p.is_file():
                return p
            raise DatasetUnavailableError(
                f"Custom database not found at: {self._custom_db_path}",
                checked_paths=[str(p)],
            )

        candidate_paths = self.get_candidate_paths()

        for p in candidate_paths:
            if p.is_file():
                self._resolved_db_path = p
                return p

        checked_strs = [str(c) for c in candidate_paths]
        raise DatasetUnavailableError(
            f"Price trends database index 'price_trends.sqlite' not found. Checked: {checked_strs}",
            checked_paths=checked_strs,
        )

    def _get_connection(self) -> sqlite3.Connection:
        """Establish a read-only optimized SQLite connection."""
        db_path = self.resolve_db_path()
        conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
        conn.row_factory = sqlite3.Row
        return conn

    def get_filter_options(
        self,
        commodity: Optional[str] = None,
        state: Optional[str] = None,
        district: Optional[str] = None,
    ) -> MarketFilterOptionsResponse:
        """Retrieve dynamic filter choices based on available records."""
        cache_key = (
            commodity.strip().lower() if commodity else None,
            state.strip().lower() if state else None,
            district.strip().lower() if district else None,
        )
        if cache_key in self._options_cache:
            return self._options_cache[cache_key]

        conn = self._get_connection()
        cur = conn.cursor()

        try:
            # 1. Distinct Commodities
            if self._all_commodities_cache is not None:
                all_commodities = self._all_commodities_cache
            else:
                cur.execute("SELECT DISTINCT commodity FROM market_prices ORDER BY commodity ASC")
                all_commodities = [r["commodity"] for r in cur.fetchall() if r["commodity"]]
                self._all_commodities_cache = all_commodities

            # Order popular agricultural commodities first
            ordered_commodities: List[str] = []
            for pop in POPULAR_COMMODITIES:
                match = next((c for c in all_commodities if c.lower() == pop.lower()), None)
                if match and match not in ordered_commodities:
                    ordered_commodities.append(match)
            for c in all_commodities:
                if c not in ordered_commodities:
                    ordered_commodities.append(c)

            active_commodity = commodity.strip() if commodity else "Tomato"
            # Canonicalize commodity case from dataset
            matched_c = next((c for c in all_commodities if c.lower() == active_commodity.lower()), None)
            if matched_c:
                active_commodity = matched_c
            elif all_commodities:
                active_commodity = ordered_commodities[0]

            # 2. Distinct States for Commodity (Indexed on commodity, state, arrival_date)
            cur.execute(
                "SELECT DISTINCT state FROM market_prices WHERE commodity = ? ORDER BY state ASC",
                (active_commodity,),
            )
            states = [r["state"] for r in cur.fetchall() if r["state"]]
            if not states:
                cur.execute("SELECT DISTINCT state FROM market_prices ORDER BY state ASC")
                states = [r["state"] for r in cur.fetchall() if r["state"]]

            # Canonicalize state case
            active_state = state.strip() if state else ("Maharashtra" if "Maharashtra" in states else (states[0] if states else ""))
            matched_s = next((s for s in states if s.lower() == active_state.lower()), None)
            if matched_s:
                active_state = matched_s

            # 3. Distinct Districts (Indexed)
            if active_state:
                cur.execute(
                    "SELECT DISTINCT district FROM market_prices WHERE commodity = ? AND state = ? ORDER BY district ASC",
                    (active_commodity, active_state),
                )
            else:
                cur.execute(
                    "SELECT DISTINCT district FROM market_prices WHERE commodity = ? ORDER BY district ASC",
                    (active_commodity,),
                )
            districts = [r["district"] for r in cur.fetchall() if r["district"]]
            active_district = district.strip() if district else (districts[0] if districts else "")
            matched_d = next((d for d in districts if d.lower() == active_district.lower()), None)
            if matched_d:
                active_district = matched_d

            # 4. Distinct Markets (Indexed)
            if district and active_state and active_district:
                cur.execute(
                    "SELECT DISTINCT market FROM market_prices WHERE commodity = ? AND state = ? AND district = ? ORDER BY market ASC",
                    (active_commodity, active_state, active_district),
                )
                markets = [r["market"] for r in cur.fetchall() if r["market"]]
            elif active_state:
                cur.execute(
                    "SELECT DISTINCT market FROM market_prices WHERE commodity = ? AND state = ? ORDER BY market ASC",
                    (active_commodity, active_state),
                )
                markets = [r["market"] for r in cur.fetchall() if r["market"]]
            else:
                cur.execute(
                    "SELECT DISTINCT market FROM market_prices WHERE commodity = ? ORDER BY market ASC",
                    (active_commodity,),
                )
                markets = [r["market"] for r in cur.fetchall() if r["market"]]

            # Prefer Pune or first available market
            active_market = "Pune" if "Pune" in markets else (markets[0] if markets else "Pune")

            # 5. Date Range across dataset using fast index lookup
            cur.execute(
                "SELECT MIN(arrival_date), MAX(arrival_date) FROM market_prices WHERE commodity = ?",
                (active_commodity,),
            )
            r_dates = cur.fetchone()
            min_date = r_dates[0] if r_dates and r_dates[0] else "2025-01-01"
            max_date = r_dates[1] if r_dates and r_dates[1] else "2025-12-30"

            result = MarketFilterOptionsResponse(
                commodities=ordered_commodities,
                states=states,
                districts=districts,
                markets=markets,
                date_range={"min_date": min_date, "max_date": max_date},
                default_selection={
                    "commodity": active_commodity,
                    "state": active_state,
                    "district": active_district,
                    "market": active_market,
                },
            )
            self._options_cache[cache_key] = result
            return result


        finally:
            conn.close()

    def analyze_market_trends(
        self,
        commodity: str,
        state: Optional[str] = None,
        district: Optional[str] = None,
        market: Optional[str] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        aggregation: str = "daily",
        compare_peers: bool = True,
    ) -> MarketTrendsResponse:
        """Run statistical market trend analysis on historical APMC modal prices."""
        clean_commodity = commodity.strip() if commodity else ""
        if not clean_commodity:
            raise InvalidFilterError("Commodity parameter is required.")

        clean_aggregation = aggregation.strip().lower() if aggregation else "daily"
        if clean_aggregation not in {"daily", "weekly", "monthly"}:
            raise InvalidFilterError(f"Unsupported aggregation '{aggregation}'. Supported: 'daily', 'weekly', 'monthly'.")

        clean_start_date = start_date.strip() if start_date else None
        clean_end_date = end_date.strip() if end_date else None

        for d_str, name in [(clean_start_date, "start_date"), (clean_end_date, "end_date")]:
            if d_str:
                try:
                    datetime.strptime(d_str, "%Y-%m-%d")
                except ValueError as exc:
                    raise InvalidFilterError(f"Invalid date format for '{name}'. Expected YYYY-MM-DD, received '{d_str}'.") from exc

        if clean_start_date and clean_end_date and clean_start_date > clean_end_date:
            raise InvalidFilterError(f"start_date '{clean_start_date}' cannot be after end_date '{clean_end_date}'.")

        conn = self._get_connection()
        cur = conn.cursor()

        try:
            # Resolve target market if omitted or unspecified
            resolved_market = market.strip() if market else None
            resolved_state = state.strip() if state else None
            resolved_district = district.strip() if district else None

            # Ensure commodities cache is loaded for fast canonical casing
            if self._all_commodities_cache is None:
                cur.execute("SELECT DISTINCT commodity FROM market_prices ORDER BY commodity ASC")
                self._all_commodities_cache = [r["commodity"] for r in cur.fetchall() if r["commodity"]]

            matched_c = next((c for c in self._all_commodities_cache if c.lower() == clean_commodity.lower()), None)
            if matched_c:
                clean_commodity = matched_c

            if not resolved_market:
                # Fast indexed lookup for first market matching commodity and optional state
                if resolved_state:
                    cur.execute(
                        "SELECT market, state, district FROM market_prices WHERE commodity = ? AND state = ? LIMIT 1",
                        (clean_commodity, resolved_state),
                    )
                else:
                    cur.execute(
                        "SELECT market, state, district FROM market_prices WHERE commodity = ? LIMIT 1",
                        (clean_commodity,),
                    )
                top_mkt = cur.fetchone()
                if top_mkt:
                    resolved_market = top_mkt["market"]
                    if not resolved_state:
                        resolved_state = top_mkt["state"]
                    if not resolved_district:
                        resolved_district = top_mkt["district"]
                else:
                    resolved_market = "Unknown"
            else:
                # Canonicalize market name
                cur.execute(
                    "SELECT market, state, district FROM market_prices WHERE commodity = ? AND LOWER(market) = LOWER(?) LIMIT 1",
                    (clean_commodity, resolved_market),
                )
                m_match = cur.fetchone()
                if not m_match:
                    # Fuzzy match e.g. "Hosur" matches "Hosur (Uzhavar Sandhai )"
                    if resolved_state:
                        cur.execute(
                            "SELECT market, state, district FROM market_prices WHERE commodity = ? AND state = ? AND LOWER(market) LIKE LOWER(?) LIMIT 1",
                            (clean_commodity, resolved_state, f"%{resolved_market}%"),
                        )
                        m_match = cur.fetchone()
                    if not m_match:
                        cur.execute(
                            "SELECT market, state, district FROM market_prices WHERE commodity = ? AND LOWER(market) LIKE LOWER(?) LIMIT 1",
                            (clean_commodity, f"%{resolved_market}%"),
                        )
                        m_match = cur.fetchone()

                if m_match:
                    resolved_market = m_match["market"]
                    if not resolved_state and m_match["state"]:
                        resolved_state = m_match["state"]
                    if not resolved_district and m_match["district"]:
                        resolved_district = m_match["district"]

            # Query historical arrival observations (Indexed B-Tree lookup)
            base_query = """
                SELECT arrival_date, modal_price, min_price, max_price
                FROM market_prices
                WHERE commodity = ?
                  AND market = ?
                  AND modal_price > 0
            """
            params: List[Any] = [clean_commodity, resolved_market]

            if resolved_state:
                base_query += " AND state = ?"
                params.append(resolved_state)

            if clean_start_date:
                base_query += " AND arrival_date >= ?"
                params.append(clean_start_date)

            if clean_end_date:
                base_query += " AND arrival_date <= ?"
                params.append(clean_end_date)

            base_query += " ORDER BY arrival_date ASC"

            cur.execute(base_query, tuple(params))
            rows = cur.fetchall()

            if not rows:
                # Return structured empty response
                return MarketTrendsResponse(
                    commodity=clean_commodity,
                    state=resolved_state,
                    district=resolved_district,
                    market=resolved_market,
                    start_date=clean_start_date,
                    end_date=clean_end_date,
                    aggregation=clean_aggregation,
                    data_points=[],
                    latest_price=None,
                    latest_date=None,
                    previous_price=None,
                    previous_date=None,
                    absolute_change=None,
                    percentage_change=None,
                    min_price=None,
                    max_price=None,
                    average_price=None,
                    observation_count=0,
                    trend_classification="Insufficient data",
                    trend_rule_description=(
                        f"Classified as 'Rising' if percentage change > +{TREND_THRESHOLD_PERCENT}%, "
                        f"'Falling' if < -{TREND_THRESHOLD_PERCENT}%, else 'Stable'. Requires at least 2 observations."
                    ),
                    insights=[f"No arrival records found for {clean_commodity} at {resolved_market} in the selected period."],
                    market_comparisons=[],
                )

            # Build aggregated time series
            points: List[MarketTrendPoint] = []
            if clean_aggregation == "daily":
                # Group by exact arrival_date
                daily_buckets: Dict[str, List[sqlite3.Row]] = {}
                for r in rows:
                    d = r["arrival_date"]
                    daily_buckets.setdefault(d, []).append(r)

                for d in sorted(daily_buckets.keys()):
                    b_rows = daily_buckets[d]
                    modal_prices = [float(r["modal_price"]) for r in b_rows if r["modal_price"] is not None]
                    min_prices = [float(r["min_price"]) for r in b_rows if r["min_price"] is not None] or modal_prices
                    max_prices = [float(r["max_price"]) for r in b_rows if r["max_price"] is not None] or modal_prices

                    avg_modal = round(sum(modal_prices) / len(modal_prices), 2)
                    points.append(
                        MarketTrendPoint(
                            date=d,
                            modal_price=avg_modal,
                            min_price=round(min(min_prices), 2) if min_prices else avg_modal,
                            max_price=round(max(max_prices), 2) if max_prices else avg_modal,
                            observation_count=len(b_rows),
                        )
                    )

            elif clean_aggregation == "weekly":
                # Group by calendar year-week (e.g. 2025-W12)
                weekly_buckets: Dict[str, List[sqlite3.Row]] = {}
                for r in rows:
                    dt = datetime.strptime(r["arrival_date"], "%Y-%m-%d")
                    # ISO calendar: YYYY-Www
                    week_key = dt.strftime("%Y-W%W")
                    weekly_buckets.setdefault(week_key, []).append(r)

                for wk in sorted(weekly_buckets.keys()):
                    b_rows = weekly_buckets[wk]
                    modal_prices = [float(r["modal_price"]) for r in b_rows if r["modal_price"] is not None]
                    min_prices = [float(r["min_price"]) for r in b_rows if r["min_price"] is not None] or modal_prices
                    max_prices = [float(r["max_price"]) for r in b_rows if r["max_price"] is not None] or modal_prices

                    # Representative date: min arrival_date in week
                    rep_date = min(r["arrival_date"] for r in b_rows)
                    avg_modal = round(sum(modal_prices) / len(modal_prices), 2)
                    points.append(
                        MarketTrendPoint(
                            date=rep_date,
                            modal_price=avg_modal,
                            min_price=round(min(min_prices), 2) if min_prices else avg_modal,
                            max_price=round(max(max_prices), 2) if max_prices else avg_modal,
                            observation_count=len(b_rows),
                        )
                    )

            elif clean_aggregation == "monthly":
                # Group by YYYY-MM
                monthly_buckets: Dict[str, List[sqlite3.Row]] = {}
                for r in rows:
                    month_key = r["arrival_date"][:7]  # YYYY-MM
                    monthly_buckets.setdefault(month_key, []).append(r)

                for m in sorted(monthly_buckets.keys()):
                    b_rows = monthly_buckets[m]
                    modal_prices = [float(r["modal_price"]) for r in b_rows if r["modal_price"] is not None]
                    min_prices = [float(r["min_price"]) for r in b_rows if r["min_price"] is not None] or modal_prices
                    max_prices = [float(r["max_price"]) for r in b_rows if r["max_price"] is not None] or modal_prices

                    rep_date = f"{m}-01"
                    avg_modal = round(sum(modal_prices) / len(modal_prices), 2)
                    points.append(
                        MarketTrendPoint(
                            date=rep_date,
                            modal_price=avg_modal,
                            min_price=round(min(min_prices), 2) if min_prices else avg_modal,
                            max_price=round(max(max_prices), 2) if max_prices else avg_modal,
                            observation_count=len(b_rows),
                        )
                    )

            # Calculate Price Statistics
            total_observations = sum(p.observation_count for p in points)
            all_modal_prices = [p.modal_price for p in points]
            overall_min = round(min(p.min_price if p.min_price is not None else p.modal_price for p in points), 2)
            overall_max = round(max(p.max_price if p.max_price is not None else p.modal_price for p in points), 2)
            overall_avg = round(sum(all_modal_prices) / len(all_modal_prices), 2)

            latest_point = points[-1]
            latest_price = latest_point.modal_price
            latest_date = latest_point.date

            previous_price: Optional[float] = None
            previous_date: Optional[str] = None
            abs_change: Optional[float] = None
            pct_change: Optional[float] = None

            if len(points) >= 2:
                prev_point = points[-2]
                previous_price = prev_point.modal_price
                previous_date = prev_point.date
                abs_change = round(latest_price - previous_price, 2)
                if previous_price > 0 and math.isfinite(previous_price):
                    pct_change = round(((latest_price - previous_price) / previous_price) * 100, 2)
                else:
                    pct_change = 0.0

            # Trend Classification
            rule_description = (
                f"Classified as 'Rising' if percentage change > +{TREND_THRESHOLD_PERCENT}%, "
                f"'Falling' if < -{TREND_THRESHOLD_PERCENT}%, and 'Stable' within ±{TREND_THRESHOLD_PERCENT}%. "
                "Requires at least 2 distinct temporal observations."
            )

            if len(points) < 2 or pct_change is None or not math.isfinite(pct_change):
                trend_class = "Insufficient data"
            elif pct_change > TREND_THRESHOLD_PERCENT:
                trend_class = "Rising"
            elif pct_change < -TREND_THRESHOLD_PERCENT:
                trend_class = "Falling"
            else:
                trend_class = "Stable"
            # Peer Market Comparisons
            market_comparisons: List[MarketComparisonItem] = []
            if compare_peers and resolved_state:
                peer_sql = """
                    SELECT market, state, district,
                           AVG(modal_price) as avg_price,
                           COUNT(*) as obs_count,
                           MAX(arrival_date) as last_d
                    FROM market_prices
                    WHERE commodity = ?
                      AND state = ?
                      AND modal_price > 0
                """
                peer_params: List[Any] = [clean_commodity, resolved_state]
                if clean_start_date:
                    peer_sql += " AND arrival_date >= ?"
                    peer_params.append(clean_start_date)
                if clean_end_date:
                    peer_sql += " AND arrival_date <= ?"
                    peer_params.append(clean_end_date)

                peer_sql += " GROUP BY market, state, district ORDER BY obs_count DESC LIMIT 6"
                cur.execute(peer_sql, tuple(peer_params))
                for p_row in cur.fetchall():
                    m_name = p_row["market"]
                    # Fetch latest arrival price for peer market (Indexed)
                    cur.execute(
                        "SELECT modal_price FROM market_prices WHERE commodity = ? AND market = ? AND arrival_date = ? LIMIT 1",
                        (clean_commodity, m_name, p_row["last_d"]),
                    )
                    lat_row = cur.fetchone()
                    lat_p = float(lat_row["modal_price"]) if lat_row else float(p_row["avg_price"])

                    market_comparisons.append(
                        MarketComparisonItem(
                            market=m_name,
                            state=p_row["state"],
                            district=p_row["district"] or "",
                            latest_price=round(lat_p, 2),
                            average_price=round(float(p_row["avg_price"]), 2),
                            last_date=p_row["last_d"],
                            observation_count=int(p_row["obs_count"]),
                        )
                    )

            # Generate Farmer-Friendly Natural Language Insights
            insights: List[str] = []
            if trend_class == "Rising":
                insights.append(
                    f"The recorded modal price for {clean_commodity} in {resolved_market} increased by "
                    f"{abs(pct_change):.1f}% over the comparison period (from ₹{previous_price:.0f} to ₹{latest_price:.0f} per quintal)."
                )
            elif trend_class == "Falling":
                insights.append(
                    f"Prices declined by {abs(pct_change):.1f}% compared with the previous period "
                    f"(from ₹{previous_price:.0f} down to ₹{latest_price:.0f} per quintal)."
                )
            elif trend_class == "Stable":
                insights.append(
                    f"The available records show relatively stable prices for {clean_commodity} in {resolved_market}, "
                    f"holding near ₹{latest_price:.0f} per quintal (fluctuation within ±{TREND_THRESHOLD_PERCENT}%)."
                )
            else:
                insights.append(
                    f"There is insufficient historical data in the selected window to establish a statistically reliable trend."
                )

            insights.append(
                f"Across {len(points)} {clean_aggregation} periods, prices ranged from a low of ₹{overall_min:.0f} "
                f"to a high of ₹{overall_max:.0f}/quintal, averaging ₹{overall_avg:.0f}/quintal."
            )

            if market_comparisons and len(market_comparisons) > 1:
                peer_avg = round(sum(m.average_price for m in market_comparisons) / len(market_comparisons), 2)
                diff = round(latest_price - peer_avg, 2)
                if diff > 0:
                    insights.append(
                        f"{resolved_market} is currently trading ₹{diff:.0f}/quintal higher than the regional peer average (₹{peer_avg:.0f}/quintal)."
                    )
                else:
                    insights.append(
                        f"{resolved_market} is currently trading ₹{abs(diff):.0f}/quintal lower than the regional peer average (₹{peer_avg:.0f}/quintal)."
                    )

            return MarketTrendsResponse(
                commodity=clean_commodity,
                state=resolved_state,
                district=resolved_district,
                market=resolved_market,
                start_date=clean_start_date,
                end_date=clean_end_date,
                aggregation=clean_aggregation,
                unit="INR per quintal",
                currency="INR",
                data_points=points,
                latest_price=latest_price,
                latest_date=latest_date,
                previous_price=previous_price,
                previous_date=previous_date,
                absolute_change=abs_change,
                percentage_change=pct_change,
                min_price=overall_min,
                max_price=overall_max,
                average_price=overall_avg,
                observation_count=total_observations,
                trend_classification=trend_class,
                trend_rule_description=rule_description,
                insights=insights,
                market_comparisons=market_comparisons,
            )

        finally:
            conn.close()


# Singleton instance
_market_trends_service: Optional[MarketTrendsService] = None


def get_market_trends_service() -> MarketTrendsService:
    """Return singleton MarketTrendsService instance."""
    global _market_trends_service
    if _market_trends_service is None:
        _market_trends_service = MarketTrendsService()
    return _market_trends_service
