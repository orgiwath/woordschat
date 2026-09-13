# Woordschat — déploiement auto-hébergé

Cette version remplace le stockage `localStorage` (propre à chaque téléphone/tablette)
par un petit serveur qui garde une seule copie partagée des mots, catégories et
du progrès de Charlie. Résultat : un mot ajouté depuis l'espace parent apparaît
automatiquement sur tous les appareils qui ouvrent l'application, sans rien
republier ni resynchroniser manuellement. L'appli va chercher les nouveautés
au démarrage, toutes les 25 secondes, et à chaque fois qu'on revient dessus.

Ce dossier contient tout ce qu'il faut pour le faire tourner sur ton
infrastructure OVH, avec Docker et un reverse-proxy Nginx.

## Ce qu'il y a dans ce dossier

```
server.js              le serveur (Node.js + Express)
package.json
Dockerfile
docker-compose.yml
public/index.html      l'application (identique visuellement, mais parle au serveur)
nginx/woordschat.conf  config Nginx prête à l'emploi (à adapter avec ton domaine)
data/                  (créé automatiquement) contient state.json, la "base de données"
```

Il n'y a pas de vraie base de données relationnelle : tout l'état (mots,
catégories, progrès, code parent) tient dans un seul fichier JSON,
`data/state.json`, réécrit de façon atomique à chaque changement. C'est
largement suffisant pour un seul enfant et ça rend les sauvegardes triviales
(voir plus bas).

## Architecture recommandée

Un seul petit conteneur Docker suffit largement pour cet usage — pas besoin
de load balancer, de base de données séparée, ni de scaling. Deux variantes
possibles selon où tourne Nginx :

**Variante A — Nginx sur la même machine que Docker** (ex. un seul serveur Ubuntu OVH) :
```
Internet (HTTPS) → Nginx (même hôte, certificat Let's Encrypt)
                       → reverse proxy vers 127.0.0.1:3210
                            → conteneur Docker "woordschat" (Node.js, port interne 3000)
                                 → volume Docker persistant (data/state.json)
```
Ici le conteneur écoute uniquement sur `127.0.0.1:3210` (loopback) : même si
quelqu'un scanne les ports de la machine, seuls 80/443 (gérés par Nginx)
répondent. C'est le réglage par défaut le plus restrictif.

**Variante B — Nginx (ou tout autre reverse proxy) sur une machine séparée**
(homelab typique : un LXC/VM dédié au reverse proxy, un autre pour Docker) :
```
Internet/LAN/VPN → Nginx (autre hôte/LXC, ex. "eole")
                       → reverse proxy vers <ip-lan>:3210
                            → conteneur Docker "woordschat" sur un autre hôte/LXC (ex. "charlie")
                                 → volume Docker persistant (data/state.json)
```
Dans ce cas, `127.0.0.1` ne fonctionne pas — vu depuis la machine du reverse
proxy, `127.0.0.1` désigne cette machine-là, pas celle qui héberge Docker. Le
port 3210 doit donc être exposé sur l'interface réseau du conteneur
(`docker-compose.yml` : `"3210:3000"`, déjà le réglage par défaut de ce
dépôt), et `nginx/woordschat.conf` doit pointer vers l'IP réelle de l'hôte
Docker. La sécurité vient alors de l'isolation réseau (ce port ne doit être
joignable que depuis ton LAN/VPN, jamais exposé directement sur internet) plutôt
que du binding loopback.

- **HTTPS est nécessaire, pas optionnel** : le code parent circule entre le
  téléphone et le serveur ; sans HTTPS il circulerait en clair sur le réseau.
  D'où Nginx + Let's Encrypt (gratuit, renouvellement automatique) — ou tout
  reverse proxy équivalent gérant déjà le TLS dans ton homelab.

**Accès public vs local uniquement.** Ce guide part du principe que tu veux
pouvoir y accéder de n'importe où (ex. le téléphone de Charlie en 4G, pas
seulement sur le wifi de la maison), donc via un nom de domaine + Let's
Encrypt. Si tu préfères garder ça strictement sur ton réseau local ou derrière
un VPN (Tailscale, WireGuard...), tu peux sauter toute la partie
Nginx/certbot/domaine et juste ouvrir `http://<ip-locale>:3210` — dis-le moi
si c'est ce que tu préfères, je peux adapter les instructions.

## 1. Prérequis sur le serveur Ubuntu

```bash
# Docker + le plugin "compose"
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER   # puis se reconnecter (ou `newgrp docker`)

# Nginx + certbot (pour le certificat HTTPS gratuit)
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx
```

## 2. Copier les fichiers sur le serveur

Depuis ta machine, copie tout ce dossier sur le serveur OVH (adapte l'utilisateur/IP) :

```bash
rsync -avz --exclude node_modules --exclude data ./ user@ton-serveur-ovh:/opt/woordschat/
```

## 3. Lancer l'application avec Docker

```bash
ssh user@ton-serveur-ovh
cd /opt/woordschat
docker compose up -d --build
docker compose logs -f    # Ctrl+C pour sortir une fois que tu vois "listening on port 3000"
curl http://127.0.0.1:3210/health   # doit répondre {"ok":true}
```

Le fichier `data/state.json` est créé automatiquement au premier démarrage,
avec le vocabulaire de départ de Charlie et le code parent par défaut `1234`.

## 4. Domaine + HTTPS

1. Chez ton registrar (ou dans l'espace domaine OVH), crée un enregistrement
   DNS de type **A** qui pointe un sous-domaine (ex. `woordschat.tondomaine.com`)
   vers l'IP publique de ton serveur OVH.
2. Édite `nginx/woordschat.conf` et remplace `woordschat.example.com` par ton
   vrai domaine (les deux occurrences).
3. Installe la config :
   ```bash
   sudo cp nginx/woordschat.conf /etc/nginx/sites-available/woordschat.conf
   sudo ln -s /etc/nginx/sites-available/woordschat.conf /etc/nginx/sites-enabled/
   sudo nginx -t && sudo systemctl reload nginx
   ```
4. Obtiens le certificat (certbot modifie automatiquement le bloc `listen 443`
   du fichier avec les bons chemins) :
   ```bash
   sudo certbot --nginx -d woordschat.tondomaine.com
   ```
5. Ouvre `https://woordschat.tondomaine.com` — l'application doit s'afficher.
   Certbot programme lui-même le renouvellement automatique du certificat.

## 5. Premier lancement côté famille

- Code parent par défaut : **1234** — va dans l'espace parent (⚙️ en bas de
  l'accueil) → onglet **Réglages** et change-le tout de suite.
- Sur le téléphone de Charlie, ouvre simplement `https://woordschat.tondomaine.com`
  et éventuellement "Ajouter à l'écran d'accueil" pour que ça se comporte comme
  une vraie appli.
- Tu peux vérifier que la synchro fonctionne : ajoute un mot depuis ton
  téléphone/PC dans l'espace parent, puis regarde l'onglet **Réglages** sur le
  téléphone de Charlie (ou attends ~25s / rouvre l'appli) — le mot apparaît
  sans rien faire d'autre.

## 6. Sauvegardes

Tout l'état est dans un seul fichier, donc la sauvegarde est simple :

```bash
# copie ponctuelle
docker compose cp woordschat:/app/data/state.json ./backup-$(date +%F).json

# ou, en cron quotidien sur l'hôte (le volume Docker est un dossier normal) :
docker run --rm -v woordschat_woordschat_data:/data -v /opt/backups:/backup \
  alpine cp /data/state.json /backup/state-$(date +%F).json
```

Pour restaurer, il suffit de remettre un `state.json` sauvegardé dans le
volume et de redémarrer le conteneur.

## 7. Mettre à jour l'application plus tard

Quand je te fournirai une nouvelle version (nouveaux exercices, corrections...) :

```bash
rsync -avz --exclude node_modules --exclude data ./ user@ton-serveur-ovh:/opt/woordschat/
ssh user@ton-serveur-ovh "cd /opt/woordschat && docker compose up -d --build"
```

Le fichier `data/state.json` (mots, catégories, progrès, code parent) n'est
jamais touché par une mise à jour — il vit dans un volume Docker séparé.

## 8. Dépannage rapide

- `docker compose logs -f` — logs du serveur.
- `curl http://127.0.0.1:3210/health` — doit répondre `{"ok":true}` si le
  conteneur tourne.
- `sudo nginx -t` — vérifie que la config Nginx est valide avant de recharger.
- Si le certificat expire un jour (ne devrait pas arriver, certbot le
  renouvelle automatiquement) : `sudo certbot renew`.
- Si l'appli affiche "🔴 Hors ligne" dans l'onglet Réglages : le téléphone
  n'arrive pas à joindre le serveur (Nginx down, DNS, certificat expiré...) —
  les scores/mots ajoutés pendant ce temps restent en local et se
  synchronisent dès que la connexion revient.
