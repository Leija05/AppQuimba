#!/usr/bin/env python3
"""
Genera tokens de licencia válidos para Quimbar.

Uso:
  python tools/generate_token.py --months 2
  python tools/generate_token.py --date 2026-08-31
"""

from __future__ import annotations

import argparse
import hashlib
import hmac
import os
from datetime import date, datetime


def add_months(base: date, months: int) -> date:
    month = base.month - 1 + months
    year = base.year + month // 12
    month = month % 12 + 1
    day = min(
        base.day,
        [31, 29 if (year % 4 == 0 and year % 100 != 0) or (year % 400 == 0) else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1],
    )
    return date(year, month, day)


def build_token(secret: str, expiry: date) -> str:
    compact = expiry.strftime("%Y%m%d")
    signature = hmac.new(secret.encode("utf-8"), compact.encode("utf-8"), hashlib.sha256).hexdigest()[:12]
    return f"QBM.{compact}.{signature}"


def main() -> None:
    parser = argparse.ArgumentParser(description="Generador de token de Quimbar")
    parser.add_argument("--months", type=int, default=2, help="Meses a partir de hoy para el vencimiento")
    parser.add_argument("--date", type=str, default="", help="Fecha exacta de vencimiento YYYY-MM-DD")
    parser.add_argument("--secret", type=str, default=os.environ.get("QUIMBAR_LICENSE_SECRET", "QuimbarToken2026"))
    args = parser.parse_args()

    if args.date:
        expiry = datetime.strptime(args.date, "%Y-%m-%d").date()
    else:
        expiry = add_months(date.today(), args.months)

    token = build_token(args.secret, expiry)
    print(f"Secret usado: {args.secret}")
    print(f"Vence: {expiry.isoformat()}")
    print(f"Token: {token}")


if __name__ == "__main__":
    main()
