[Setup]
AppName=ZapMix
AppVersion=1.0
DefaultDirName={pf}\ZapMix
DefaultGroupName=ZapMix
OutputDir=installer
OutputBaseFilename=ZapMix_Setup
Compression=lzma2
SolidCompression=yes
SetupIconFile=public\media\logotipo.ico

[Languages]
Name: "portuguese"; MessagesFile: "compiler:Languages\Portuguese.isl"

[Files]
Source: "release\ZapMix-win32-x64\*"; DestDir: "{app}"; Flags: recursesubdirs

[Icons]
Name: "{group}\ZapMix"; Filename: "{app}\ZapMix.exe"
Name: "{userdesktop}\ZapMix"; Filename: "{app}\ZapMix.exe"

[Run]
Filename: "{app}\ZapMix.exe"; Description: "Iniciar ZapMix"; Flags: postinstall nowait