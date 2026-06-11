"""PacketHighway - live network traffic visualization platform.

Captures packets with scapy (or generates synthetic traffic in demo mode)
and streams compact packet summaries over a WebSocket to a 3D dashboard
(React Three Fiber) where every packet drives down a virtual highway.

Usage:
    python packet_highway.py --demo          # synthetic traffic, no Npcap needed
    python packet_highway.py                 # live capture (Npcap + Administrator)
    python packet_highway.py --iface "Wi-Fi" # capture on a specific interface
"""

import argparse
import asyncio
import json
import os
import random
import socket
import sys
import threading
import time
from functools import partial
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

import websockets

DIST_DIR = Path(__file__).parent / "dist"

# Sampling cap: above this many packets per batch the browser only gets a
# random sample to spawn as vehicles, but the batch totals stay accurate.
MAX_CARS_PER_BATCH = 100
BATCH_INTERVAL = 0.06  # seconds
QUEUE_LIMIT = 5000

SUSPICIOUS_PORTS = {23, 445, 1337, 3389, 4444, 5900, 6667, 31337}
ENCRYPTED_PORTS = {22, 443, 853, 993, 995, 8443}

clients = set()
queue: asyncio.Queue = None
loop: asyncio.AbstractEventLoop = None
capture_mode = "demo"

# demo attack simulation state, toggled from the dashboard
ATTACK = {"until": 0.0, "src": None}


# --------------------------------------------------------------------------
# Packet sources
# --------------------------------------------------------------------------

def port_proto(sport, dport, fallback):
    """Map well-known ports to an application protocol label."""
    for port in (dport, sport):
        if port == 443:
            return "HTTPS"
        if port == 80:
            return "HTTP"
        if port == 53:
            return "DNS"
    return fallback


def flag_ports(sport, dport):
    sus = 1 if sport in SUSPICIOUS_PORTS or dport in SUSPICIOUS_PORTS else 0
    enc = 1 if sport in ENCRYPTED_PORTS or dport in ENCRYPTED_PORTS else 0
    return sus, enc


def local_ips():
    """Best-effort set of this machine's IP addresses (for direction)."""
    ips = {"127.0.0.1", "::1"}
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None):
            ips.add(info[4][0])
    except socket.gaierror:
        pass
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ips.add(s.getsockname()[0])
        s.close()
    except OSError:
        pass
    return ips


def live_source(push, iface):
    """Sniff real packets with scapy and push summaries to the queue."""
    try:
        from scapy.all import sniff
        from scapy.layers.inet import IP, TCP, UDP, ICMP
        from scapy.layers.inet6 import IPv6
    except ImportError:
        sys.exit("scapy is required for live capture:  pip install scapy")

    lips = local_ips()

    def on_packet(pkt):
        size = len(pkt)
        src = dst = ""
        sp = dp = 0
        proto = "OTHER"
        ip = pkt.getlayer(IP) or pkt.getlayer(IPv6)
        if ip is not None:
            src, dst = ip.src, ip.dst
            if pkt.haslayer(TCP):
                sp, dp = pkt[TCP].sport, pkt[TCP].dport
                proto = port_proto(sp, dp, "TCP")
            elif pkt.haslayer(UDP):
                sp, dp = pkt[UDP].sport, pkt[UDP].dport
                proto = port_proto(sp, dp, "UDP")
            elif pkt.haslayer(ICMP):
                proto = "ICMP"
        sus, enc = flag_ports(sp, dp)
        push({"p": proto, "s": src, "d": dst, "sp": sp, "dp": dp,
              "b": size, "o": 1 if src in lips else 0,
              "t": int(time.time() * 1000), "x": sus, "e": enc})

    try:
        sniff(prn=on_packet, store=False, iface=iface)
    except Exception as exc:
        print(f"\n[!] Live capture failed: {exc}")
        print("    On Windows install Npcap (https://npcap.com) and run this")
        print("    script as Administrator, or try demo mode:")
        print("        python packet_highway.py --demo")
        os._exit(1)


DEMO_MIX = (["HTTPS"] * 45 + ["HTTP"] * 8 + ["DNS"] * 12 + ["TCP"] * 15
            + ["UDP"] * 12 + ["ICMP"] * 3 + ["OTHER"] * 5)


def demo_packet(me):
    """Build one plausible synthetic packet summary."""
    proto = random.choice(DEMO_MIX)
    outbound = random.random() < 0.45
    peer = ".".join(str(random.randint(1, 254)) for _ in range(4))
    sp, dp = random.randint(49152, 65535), 0
    latency = random.randint(2, 40) if random.random() < 0.8 \
        else random.randint(40, 130)

    if proto == "DNS":
        peer = random.choice(["1.1.1.1", "8.8.8.8", "9.9.9.9"])
        dp, size = 53, random.randint(60, 160)
    elif proto in ("HTTPS", "HTTP"):
        dp = 443 if proto == "HTTPS" else 80
        if outbound:
            size = random.choice([random.randint(60, 120),
                                  random.randint(200, 700)])
        else:
            size = (random.randint(1000, 1514) if random.random() < 0.6
                    else random.randint(100, 900))
    elif proto == "TCP":
        dp = random.choice([22, 8080, 5000, random.randint(1024, 65535)])
        size = random.choice([random.randint(60, 200),
                              random.randint(200, 1514)])
    elif proto == "UDP":
        dp = random.choice([123, 1900, 5353, random.randint(1024, 65535)])
        size = random.randint(60, 1200)
    elif proto == "ICMP":
        sp = dp = 0
        size = 74
    else:
        sp = dp = 0
        size = random.randint(42, 600)

    # the occasional probe against a sensitive port
    if random.random() < 0.005 and proto in ("TCP", "OTHER"):
        dp = random.choice(sorted(SUSPICIOUS_PORTS))
        size = random.randint(40, 120)

    sus, enc = flag_ports(sp, dp)
    base = {"p": proto, "b": size, "t": int(time.time() * 1000),
            "l": latency, "x": sus, "e": enc}
    if outbound:
        return {**base, "s": me, "d": peer, "sp": sp, "dp": dp, "o": 1}
    return {**base, "s": peer, "d": me, "sp": dp, "dp": sp, "o": 0}


def attack_packet(me):
    """One packet of the simulated DDoS flood."""
    return {
        "p": "TCP", "s": ATTACK["src"], "d": me,
        "sp": random.randint(1024, 65535),
        "dp": random.choice([445, 23, 4444]),
        "b": random.randint(40, 120), "o": 0,
        "t": int(time.time() * 1000),
        "l": random.randint(80, 200), "x": 1, "e": 0,
    }


def demo_source(push):
    """Generate a realistic-looking synthetic traffic stream."""
    me = "192.168.1.34"
    while True:
        if time.time() < ATTACK["until"]:
            time.sleep(0.012)
            for _ in range(random.randint(2, 5)):
                push(attack_packet(me))
            continue
        time.sleep(random.expovariate(16))
        # occasional burst, like a page load pulling in resources
        burst = random.randint(4, 18) if random.random() < 0.06 else 1
        for _ in range(burst):
            push(demo_packet(me))


# --------------------------------------------------------------------------
# WebSocket fan-out
# --------------------------------------------------------------------------

def make_push():
    def push(item):
        loop.call_soon_threadsafe(_put, item)

    def _put(item):
        if queue.qsize() < QUEUE_LIMIT:
            queue.put_nowait(item)

    return push


async def ws_handler(websocket):
    clients.add(websocket)
    try:
        await websocket.send(json.dumps({"type": "hello",
                                         "mode": capture_mode}))
        async for message in websocket:
            try:
                msg = json.loads(message)
            except ValueError:
                continue
            if msg.get("cmd") == "attack" and capture_mode == "demo":
                ATTACK["src"] = ".".join(
                    str(random.randint(1, 254)) for _ in range(4))
                ATTACK["until"] = time.time() + 8
    finally:
        clients.discard(websocket)


async def broadcaster():
    while True:
        await asyncio.sleep(BATCH_INTERVAL)
        items = []
        while not queue.empty():
            items.append(queue.get_nowait())
        if not items or not clients:
            continue
        shown = (items if len(items) <= MAX_CARS_PER_BATCH
                 else random.sample(items, MAX_CARS_PER_BATCH))
        message = json.dumps({
            "type": "batch",
            "n": len(items),
            "bytes": sum(p["b"] for p in items),
            "packets": shown,
        })
        websockets.broadcast(clients, message)


# --------------------------------------------------------------------------
# HTTP server for the built frontend
# --------------------------------------------------------------------------

class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def serve_static(port):
    handler = partial(QuietHandler, directory=str(DIST_DIR))
    HTTPServer(("127.0.0.1", port), handler).serve_forever()


# --------------------------------------------------------------------------

async def main(args):
    global queue, loop
    loop = asyncio.get_running_loop()
    queue = asyncio.Queue()

    if not DIST_DIR.exists():
        print("[!] dist/ not found - build the frontend first:")
        print("        npm install && npm run build")

    threading.Thread(target=serve_static, args=(args.port,),
                     daemon=True).start()

    push = make_push()
    if capture_mode == "demo":
        source = threading.Thread(target=demo_source, args=(push,),
                                  daemon=True)
    else:
        source = threading.Thread(target=live_source,
                                  args=(push, args.iface), daemon=True)
    source.start()

    print(f"  PacketHighway [{capture_mode.upper()}]")
    print(f"  dashboard  http://127.0.0.1:{args.port}")
    print(f"  websocket  ws://127.0.0.1:{args.ws_port}")
    print("  Ctrl+C to stop")

    async with websockets.serve(ws_handler, "127.0.0.1", args.ws_port):
        await broadcaster()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Live network traffic "
                                     "visualized as highway traffic.")
    parser.add_argument("--demo", action="store_true",
                        help="generate synthetic traffic instead of sniffing")
    parser.add_argument("--iface", default=None,
                        help="interface to sniff on (default: scapy's choice)")
    parser.add_argument("--port", type=int, default=8350,
                        help="HTTP port for the dashboard (default 8350)")
    parser.add_argument("--ws-port", type=int, default=8765,
                        help="WebSocket port (default 8765)")
    cli = parser.parse_args()
    capture_mode = "demo" if cli.demo else "live"
    try:
        asyncio.run(main(cli))
    except KeyboardInterrupt:
        pass
