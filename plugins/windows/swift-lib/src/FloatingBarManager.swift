import Cocoa
import Combine
import SwiftUI

final class FloatingBarManager {
  static let shared = FloatingBarManager()

  private var panel: NSPanel?
  private let model = FloatingBarViewModel()
  private let settingsModel = FloatingOverlaySettingsModel.shared
  private var observers: [(NotificationCenter, Any)] = []
  private var cancellables = Set<AnyCancellable>()
  private var commandCoalescer: FloatingBarCommandCoalescer!
  private var screen: IslandScreen?
  private var pointerMonitors: [Any] = []
  private var press: (start: NSPoint, grabOffset: NSPoint)?

  private init() {
    commandCoalescer = FloatingBarCommandCoalescer { [weak self] action in
      self?.apply(action)
    }
    model.$placement
      .receive(on: DispatchQueue.main)
      .sink { [weak self] _ in self?.placePanel() }
      .store(in: &cancellables)
    model.$mode
      .receive(on: DispatchQueue.main)
      .sink { [weak self] _ in self?.trackPointer() }
      .store(in: &cancellables)
    settingsModel.$visibleInScreenshots
      .receive(on: DispatchQueue.main)
      .sink { [weak self] visible in self?.applySharing(visible) }
      .store(in: &cancellables)
    settingsModel.$display
      .removeDuplicates()
      .receive(on: DispatchQueue.main)
      .sink { [weak self] _ in
        guard self?.model.isDragging == false else { return }
        self?.selectScreen()
      }
      .store(in: &cancellables)
    Publishers.CombineLatest4(
      settingsModel.$liveCaptionPosition, settingsModel.$liveCaptionWidth,
      settingsModel.$liveCaptionLineCount, settingsModel.$liveCaptionMinimized
    )
    .receive(on: DispatchQueue.main)
    .sink { [weak self] _ in self?.refreshPlacement() }
    .store(in: &cancellables)
  }

  func show() {
    commandCoalescer.enqueueShow()
    commandCoalescer.flush()
  }

  func hide() {
    commandCoalescer.enqueueHide()
  }

  func update(state: FloatingBarStatePayload) {
    commandCoalescer.enqueueUpdate(state)
  }

  var panelSharingType: NSWindow.SharingType? { panel?.sharingType }

  /// Off in tests, which build and configure the panel without putting it on the screen.
  var presentsOnScreen = true

  func update(amplitude: Double) {
    commandCoalescer.enqueueAmplitude(amplitude)
  }

  private func apply(_ action: FloatingBarCommandCoalescer.Action) {
    dispatchPrecondition(condition: .onQueue(.main))

    switch action {
    case .show:
      applyShow()
    case .hide:
      applyHide()
    case .update(let state):
      applyUpdate(state)
    case .amplitude(let amplitude):
      applyAmplitude(amplitude)
    }
  }

  private func applyShow() {
    selectScreen()
    model.reduceMotion = NSWorkspace.shared.accessibilityDisplayShouldReduceMotion
    if let panel {
      placePanel()
      startObserving()
      if presentsOnScreen { panel.orderFrontRegardless() }
      return
    }

    let panel = createPanel()
    let hostingView = NSHostingView(
      rootView: FloatingBarView(
        model: model, settings: settingsModel,
        onSettings: { [weak self] in
          self?.toggleSettings()
        }))
    hostingView.sizingOptions = []
    hostingView.autoresizingMask = [.width, .height]
    panel.contentView = hostingView
    self.panel = panel
    placePanel()
    if presentsOnScreen { panel.orderFrontRegardless() }
    startObserving()
  }

  private func applyHide() {
    guard let panel else { return }
    stopObserving()
    FloatingOverlaySettingsPanelManager.shared.hide()
    panel.orderOut(nil)
    self.panel = nil
    model.isPeeking = false
  }

  private func applyUpdate(_ state: FloatingBarStatePayload) {
    let startsDictation =
      state.dictation != nil && state.dictation?.sessionId != model.dictation?.sessionId
    if state.dictation != nil, panel?.isKeyWindow == true { panel?.resignKey() }
    model.dictation = state.dictation
    (panel as? FloatingBarPanel)?.dictationMode = state.dictation != nil
    model.trackRecordingStart(sessionId: state.sessionId, startedAtMs: state.startedAtMs)
    if model.status != state.status { model.status = state.status }
    applyAmplitude(state.amplitude)
    if model.title != state.title { model.title = state.title }
    if model.liveCaptionToggleVisible != state.liveCaptionToggleVisible {
      model.liveCaptionToggleVisible = state.liveCaptionToggleVisible
    }
    if let transcriptBubbles = state.transcriptBubbles { model.setTranscript(transcriptBubbles) }
    if model.transcriptNotice != state.transcriptNotice {
      model.transcriptNotice = state.transcriptNotice
    }
    settingsModel.apply(floatingBarState: state)
    let minimized =
      state.dictation == nil ? settingsModel.liveCaptionMinimized : state.liveCaptionMinimized
    let isExpanded = state.liveCaptionToggleVisible && !minimized
    if model.isExpanded != isExpanded { model.isExpanded = isExpanded }
    if startsDictation { selectScreen() }
  }

  private func applyAmplitude(_ amplitude: Double) {
    let amplitude = min(max(amplitude, 0), 1)
    guard model.amplitude != amplitude else { return }
    model.amplitude = amplitude
  }

  private func createPanel() -> NSPanel {
    let panel = FloatingBarPanel(
      contentRect: IslandLayout.panelFrame(model.placement),
      styleMask: [.borderless, .nonactivatingPanel],
      backing: .buffered,
      defer: false
    )
    panel.dictationMode = model.dictation != nil
    panel.level = .statusBar
    panel.isFloatingPanel = true
    panel.hidesOnDeactivate = false
    panel.isOpaque = false
    panel.backgroundColor = .clear
    panel.hasShadow = false
    panel.sharingType = IslandSharing.type(visible: settingsModel.visibleInScreenshots)
    panel.ignoresMouseEvents = true
    panel.isMovable = false
    panel.collectionBehavior = [
      .canJoinAllSpaces, .fullScreenAuxiliary, .stationary, .ignoresCycle,
    ]
    return panel
  }

  private func selectScreen() {
    let screens = NSScreen.screens.map(IslandScreen.init)
    guard
      let index = IslandLayout.screenIndex(
        for: screens, mouse: NSEvent.mouseLocation, choice: settingsModel.display)
    else { return }
    screen = screens[index]
    refreshPlacement()
  }

  /// Connected displays for the "Show on" setting, as JSON: id, name, and whether it has the
  /// camera notch. The main display comes first.
  static func displaysJSON() -> String {
    let displays = NSScreen.screens.map(IslandScreen.init).map {
      ["id": $0.id, "name": $0.name, "hasCamera": $0.hasNotch] as [String: Any]
    }
    guard let data = try? JSONSerialization.data(withJSONObject: displays),
      let json = String(data: data, encoding: .utf8)
    else { return "[]" }
    return json
  }

  private func refreshPlacement() {
    guard let screen else { return }
    let placement = IslandPlacement(
      screen: screen,
      position: settingsModel.liveCaptionPosition,
      captionWidth: CGFloat(settingsModel.liveCaptionWidth),
      captionLines: settingsModel.liveCaptionLineCount)
    if model.placement != placement { model.placement = placement }
    if model.dictation == nil {
      let isExpanded = model.liveCaptionToggleVisible && !settingsModel.liveCaptionMinimized
      if model.isExpanded != isExpanded { model.isExpanded = isExpanded }
    }
  }

  /// The window keeps one size per placement; switching modes only animates the island inside
  /// it, so the top edge never moves and nothing is resized mid-animation.
  private func placePanel() {
    guard let panel, !model.isDragging else { return }
    let frame = IslandLayout.panelFrame(model.placement)
    if panel.frame != frame {
      panel.setFrame(frame, display: true, animate: false)
      panel.contentView?.frame = NSRect(origin: .zero, size: frame.size)
    }
    trackPointer()
  }

  private func islandFrameOnScreen() -> NSRect? {
    guard let panel else { return nil }
    return IslandLayout.islandFrame(
      for: model.mode, model.placement, dictation: model.dictation != nil, in: panel.frame)
  }

  /// The window is mostly transparent, so it ignores the mouse except while the pointer is over
  /// the island itself; clicks anywhere else reach the app underneath. The same check drives hover.
  private func trackPointer(_ location: NSPoint = NSEvent.mouseLocation) {
    guard let panel, !model.isDragging else { return }
    let regions = IslandLayout.hitRegion(
      for: model.mode, model.placement, dictation: model.dictation != nil, in: panel.frame)
    let inside = regions.contains { NSMouseInRect(location, $0, false) }
    if panel.ignoresMouseEvents == inside { panel.ignoresMouseEvents = !inside }
    model.setHovering(inside)
  }

  /// A press on the neck, the captions or the expanded header that travels past the drag threshold
  /// picks the island up; shorter presses stay clicks and reach the island's buttons untouched.
  private func handleDrag(_ event: NSEvent) -> NSEvent? {
    guard let panel, event.window === panel else { return event }
    let location = NSEvent.mouseLocation
    switch event.type {
    case .leftMouseDown:
      let handles = IslandLayout.dragHandles(
        for: model.mode, model.placement, dictation: model.dictation != nil, in: panel.frame)
      guard handles.contains(where: { NSMouseInRect(location, $0, false) }),
        let neck = handles.first
      else {
        press = nil
        return event
      }
      let grab = NSPoint(
        x: min(max(location.x - neck.midX + IslandLayout.pillWidth / 2, 12),
          IslandLayout.pillWidth - 12),
        y: IslandLayout.pillHeight / 2)
      press = (location, grab)
      return event
    case .leftMouseDragged:
      guard let press else { return event }
      if !model.isDragging {
        guard IslandLayout.isDrag(from: press.start, to: location) else { return event }
        FloatingOverlaySettingsPanelManager.shared.hide()
        model.isDragging = true
        panel.ignoresMouseEvents = false
      }
      panel.setFrame(
        IslandLayout.dragFrame(pointer: location, grabOffset: press.grabOffset), display: true,
        animate: false)
      return nil
    case .leftMouseUp:
      let wasDragging = model.isDragging
      press = nil
      guard wasDragging else { return event }
      drop(at: location)
      return nil
    default:
      return event
    }
  }

  /// The pill glides to the anchor it was dropped nearest and only then becomes the island at its
  /// new place, so the window is moved in one animated step and never resized under the island.
  private func drop(at location: NSPoint) {
    guard let panel else { return }
    let screens = NSScreen.screens.map(IslandScreen.init)
    guard let snap = IslandLayout.snapTarget(release: location, screens: screens) else {
      model.isDragging = false
      placePanel()
      return
    }
    let target = screens[snap.screenIndex]
    let placement = IslandPlacement(
      screen: target, position: snap.position,
      captionWidth: CGFloat(settingsModel.liveCaptionWidth),
      captionLines: settingsModel.liveCaptionLineCount)
    let settle = IslandLayout.settleFrame(placement)
    let finish = { [weak self] in
      guard let self else { return }
      self.screen = target
      self.model.isDragging = false
      self.settingsModel.setPlacement(
        display: target.id.isEmpty ? .camera : .display(target.id), position: snap.position)
      self.refreshPlacement()
      self.placePanel()
    }
    if model.reduceMotion {
      finish()
      return
    }
    NSAnimationContext.runAnimationGroup({ context in
      context.duration = 0.32
      context.timingFunction = CAMediaTimingFunction(controlPoints: 0.2, 0.9, 0.25, 1)
      panel.animator().setFrame(settle, display: true)
    }, completionHandler: finish)
  }

  private func toggleSettings() {
    FloatingOverlaySettingsPanelManager.shared.toggle(
      anchor: islandFrameOnScreen(), screen: panel?.screen)
  }

  private func applySharing(_ visible: Bool) {
    panel?.sharingType = IslandSharing.type(visible: visible)
    FloatingOverlaySettingsPanelManager.shared.applySharing(visible)
  }

  private func startObserving() {
    if pointerMonitors.isEmpty {
      let events: NSEvent.EventTypeMask = [.mouseMoved, .leftMouseDragged]
      if let global = NSEvent.addGlobalMonitorForEvents(matching: events, handler: { [weak self] _ in
        self?.trackPointer()
      }) {
        pointerMonitors.append(global)
      }
      if let local = NSEvent.addLocalMonitorForEvents(matching: events, handler: { [weak self] event in
        self?.trackPointer()
        return event
      }) {
        pointerMonitors.append(local)
      }
      let presses: NSEvent.EventTypeMask = [.leftMouseDown, .leftMouseDragged, .leftMouseUp]
      if let drag = NSEvent.addLocalMonitorForEvents(matching: presses, handler: { [weak self] event in
        self?.handleDrag(event) ?? event
      }) {
        pointerMonitors.append(drag)
      }
    }
    guard observers.isEmpty else { return }
    let center = NotificationCenter.default
    let workspace = NSWorkspace.shared.notificationCenter
    observers.append(
      (
        center,
        center.addObserver(
          forName: NSApplication.didChangeScreenParametersNotification, object: nil, queue: .main
        ) { [weak self] _ in self?.selectScreen() }
      ))
    observers.append(
      (
        workspace,
        workspace.addObserver(
          forName: NSWorkspace.accessibilityDisplayOptionsDidChangeNotification, object: nil,
          queue: .main
        ) { [weak self] _ in
          self?.model.reduceMotion = NSWorkspace.shared.accessibilityDisplayShouldReduceMotion
        }
      ))
    observers.append(
      (
        workspace,
        workspace.addObserver(
          forName: NSWorkspace.activeSpaceDidChangeNotification, object: nil, queue: .main
        ) { [weak self] _ in self?.selectScreen() }
      ))
  }

  private func stopObserving() {
    for (center, observer) in observers { center.removeObserver(observer) }
    observers.removeAll()
    for monitor in pointerMonitors { NSEvent.removeMonitor(monitor) }
    pointerMonitors.removeAll()
  }
}

enum IslandSharing {
  static func type(visible: Bool) -> NSWindow.SharingType { visible ? .readOnly : .none }
}

final class FloatingBarPanel: NSPanel {
  var dictationMode = false
  override var canBecomeKey: Bool { !dictationMode && super.canBecomeKey }
  override var canBecomeMain: Bool { false }

  override func constrainFrameRect(_ frameRect: NSRect, to screen: NSScreen?) -> NSRect {
    frameRect
  }
}
