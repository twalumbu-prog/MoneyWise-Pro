# Lipila relay on an Oracle Cloud Always Free server

Lipila only processes payouts from IP addresses whitelisted on the wallet (Wallets > the wallet > Security > IP Whitelisting). Vercel's
addresses change, so payouts go through a tiny relay on a server with one fixed IP. That IP is the only one you whitelist.

The relay (`relay/lipila-relay.mjs`) is not an open proxy: it needs a shared secret, and forwards only Lipila payout calls
(`/api/v1/disbursements/...` and the balance). It keeps no key or body in its logs.

Screen names below are from memory and Oracle changes its console, so follow the intent if a label differs.

## 1. Create the Oracle account (you do this)
1. Sign up at oracle.com/cloud/free. A card is needed to verify you; Always Free resources are not charged. Pick the home region closest to you
   (it cannot be changed later).
2. Keep the account active: Oracle can reclaim idle Always Free servers, so the relay should receive a request now and then (the health check below counts).

## 2. Create the server
1. Menu > Compute > Instances > Create instance.
2. Image: Ubuntu 22.04 or 24.04. Shape: pick one marked "Always Free eligible" (the AMD `VM.Standard.E2.1.Micro` is enough).
3. Networking: use the default network and **assign a public IPv4 address**.
4. Add your SSH public key (or let Oracle generate one and download it).
5. Create. Note the public IP.
6. Make the IP permanent: Networking > IP management > Reserved public IPs > Reserve, then attach it to the instance's network interface
   (Always Free includes one reserved IP). The address you whitelist must be this reserved one.
7. Open ports 80 and 443: the instance's subnet > Security List > Add ingress rules from `0.0.0.0/0` for TCP 80 and 443.
   Also open them in the server's own firewall (step 3).

## 3. Set up the server (over SSH, as the ubuntu user)
```bash
sudo apt update && sudo apt install -y nodejs caddy   # Node must be 18 or newer: check with `node -v`; if older, install from nodesource.com
sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT && sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT
sudo mkdir -p /opt/lipila-relay && sudo chown ubuntu /opt/lipila-relay
```
Copy `relay/lipila-relay.mjs` to `/opt/lipila-relay/` (for example with `scp`). Make a secret and keep it:
```bash
openssl rand -hex 32
```
Run it as a service: create `/etc/systemd/system/lipila-relay.service`
```ini
[Unit]
Description=Lipila relay
After=network-online.target

[Service]
User=ubuntu
Environment=RELAY_SECRET=PUT_THE_SECRET_HERE
ExecStart=/usr/bin/node /opt/lipila-relay/lipila-relay.mjs
Restart=always

[Install]
WantedBy=multi-user.target
```
```bash
sudo systemctl daemon-reload && sudo systemctl enable --now lipila-relay
```

## 4. HTTPS (the key and secret must not travel in plain text)
No domain is needed: `sslip.io` turns the IP into a hostname (203.0.113.5 becomes `203-0-113-5.sslip.io`). Put this in `/etc/caddy/Caddyfile`
(replace the hostname with yours) and reload:
```
203-0-113-5.sslip.io {
    reverse_proxy 127.0.0.1:8080
}
```
```bash
sudo systemctl reload caddy
curl https://203-0-113-5.sslip.io/health      # {"ok":true}
```
Caddy gets the certificate by itself.

## 5. Whitelist and connect
1. In Lipila: Wallets > the wallet > Security > IP Whitelisting > add the reserved IP.
2. In Vercel (the API project), set:
   - `LIPILA_RELAY_URL` = `https://203-0-113-5.sslip.io`
   - `LIPILA_RELAY_SECRET` = the same secret as the service
   Then redeploy the API. (For local testing, put them in `apps/api/.env`.) With these unset, the API calls Lipila directly as before.
3. Send a K10 payout. The relay's log (`journalctl -u lipila-relay`) shows a line per call, such as `POST /api/v1/disbursements/bank -> 200`.

## Rotating the secret
Change `RELAY_SECRET` in the service file, `sudo systemctl restart lipila-relay`, and update `LIPILA_RELAY_SECRET` in Vercel.
