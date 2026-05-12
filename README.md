# Online Combat

快节奏多人网页割草对战原型。玩家打开网页后输入名字，点击“马上开战”即可自动匹配房间。

## 游戏内容文档

面向 AI 读取和后续维护的代码来源文档在 [`docs/GAME_CONTENT.md`](docs/GAME_CONTENT.md)。后续新增或修改玩法、数值、敌人、载具、武器、天气、房间规则时，同步维护该文档。

## 玩法状态

- 固定 3 个战区房间，1、2 房为普通模式，3 房为大逃杀缩圈模式
- 每个房间 15 分钟一局
- 玩家进入房间前选择 A / B / C 阵营
- 房间人数不设上限
- 15 分钟结束时，阵营积分最高者获胜
- 小地图显示 Boss、自己、同阵营玩家和敌对玩家位置
- 每 3 分钟一波高仇恨怪物入侵
- 第 5 分钟后每 1 分钟一波狂暴小兵
- 宝箱需要攻击打破，掉落载具气泡
- 载具、武器槽、升级、临时 Buff、天气、手机端摇杆已接入
- 完整规则和数值以 `docs/GAME_CONTENT.md` 为准

## 本地运行

开发调试：

```bash
npm install
npm run build
npm start
```

默认本地访问：

```text
http://127.0.0.1:8080/
```

如果要模拟服务器上的 `/game` 子路径：

```bash
npm run build:game
APP_BASE_PATH=/game npm start
```

Windows PowerShell：

```powershell
npm run build:game
$env:APP_BASE_PATH="/game"; npm start
```

访问：

```text
http://127.0.0.1:8080/game/
```

## Docker 部署

项目默认 Docker 配置已经按 `/game` 子路径打包和运行：

```bash
docker compose up -d --build
```

容器内服务监听 `8080`，访问路径：

```text
http://服务器IP:8080/game/
```

查看状态：

```bash
docker compose ps
docker compose logs -f
```

停止：

```bash
docker compose down
```

## 腾讯云 Ubuntu 部署到域名 /game

假设你的域名是：

```text
example.com
```

目标访问地址：

```text
https://example.com/game/
```

### 1. 安装 Docker

```bash
sudo apt update
sudo apt install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

sudo tee /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

验证：

```bash
docker --version
docker compose version
```

### 2. 拉取项目

```bash
cd /opt
sudo git clone https://github.com/feimaoT/online_combat.git
sudo chown -R $USER:$USER /opt/online_combat
cd /opt/online_combat
```

### 3. 启动游戏服务

```bash
docker compose up -d --build
```

确认容器正常：

```bash
docker compose ps
curl -I http://127.0.0.1:8080/game/
```

### 4. 配置 Nginx 反向代理

如果服务器没装 Nginx：

```bash
sudo apt install -y nginx
```

新建配置：

```bash
sudo nano /etc/nginx/sites-available/online-combat
```

写入，把 `example.com` 替换成你的域名：

```nginx
server {
    listen 80;
    server_name example.com;

    location = /game {
        return 301 /game/;
    }

    location ^~ /game/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
```

启用配置：

```bash
sudo ln -sf /etc/nginx/sites-available/online-combat /etc/nginx/sites-enabled/online-combat
sudo nginx -t
sudo systemctl reload nginx
```

访问：

```text
http://example.com/game/
```

### 5. 腾讯云安全组

腾讯云控制台安全组需要放行：

- TCP 80
- 如果你要 HTTPS，再放行 TCP 443

不需要对公网开放 8080；8080 只给本机 Nginx 反代即可。

### 6. HTTPS

域名解析到服务器后，可以用 Certbot：

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d example.com
```

完成后访问：

```text
https://example.com/game/
```

## 更新部署

本机提交并推送：

```bash
git add .
git commit -m "update game"
git push
```

服务器更新：

```bash
cd /opt/online_combat
git pull
docker compose up -d --build
```

## 说明

当前多人版本是快节奏娱乐原型。积分由客户端上报，适合朋友测试和小范围试玩。若要公开运营，需要把敌人、伤害、击杀和积分改成服务端权威判定，避免作弊。
