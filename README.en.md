# Palm Remote: control a Windows PC from an Android phone

[简体中文](README.md) | **English**

<img src="assets/palm-remote.svg" width="96" alt="Palm Remote icon">

Keep your PC running and use your phone to view its desktop, move the mouse, click, scroll, and type—including Chinese text with your phone’s own keyboard.

No dedicated remote-control app is needed on the phone: **turn on Tailscale → open your bookmarked address → enter your four-digit PIN**. Palm Remote must be running on the PC, which must stay online, awake, and unlocked.

## How I use it every day

After the initial installation and pairing:

1. **PC:** open Palm Remote and wait for the panel to show that remote control is running. It tries to prepare the already-signed-in desktop Tailscale client; the first sign-in still requires you.
2. **Phone:** turn on Tailscale and check that it is connected. Mobile data works; the phone and PC do not need to share Wi-Fi.
3. **Browser:** open the address shown by your PC’s panel, enter your saved four-digit PIN, and wait for the desktop to appear.
4. **When finished:** tap **Disconnect (断开)** on the phone. You can leave the PC panel running. To stop its service, right-click the system-tray icon and choose **Exit Palm Remote (退出掌上遥控)**.

You can always reopen the PC panel. Clicking its **×** offers three choices:

- **Send to tray (收进托盘):** removes the taskbar window while remote control keeps running. Double-click the tray icon to restore the panel.
- **Minimize to taskbar (最小化到任务栏):** keeps its taskbar button. Click that button to restore the panel.
- **Cancel (取消):** keeps the panel open.

The ordinary minimize button keeps the window on the taskbar. Opening Palm Remote again also restores the existing panel.

## Using the phone controls

| What you want to do | How to do it |
| --- | --- |
| Move the mouse | Drag the round handle beside the pointer with your right hand |
| Left-click or right-click | Tap the corresponding button with your left hand |
| Select text or drag a window | Hold **Left (左键)** while dragging the round handle with your other hand |
| Double-click | Tap the left button twice |
| Scroll | Tap **Wheel ↑ (滚轮↑)** or **Wheel ↓ (滚轮↓)**; scrolling is slow by default |
| Type text | Click the PC’s input field, tap **Type (打字)**, and compose with your phone’s own keyboard |
| Insert the prepared text into the PC | Tap **Input to PC (输入电脑)**; the phone keyboard stays open for continued typing |
| Delete | Deletes the phone draft when it contains text; otherwise sends Backspace to the PC |
| Start a new line | Tap **New line (换行)** to send Shift+Enter |
| Send or submit | Tap **Send (发送)** to send Enter |
| Hide the phone keyboard | Tap **Hide keyboard (收起键盘)** |
| View the desktop in landscape | Tap **Landscape (横屏全屏)**; **Full view (完整画面)** keeps the whole desktop visible |

The target PC application decides what Shift+Enter and Enter do. **Options (选项)** lets you adjust mouse speed, the opacity of controls over the desktop, and local clarity enhancement.

The documentation has Chinese and English versions; the application’s current interface is in Chinese.

## Real-use screenshots

These four images were captured during actual phone use. **The address in the screenshots belongs to the demonstration PC. Use the address shown by your own panel.**

### 1. Opening the address: the PIN screen

This was not the first use, so the long-key entry and four-digit PIN setup screen did not appear. On the first visit, the page shows that initial pairing screen instead.

<img src="docs/images/01-unlock.jpg" width="300" alt="Four-digit PIN screen when opening the address">

### 2. After entering the PIN: unlocking, then connecting

After the PIN is entered, **Unlocking… (正在解锁…)** appears at the bottom left, followed by **Connecting… (正在连接…)**.

<img src="docs/images/02-unlocking.jpg" width="300" alt="PIN entered, with Unlocking shown at the bottom left">

### 3. Preparing text for an input field on the PC website

The text has not yet been entered on the PC, but it is already prepared on the phone.

<img src="docs/images/03-text-ready.jpg" width="300" alt="Text prepared with the phone keyboard, before insertion into the PC">

### 4. The prepared text is successfully entered on the PC

The text prepared with the phone keyboard has successfully appeared in the input field on the PC website.

<img src="docs/images/04-text-entered.jpg" width="300" alt="Prepared phone text successfully entered into the PC website input field">

## First-time setup

This repository distributes source code. Complete the following setup once on your own Windows PC. You need an Android phone, a Windows PC, and working internet connections.

### Step 1: install the prerequisites

- Install [Node.js](https://nodejs.org/) version 22 or later on the PC.
- Install [Tailscale](https://tailscale.com/download) on both devices, sign in to the same account, and enable their connections.
- Choose **Code → Download ZIP** on this repository and extract it into a folder you intend to keep.

### Step 2: install and start the project

Open PowerShell or a terminal in the extracted project folder and run once:

```powershell
npm ci --ignore-scripts
```

Then double-click **启动手机远控.cmd**. It builds the Windows launcher on the first run, opens the panel, and automatically starts the remote-control service.

You can create a desktop shortcut to the generated **PalmRemote.exe**. Keep the executable in the project folder; it needs the other project files.

### Step 3: allow your phone through the PC firewall

Find the **phone’s IPv4 address** in its Tailscale app. It normally starts with `100.`. Open PowerShell **as Administrator**, change to the project folder, and run the following command, replacing the quoted placeholder with your phone’s actual address:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/enable-external-access.ps1 -PhoneIP "YOUR_PHONE_TAILSCALE_IPV4"
```

This is a one-time firewall configuration that permits only the specified phone to access the remote-control port. It does not publish your desktop-control page to the internet. Run it again if you change the phone or port.

### Step 4: pair the phone

1. Open the **phone access address** shown by the PC panel in your phone browser, then bookmark it.
2. Click **Copy connection key (复制连接密钥)** on the PC and enter that PC’s key on the phone’s initial pairing page.
3. Choose your own four-digit PIN, enter it again to confirm, and save and connect.
4. Future visits in the same browser at the same address need only that PIN, not the long key.

**Each installation has its own key and address.** A fresh installation generates a random key; restarting preserves it. The access address comes from that PC’s Tailscale address and the configured port. The repository contains no user keys or pairing records. Clearing browser data or changing the browser or address requires pairing again. If you forget the PIN, choose **Pair again / Forgot PIN (重新配对 / 忘记密码)** and use the PC’s long key to set a new one.

## How the software is built

The PC captures its primary screen and passes the phone’s mouse, wheel, and text commands to Windows. The phone browser displays the desktop, provides two-handed mouse controls, and uses the phone’s own input method. Tailscale connects the devices across different networks.

| Part of the project | Purpose |
| --- | --- |
| `web/` | Phone page, PIN keypad, mouse controls, text editing, and desktop display |
| `src/` | Node.js service connecting the phone and PC, validating pairing, and relaying commands and images |
| `windows/Desktop.cs`, `windows/worker.ps1` | Windows screen capture and mouse/keyboard input |
| `scripts/remote-launcher.ps1` | PC panel, tray, and service start/stop controls |
| `windows/Launcher.cs` | Windows executable entry point with the application icon |

External-network startup defaults to **720p**, preserving aspect ratio within 1280×720. The first image is a complete desktop. Later updates contain only changed regions, while the phone keeps the rest of the background. Cursor-only movement does not retransmit an unchanged background. Clarity enhancement runs locally on the phone.

This can control a real Windows desktop, but remains a personal project. It currently supports the primary screen and one controller page. It cannot overcome PC sleep, the lock screen, UAC, or higher-privilege windows.

## If the page will not open or updates are slow

- **The address will not open:** check that the PC panel shows the service running, both Tailscale clients are connected, the address belongs to your PC, and the firewall step above is complete.
- **Commands act quickly but the phone image updates slowly:** image-transfer bandwidth may be limited. Tailscale direct connections are usually faster; failed direct connections use a relay. Large desktop changes can take time to arrive. Test again after changing networks.
- **Another VPN must stay on the PC:** do not simply disable it for remote control. Tailscale and the proxy may need split routing; whether remote traffic bypasses a paid proxy must be checked against your actual configuration.
- **Avoid repeated pairing:** use the same browser and bookmarked address, and keep its site data. Short disconnections attempt automatic recovery without replaying earlier text or clicks.

The default port is **8789**. To change it, copy `remote-settings.example.json` to `.remote-settings.json`, edit `port`, restart the service, and update the firewall rule and phone bookmark. Custom installation paths can use `nodePath` and `tailscalePath`. This local configuration is not uploaded to GitHub.

Do not publish the long key or private configuration, and do not expose the remote-control port directly to the public internet. The four-digit PIN is checked together with the browser’s pairing credential; repeated incorrect PINs trigger a waiting period.

## Development and verification

```powershell
npm test
powershell.exe -NoProfile -ExecutionPolicy Bypass -File windows/worker.ps1 -CheckOnly
powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File scripts/remote-launcher.ps1 -TrayCheck
```

For an interaction demo that does not control the real PC, run `npm run demo` and open `http://127.0.0.1:8787/` in the PC browser. Real phone, Windows, and network behavior still requires practical testing.