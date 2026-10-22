#!/bin/sh
set -e

NODE_INPUT="${NODE_NAMES:-${NODE_NAME:-node1}}"
NODES_LIST=$(echo "$NODE_INPUT" | tr ',+' ' ')
MASTER_ADDR=${MASTER_ADDR:-ws://host.docker.internal:8080/websocket}
DISK_QUOTA_GB=${DISK_QUOTA_GB:-10}

echo "=========================================="
echo "?? ?Ÿå? ChainNode å®¹å™¨ç¯€é»? ${NODES_LIST}"
echo "?“¡ ä¸»æ??ç¨± (HostName): $(hostname)"
echo "?? NodeMaster ???ä½å?: ${MASTER_ADDR}"
echo "?’¾ ?ç½®ç¡¬ç?ç©ºé?: ${DISK_QUOTA_GB} GB"
echo "=========================================="

DISK_DIR="/chainnode_store"
DISK_IMG="${DISK_DIR}/disk.img"
mkdir -p "$DISK_DIR" /chainnode/bin /chainnode/data /chainnode/log

# ç¢ºä?å®¹å™¨?§æ?è¶³å???loop è¨­å?ç¯€é»?(?¯æ´å¤šå®¹?¨ç¨ç«‹æ?è¼?
for i in 0 1 2 3 4 5 6 7; do
    [ -e "/dev/loop$i" ] || mknod "/dev/loop$i" b 7 "$i" 2>/dev/null || true
done

# ?¥é?ç½®ä? DISK_QUOTA_GBï¼Œåœ¨ /chainnode_store å»ºç??¨ç??›æ“¬ç£ç?ä¸¦æ?è¼‰è‡³ /chainnode/data
# ?™è? Agent ??disk.Usage() ?½å??Ÿå¯¦ç²¾æ??å ± 150G (docker1) ??200G (docker2)
if [ -n "$DISK_QUOTA_GB" ]; then
    if [ ! -f "$DISK_IMG" ]; then
        echo "?“¦ æ­?œ¨å»ºç? ${DISK_QUOTA_GB} GB ?¨ç??›æ“¬ç£ç? (${DISK_IMG})..."
        truncate -s "${DISK_QUOTA_GB}G" "$DISK_IMG"
        mkfs.ext4 -F "$DISK_IMG" > /dev/null 2>&1 || true
    fi
    # ?é? /proc/mounts æª¢æŸ¥?¯å¦å·²æ?è¼‰è‡³ /chainnode/data
    if ! grep -qs '/chainnode/data ' /proc/mounts; then
        echo "?’¾ ?›è? ${DISK_QUOTA_GB} GB ?›æ“¬ç£ç???/chainnode/data..."
        mount -o loop "$DISK_IMG" /chainnode/data 2>/dev/null || true
    fi
fi

# ?•æ??Ÿæ? NodeAgent å°ˆå±¬ config.ini
cat <<EOF > /chainnode/config.ini
[global]
serveraddr    = ${MASTER_ADDR}
bindir        = /chainnode/bin
homedir       = /chainnode/data
launchermodel = multi
EOF

for N in $NODES_LIST; do
    echo "  ??è¨»å?ç®¡ç?ç¯€é»? [$N]"
    cat <<EOF >> /chainnode/config.ini

[$N]
HomeDir       = /chainnode/data
EOF
done

echo "???ç½®æª?/chainnode/config.ini ?Ÿæ?å®Œæ?:"
cat /chainnode/config.ini
echo "???Ÿå? NodeAgent..."

exec /chainnode/bin/nodeagent -c /chainnode/config.ini
