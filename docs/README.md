# Yogurt help

Yogurt records your microphone and call audio, transcribes the meeting, and writes a Summary alongside your own notes. Processing stays on your computer. No bot joins the call.

## Install

Download Yogurt from [GitHub Releases](https://github.com/FrigadeHQ/yogurt/releases/latest). Every computer needs at least 8 GB of memory.

- **Mac:** Apple Silicon, macOS 14.4 or later. Open the DMG, drag Yogurt into Applications, then open it from Applications.
- **Windows:** Windows 10 version 2004 or later, x64. Run the `.exe` installer. It's signed by Frigade Inc.
- **Linux:** x64, Ubuntu 22.04 or a compatible newer system, with PulseAudio or PipeWire. Make the `.AppImage` executable in its file properties, then open it. If it doesn't open, install FUSE 2 first: `sudo apt install libfuse2` on Ubuntu 22.04, `sudo apt install libfuse2t64` on 24.04 and newer. GNOME needs the AppIndicator extension to show the tray icon.

On first run, Yogurt downloads the models it needs. Windows and Linux also check transcription speed and stop setup if the computer cannot keep up. Recording works as soon as setup finishes. The notes model keeps downloading in the background, and notes and questions work offline once it's in. Calendar access and speaker names from calls are available on Mac only.

## Mac permissions

Microphone and call audio access let Yogurt hear both sides of a meeting. Allow them during setup, or open Settings in Yogurt to change them later. macOS lists call audio under Screen & System Audio Recording.

The other permissions are optional:

- **Calendar:** show upcoming meetings and use their titles and attendees.
- **Notifications:** offer to take notes when a call starts.
- **Accessibility:** read speaker names from supported call apps.
- **Screen Recording:** read the text on a call's window, when you choose it for that call ([Read a call's screen](#read-a-calls-screen)). macOS asks the first time; after you allow it, it may ask you to quit and reopen Yogurt.

If a permission is off, use its button in Yogurt's Settings to open the right system pane. After changing it, return to Yogurt. Recording always waits for your click.

## Privacy

Audio, transcripts, notes, and questions are processed locally. Yogurt does not upload your meetings, and there is no telemetry.

Yogurt connects to the internet to download models from Hugging Face, to get Apple's optional on-device speech assets (on a Mac), and to check GitHub for updates. After setup it keeps downloading in the background: first a smaller notes model, then the best one your computer can run, which can be large (about 14 GB on a Mac with 64 GB of memory, about 63 GB with 96 GB or more). Updates download in the background and install when you quit. Links open in your browser. Copying and exporting does not upload your content.

If you [connect an AI app](#connect-an-ai-app), it may send what it reads to its own online model.

## Change a Summary

Type in a Summary to change it yourself. To have the notes model change it, open **… → Edit or regenerate summary** and add a note, like "shorter" or "add the budget":

- **Edit summary** applies the note to the Summary as it is now, and keeps your own changes. It reads only the Summary unless you tick **Edit using the transcript too**. Reading the transcript is slower, and a long meeting may not fit the notes model at once, so it is then read in parts. For a few seconds afterwards, **Undo** puts the Summary back as it was.
- **Regenerate** writes the Summary again from the meeting, and replaces your changes.

## Your data

Meetings, recordings, settings and downloaded models live here:

| Computer | Folder |
| --- | --- |
| Mac | `~/Library/Application Support/Yogurt` |
| Windows | `%APPDATA%\Yogurt` |
| Linux | `~/.config/Yogurt` (or `$XDG_CONFIG_HOME/Yogurt` if set) |

## What Yogurt keeps

Everything is kept until you choose otherwise in **Settings → What Yogurt keeps**. Each rule counts from when a meeting ended:

- **Delete audio:** once the summary is saved, or after a week, a month, 3 months, a year, or any number of days.
- **Delete video:** the copy of an uploaded video, and the pictures read from a call's window. **Don't keep it** saves neither: the screen is read once, while uploading or during the call, and can't be read again later.
- **Delete transcripts:** the transcript and its audio go; the notes stay, and are no longer written again.
- **Move meetings to the Trash:** they are deleted for good 30 days later, unless restored.

Audio and transcripts go only from meetings whose summary is saved. When a new rule would act on meetings at once, Yogurt asks first and says how many.

## Upload a recording

Upload an MP3, M4A or WAV, or a screen recording (MOV or MP4), and Yogurt transcribes it into a new note. On a Mac, text shown on a video's screen is read on this computer and added to the transcript as **Screen** lines at the time it was shown, so the notes and Ask can use it.

## Read a call's screen

On a Mac, the **Take notes?** card that shows when a call starts has a screen button next to **Start recording**. Turn it on, and the button reads **Record with screen**: while the meeting records, Yogurt reads the text on the call's window every 2 seconds, on this computer, and adds it to the transcript as **Screen** lines as it changes, so the notes and Ask can use what was shared.

- Only the call's window is read: Zoom's or Teams' meeting window, or the browser window while it shows the call's tab (a Meet tab, for example). Other apps and other tabs never are.
- It is chosen for each call, and it is off unless you turn it on. A recording started from Yogurt itself reads no screen.
- The first time you turn the button on, the Mac asks to allow Screen Recording for Yogurt. Allow it before you start recording: macOS then asks to reopen Yogurt. Until then, the card says so with **Open Settings**, and the call is recorded as usual.
- If the call's event already has a note, the card adds to that note, and the screen is read for the new part.
- Pausing the recording pauses it too. If Screen Recording is off, the note says so and the call is recorded as usual.
- The pictures read are kept with the meeting until **Delete video** in [What Yogurt keeps](#what-yogurt-keeps) removes them.

## Backup and restore

Finish any recording, then open **Settings → Backup** to export your meetings and audio to one ZIP file. Meetings in the Trash are not included.

Import a backup from the same section. It adds meetings that are missing and leaves existing meetings unchanged. Backups work across Mac, Windows and Linux.

## Connect an AI app

In **Settings → AI apps**, turn on access, copy the helper command, and add it as a local MCP server in your AI app. MCP lets that app read your meetings, notes and transcripts; it cannot change them. Yogurt does not edit the other app's configuration.

Access is off by default. A connected AI app may send what it reads to its own online model. Turn access off in Yogurt to stop further reads.

## Uninstall

Quit Yogurt first. On Mac, move Yogurt from Applications to the Trash. On Windows, uninstall it from Settings → Apps. On Linux, delete the AppImage.

Removing the app keeps your data. To remove that too, export a backup if you want one, then delete the Yogurt data folder listed above. This permanently removes your local meetings, recordings, settings and models.

## Report a problem

[Open a GitHub issue](https://github.com/FrigadeHQ/yogurt/issues) with your operating system, Yogurt version, what you did, what you expected and what happened. Leave private meeting content out of screenshots and reports.
