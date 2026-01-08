通過以下任意一種方式都可以啓動testweb
1.  通過StartTestWebServer.bat會啓動dist目錄下的web。通過該方法啓動testweb的時候，如果已經確定安裝了serve，那麽可以參考其中的注釋來去除重複安裝的部分。
2. 將dist挂載到任意一個webserver
3. 進入src目錄，執行npm run dev