#!/usr/bin/env python3
"""
Genera tokens de licencia (QBM/QBM2) o premium (QBP/QBP2) para Quimbar.

Ejemplos:
  python tools/generate_token.py --type license --plan bimestral --machine-id "PC-123"
  python tools/generate_token.py --type premium --plan mensual
  python tools/generate_token.py --type premium --date 2026-12-31 --machine-id "PC-123"
"""

from __future__ import annotations

import argparse
import hashlib
import hmac
import os
from datetime import date, datetime

LICENSE_SECRET_DEFAULT = "QuimbarToken2026"
PREMIUM_SECRET_DEFAULT = "QuimbarPremium2026"

PLAN_MONTHS = {
    "mensual": 1,
    "bimestral": 2,
    "trimestral": 3,
    "semestral": 6,
    "anual": 12,
}


def add_months(base: date, months: int) -> date:
    month = base.month - 1 + months
    year = base.year + month // 12
    month = month % 12 + 1
    day = min(
        base.day,
        [31, 29 if (year % 4 == 0 and year % 100 != 0) or (year % 400 == 0) else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1],
    )
    return date(year, month, day)


def machine_hash(machine_id: str) -> str:
    return hashlib.sha256(machine_id.encode("utf-8")).hexdigest()[:12]


def build_token(secret: str, expiry: date, token_type: str, machine_id: str | None = None) -> str:
    compact = expiry.strftime("%Y%m%d")
    v1_prefix = "QBM" if token_type == "license" else "QBP"
    v2_prefix = "QBM2" if token_type == "license" else "QBP2"

    if machine_id:
        hw_hash = machine_hash(machine_id)
        payload = f"{compact}.{hw_hash}"
        signature = hmac.new(secret.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).hexdigest()[:12]
        return f"{v2_prefix}.{compact}.{hw_hash}.{signature}"

    signature = hmac.new(secret.encode("utf-8"), compact.encode("utf-8"), hashlib.sha256).hexdigest()[:12]
    return f"{v1_prefix}.{compact}.{signature}"


def main() -> None:
    parser = argparse.ArgumentParser(description="Generador de token de Quimbar")
    parser.add_argument("--type", choices=["license", "premium"], default="license", help="Tipo de token a generar")
    parser.add_argument("--plan", choices=list(PLAN_MONTHS.keys()), default="bimestral", help="Periodo comercial")
    parser.add_argument("--months", type=int, default=0, help="Meses personalizados (sobrescribe --plan)")
    parser.add_argument("--date", type=str, default="", help="Fecha exacta de vencimiento YYYY-MM-DD")
    parser.add_argument("--secret", type=str, default="", help="Secreto manual (opcional)")
    parser.add_argument("--machine-id", type=str, default="", help="Hardware ID destino (genera versión ligada al equipo)")
    args = parser.parse_args()

    default_secret = os.environ.get(
        "QUIMBAR_LICENSE_SECRET" if args.type == "license" else "QUIMBAR_PREMIUM_SECRET",
        LICENSE_SECRET_DEFAULT if args.type == "license" else PREMIUM_SECRET_DEFAULT,
    )
    secret = args.secret or default_secret

    if args.date:
        expiry = datetime.strptime(args.date, "%Y-%m-%d").date()
    else:
        months = args.months if args.months > 0 else PLAN_MONTHS[args.plan]
        expiry = add_months(date.today(), months)

    token = build_token(secret, expiry, args.type, args.machine_id or None)
    print(f"Tipo: {args.type}")
    print(f"Plan: {args.plan}")
    print(f"Secret usado: {secret}")
    print(f"Vence: {expiry.isoformat()}")
    if args.machine_id:
        print(f"Machine hash: {machine_hash(args.machine_id)}")
    print(f"Token: {token}")


if __name__ == "__main__":
    main()
