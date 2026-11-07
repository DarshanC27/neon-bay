// ---------- serverless multiplayer: one player's browser hosts the room ----------
// Used when the game is opened without mp_server.py (e.g. from GitHub Pages). P2PSock looks like a WebSocket to net.js
// (send / close / onopen / onmessage / onclose), so everything else (sync, voice, chat, hits) works unchanged.
// The first player in a room claims the peer id "neonbay-v1-<room>" and runs the same room logic as mp_server.py
// in their browser; everyone else connects to them over WebRTC data channels. The public PeerJS broker is only used
// to introduce browsers to each other. If the host leaves, everyone reconnects and the first to grab the id hosts.
(function () {
  const PEERJS = "https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js";
  const ICE = [
    { urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" },
    { urls: ["turn:openrelay.metered.ca:80", "turn:openrelay.metered.ca:443", "turn:openrelay.metered.ca:443?transport=tcp"], username: "openrelayproject", credential: "openrelayproject" },
  ];
  G.ICE_SERVERS = ICE;
  const MAX = 16, TICK = 50;
  const COLORS = ["#22d3ee", "#ff3df2", "#ffd60a", "#19f5a0", "#ff7b00", "#c77dff", "#4cc9f0", "#ff4d6d", "#a3e635", "#f472b6", "#60a5fa", "#facc15", "#34d399", "#fb7185", "#818cf8", "#fdba74"];
  let libP = null;
  function loadLib() {
    if (window.Peer) return Promise.resolve();
    return libP || (libP = new Promise((res, rej) => {
      const s = document.createElement("script"); s.src = PEERJS; s.async = true;
      s.onload = () => res(); s.onerror = () => { libP = null; s.remove(); rej(new Error("could not load PeerJS")); };
      document.head.appendChild(s);
    }));
  }
  const rid = () => Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, "0");
  const clean = (t, n, d) => (String(t || "").replace(/[\x00-\x1f<>]/g, "").trim().slice(0, n) || d);

  class P2PSock {
    constructor(room) {
      this.readyState = 0; this.onopen = this.onmessage = this.onclose = null;
      this.room = clean(room, 24, "bay").toLowerCase().replace(/[^a-z0-9_-]/g, "-");
      this.hostId = "neonbay-v1-" + this.room; this.tries = 0; this.closed = false;
      this.unload = () => this.close(); addEventListener("pagehide", this.unload);
      loadLib().then(() => this.claimHost(), (e) => { console.warn(e); this._close(); });
    }
    opts() { return { debug: 0, config: { iceServers: ICE } }; }
    // ---- try to be the host; if the id is taken, join whoever has it
    claimHost() {
      if (this.closed) return;
      if (++this.tries > 5) return this._close();
      const peer = (this.peer = new Peer(this.hostId, this.opts()));
      peer.on("open", () => this.becomeHost());
      peer.on("error", (e) => {
        if (e.type === "unavailable-id") { peer.destroy(); this.join(); }
        else if (this.readyState !== 1 || ["network", "server-error", "socket-error", "socket-closed", "browser-incompatible"].includes(e.type)) this._close();
      });
    }
    join() {
      if (this.closed) return;
      const peer = (this.peer = new Peer(this.opts()));
      peer.on("open", () => {
        const conn = (this.conn = peer.connect(this.hostId, { reliable: true, serialization: "raw" }));
        const to = setTimeout(() => { if (this.readyState !== 1) { peer.destroy(); this.claimHost(); } }, 12000);
        conn.on("open", () => { clearTimeout(to); this._open(); });
        conn.on("data", (d) => this._deliver(typeof d === "string" ? d : new TextDecoder().decode(d)));
        conn.on("close", () => this._close()); conn.on("error", () => this._close());
      });
      peer.on("error", (e) => {
        if (e.type === "peer-unavailable") { peer.destroy(); setTimeout(() => this.claimHost(), 300 + Math.random() * 700); } // host just left: race to take over
        else if (this.readyState !== 1) this._close();
        else if (["network", "server-error", "socket-error"].includes(e.type) && !(this.conn && this.conn.open)) this._close();
      });
    }
    // ---- host: the same room logic as mp_server.py, running in this browser
    becomeHost() {
      this.isHost = true; this.players = new Map(); this.hostPid = null; this.tickN = 0;
      this.peer.on("connection", (conn) => {
        conn.on("data", (d) => this.hostRecv(conn, typeof d === "string" ? d : new TextDecoder().decode(d)));
        conn.on("close", () => this.hostDrop(conn)); conn.on("error", () => this.hostDrop(conn));
      });
      // the broker connection only matters for new joiners: keep it alive, the game keeps running if it drops
      this.peer.on("disconnected", () => { if (!this.closed) setTimeout(() => { try { this.peer.reconnect(); } catch (e) { /* destroyed */ } }, 1500); });
      this.tick = setInterval(() => this.hostTick(), TICK);
      this._open();
    }
    hostSend(p, obj) {
      const s = typeof obj === "string" ? obj : JSON.stringify(obj);
      if (p.self) queueMicrotask(() => this._deliver(s));
      else if (p.conn.open) { try { p.conn.send(s); } catch (e) { /* closing */ } }
    }
    hostBroadcast(obj, skip) { const s = JSON.stringify(obj); for (const p of this.players.values()) if (p.id !== skip) this.hostSend(p, s); }
    hostRecv(conn, raw) {
      if (raw.length > 64000) return;
      let m; try { m = JSON.parse(raw); } catch (e) { return; }
      let me = conn ? [...this.players.values()].find((p) => p.conn === conn) : [...this.players.values()].find((p) => p.self);
      if (!me) {
        if (m.type !== "hello") return;
        if (this.players.size >= MAX) { if (conn) { conn.send(JSON.stringify({ type: "full", max: MAX })); setTimeout(() => conn.close(), 300); } return; }
        const used = new Set([...this.players.values()].map((p) => p.color));
        me = { id: rid(), name: clean(m.name, 18, "Player"), color: COLORS.find((c) => !used.has(c)) || COLORS[0], conn, self: !conn, state: null, joined: performance.now() };
        this.players.set(me.id, me); if (!this.hostPid) this.hostPid = me.id;
        const info = (p) => ({ id: p.id, name: p.name, color: p.color });
        this.hostSend(me, { type: "welcome", id: me.id, room: this.room, host: this.hostPid, color: me.color, t: performance.now(), peers: [...this.players.values()].filter((p) => p !== me).map(info) });
        this.hostBroadcast({ type: "join", ...info(me) }, me.id);
        return;
      }
      switch (m.type) {
        case "state": me.state = m.s; this.hostBroadcast({ type: "snap", t: performance.now(), part: 1, p: { [me.id]: m.s } }, me.id); break; // relay at once: states carry their own timestamps
        case "ping": this.hostSend(me, { type: "pong", c: m.c, t: performance.now() }); break;
        case "rtc": case "evt": { const to = this.players.get(m.to); if (to) this.hostSend(to, { type: m.type, from: me.id, data: m.data }); break; }
        case "chat": { const text = clean(m.text, 200, ""); if (text) this.hostBroadcast({ type: "chat", from: me.id, name: me.name, color: me.color, text }); break; }
        case "env": if (me.id === this.hostPid) this.hostBroadcast({ type: "env", data: m.data }, me.id); break;
      }
    }
    hostDrop(conn) {
      const p = [...this.players.values()].find((q) => q.conn === conn); if (!p) return;
      this.players.delete(p.id); this.hostBroadcast({ type: "leave", id: p.id });
    }
    hostTick() { // full roll-call once a second so everyone agrees who is in the menu / in the world
      if (this.players.size < 2 || ++this.tickN % 20) return;
      const states = {}; for (const p of this.players.values()) if (p.state) states[p.id] = p.state;
      this.hostBroadcast({ type: "snap", t: performance.now(), p: states });
    }
    // ---- WebSocket-like surface
    send(s) {
      if (this.readyState !== 1) return;
      if (this.isHost) this.hostRecv(null, s);
      else if (this.conn && this.conn.open) { try { this.conn.send(s); } catch (e) { /* closing */ } }
    }
    close() { this.closed = true; this._close(); }
    _open() { if (this.readyState === 1) return; this.readyState = 1; this.onopen && this.onopen(); }
    _deliver(s) { if (this.readyState === 1 && this.onmessage) this.onmessage({ data: s }); }
    _close() {
      if (this.readyState === 3) return; this.readyState = 3;
      clearInterval(this.tick); removeEventListener("pagehide", this.unload);
      try { this.peer && this.peer.destroy(); } catch (e) { /* gone */ }
      this.onclose && this.onclose();
    }
  }
  G.P2PSock = P2PSock;
})();
