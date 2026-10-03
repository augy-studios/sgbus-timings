from typing import Optional

import httpx

# One pool of connections for the requests the bot makes all the time: live timings and
# service alerts from LTA, and places, journeys and postal codes. A client per request
# opened a new connection, with a new TLS handshake, every time; this one keeps them open
# between requests, which takes a round trip or two off each answer. Each request still
# sets its own timeout.
_client: Optional[httpx.AsyncClient] = None


def shared_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(
            timeout=30,
            limits=httpx.Limits(max_connections=50, max_keepalive_connections=20, keepalive_expiry=60),
        )
    return _client
