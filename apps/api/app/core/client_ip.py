from ipaddress import ip_address, ip_network

from starlette.datastructures import Headers
from starlette.types import Scope


def get_client_ip(scope: Scope) -> str:
    client = scope.get("client")

    if client is None:
        return "unknown"

    host = client[0]
    return host or "unknown"


def get_client_subnet(client_ip: str) -> str:
    try:
        address = ip_address(client_ip)
    except ValueError:
        return client_ip

    prefix_length = 24 if address.version == 4 else 64
    return str(ip_network(f"{address}/{prefix_length}", strict=False))


def has_private_client_host(scope: Scope) -> bool:
    headers = Headers(scope=scope)
    host = headers.get("host", "")

    return (
        host.startswith("127.0.0.1")
        or host.startswith("localhost")
        or host.startswith("testserver")
    )
