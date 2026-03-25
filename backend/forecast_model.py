"""
Forecast Model — Hour×Weekday Lookup Table
Simulates LSTM output for hackathon demo.
Returns base_green times per arm based on time-of-day traffic patterns.
"""

import datetime
import random

# Realistic Bengaluru traffic patterns by hour
# Values represent base_green in seconds for a typical weekday
# Pattern: morning peak (8-10), evening peak (5-8), quiet night
WEEKDAY_PATTERN = {
    # hour: (arm_N, arm_E, arm_S, arm_W)
    0:  (18, 18, 18, 18),
    1:  (15, 15, 15, 15),
    2:  (15, 15, 15, 15),
    3:  (15, 15, 15, 15),
    4:  (18, 18, 18, 18),
    5:  (22, 20, 25, 20),
    6:  (28, 25, 30, 25),
    7:  (35, 30, 40, 32),
    8:  (45, 38, 55, 42),   # morning peak starts
    9:  (50, 42, 60, 48),   # morning peak
    10: (42, 35, 48, 38),
    11: (35, 30, 38, 32),
    12: (32, 28, 35, 30),
    13: (30, 28, 32, 28),
    14: (30, 28, 32, 28),
    15: (32, 30, 35, 30),
    16: (38, 35, 42, 38),
    17: (48, 42, 55, 45),   # evening peak starts
    18: (55, 48, 60, 52),   # evening peak
    19: (50, 45, 55, 48),   # evening peak
    20: (40, 35, 42, 38),
    21: (32, 28, 35, 30),
    22: (25, 22, 28, 25),
    23: (20, 20, 22, 20),
}

WEEKEND_PATTERN = {
    # Weekends: flatter profile, later morning, more midday
    0:  (18, 18, 18, 18),
    1:  (15, 15, 15, 15),
    2:  (15, 15, 15, 15),
    3:  (15, 15, 15, 15),
    4:  (15, 15, 15, 15),
    5:  (18, 18, 18, 18),
    6:  (20, 20, 20, 20),
    7:  (22, 22, 25, 22),
    8:  (28, 25, 30, 28),
    9:  (32, 30, 35, 32),
    10: (35, 32, 38, 35),
    11: (38, 35, 42, 38),   # midday activity
    12: (40, 38, 45, 40),
    13: (38, 35, 42, 38),
    14: (35, 32, 38, 35),
    15: (35, 32, 38, 35),
    16: (38, 35, 40, 38),
    17: (42, 38, 45, 40),
    18: (45, 40, 48, 42),
    19: (40, 38, 42, 40),
    20: (35, 32, 38, 35),
    21: (28, 28, 30, 28),
    22: (22, 22, 25, 22),
    23: (20, 20, 20, 20),
}

# Junction-specific multipliers (some junctions are busier)
JUNCTION_MULTIPLIERS = {
    "silk_board":    {"arm_N": 1.2, "arm_E": 1.0, "arm_S": 1.3, "arm_W": 1.0},
    "kr_circle":     {"arm_N": 1.1, "arm_E": 1.2, "arm_S": 1.0, "arm_W": 1.1},
    "jayanagar":     {"arm_N": 1.0, "arm_E": 1.1, "arm_S": 1.0, "arm_W": 1.0},
    "banashankari":  {"arm_N": 1.0, "arm_E": 1.0, "arm_S": 1.1, "arm_W": 1.0},
}


def get_forecast(junction: str = "silk_board", horizon: int = 30) -> dict:
    """
    Return base_green per arm for the given junction and forecast horizon.
    Simulates LSTM output using hour×weekday lookup table with noise.
    """
    now = datetime.datetime.now()
    # Offset by horizon minutes to forecast ahead
    forecast_time = now + datetime.timedelta(minutes=horizon)
    hour = forecast_time.hour
    weekday = forecast_time.weekday()  # 0=Monday, 6=Sunday

    # Select pattern
    is_weekend = weekday >= 5
    pattern = WEEKEND_PATTERN if is_weekend else WEEKDAY_PATTERN

    base = pattern.get(hour, (30, 30, 30, 30))

    # Apply junction multiplier
    mult = JUNCTION_MULTIPLIERS.get(junction, {"arm_N": 1.0, "arm_E": 1.0, "arm_S": 1.0, "arm_W": 1.0})

    # Add small noise to simulate model variance (±3 seconds)
    def noisy(val, m):
        return max(15, min(60, int(val * m + random.uniform(-3, 3))))

    return {
        "arm_N": noisy(base[0], mult["arm_N"]),
        "arm_E": noisy(base[1], mult["arm_E"]),
        "arm_S": noisy(base[2], mult["arm_S"]),
        "arm_W": noisy(base[3], mult["arm_W"]),
        "junction": junction,
        "horizon_min": horizon,
        "forecast_time": forecast_time.isoformat(),
        "is_weekend": is_weekend,
        "hour": hour,
    }
