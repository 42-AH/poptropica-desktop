# POPTROPICA.LOVE APP FOR WINDOWS
(see poptropica.love)

### App has both online (realms, friends, common rooms hosted by poptropica.love) and offline functionality

# INSTALLATION

## Either: Download the .exe from [releases](https://github.com/42-AH/poptropica-desktop/releases/latest)

## Or: Build for windows

### Requires: 64-bit Windows with Git, Python 3.11 or newer, and .NET Framework 4.8.

### Clone repo:

```powershell
git clone https://github.com/42-AH/poptropica-desktop.git
cd poptropica-desktop
```

### Download Poptropica.exe from [release v1.1.4](https://github.com/42-AH/poptropica-desktop/releases/tag/v1.1.4) into your Downloads folder.

### Build the app:

```powershell
py -3 build.py --release "$env:USERPROFILE\Downloads\Poptropica.exe"
```

### Run the new exe:

```powershell
& ".\outputs\Poptropica.exe"
```
