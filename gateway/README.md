# XYvirtual Gateway

Server-side bridge between industrial controllers and XYvirtual WEB, owned by this project
(ADR-0023). It speaks the browser's existing **WebSocket Realtime v2** protocol, so the WEB
connects with its built-in `websocket-realtime` interface — no browser change is needed.

| Direction | What it does |
| --- | --- |
| South (PLC) | OPC UA client (node-opcua): one subscription, one monitored item per configured signal, explicit writes |
| North (WEB) | `WS /ws` Realtime v2 (`init`, `import_request`/`import_answer`, `subscribe`, `snapshot`, `data`) |
| History | Value changes into InfluxDB v2; `GET /history/status`, `/history/signals`, `/history/query` for the HMI trend panel |
| Health | `GET /health` — public, no secrets |

XYvirtual CONNECT remains usable as an optional third-party gateway; this gateway does not
replace CONNECT-only features (AI agents, CONNECT self-update, CONNECT plugin catalog).

## Run

```bash
cd gateway
npm ci --ignore-scripts
export XYV_GATEWAY_API_KEY=... XYV_OPCUA_PASSWORD=... XYV_INFLUX_TOKEN=...
node src/main.mjs --config /etc/xyvirtual-gateway/gateway.json
```

In the browser: Settings → Interfaces → **WebSocket Realtime**, address/port of the gateway,
path `/ws`, and the API key as the auth token. In the Offline Appliance the gateway is preset
behind the HTTPS entry at `/gateway/ws`.

## Configuration

See `gateway.example.json`. The file is validated strictly; unknown keys are rejected so a typo
cannot silently disable a safety setting.

- **Signals are explicit.** Each entry maps a WEB signal name to an OPC UA NodeId and a PLC type
  (`PLCInputBool|Int|Float`, `PLCOutputBool|Int|Float`). Direction is from the PLC's point of
  view: `PLCInput*` is written by the WEB, `PLCOutput*` by the PLC. Nothing is published that is
  not configured.
- **Writes are opt-in.** Only `PLCInput*` signals with `"writable": true` accept writes, with type,
  OPC UA data-type range and optional `min`/`max` checks. `"readOnly": true` disables all writes.
- **Every write attempt is audited** to `audit.path` (JSON Lines): `rejected`, `written`, `failed`,
  or `unknown`. A timed-out or disconnected write is `unknown` and is **never retried** — read the
  PLC state before deciding to write again.
- **Secrets are never in the file.** `apiKeyEnv`, `source.identity.passwordEnv` and
  `history.tokenEnv` name environment variables. A username identity requires `Sign` or
  `SignAndEncrypt`, so a password never crosses the network in clear text.
- **Certificates.** With `pkiDir` set, the client keeps its certificate and trust lists there;
  unknown server certificates are rejected until an administrator moves them from
  `pkiDir/rejected` to `pkiDir/trusted`.

## Test

```bash
npm test
```

The integration test runs a real node-opcua **server** in-process as a stand-in PLC and an
InfluxDB HTTP mock. It verifies the protocol, the write policy, auditing, history and
reconnection. **It is not a real-PLC acceptance**: real controllers, real OPC UA servers,
certificates issued by customer PKI and plant networks must be validated separately, with
authorization and supervision (IO-4).
