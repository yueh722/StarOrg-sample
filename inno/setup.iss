; ============================================================
;  ChainNode Suite - Safe Uninstall with Fallback Restart Delete
; ============================================================

#define MyAppId "{2733b1bc-daf7-4d44-b30a-a9a97293c88c}"

[Setup]
AppId={{#MyAppId}
AppName={cm:AppNameLabel}
AppVersion=1.0
VersionInfoProductName=ChainNode Suite
VersionInfoDescription=ChainNode Suite Installer
VersionInfoCompany=
ArchitecturesInstallIn64BitMode=x64compatible
DefaultDirName={autopf}\ChainNode
DefaultGroupName=ChainNode
OutputDir=.
OutputBaseFilename=ChainNodeSetup
Compression=lzma
SolidCompression=yes
PrivilegesRequired=admin
DisableProgramGroupPage=yes
ShowLanguageDialog=yes

[Languages]
Name: "en";      MessagesFile: "compiler:Default.isl"
Name: "zhcn";    MessagesFile: "compiler:Languages\ChineseSimplified.isl"
Name: "zhtw";    MessagesFile: "compiler:Languages\ChineseTraditional.isl"

[CustomMessages]
en.AppNameLabel=ChainCode Node Suite
en.CompNodeAgent=Install NodeAgent (Service, GUI & CometBFT)
en.CompNodeMaster=Install NodeMaster (Service & GUI)
en.TypeCustom=Custom Installation
en.MsgSelectAtLeast=Please select at least one component.
en.MsgRenameFail=Warning: Unable to rename config file: %1
en.AlreadyInstalled=The application is already installed. Uninstall existing version first?
en.UninstallAborted=Uninstall cancelled by user.
en.ProcessRunning=The following processes are still running:%n%n%1%n%nPlease close them manually or choose "Force Terminate" to proceed.
en.ForceTerminate=Force Terminate
en.CancelUninstall=Cancel Uninstall
en.TerminateFailed=Failed to terminate process: %1
en.ServiceStopping=Stopping service: %1
en.ServiceStopFailed=Failed to stop service %1 (exit code: %3)
en.ScheduledRestartDelete=Some files could not be deleted now and will be removed after restart:%n%n%1
en.ConfigExists=Configuration file already exists, skipping: %1
en.UninstallComplete=Uninstallation completed successfully.
en.UninstallCompleteWithRestart=Uninstallation completed. A system restart is required to fully remove locked files.
en.MsgServiceExecFail=Failed to execute service command: %1
en.MsgServiceCmdFail=Service command failed: %1 %2 (exit code: %3)

zhcn.AppNameLabel=ChainCode Node Suite
zhcn.CompNodeAgent=安装 NodeAgent（含服务、GUI 及 CometBFT）
zhcn.CompNodeMaster=安装 NodeMaster（含服务与 GUI）
zhcn.TypeCustom=自定义安装
zhcn.MsgSelectAtLeast=请至少选择一个要安装的组件。
zhcn.MsgRenameFail=警告：无法重命名配置文件: %1
zhcn.AlreadyInstalled=检测到程序已经安装。是否先卸载现有版本？
zhcn.UninstallAborted=用户取消了卸载操作。
zhcn.ProcessRunning=以下进程仍在运行：%n%n%1%n%n请手动关闭，或选择“强制终止”继续卸载。
zhcn.ForceTerminate=强制终止
zhcn.CancelUninstall=取消卸载
zhcn.TerminateFailed=终止进程失败: %1
zhcn.ServiceStopping=正在停止服务: %1
zhcn.ServiceStopFailed=停止服务 %1 失败（返回码: %3）
zhcn.ScheduledRestartDelete=部分文件当前无法删除，将在重启后自动移除：%n%n%1
zhcn.ConfigExists=配置文件已存在，跳过释放: %1
zhcn.UninstallComplete=卸载完成。
zhcn.UninstallCompleteWithRestart=卸载完成。需要重启系统以彻底清除被锁定的文件。
zhcn.MsgServiceExecFail=服务命令执行失败: %1
zhcn.MsgServiceCmdFail=服务命令失败: %1 %2 (返回码: %3)

zhtw.AppNameLabel=ChainCode Node Suite
zhtw.CompNodeAgent=安裝 NodeAgent（含服務、GUI 及 CometBFT）
zhtw.CompNodeMaster=安裝 NodeMaster（含服務與 GUI）
zhtw.TypeCustom=自訂安裝
zhtw.MsgSelectAtLeast=請至少選擇一個要安裝的元件。
zhtw.MsgRenameFail=警告：無法重新命名設定檔: %1
zhtw.AlreadyInstalled=檢測到程式已經安裝。是否先解除安裝現有版本？
zhtw.UninstallAborted=使用者取消了解除安裝操作。
zhtw.ProcessRunning=以下處理程序仍在執行：%n%n%1%n%n請手動關閉，或選擇「強制終止」繼續解除安裝。
zhtw.ForceTerminate=強制終止
zhtw.CancelUninstall=取消解除安裝
zhtw.TerminateFailed=終止處理程序失敗: %1
zhtw.ServiceStopping=正在停止服務: %1
zhtw.ServiceStopFailed=停止服務 %1 失敗（返回碼: %3）
zhtw.ScheduledRestartDelete=部分檔案目前無法刪除，將在重新啟動後自動移除：%n%n%1
zhtw.ConfigExists=設定檔已存在，跳過釋放: %1
zhtw.UninstallComplete=解除安裝完成。
zhtw.UninstallCompleteWithRestart=解除安裝完成。需要重新啟動系統以徹底清除被鎖定的檔案。
zhtw.MsgServiceExecFail=服務命令執行失敗: %1
zhtw.MsgServiceCmdFail=服務命令失敗: %1 %2 (返回碼: %3)

[Types]
Name: "custom"; Description: "{cm:TypeCustom}"; Flags: iscustom

[Components]
Name: "nodeagent";  Description: "{cm:CompNodeAgent}";  Types: custom
Name: "nodemaster"; Description: "{cm:CompNodeMaster}"; Types: custom

[Files]
; 配置文件：仅当目标 .ini 不存在时才释放
Source: "nodeagent\config.template.ini"; DestDir: "{code:GetNodeAgentConfigPath}"; Components: nodeagent; Flags: ignoreversion; Check: ShouldInstallNodeAgentConfig; AfterInstall: RenameAndPatchNodeAgentConfig
Source: "nodemaster\config.template.ini"; DestDir: "{code:GetNodeMasterConfigPath}"; Components: nodemaster; Flags: ignoreversion; Check: ShouldInstallNodeMasterConfig; AfterInstall: RenameNodeMasterConfig

; 其他文件（不使用 restartreplace，由卸载逻辑处理删除失败）
Source: "nodeagent\AgentGUI.exe"; DestDir: "{app}"; Components: nodeagent; Flags: ignoreversion
Source: "nodeagent\NodeAgent.exe"; DestDir: "{app}"; Components: nodeagent; Flags: ignoreversion
Source: "nodeagent\cometbft\bin\cometbft.exe"; DestDir: "{app}\cometbft\bin"; Components: nodeagent; Flags: ignoreversion
Source: "nodeagent\cometbft\bin\abci-v2-Identity-app.exe"; DestDir: "{app}\cometbft\bin"; Components: nodeagent; Flags: ignoreversion
Source: "nodemaster\MasterGUI.exe"; DestDir: "{app}"; Components: nodemaster; Flags: ignoreversion
Source: "nodemaster\NodeMaster.exe"; DestDir: "{app}"; Components: nodemaster; Flags: ignoreversion

[Icons]
Name: "{autodesktop}\NodeAgent GUI"; Filename: "{app}\AgentGUI.exe"; Components: nodeagent
Name: "{autodesktop}\NodeMaster GUI"; Filename: "{app}\MasterGUI.exe"; Components: nodemaster

[Registry]
Root: HKLM; Subkey: "Software\Microsoft\Windows\CurrentVersion\Uninstall\{{#MyAppId}_is1"; ValueType: string; ValueName: "DisplayVersion"; ValueData: "1.0"; Flags: uninsdeletekey
Root: HKLM; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "NodeAgentGUI"; ValueData: """{app}\AgentGUI.exe"""; Components: nodeagent; Flags: uninsdeletevalue
Root: HKLM; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "NodeMasterGUI"; ValueData: """{app}\MasterGUI.exe"""; Components: nodemaster; Flags: uninsdeletevalue

[Code]
// Windows API 声明
function MoveFileEx(lpExistingFileName, lpNewFileName: WideString; dwFlags: DWORD): LongBool;
  external 'MoveFileExW@kernel32.dll stdcall';
const
  MOVEFILE_DELAY_UNTIL_REBOOT = $4;

var
  InstallNodeAgent, InstallNodeMaster: Boolean;
  RestartDeleteList: TStringList;

// ---------------- 路径函数 ----------------
function GetNodeAgentConfigPath(Param: String): String;
begin
  Result := ExpandConstant('{commonappdata}\chainnode\NodeAgent');
end;

function GetNodeMasterConfigPath(Param: String): String;
begin
  Result := ExpandConstant('{commonappdata}\chainnode\NodeMaster');
end;

// ---------------- 配置文件保护：存在则跳过 ----------------
function ShouldInstallNodeAgentConfig: Boolean;
var
  DestFile: String;
begin
  DestFile := GetNodeAgentConfigPath('') + '\config.ini';
  if FileExists(DestFile) then
  begin
    //MsgBox(FmtMessage(CustomMessage('ConfigExists'), [DestFile]), mbInformation, MB_OK);
    Result := False;
  end
  else
    Result := True;
end;

function ShouldInstallNodeMasterConfig: Boolean;
var
  DestFile: String;
begin
  DestFile := GetNodeMasterConfigPath('') + '\config.ini';
  if FileExists(DestFile) then
  begin
    //MsgBox(FmtMessage(CustomMessage('ConfigExists'), [DestFile]), mbInformation, MB_OK);
    Result := False;
  end
  else
    Result := True;
end;

// ---------------- 配置文件处理 ----------------
procedure RenameAndPatchNodeAgentConfig;
var
  ConfigDir, SourceFile, DestFile, NewBinDir: String;
begin
  ConfigDir := GetNodeAgentConfigPath('');
  SourceFile := ConfigDir + '\config.template.ini';
  DestFile := ConfigDir + '\config.ini';
  if FileExists(SourceFile) then
  begin
    if RenameFile(SourceFile, DestFile) then
    begin
      NewBinDir := ExpandConstant('{app}\cometbft\bin');
      if not SetIniString('global', 'BinDir', NewBinDir, DestFile) then
        MsgBox('Failed to update BinDir in config.ini', mbError, MB_OK);
    end
    else
      MsgBox(FmtMessage(CustomMessage('MsgRenameFail'), [SourceFile]), mbError, MB_OK);
  end;
end;

procedure RenameNodeMasterConfig;
var
  ConfigDir, SourceFile, DestFile: String;
begin
  ConfigDir := GetNodeMasterConfigPath('');
  SourceFile := ConfigDir + '\config.template.ini';
  DestFile := ConfigDir + '\config.ini';
  if FileExists(SourceFile) and not FileExists(DestFile) then
    RenameFile(SourceFile, DestFile);
end;

// ---------------- 进程检测与终止 ----------------
function IsProcessRunning(const ExeName: String): Boolean;
var
  WbemLocator, WbemServices, WbemObjectSet: Variant;
  I: Integer;
begin
  Result := False;
  try
    WbemLocator := CreateOleObject('WbemScripting.SWbemLocator');
    WbemServices := WbemLocator.ConnectServer('localhost', 'root\cimv2');
    WbemObjectSet := WbemServices.ExecQuery('SELECT * FROM Win32_Process WHERE Name="' + ExeName + '"');
    Result := (WbemObjectSet.Count > 0);
  except
    // 回退方案：检查文件是否存在（不精确但安全）
    Result := FileExists(ExpandConstant('{app}\' + ExeName));
  end;
end;

function TerminateProcessByName(const ExeName: String): Boolean;
var
  WbemLocator, WbemServices, WbemObjectSet: Variant;
  Process: Variant;
  I: Integer;
begin
  Result := True;
  try
    WbemLocator := CreateOleObject('WbemScripting.SWbemLocator');
    WbemServices := WbemLocator.ConnectServer('localhost', 'root\cimv2');
    WbemObjectSet := WbemServices.ExecQuery('SELECT * FROM Win32_Process WHERE Name="' + ExeName + '"');
    if WbemObjectSet.Count > 0 then
    begin
      for I := 0 to WbemObjectSet.Count - 1 do
      begin
        Process := WbemObjectSet.ItemIndex(I);
        if Process.Terminate() <> 0 then
          Result := False;
      end;
    end;
  except
    Result := False;
  end;
end;

function CheckAndTerminateProcesses: Boolean;
var
  Processes: array[0..5] of String;
  RunningList, Msg: String;
  I: Integer;
  Response: Integer;
begin
  Processes[0] := 'NodeAgent.exe';
  Processes[1] := 'AgentGUI.exe';
  Processes[2] := 'NodeMaster.exe';
  Processes[3] := 'MasterGUI.exe';
  Processes[4] := 'cometbft.exe';
  Processes[5] := 'abci-v2-Identity-app.exe';
  
  RunningList := '';
  for I := 0 to 5 do
    if IsProcessRunning(Processes[I]) then
      RunningList := RunningList + Processes[I] + #13#10;
  
  if RunningList = '' then
  begin
    Result := True;
    Exit;
  end;
  
  Msg := FmtMessage(CustomMessage('ProcessRunning'), [RunningList]);
  Response := MsgBox(Msg, mbConfirmation, MB_YESNO);
  
  if Response = IDNO then  // 用户选择取消
  begin
    MsgBox(CustomMessage('UninstallAborted'), mbInformation, MB_OK);
    Result := False;
    Exit;
  end;
  
  // 强制终止
  for I := 0 to 5 do
  begin
    if IsProcessRunning(Processes[I]) then
    begin
      if not TerminateProcessByName(Processes[I]) then
        MsgBox(FmtMessage(CustomMessage('TerminateFailed'), [Processes[I]]), mbError, MB_OK);
    end;
  end;
  
  // 再次检查确保进程已终止
  for I := 0 to 5 do
    if IsProcessRunning(Processes[I]) then
    begin
      MsgBox(FmtMessage(CustomMessage('TerminateFailed'), [Processes[I]]), mbError, MB_OK);
      Result := False;
      Exit;
    end;
  
  Result := True;
end;

// ---------------- 服务控制 ----------------
function RunServiceCommand(const ExeName, Args: String): Boolean;
var
  ExePath, Msg: String;
  ResultCode: Integer;
begin
  ExePath := ExpandConstant('{app}\' + ExeName);
  if not FileExists(ExePath) then
  begin
    Result := False;
    Exit;
  end;
  
  if not Exec(ExePath, Args, '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
  begin
    Msg := FmtMessage(CustomMessage('MsgServiceExecFail'), [ExeName + ' ' + Args]);
    MsgBox(Msg, mbError, MB_OK);
    Result := False;
    Exit;
  end;
  
  Result := (ResultCode = 0);
  if not Result then
  begin
    Msg := FmtMessage(CustomMessage('MsgServiceCmdFail'), [ExeName, Args, IntToStr(ResultCode)]);
    MsgBox(Msg, mbError, MB_OK);
  end;
end;

procedure StopAndRemoveServices;
begin
  // 停止并卸载 NodeAgent 服务
  if FileExists(ExpandConstant('{app}\NodeAgent.exe')) then
  begin
    //RunServiceCommand('NodeAgent.exe', 'service stop');
    RunServiceCommand('NodeAgent.exe', 'service uninstall');
    TerminateProcessByName('NodeAgent.exe');
  end;
  
  // 停止并卸载 NodeMaster 服务
  if FileExists(ExpandConstant('{app}\NodeMaster.exe')) then
  begin
    //RunServiceCommand('NodeMaster.exe', 'service stop');
    RunServiceCommand('NodeMaster.exe', 'service uninstall');
    TerminateProcessByName('NodeMaster.exe');
  end;
end;

// ---------------- 安全删除：失败时回退到 MoveFileEx ----------------
procedure SafeDeleteFile(const FileName: String);
begin
  if not DeleteFile(FileName) then
  begin
    // 常规删除失败，尝试标记为重启删除
    if MoveFileEx(FileName, '', MOVEFILE_DELAY_UNTIL_REBOOT) then
    begin
      if RestartDeleteList = nil then
        RestartDeleteList := TStringList.Create;
      RestartDeleteList.Add(FileName);
    end
    else
    begin
      Log('Failed to delete and schedule for restart: ' + FileName);
    end;
  end;
end;

procedure SafeDeleteDirRecursive(const DirName: String);
var
  FindRec: TFindRec;
  FilePath: String;
begin
  if FindFirst(DirName + '\*', FindRec) then
  repeat
    if (FindRec.Name <> '.') and (FindRec.Name <> '..') then
    begin
      FilePath := DirName + '\' + FindRec.Name;
      if FindRec.Attributes and FILE_ATTRIBUTE_DIRECTORY <> 0 then
        SafeDeleteDirRecursive(FilePath)  // 递归删除子目录
      else
        SafeDeleteFile(FilePath);         // 删除文件
    end;
  until not FindNext(FindRec);
  FindClose(FindRec);
  
  // 尝试删除空目录
  if not RemoveDir(DirName) then
    Log('Failed to remove directory: ' + DirName);
end;

// ---------------- 安装流程控制 ----------------
function InitializeSetup(): Boolean;
var
  UninstallStr: String;
  ResultCode: Integer;
begin
  Result := True;
  if RegQueryStringValue(HKLM, 'SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\' + '{#MyAppId}_is1', 'UninstallString', UninstallStr) then
  begin
    if MsgBox(CustomMessage('AlreadyInstalled'), mbConfirmation, MB_YESNO) = IDYES then
    begin
      if Exec(RemoveQuotes(UninstallStr), '/SILENT', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
      begin
        // 卸载成功后终止安装
        Result := False; // 退出安装
      end
      else
        MsgBox('Uninstall failed. Please uninstall manually first.', mbError, MB_OK);
    end
    else
      Result := False; // 用户选择不卸载，终止安装
  end;
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  Result := '';
  InstallNodeAgent := WizardIsComponentSelected('nodeagent');
  InstallNodeMaster := WizardIsComponentSelected('nodemaster');
  
  if InstallNodeAgent then ForceDirectories(GetNodeAgentConfigPath(''));
  if InstallNodeMaster then ForceDirectories(GetNodeMasterConfigPath(''));
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
  begin
    if InstallNodeAgent then 
      RunServiceCommand('NodeAgent.exe', 'service install');
      RunServiceCommand('NodeAgent.exe', 'service start');
    if InstallNodeMaster then 
      RunServiceCommand('NodeMaster.exe', 'service install');
      RunServiceCommand('NodeMaster.exe', 'service start');
  end;
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if CurPageID = wpSelectComponents then
  begin
    if not (WizardIsComponentSelected('nodeagent') or WizardIsComponentSelected('nodemaster')) then
    begin
      MsgBox(CustomMessage('MsgSelectAtLeast'), mbError, MB_OK);
      Result := False;
    end;
  end;
end;

// ---------------- 卸载流程控制 ----------------
function InitializeUninstall(): Boolean;
begin
  // 1. 检测并处理进程
  if not CheckAndTerminateProcesses then
  begin
    Result := False;
    Exit;
  end;
  
  // 2. 停止并移除服务
  StopAndRemoveServices;
  
  Result := True;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usPostUninstall then
  begin
    // 3. 安全删除安装目录（常规删除失败时才用 MoveFileEx）
    if DirExists(ExpandConstant('{app}')) then
      SafeDeleteDirRecursive(ExpandConstant('{app}'));
    
    // 4. 报告需要重启删除的文件
    if (RestartDeleteList <> nil) and (RestartDeleteList.Count > 0) then
    begin
      MsgBox(FmtMessage(CustomMessage('ScheduledRestartDelete'), [RestartDeleteList.Text]), mbInformation, MB_OK);
      MsgBox(CustomMessage('UninstallCompleteWithRestart'), mbInformation, MB_OK);
    end
    else
      MsgBox(CustomMessage('UninstallComplete'), mbInformation, MB_OK);
    
    // 5. 清理资源
    if RestartDeleteList <> nil then
      RestartDeleteList.Free;
  end;
end;