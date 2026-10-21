# Automations

An automation saves each meeting as a Markdown file in a folder on your Mac, without you doing anything. Cue sends nothing anywhere else. If the folder is synced by a cloud service such as iCloud Drive or Dropbox, that service uploads the files as it normally does.

Open automations from **Settings → Automations**.

## How do I save every meeting as a file?

1. Under **Get started**, open **Export every meeting as Markdown**.
2. Click **Choose folder** and pick a folder.
3. Choose what each file includes and how files are named (see [Export options](#export-options)).
4. Click **Test** to export your latest note now and check the file.
5. Click **Save & enable**.

After each meeting, Cue writes the file. When the summary changes later, Cue updates the file. **Preview** shows what a file looks like. **Disable** stops the automation, and **⋯ → Remove automation** removes it.

## Export options

- **Export folder**: Where the files go.
- **Include**: Memo, Summary, Transcript and **Collect action items**. All are on at first.
- **Filename**: Leave it empty to use the meeting date and title. You can use `{date}` (written like 2026-10-20) and `{title}`.
- **Include meeting ID**: Adds a short code to the file name so two meetings with the same title don't overwrite each other. It is on at first.

## Make your own automation

1. Click **+** (**New automation**).
2. Click the name at the top of the page and type a name.
3. Under **When this happens**, choose **After the meeting summary is ready** or **After the meeting ends**. With the first one, Cue updates the file each time you regenerate the summary. With the second, it writes the file once.
4. Add the **Markdown export** action and set its [options](#export-options).
5. Click **Save & enable**. It needs at least one action that is set up.

You can add more than one export, for example to two folders. Cue runs them from top to bottom.

To change or delete an automation, right-click it in the list and choose **Edit** or **Delete**.

## When something goes wrong

The page shows when the automation last ran, for example "Last run 5 minutes ago", or why it failed. Often the file name is already used by another file. Turn on **Include meeting ID** or change the file name.

If you rename a meeting, Cue removes the old file it wrote, unless you changed that file yourself.
