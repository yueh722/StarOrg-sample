REM start all nodes

REM '######################################################################################'
echo 'starting all nodes'

set org_path=%cd%
set path=%path%;"%org_path%/Runtime/bin"


start cometbft node --home ./Runtime/localnet/node0
start cometbft node --home ./Runtime/localnet/node1
start cometbft node --home ./Runtime/localnet/node2
start cometbft node --home ./Runtime/localnet/node3

REM start all applications
REM '######################################################################################'
echo 'starting all applications'

cd Runtime\apps

mkdir app0 app1 app2 app3

cd app0
start abci-v2-Identity-app --home .\home0 --socket-addr tcp://127.0.0.1:26658 --http-addr 127.0.0.1:8080 --abci-rpc-addr http://127.0.0.1:26657

cd ..\app1
start abci-v2-Identity-app --home .\home1 --socket-addr tcp://127.0.0.1:36658 --http-addr 127.0.0.1:8081 --abci-rpc-addr http://127.0.0.1:36657

cd ..\app2
start abci-v2-Identity-app --home .\home2 --socket-addr tcp://127.0.0.1:46658 --http-addr 127.0.0.1:8082 --abci-rpc-addr http://127.0.0.1:46657

cd ..\app3
start abci-v2-Identity-app --home .\home3 --socket-addr tcp://127.0.0.1:56658 --http-addr 127.0.0.1:8083 --abci-rpc-addr http://127.0.0.1:56657

cd %org_path%

timeout /t 3 /nobreak

