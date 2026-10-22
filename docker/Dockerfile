FROM debian:bookworm-slim

# 安裝基本相容庫與磁碟工具
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    e2fsprogs \
    procps \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /chainnode

# 複製編譯好的 Linux 二進位檔案
COPY bin/nodeagent /chainnode/bin/nodeagent
COPY bin/abci-v2-Identity-app /chainnode/bin/abci-v2-Identity-app
COPY bin/cometbft /chainnode/bin/cometbft
COPY entrypoint.sh /chainnode/entrypoint.sh

# 建立 .exe 符號連結以相容 NodeAgent 的調用路徑
RUN ln -s /chainnode/bin/abci-v2-Identity-app /chainnode/bin/abci-v2-Identity-app.exe && \
    ln -s /chainnode/bin/cometbft /chainnode/bin/cometbft.exe && \
    chmod +x /chainnode/bin/* /chainnode/entrypoint.sh

ENTRYPOINT ["/chainnode/entrypoint.sh"]
