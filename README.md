# Tuende Guide

**Tuende Guide** is a responsive web application built on HTML, CSS & Javascript. It is designed to help travelers, students, and individuals planning for relocation, to explore country and city facts, check weather conditions in order to plan adequayely for their travel.

* **GitHub Repository:** `https://github.com/dazzy-ji/nav_app.git`

* **Demo Video Link:** `https://youtu.be/qRBcZ3UU0FY`

* **Local Deployment URL:** `http://localhost:3000`

* **Load Balancer URL:** `http://18.170.38.182`

## Access & Login Details

* **Sign In /Sign Up:** Open the appication (`http://localhost:3000` locally or `http://18.170.38.182` via the load balancer), go to **My Account & Settings**, enter any valid email address (sucha as `traveler@example.com`), and click **Sign In / Sign Up**. No password is required.

* **Guest & Signed-In Modes:** You cann browse destinations in **Guest** mode; signing in activates a user session and enables persistent saved destinationsacross page reloads.


## Features & User Interactions
*  **Account & Session Management:** Switch between **Guest** and a signed -in user session with persistence across reloads.

* **Search, Filter & Sort:** Dynamically search, filter, and sort country and city destinations based on user input. 

* **Weather Information:** View destination weather details powered by the **Open-Meteo API**.

* **Save & Remove Destinations:** Save and remove destinations with persistence across page refreshes. 

## Architecture & Deployment

The applicatio is deployed across three Ubuntu servers using **Node.js**, **PM2**, and **HAProxy**

| Role | Hostname | Public IP | Configuration & Responsibility | 
| ----- | ----- | ----- | ----- | 
| **Web Server 1** | `7292-web-01` | `18.171.209.75` | Runs Node.js (`server.js`) on port `3000` via PM2 (`HOSTNAME=7292-web-01`, `PORT=3000`) | 
| **Web Server 2** | `7292-web-02` | `18.130.43.202` | Runs Node.js (`server.js`) on port `3000` via PM2 (`HOSTNAME=7292-web-02`, `PORT=3000`) | 
| **Load Balancer** | `7292-lb-01` | `18.170.38.182` | Runs HAProxy on port `80` with `roundrobin` balancing and backend health checks | 

## Running Locally

1. **Clone the repository:**

   ```
   git clone https://github.com/dazzy-ji/nav_app.git
   cd ~/nav_app
   
   ```

2. **Install production dependencies:**

   ```
   npm ci --omit=dev
   
   ```

3. **Create `.env`:**

   ```
   PORT=3000
   HOSTNAME=localhost
   
   ```

4. **Start the server:**

   ```
   node server.js
   
   ```

   Open `http://localhost:3000` in your browser.

## Running Through the Load Balancer

### 1. Deploy and Start the App on Web01 (`18.171.209.75`) and Web02 (`18.130.43.202`)

1. **SSH into each web server** and clone/pull the repository:

   ```
   ssh -i ~/.ssh/id_rsa ubuntu@18.171.209.75   # Web01 (repeat for 18.130.43.202)
   git clone https://github.com/dazzy-ji/nav_app.git
   cd ~/nav_app
   npm ci --omit=dev
   
   ```

2. **Configure the server environment variables** (set `HOSTNAME=7292-web-01` on Web01 and `HOSTNAME=7292-web-02` on Web02):

   ```
   cat << 'EOF' > ~/nav_app/.env
   PORT=3000
   HOSTNAME=7292-web-01
   EOF
   
   ```

3. **Open port `3000` in the firewall** so `7292-lb-01` can reach the Node.js backend:

   ```
   sudo ufw allow 3000/tcp
   
   ```

4. **Start the application with PM2** and save the process list:

   ```
   pm2 start server.js --name tuende-guide --update-env
   pm2 save
   
   ```

### 2. Configure and Start HAProxy on Lb01 (`18.170.38.182`)

1. **SSH into the load balancer** and install HAProxy if not already installed:

   ```
   ssh -i ~/.ssh/id_rsa ubuntu@18.170.38.182
   sudo apt-get update && sudo apt-get install -y haproxy
   
   ```

2. **Configure `/etc/haproxy/haproxy.cfg`** to listen on port `80` and balance requests round-robin across `7292-web-01` and `7292-web-02`:

   ```
   sudo tee /etc/haproxy/haproxy.cfg > /dev/null << 'EOF'
   global
       log /dev/log local0
       log /dev/log local1 notice
       maxconn 4096
       user haproxy
       group haproxy
       daemon
   
   defaults
       log     global
       mode    http
       option  httplog
       option  dontlognull
       timeout connect 5s
       timeout client  30s
       timeout server  30s
   
   frontend tuende_frontend
       bind *:80
       default_backend tuende_backends
   
   backend tuende_backends
       balance roundrobin
       option httpchk GET /api/health
       http-check expect status 200
       server web01 18.171.209.75:3000 check inter 5s fall 2 rise 2
       server web02 18.130.43.202:3000 check inter 5s fall 2 rise 2
   EOF
   
   ```

3. **Validate the configuration and restart HAProxy:**

   ```
   sudo haproxy -c -f /etc/haproxy/haproxy.cfg
   sudo systemctl enable haproxy
   sudo systemctl restart haproxy
   
   ```

4. **Access the live application:**
   Open `http://18.170.38.182` in your browser.

## Verifying Load Balancing & Failover

### 1. Traffic Distribution

Run from `7292-lb-01` or your local terminal:

```
for i in 1 2 3 4 5 6; do
  curl -s http://18.170.38.182/api/health
  echo ""
done

```

Responses alternate between `7292-web-01` and `7292-web-02`.

### 2. Failover & Recovery

1. On `7292-web-01`, stop the application process:

   ```
   pm2 stop tuende-guide
   
   ```

2. Re-run the `curl` loop against `http://18.170.38.182/api/health` to verify requests continue serving from `7292-web-02`.

3. Start `7292-web-01` back up so both backend nodes remain active:

   ```
   pm2 start tuende-guide
   
   ```
## Credits & Attribution

* **Weather Data:** [Open-Meteo API](https://open-meteo.com/)
