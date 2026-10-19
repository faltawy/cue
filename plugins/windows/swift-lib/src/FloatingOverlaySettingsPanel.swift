import Cocoa
import SwiftUI

enum FloatingOverlaySettingsPanelLayout {
  static let width: CGFloat = 280
  static let height: CGFloat = 302
  static let cornerRadius: CGFloat = 16
  static let gap: CGFloat = 8

  static func origin(below anchor: NSRect, in visibleFrame: NSRect, size: NSSize) -> NSPoint {
    let placeAbove = anchor.midY < visibleFrame.midY
    let y =
      placeAbove ? anchor.maxY + gap : anchor.minY - gap - size.height
    let x = anchor.midX - size.width / 2
    return NSPoint(
      x: min(max(x, visibleFrame.minX + gap), visibleFrame.maxX - gap - size.width),
      y: min(max(y, visibleFrame.minY + gap), visibleFrame.maxY - gap - size.height))
  }
}

final class FloatingOverlaySettingsPanelManager {
  static let shared = FloatingOverlaySettingsPanelManager()

  private let settings = FloatingOverlaySettingsModel.shared
  private var panel: NSPanel?

  private init() {}

  func toggle(anchor: NSRect?, screen: NSScreen?) {
    runOnMain { [weak self] in
      guard let self else { return }

      if let panel = self.panel, panel.isVisible {
        self.hidePanel()
        return
      }

      self.show(anchor: anchor, screen: screen)
    }
  }

  func applySharing(_ visible: Bool) {
    runOnMain { [weak self] in
      self?.panel?.sharingType = IslandSharing.type(visible: visible)
    }
  }

  func hide() {
    runOnMain { [weak self] in
      self?.hidePanel()
    }
  }

  private func show(anchor: NSRect?, screen: NSScreen?) {
    let panel = self.panel ?? createPanel()
    if panel.contentView == nil {
      panel.contentView = NSHostingView(
        rootView: FloatingOverlaySettingsPanelView(settings: settings))
    }

    position(panel, anchor: anchor, screen: screen)
    panel.orderFrontRegardless()
    self.panel = panel
  }

  private func hidePanel() {
    guard let panel else { return }
    panel.orderOut(nil)
  }

  private func createPanel() -> NSPanel {
    let panel = NSPanel(
      contentRect: NSRect(
        x: 0,
        y: 0,
        width: FloatingOverlaySettingsPanelLayout.width,
        height: FloatingOverlaySettingsPanelLayout.height),
      styleMask: [.borderless, .nonactivatingPanel],
      backing: .buffered,
      defer: false
    )

    panel.level = .statusBar
    panel.isFloatingPanel = true
    panel.hidesOnDeactivate = false
    panel.isOpaque = false
    panel.backgroundColor = .clear
    panel.hasShadow = true
    panel.sharingType = IslandSharing.type(visible: settings.visibleInScreenshots)
    panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]
    return panel
  }

  private func position(_ panel: NSPanel, anchor: NSRect?, screen: NSScreen?) {
    guard let screen = screen ?? NSScreen.main ?? NSScreen.screens.first else { return }
    let anchorFrame =
      anchor
      ?? NSRect(x: screen.visibleFrame.midX, y: screen.visibleFrame.maxY, width: 0, height: 0)
    panel.setFrameOrigin(
      FloatingOverlaySettingsPanelLayout.origin(
        below: anchorFrame, in: screen.visibleFrame, size: panel.frame.size))
  }

  private func runOnMain(_ block: @escaping () -> Void) {
    if Thread.isMainThread {
      block()
      return
    }

    DispatchQueue.main.async(execute: block)
  }
}

private struct FloatingOverlaySettingsPanelView: View {
  @ObservedObject var settings: FloatingOverlaySettingsModel

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      HStack {
        Text("Captions")
          .font(.system(size: 13, weight: .semibold))
        Spacer()
        Button(action: { FloatingOverlaySettingsPanelManager.shared.hide() }) {
          Image(systemName: "xmark")
            .font(.system(size: 10, weight: .semibold))
            .frame(width: 20, height: 20)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .foregroundStyle(.secondary)
        .accessibilityLabel("Close")
      }

      Toggle(
        "Show captions",
        isOn: Binding(
          get: { !settings.liveCaptionMinimized },
          set: { settings.setLiveCaptionMinimized(!$0) })
      )
      .toggleStyle(.switch)
      .controlSize(.small)
      .font(.system(size: 12))

      row("Lines") {
        Picker(
          "Lines",
          selection: Binding(
            get: { settings.liveCaptionLineCount },
            set: {
              settings.setLiveCaptionSize(width: settings.liveCaptionWidth, lineCount: $0)
            })
        ) {
          ForEach(LiveCaptionLayout.minLineCount...LiveCaptionLayout.maxLineCount, id: \.self) {
            Text("\($0)").tag($0)
          }
        }
        .pickerStyle(.segmented)
        .labelsHidden()
        .frame(width: 140)
      }

      row("Width") {
        Slider(
          value: Binding(
            get: { settings.liveCaptionWidth },
            set: {
              settings.setLiveCaptionSize(width: $0, lineCount: settings.liveCaptionLineCount)
            }),
          in: Double(LiveCaptionLayout.minWidth)...Double(LiveCaptionLayout.maxWidth)
        )
        .controlSize(.small)
        .frame(width: 140)
      }

      row("Background") {
        Slider(
          value: Binding(
            get: { settings.liveCaptionOpacity }, set: settings.setLiveCaptionOpacity),
          in: FloatingOverlayOpacity.minLiveCaption...FloatingOverlayOpacity.maxLiveCaption
        )
        .controlSize(.small)
        .frame(width: 140)
      }

      row("Position") {
        Picker(
          "Position",
          selection: Binding(
            get: { settings.liveCaptionPosition }, set: settings.setLiveCaptionPosition)
        ) {
          ForEach(LiveCaptionPosition.allCases, id: \.self) { Text($0.title).tag($0) }
        }
        .labelsHidden()
        .controlSize(.small)
        .frame(width: 140)
      }

      Toggle(
        "Show in screenshots and screen sharing",
        isOn: Binding(
          get: { settings.visibleInScreenshots }, set: settings.setVisibleInScreenshots)
      )
      .toggleStyle(.switch)
      .controlSize(.small)
      .font(.system(size: 12))
    }
    .padding(16)
    .frame(
      width: FloatingOverlaySettingsPanelLayout.width,
      height: FloatingOverlaySettingsPanelLayout.height,
      alignment: .top
    )
    .background(
      RoundedRectangle(
        cornerRadius: FloatingOverlaySettingsPanelLayout.cornerRadius, style: .continuous
      )
      .fill(Color(white: 0.09))
    )
    .overlay(
      RoundedRectangle(
        cornerRadius: FloatingOverlaySettingsPanelLayout.cornerRadius, style: .continuous
      )
      .strokeBorder(Color.white.opacity(0.1), lineWidth: 1)
    )
    .environment(\.colorScheme, .dark)
  }

  private func row<Content: View>(_ title: String, @ViewBuilder content: () -> Content)
    -> some View
  {
    HStack {
      Text(title)
        .font(.system(size: 12))
        .foregroundStyle(.secondary)
      Spacer()
      content()
    }
  }
}
