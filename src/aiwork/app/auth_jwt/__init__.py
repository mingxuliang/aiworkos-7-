# -*- coding: utf-8 -*-
"""JWT + Redis + MySQL authentication module — the only auth mode."""

# Lazy import to avoid pulling PyJWT/redis/sqlalchemy when not in jwt mode


def get_router():
    """Return the JWT auth router (lazy-loaded)."""
    from .router import router as jwt_auth_router
    return jwt_auth_router


__all__ = ["get_router"]
