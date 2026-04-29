# Translation Editor - User Manual

**Version:** 1.0.0  
**Last Updated:** April 2026

---

## 📋 Table of Contents

1. [Introduction](#introduction)
2. [Installation](#installation)
3. [First Run Setup](#first-run-setup)
4. [Interface Overview](#interface-overview)
5. [Working with Files](#working-with-files)
6. [Translation Features](#translation-features)
7. [Glossary Management](#glossary-management)
8. [Text-to-Speech (TTS)](#text-to-speech-tts)
9. [Audio Player](#audio-player)
10. [Style Profile](#style-profile)
11. [Terminal & Python Scripts](#terminal--python-scripts)
12. [Keyboard Shortcuts](#keyboard-shortcuts)
13. [Tips & Troubleshooting](#tips--troubleshooting)

---

## Introduction

Translation Editor is a desktop application built for translating novels and long-form text. It provides:

- **Dual-view editing** - Source and translation side-by-side
- **AI-powered translation** - Integration with OpenRouter API
- **Glossary management** - Maintain consistent terminology
- **Multi-tone TTS** - Generate audio with different tones per line
- **Style profiling** - Maintain consistent writing style

---

## Installation

### System Requirements

- **OS:** Windows 10/11, macOS 10.15+, or Linux
- **RAM:** 4GB minimum (8GB recommended)
- **Storage:** 500MB free space
- **Python:** 3.8+ (optional, for running Python scripts)

### Download & Install

#### Windows
1. Download `TL-Editor-Setup.exe` from the releases page
2. Run the installer
3. Follow the installation wizard
4. Launch from Start Menu or desktop shortcut

#### macOS
1. Download `TL-Editor.dmg`
2. Drag TL-Editor to Applications folder
3. On first launch, right-click → Open (to bypass Gatekeeper)
4. Go to System Preferences → Security → Allow TL-Editor

#### Linux
```bash
# Debian/Ubuntu
sudo dpkg -i TL-Editor.deb
sudo apt-get install -f

# Fedora/RHEL
sudo rpm -i TL-Editor.rpm
```

### Build from Source (Advanced)

```bash
# Clone the repository
git clone <repository-url>
cd translator/translation-editor

# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for your platform
npm run build:win    # Windows
npm run build:mac    # macOS
npm run build:linux  # Linux
```

---

## First Run Setup

On first launch, the **Setup Wizard** will guide you through initial configuration:

### Step 1: Select Working Folder
- Choose the folder containing your novel/project files
- This folder will be scanned for JSON glossary files
- You can change this later via the sidebar

### Step 2: Load Glossary Files (Optional)
- Select existing glossary JSON files
- These define how specific terms should be translated
- You can add more later via the Glossary Panel

### Step 3: Configure Python (Optional)
- If you have Python scripts for translation/preprocessing
- Specify the Python executable path
- Set default script and working directory

---

## Interface Overview

```
┌─────────────────────────────────────────────────────────────┐
│  [TL-Editor]                                              │
├─────────────────────────────────────────────────────────────┤
│ Sidebar │           Main Content Area                     │
│         │                                                 │
│ 📁 Tree │  ┌──────────┐    ┌──────────┐                │
│ 📖 Gloss│  │   SRC    │    │   TGT    │                │
│ 🎵 Audio│  │  Source  │    │ Translation│               │
│ 💻 Term │  │  Column  │    │  Column   │                │
│ ⚙️ Setup │  └──────────┘    └──────────┘                │
│         │                                                 │
│         │  ┌─────────────────────────────────────────┐    │
│         │  │         Audio Player                    │    │
│         │  └─────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### Main Components

| Component | Location | Description |
|-----------|----------|-------------|
| **Sidebar** | Left | File tree, glossary access, tools |
| **DualView** | Center | Side-by-side source and translation |
| **AI Translate Panel** | Top-right | AI translation controls |
| **Glossary Panel** | Middle-right | Manage glossary entries |
| **Audio Player** | Bottom | Playback for generated audio |
| **Terminal** | Bottom-right | Run Python scripts |

---

## Working with Files

### Opening a Folder

1. Click the **folder icon** in the sidebar
2. Select your project folder
3. The file tree will populate automatically

### Opening Files

- **Double-click** a file in the sidebar tree
- Or use **Ctrl+O** to browse for a file

### Saving Files

- **Auto-save** is not enabled by default
- Press **Ctrl+S** to save the current file
- The file tab shows a **dot (•)** when unsaved

### Undo/Redo

- **Undo:** Ctrl+Z
- **Redo:** Ctrl+Y or Ctrl+Shift+Z
- Up to 200 undo levels available

### Renaming Files

1. Right-click a file in the sidebar
2. Select **Rename**
3. Type the new name
4. Press **Enter** to confirm

---

## Translation Features

### AI Translation

1. Load source text in the **SRC column**
2. Click **"แปลทั้งบท"** (Translate Chapter) in the AI Translate Panel
3. Configure (first time):
   - **API Key:** Get from [OpenRouter](https://openrouter.ai)
   - **Prompt Path:** Text file with translation instructions
   - **Glossary Path:** JSON file with terminology
4. Click **Translate** and wait for results

### Manual Translation

- Click any line in the **TGT column**
- Edit the text directly
- Changes are tracked for undo/redo

### Context Menu

Right-click on selected text to:
- **Translate Selection** - Translate just the selected portion
- **Send to Paraphrase** - Rephrase the selected text
- **Add to Glossary** - Quick-add as a glossary entry
- **Copy** - Copy to clipboard

### Find & Replace

1. Press **Ctrl+F** or click the search icon
2. Type your search term
3. Use **↑/↓** to navigate matches
4. Use **Replace** to change individual matches
5. Use **Replace All** to change all occurrences

---

## Glossary Management

### What is a Glossary?

A glossary ensures consistent translation of:
- Character names
- Place names
- Technical terms
- Special phrases

**Example:**
```json
{
  "Alice": "อลิซ",
  "Wonderland": "วันเดอร์แลนด์",
  "rabbit": "กระต่าย"
}
```

### Adding Entries

#### Method 1: Via Glossary Panel
1. Open **Glossary Panel** from sidebar
2. Click **+ Add Entry**
3. Fill in:
   - **Source:** Original term (e.g., "Alice")
   - **Target:** Translation (e.g., "อลิซ")
   - **Type:** person, place, term, other
   - **Paths:** Which files use this term
4. Click **Save**

#### Method 2: From Context Menu
1. Select text in SRC column
2. Right-click → **Add to Glossary**
3. Fill in details in the popup

### Importing Glossary Files

1. Click **Import** in Glossary Panel
2. Select a JSON file with format:
```json
[
  {
    "source": "Alice",
    "target": "อลิซ",
    "type": "person"
  }
]
```

### Exporting Glossary

1. Click **Export** dropdown
2. Choose format:
   - **JSON** - Full structure with metadata
   - **Simple JSON** - Just source-target pairs
   - **CSV** - Spreadsheet-compatible

### Cascading Path Selection

For nested JSON structures, use the cascading dropdown to select the correct path for each entry.

---

## Text-to-Speech (TTS)

### Setting Up TTS

1. Go to **Setup** (sidebar) or **AI Translate Panel**
2. Configure:
   - **TTS API URL:** `http://localhost:8000` (local) or `https://novelttsapi.onrender.com` (cloud)
   - **API Key:** If required by your API
   - **Voice Gender:** Female or Male
   - **Voice Name:** Specific voice (optional)
   - **Rate:** Speech speed (e.g., `+35%`)

### Generating Audio for Entire Chapter

1. Ensure TGT column has translated text
2. Click **"🎵 Generate with Tones"** in AI Translate Panel
3. Wait for generation (10-30 seconds)
4. Audio Player will appear automatically

### Setting Tones Per Line

1. In the **TGT column**, each line has a **tone dropdown** (left side)
2. Select tone for each line:
   - **ปกติ (normal)** - Standard narration
   - **โกรธ (angry)** - Loud, fast, higher pitch
   - **เศร้า (sad)** - Slow, slightly lower pitch
   - **กระซิบ (whisper)** - Quiet, slow, lower pitch
   - **ตื่นเต้น (excited)** - Fast, higher pitch, loud
   - **กลัว (fearful)** - Slightly higher, quiet
   - **จริงจัง (serious)** - Slightly slower, deeper
   - **เย็นชา (cold)** - Slow, deep, quiet

3. Click **"Generate with Tones"** to create audio with varied tones

### Preview Voice

1. In AI Translate Panel, click **Preview**
2. Enter sample text
3. Select voice settings
4. Listen to a short preview before generating the full chapter

---

## Audio Player

The Audio Player appears at the bottom when audio is generated.

### Controls

| Button | Function |
|--------|----------|
| ▶ Play | Start playback |
| ⏸ Pause | Pause playback |
| ⏪ Rewind | Go back 10 seconds |
| ⏩ Forward | Skip forward 10 seconds |
| 🔊 Volume | Adjust volume (click to mute) |
| Timeline | Click/drag to seek |

### Keyboard Shortcuts

- **Space:** Play/Pause
- **←/→:** Seek backward/forward 5 seconds
- **↑/↓:** Increase/decrease volume
- **M:** Mute/Unmute

### Closing Audio

- Click the **X** button to close the player
- This also clears the current audio from memory

---

## Style Profile

The Style Profile helps maintain consistent writing style across translations.

### Creating a Style Profile

1. Open **Style Profile Panel** from sidebar
2. Click **Create Profile**
3. Paste examples of your desired writing style
4. The system analyzes:
   - Sentence length
   - Vocabulary complexity
   - Tone and mood
   - Common phrases

### Applying Style Profile

1. During AI translation, enable **"Use Style Profile"**
2. The AI will mimic the analyzed style
3. Review and adjust as needed

---

## Terminal & Python Scripts

### Opening Terminal

1. Click **Terminal** icon in sidebar
2. The terminal panel opens at the bottom

### Running Python Scripts

1. In Terminal panel, go to **Python** tab
2. Configure:
   - **Python Path:** Path to python.exe
   - **Script Path:** Your Python script
   - **Working Directory:** Where the script runs
3. Click **Run**

### Pinning Scripts

- Click the **Pin** icon to save frequently used scripts
- Access them from the dropdown later

### Viewing Output

- **stdout:** Normal output (white text)
- **stderr:** Error messages (red text)
- **Exit Code:** Shown when script completes

---

## Keyboard Shortcuts

### Global Shortcuts

| Shortcut | Action |
|----------|--------|
| **Ctrl+S** | Save current file |
| **Ctrl+Z** | Undo |
| **Ctrl+Y** | Redo |
| **Ctrl+F** | Find in current column |
| **Ctrl+G** | Go to glossary panel |
| **Ctrl+R** | Refresh file tree |
| **Ctrl+J** | Open terminal |
| **Ctrl+B** | Toggle sidebar |
| **Ctrl+Shift+T** | Open TTS settings |

### DualView Shortcuts

| Shortcut | Action |
|----------|--------|
| **↑/↓** | Navigate rows |
| **Enter** | Edit selected row |
| **Esc** | Cancel editing |
| **Tab** | Switch between SRC/TGT |

### Audio Player Shortcuts

| Shortcut | Action |
|----------|--------|
| **Space** | Play/Pause |
| **←** | Rewind 5 seconds |
| **→** | Forward 5 seconds |
| **↑** | Volume up |
| **↓** | Volume down |
| **M** | Mute toggle |

---

## Tips & Troubleshooting

### Tips

1. **Use Glossary Early** - Set up your glossary before starting translation to ensure consistency
2. **Batch Translation** - Use AI translation for entire chapters, then refine manually
3. **Tone Variety** - Vary tones in TTS to make audio more engaging
4. **Regular Saves** - Press Ctrl+S frequently (auto-save not enabled by default)
5. **Keyboard Navigation** - Learn shortcuts to speed up workflow

### Common Issues

#### Issue: "Cannot connect to TTS API"
**Solution:**
- Ensure the Novel TTS API is running (`python main.py` in `novel-tts-api` folder)
- Check the API URL in settings (default: `http://localhost:8000`)
- Verify no firewall is blocking the connection

#### Issue: "Glossary not applying"
**Solution:**
- Check that glossary paths match your file structure
- Ensure glossary JSON format is correct
- Try re-importing the glossary

#### Issue: "Audio generation fails"
**Solution:**
- Check internet connection (Edge TTS requires online access)
- Verify TTS API is running
- Try with shorter text first
- Check API key if configured

#### Issue: "App runs slowly with large files"
**Solution:**
- Close other applications to free memory
- Split large files into smaller chapters
- Use Find feature instead of scrolling manually

#### Issue: "Changes not saving"
**Solution:**
- Check file permissions (read-only?)
- Ensure you're saving to a writable location
- Try "Save As" to a different location

### Getting Help

- **Documentation:** Check `README.md` and `STRUCTURE.md`
- **Issues:** Report bugs on the project repository
- **Logs:** Check the terminal panel for error messages

---

## Appendix: File Formats

### Supported Source Files
- Plain text (.txt)
- Markdown (.md)
- Any text-based format

### Glossary JSON Format
```json
[
  {
    "source": "Source term",
    "target": "Translated term",
    "type": "person|place|term|other",
    "paths": ["file1.txt", "file2.txt"]
  }
]
```

### Prompt File Format
```
Translate the following novel chapter from [SOURCE_LANG] to [TARGET_LANG].

Rules:
- Maintain the original tone and style
- Use the provided glossary for terminology
- Keep character names consistent
- Preserve paragraph breaks

[Your text here]
```

---

**End of User Manual**
