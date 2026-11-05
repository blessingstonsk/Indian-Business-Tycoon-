# Deploying to Oracle Cloud (Always Free)

The game runs as three pieces:

| Piece | Where | Cost |
|---|---|---|
| Website (React build) | GitHub Pages | free |
| Game server (Node 22 + HTTPS via Caddy) | Oracle Cloud VM, Ubuntu | Always Free |
| Database | Oracle Autonomous Database (Transaction Processing) | Always Free |

Sign-in uses a **Google OAuth client ID**, which is free.

> **Keep secrets out of chat and git.** The database password and session secret live only in `/etc/ibt/server.env` on the VM. The connect string, client ID and server URL are not secret.

## 1. Create the VM

1. In the OCI console, go to ☰ → **Compute → Instances → Create instance**.
2. Fill in the instance:
   - Image: **Canonical Ubuntu 24.04**.
   - Shape: **VM.Standard.A1.Flex** with 1 OCPU and 6 GB. If it's out of capacity, use **VM.Standard.E2.1.Micro**.
   - Networking: create a VCN with a **public subnet**, and keep **Assign a public IPv4 address** on.
   - SSH keys: **Generate a key pair for me**, then download the private key.
3. Click **Create**, then note the **public IP**.
4. On the instance page, click the subnet, then **Security Lists → Default → Add Ingress Rules**. Add two rules with source `0.0.0.0/0` and TCP destination ports **80** and **443**.

## 2. Create the database

1. ☰ → **Oracle Database → Autonomous Database → Create**. Turn on **Always Free** and choose workload **Transaction Processing**.
2. Set an **ADMIN** password and keep it private.
3. Network access:
   - Choose **Secure access from allowed IPs and VCNs only**, and add the VM's public IP.
   - **Untick "Require mutual TLS (mTLS) authentication"** so the server can connect over plain TLS without a wallet.
4. When it's ready, open **Database actions → SQL** and run [`deploy/oracle/01-create-app-user.sql`](../deploy/oracle/01-create-app-user.sql) with your own password.
5. Click **Database connection**, set **TLS authentication: TLS**, and copy the connection string for the entry ending in **`_tp`**.

## 3. Create the Google sign-in client

1. At [console.cloud.google.com](https://console.cloud.google.com), go to **APIs & Services**.
2. Configure the **OAuth consent screen**: External, with an app name and your email.
3. Go to **Credentials → Create credentials → OAuth client ID → Web application**.
4. Under **Authorized JavaScript origins**, add `https://blessingstonsk.github.io` and `http://localhost:5173`.
5. Copy the **Client ID** (it ends in `.apps.googleusercontent.com`).

## 4. Install the server on the VM

SSH in. On Windows PowerShell:

```powershell
ssh -i path\to\ssh-key.key ubuntu@YOUR_PUBLIC_IP
```

Then run:

```bash
curl -fsSL https://raw.githubusercontent.com/blessingstonsk/Indian-Business-Tycoon-/main/deploy/oci/setup.sh | bash
```

This script:
- installs Node 22, git and Caddy,
- opens ports 80/443 in the VM firewall,
- clones and builds the server,
- creates `/etc/ibt/server.env` with a random `SESSION_SECRET`,
- installs the `ibt-server` service,
- points Caddy at `https://<your-ip-with-dashes>.sslip.io`, which gets a free Let's Encrypt certificate.

Fill in the settings:

```bash
sudo nano /etc/ibt/server.env
```

| Setting | Value |
|---|---|
| `ORACLE_USER` | `IBT_APP` |
| `ORACLE_PASSWORD` | the password from step 2.4 |
| `ORACLE_CONNECT_STRING` | the `_tp` TLS connection string from step 2.5 (paste it whole) |
| `GOOGLE_CLIENT_ID` | the client ID from step 3 |
| `ALLOWED_ORIGINS` | `https://blessingstonsk.github.io,http://localhost:5173` |

Then start the server:

```bash
sudo systemctl restart ibt-server && sleep 3 && curl -s https://YOUR-IP-WITH-DASHES.sslip.io/health
```

You should see `{"ok":true,...,"google":true,...}`. Logs are in `journalctl -u ibt-server -f`.

## 5. Point the website at the server

In GitHub, go to **Settings → Secrets and variables → Actions → Variables** and add:

| Variable | Value |
|---|---|
| `VITE_API_URL` | `https://YOUR-IP-WITH-DASHES.sslip.io` |
| `VITE_GOOGLE_CLIENT_ID` | the client ID from step 3 |

Then open **Actions → Deploy to GitHub Pages → Run workflow**. Once it finishes, open the site and sign in with Google.

## Updating

After pushing new code, run this on the VM:

```bash
sudo bash /opt/ibt/deploy/oci/update.sh
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| `curl …/health` times out | Check the security list has the 80/443 ingress rules, and that `sudo iptables -L INPUT` shows ACCEPT for 80/443 before the REJECT line. |
| Caddy can't get a certificate | Ports 80/443 must be reachable from the internet first. Check with `journalctl -u caddy`. |
| `ORA-12506` / connection refused | Add the VM's public IP to the database's allowed IPs, and make sure mTLS is **not** required. |
| `ORA-01017` | Wrong `ORACLE_USER` or `ORACLE_PASSWORD`. |
| Google button says the origin isn't allowed | Add the exact site origin to the OAuth client's **Authorized JavaScript origins**. Changes can take a few minutes. |
| Browser console shows a CORS error | Add the site origin to `ALLOWED_ORIGINS`, then `sudo systemctl restart ibt-server`. |
