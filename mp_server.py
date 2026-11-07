"""NEON BAY online server: shared city, smooth player sync and voice-chat signalling.

    python mp_server.py                 # http://localhost:8005  (and https://<lan-ip>:8445 for other devices)
    python mp_server.py --port 8003     # what launch.py uses

Everyone who opens the game from this server can press PLAY ONLINE on the title screen, pick the same room name
and drive around the same city together, with proximity voice chat.

Voice chat needs a microphone, and browsers only allow microphones on https:// pages or http://localhost.
That's why the server also runs HTTPS on port 8445 with a self-signed certificate. Other PCs and phones on your
Wi-Fi open https://<lan-ip>:8445 and click "Advanced -> Proceed" once.
To play over the internet with no server at all, open the game from GitHub Pages: it switches to peer-to-peer mode
(see js/p2p.js), where the first player's browser hosts the room.

Needs: pip install fastapi uvicorn cryptography
"""
import argparse
import asyncio
import datetime
import ipaddress
import json
import random
import re
import socket
import time
from pathlib import Path

import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

ROOT = Path(__file__).parent
CERT_DIR = Path.home() / ".neonbay-mp"  # outside the served folder so the private key is never downloadable
TICK = 1 / 20  # snapshot rate (Hz)
MAX_PLAYERS = 16
COLORS = ["#22d3ee", "#ff3df2", "#ffd60a", "#19f5a0", "#ff7b00", "#c77dff", "#4cc9f0", "#ff4d6d",
          "#a3e635", "#f472b6", "#60a5fa", "#facc15", "#34d399", "#fb7185", "#818cf8", "#fdba74"]

app = FastAPI()


def now_ms():
    return time.monotonic() * 1000.0


class Player:
    def __init__(self, pid, name, ws, color):
        self.id, self.name, self.ws, self.color = pid, name, ws, color
        self.state = None
        self.out = asyncio.Queue(maxsize=96)
        self.joined = now_ms()

    def info(self):
        return {"id": self.id, "name": self.name, "color": self.color}

    def push(self, msg, droppable=False):
        """Queue a message. Snapshots are droppable: a slow client just skips some instead of lagging behind."""
        data = msg if isinstance(msg, str) else json.dumps(msg, separators=(",", ":"))
        try:
            self.out.put_nowait(data)
        except asyncio.QueueFull:
            if droppable:
                return
            try:  # make room for an important message by dropping the oldest queued one
                self.out.get_nowait()
                self.out.put_nowait(data)
            except (asyncio.QueueEmpty, asyncio.QueueFull):
                pass


class Room:
    def __init__(self, name):
        self.name = name
        self.players: dict[str, Player] = {}
        self.host = None

    def broadcast(self, msg, skip=None, droppable=False):
        data = json.dumps(msg, separators=(",", ":"))
        for p in self.players.values():
            if p.id != skip:
                p.push(data, droppable)


rooms: dict[str, Room] = {}


def clean(text, n, default):
    text = re.sub(r"[\x00-\x1f<>]", "", str(text or "")).strip()[:n]
    return text or default


@app.get("/mp/info")
def info():
    return JSONResponse({"ok": True, "rooms": {k: len(r.players) for k, r in rooms.items() if r.players}, "max": MAX_PLAYERS},
                        headers={"Cache-Control": "no-store"})


@app.middleware("http")
async def no_cache(request, call_next):
    resp = await call_next(request)
    resp.headers["Cache-Control"] = "no-cache"
    return resp


@app.websocket("/mp/ws")
async def ws_endpoint(ws: WebSocket):
    await ws.accept()
    try:
        hello = json.loads(await asyncio.wait_for(ws.receive_text(), 10))
    except Exception:
        await ws.close()
        return
    room_name = clean(hello.get("room"), 24, "bay").lower()
    room = rooms.setdefault(room_name, Room(room_name))
    if len(room.players) >= MAX_PLAYERS:
        await ws.send_text(json.dumps({"type": "full", "max": MAX_PLAYERS}))
        await ws.close()
        return
    pid = "%06x" % random.getrandbits(24)
    used = {p.color for p in room.players.values()}
    color = next((c for c in COLORS if c not in used), random.choice(COLORS))
    me = Player(pid, clean(hello.get("name"), 18, "Player"), ws, color)
    room.players[pid] = me
    if room.host not in room.players:
        room.host = pid
    me.push({"type": "welcome", "id": pid, "room": room_name, "host": room.host, "color": color, "t": now_ms(),
             "peers": [p.info() for p in room.players.values() if p.id != pid]})
    room.broadcast({"type": "join", **me.info()}, skip=pid)
    print(f"[{room_name}] + {me.name} ({len(room.players)} online)")

    async def writer():
        try:
            while True:
                await ws.send_text(await me.out.get())
        except Exception:
            pass

    wtask = asyncio.create_task(writer())
    try:
        while True:
            raw = await ws.receive_text()
            if len(raw) > 64_000:
                continue
            try:
                m = json.loads(raw)
            except ValueError:
                continue
            t = m.get("type")
            if t == "state":
                me.state = m.get("s")
            elif t == "ping":
                me.push({"type": "pong", "c": m.get("c"), "t": now_ms()})
            elif t in ("rtc", "evt"):  # point-to-point: WebRTC signalling, hits between players
                to = room.players.get(m.get("to"))
                if to:
                    to.push({"type": t, "from": pid, "data": m.get("data")})
            elif t == "chat":
                text = clean(m.get("text"), 200, "")
                if text:
                    room.broadcast({"type": "chat", "from": pid, "name": me.name, "color": me.color, "text": text})
            elif t == "env" and room.host == pid:  # host keeps everyone's clock and weather in step
                room.broadcast({"type": "env", "data": m.get("data")}, skip=pid)
    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        wtask.cancel()
        room.players.pop(pid, None)
        room.broadcast({"type": "leave", "id": pid})
        if room.host == pid and room.players:
            room.host = min(room.players.values(), key=lambda p: p.joined).id
            room.broadcast({"type": "host", "id": room.host})
        if not room.players:
            rooms.pop(room_name, None)
        print(f"[{room_name}] - {me.name} ({len(room.players)} online)")


async def ticker():
    """Send each room a 20 Hz snapshot of every player's latest state, stamped with server time."""
    while True:
        t0 = time.monotonic()
        for room in list(rooms.values()):
            states = {p.id: p.state for p in room.players.values() if p.state}
            if len(room.players) > 1:
                room.broadcast({"type": "snap", "t": now_ms(), "p": states}, droppable=True)
        await asyncio.sleep(max(0.0, TICK - (time.monotonic() - t0)))


app.mount("/", StaticFiles(directory=ROOT, html=True), name="game")


def lan_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()


def ensure_cert(ip):
    """Make (or reuse) a self-signed certificate for localhost + this PC's LAN address."""
    try:
        from cryptography import x509
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import rsa
        from cryptography.x509.oid import NameOID
    except ImportError:
        return None
    CERT_DIR.mkdir(exist_ok=True)
    crt, key = CERT_DIR / "cert.pem", CERT_DIR / "key.pem"
    tag = CERT_DIR / "ip.txt"
    if crt.exists() and key.exists() and tag.exists() and tag.read_text() == ip:
        return str(crt), str(key)
    k = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "Neon Bay local server")])
    alt = [x509.DNSName("localhost"), x509.IPAddress(ipaddress.ip_address("127.0.0.1"))]
    if ip != "127.0.0.1":
        alt.append(x509.IPAddress(ipaddress.ip_address(ip)))
    now = datetime.datetime.now(datetime.timezone.utc)
    cert = (x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(k.public_key())
            .serial_number(x509.random_serial_number()).not_valid_before(now - datetime.timedelta(days=1))
            .not_valid_after(now + datetime.timedelta(days=825)).add_extension(x509.SubjectAlternativeName(alt), critical=False)
            .sign(k, hashes.SHA256()))
    key.write_bytes(k.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.TraditionalOpenSSL, serialization.NoEncryption()))
    crt.write_bytes(cert.public_bytes(serialization.Encoding.PEM))
    tag.write_text(ip)
    return str(crt), str(key)


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8005)
    ap.add_argument("--https-port", type=int, default=8445)
    ap.add_argument("--no-https", action="store_true")
    a = ap.parse_args()
    ip = lan_ip()
    servers = [uvicorn.Server(uvicorn.Config(app, host="0.0.0.0", port=a.port, log_level="warning", ws_ping_interval=10, ws_ping_timeout=20))]
    cert = None if a.no_https else ensure_cert(ip)
    if cert:
        servers.append(uvicorn.Server(uvicorn.Config(app, host="0.0.0.0", port=a.https_port, log_level="warning", lifespan="off",
                                                     ssl_certfile=cert[0], ssl_keyfile=cert[1], ws_ping_interval=10, ws_ping_timeout=20)))
    print(f"\n  NEON BAY online server\n\n  This PC:         http://localhost:{a.port}")
    if cert:
        print(f"  Other devices:   https://{ip}:{a.https_port}   (same Wi-Fi; click Advanced -> Proceed once)")
    print("\n  On the title screen press PLAY ONLINE and use the same room name.\n  Ctrl+C to stop.\n")
    tick = asyncio.create_task(ticker())
    try:
        await asyncio.gather(*(s.serve() for s in servers))
    finally:
        tick.cancel()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
