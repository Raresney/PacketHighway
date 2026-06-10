# 🚦 PacketHighway

**Live network traffic, visualized as highway traffic.**

Every packet crossing your network interface becomes a vehicle on a divided
highway: inbound traffic drives one way, outbound the other. The color tells
you the protocol, the vehicle type tells you the packet size — tiny ACKs zip
by as motorcycles while full-MTU downloads rumble past as trucks. When your
connection gets busy, the highway gets congested. Literally.

```
  ⬅ INBOUND   🏍  🚗   🚚      🏍   🚗        ⬅
  ═══════════════════════════════════════════════
  ➡            🚗      🏍    🚛       🚗   OUTBOUND ➡
```

## How it works

```
 ┌─────────────┐   packet     ┌──────────────────┐   WebSocket   ┌─────────────┐
 │ scapy sniff │ ──summary──▶ │ asyncio batcher  │ ──60ms batch─▶│ Canvas 2D   │
 │ (or demo    │              │ + sampler        │               │ highway     │
 │  generator) │              │ (websockets lib) │               │ renderer    │
 └─────────────┘              └──────────────────┘               └─────────────┘
```

- **Capture thread** — [scapy](https://scapy.net/) sniffs the interface and
  reduces each packet to a compact summary: protocol, endpoints, ports, size,
  direction (matched against the host's local IPs).
- **Batcher** — packets are queued and flushed to all connected browsers every
  60 ms. Above ~80 packets per batch only a random sample is sent as cars,
  but the totals stay exact, so the stats remain truthful under load.
- **Renderer** — vanilla JS on a 2D canvas. No frameworks, no build step.

## Visual encoding

| Dimension      | Meaning                                             |
| -------------- | --------------------------------------------------- |
| Carriageway    | Direction — top = inbound, bottom = outbound        |
| Color          | Protocol — HTTPS, HTTP, DNS, TCP, UDP, ICMP, other  |
| Vehicle type   | Packet size — 🏍 ≤120 B, 🚗 ≤600 B, 🚐 ≤1200 B, 🚛 >1200 B |
| Lane           | Heavier vehicles keep right, just like a real highway |
| Congestion     | Real backpressure — vehicles brake behind slower ones |

Extras: hover any vehicle for `src:port → dst:port`, click legend chips to
filter protocols, <kbd>Space</kbd> to pause.

## Quick start

```bash
pip install -r requirements.txt

# Demo mode - synthetic traffic, runs anywhere, no privileges needed
python packet_highway.py --demo

# Live mode - real packets (see requirements below)
python packet_highway.py
python packet_highway.py --iface "Wi-Fi"
```

Then open **http://127.0.0.1:8350**.

### Live capture requirements

| OS      | Requirement                                              |
| ------- | -------------------------------------------------------- |
| Windows | [Npcap](https://npcap.com) installed + run as Administrator |
| Linux   | `sudo`, or `setcap cap_net_raw+ep` on the Python binary  |
| macOS   | `sudo`                                                    |

### Options

```
--demo            synthetic traffic instead of live capture
--iface IFACE     interface to sniff (default: scapy's default)
--port PORT       dashboard HTTP port   (default 8350)
--ws-port PORT    WebSocket port        (default 8765)
```

If you change `--ws-port`, open the dashboard as
`http://127.0.0.1:8350/?ws=<port>`.

## Why

Built as a security-tooling portfolio project: packet capture, traffic
classification and real-time data streaming, wrapped in a visualization that
makes network activity instantly readable — you can *see* a DNS burst, a
download saturating the link, or an ICMP sweep, without reading a single
table row.

## License

MIT
