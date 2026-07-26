"""Behavior contracts for dashboard WebSocket transport limits."""

from hermes_cli.web_server import (
    _DASHBOARD_WS_MAX_SIZE,
    _dashboard_websocket_options,
)


def test_dashboard_websocket_limit_accepts_large_chat_payloads():
    options = _dashboard_websocket_options("0.0.0.0")

    assert options["ws_max_size"] == _DASHBOARD_WS_MAX_SIZE
    assert options["ws_max_size"] >= 64 * 1024 * 1024


def test_dashboard_websocket_keepalive_depends_on_network_path():
    loopback = _dashboard_websocket_options("127.0.0.1")
    public = _dashboard_websocket_options("0.0.0.0")

    assert loopback["ws_ping_interval"] is None
    assert loopback["ws_ping_timeout"] is None
    assert public["ws_ping_interval"] == 20.0
    assert public["ws_ping_timeout"] == 20.0
    assert loopback["ws_max_size"] == public["ws_max_size"]