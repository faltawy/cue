import Cocoa

/// Hosts a view for an offscreen render. The window is never ordered in, sits far off any display,
/// is fully transparent and ignores the pointer, so a test run never shows anything on screen.
/// Close it once the capture is done.
func offscreenWindow(hosting view: NSView) -> NSWindow {
  let window = NSWindow(
    contentRect: NSRect(origin: NSPoint(x: -10_000, y: -10_000), size: view.frame.size),
    styleMask: [.borderless], backing: .buffered, defer: false)
  window.isReleasedWhenClosed = false
  window.alphaValue = 0
  window.ignoresMouseEvents = true
  window.contentView = view
  return window
}
