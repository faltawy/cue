import Cocoa

enum OverlayLayout {
  static let panelWidth: CGFloat = 120
  static let panelHeight: CGFloat = 30
  static let shadowPadding: CGFloat = 12
  static let cornerRadius: CGFloat = 15
  static let bottomInset: CGFloat = 48
  /// The live preview sits above the pill, growing upward to three lines.
  static let previewWidth: CGFloat = 360
  static let previewMaxHeight: CGFloat = 76
  static let previewGap: CGFloat = 8
  static var containerWidth: CGFloat { previewWidth + shadowPadding * 2 }
  static var containerHeight: CGFloat {
    previewMaxHeight + previewGap + panelHeight + shadowPadding * 2
  }
  static let contentPaddingH: CGFloat = 12
  static let iconBarsGap: CGFloat = 10
  static let iconSize: CGFloat = 12
  static let barWidth: CGFloat = 2
  static let barSpacing: CGFloat = 2
  static let barCount: Int = 16
  static let barMaxHeight: CGFloat = 16
  static let barMinHeight: CGFloat = 2
}

enum OverlayTiming {
  static let fadeIn: TimeInterval = 0.22
  static let fadeOut: TimeInterval = 0.16
  static let amplitudeLerp: Double = 0.35
}
