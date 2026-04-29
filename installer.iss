; Script do instalador do ZapMix
; Compile no Inno Setup (F9)

[Setup]
AppId={{ZapMix-WhatsApp-Enquete}}
AppName=ZapMix
AppVersion=1.0
AppPublisher=Anderson Souza
AppPublisherURL=https://zapmix-site.vercel.app
AppSupportURL=https://zapmix-site.vercel.app
AppUpdatesURL=https://zapmix-site.vercel.app
DefaultDirName={pf}\ZapMix
DefaultGroupName=ZapMix
AllowNoIcons=yes
UninstallDisplayIcon={app}\ZapMix.exe
OutputDir=installer
OutputBaseFilename=ZapMix_Setup
Compression=lzma2
SolidCompression=yes
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64
SetupIconFile=public\media\logotipo.ico
UninstallDisplayName=ZapMix
WizardStyle=modern
VersionInfoVersion=1.0.0
VersionInfoCompany=Anderson Souza
VersionInfoDescription=ZapMix - WhatsApp + Enquete + vMix
ShowLanguageDialog=yes
DisableProgramGroupPage=no
DisableReadyPage=no

[Languages]
Name: "portuguese"; MessagesFile: "compiler:Languages\Portuguese.isl"

[Tasks]
Name: "desktopicon"; Description: "Criar ícone na Área de Trabalho"; GroupDescription: "Ícones adicionais:"
Name: "quicklaunchicon"; Description: "Criar ícone na Barra de Início Rápido"; GroupDescription: "Ícones adicionais:"; Flags: unchecked

[Files]
; Arquivos do aplicativo
Source: "release\ZapMix-win32-x64\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs

[Icons]
Name: "{group}\ZapMix"; Filename: "{app}\ZapMix.exe"; IconFilename: "{app}\public\media\logotipo.ico"
Name: "{group}\Desinstalar ZapMix"; Filename: "{uninstallexe}"
Name: "{userdesktop}\ZapMix"; Filename: "{app}\ZapMix.exe"; IconFilename: "{app}\public\media\logotipo.ico"; Tasks: desktopicon
Name: "{userappdata}\Microsoft\Internet Explorer\Quick Launch\ZapMix"; Filename: "{app}\ZapMix.exe"; Tasks: quicklaunchicon

[Run]
Filename: "{app}\ZapMix.exe"; Description: "Iniciar ZapMix agora"; Flags: postinstall nowait skipifsilent

[UninstallDelete]
Type: filesandordirs; Name: "{app}\zapmix-data"
Type: filesandordirs; Name: "{userappdata}\ZapMix"
Type: dirifempty; Name: "{app}"

[InstallDelete]
Type: filesandordirs; Name: "{app}\zapmix-data"
Type: filesandordirs; Name: "{userappdata}\ZapMix"

[Messages]
; Mensagens em português
WelcomeLabel2=Este assistente irá instalar o ZapMix no seu computador.%n%nZapMix é um aplicativo para integrar WhatsApp com vMix, permitindo exibir mensagens, fotos, vídeos e enquetes ao vivo.
SelectDirLabel3=O instalador irá instalar o ZapMix na seguinte pasta.%n%nClique em Avançar para continuar.
SelectProgramGroupLabel3=O instalador irá criar atalhos no seguinte Menu Iniciar.%n%nClique em Avançar para continuar.