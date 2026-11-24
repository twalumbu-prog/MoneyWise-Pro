// Builds the iPhone capture guide video (assets/capture-guide/guide.mp4) from the step screenshots.
//
//   swift scripts/capture-guide/make-video.swift assets/capture-guide assets/capture-guide/steps.json assets/capture-guide/guide.mp4
//
// Each step is shown for a few seconds: its caption on top, the Shortcuts screenshot below (zoomed to the area around
// the tap), and a pulsing ring with a tap on the exact spot. The same steps.json drives the in-app step-by-step guide,
// so the video and the screens always agree. Re-run after taking new screenshots for a new iOS version.
import AVFoundation
import CoreGraphics
import CoreText
import Foundation
import ImageIO

struct Step: Decodable { let image: String; let caption: String; let x: Double; let y: Double }
struct Spec: Decodable { let pointsWidth: Double; let pointsHeight: Double; let steps: [Step] }

let args = CommandLine.arguments
guard args.count == 4 else { print("usage: make-video.swift <shots dir> <steps.json> <out.mp4>"); exit(1) }
let shotsDir = URL(fileURLWithPath: args[1])
let spec = try JSONDecoder().decode(Spec.self, from: Data(contentsOf: URL(fileURLWithPath: args[2])))
let outURL = URL(fileURLWithPath: args[3])

// The app's own fonts, so the video reads like the rest of MoneyWise.
let fontDir = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("../../../../node_modules/@expo-google-fonts/dm-sans")
for f in ["700Bold/DMSans_700Bold.ttf", "500Medium/DMSans_500Medium.ttf"] {
    CTFontManagerRegisterFontsForURL(fontDir.appendingPathComponent(f) as CFURL, .process, nil)
}

let W = 720, H = 1280, FPS: Int32 = 30
let stepSeconds = 3.6, fade = 0.35
let headerH: CGFloat = 220
let ink = CGColor(red: 0x11/255, green: 0x18/255, blue: 0x27/255, alpha: 1)
let muted = CGColor(red: 0x6B/255, green: 0x72/255, blue: 0x80/255, alpha: 1)
let blue = CGColor(red: 0, green: 0x6A/255, blue: 1, alpha: 1)
let white = CGColor(red: 1, green: 1, blue: 1, alpha: 1)

func loadImage(_ name: String) -> CGImage {
    let src = CGImageSourceCreateWithURL(shotsDir.appendingPathComponent(name) as CFURL, nil)!
    return CGImageSourceCreateImageAtIndex(src, 0, nil)!
}
let images = spec.steps.map { loadImage($0.image) }

/// Caption with **key words** in blue.
func attributed(_ text: String, size: CGFloat) -> NSAttributedString {
    let font = CTFontCreateWithName("DMSans-Bold" as CFString, size, nil)
    let out = NSMutableAttributedString()
    for (i, part) in text.components(separatedBy: "**").enumerated() {
        out.append(NSAttributedString(string: part, attributes: [
            NSAttributedString.Key(kCTFontAttributeName as String): font,
            NSAttributedString.Key(kCTForegroundColorAttributeName as String): i % 2 == 1 ? blue : ink,
        ]))
    }
    return out
}

func drawText(_ ctx: CGContext, _ str: NSAttributedString, in rect: CGRect) {
    let setter = CTFramesetterCreateWithAttributedString(str)
    let path = CGPath(rect: rect, transform: nil)
    let frame = CTFramesetterCreateFrame(setter, CFRange(location: 0, length: 0), path, nil)
    CTFrameDraw(frame, ctx)
}

func drawFrame(_ ctx: CGContext, step i: Int, t: Double, alpha: CGFloat) {
    let s = spec.steps[i], img = images[i]
    ctx.saveGState()
    ctx.setAlpha(alpha)
    // CoreGraphics is bottom-up; flip so y grows downwards like the screen.
    ctx.translateBy(x: 0, y: CGFloat(H)); ctx.scaleBy(x: 1, y: -1)

    // Screenshot: full width, scrolled so the tap sits in the upper middle of the visible area.
    let scale = CGFloat(W) / CGFloat(img.width)
    let imgH = CGFloat(img.height) * scale
    let tx = CGFloat(s.x / spec.pointsWidth) * CGFloat(W)
    let tyImg = CGFloat(s.y / spec.pointsHeight) * imgH
    let visible = CGFloat(H) - headerH
    var offset = tyImg - visible * 0.45
    // Never show the status bar (time, battery): it is not part of what to tap.
    let statusBar = CGFloat(62 / spec.pointsHeight) * imgH
    offset = max(statusBar, min(offset, imgH - visible))
    ctx.saveGState()
    ctx.clip(to: CGRect(x: 0, y: headerH, width: CGFloat(W), height: visible))
    ctx.saveGState()
    ctx.translateBy(x: 0, y: headerH - offset + imgH); ctx.scaleBy(x: 1, y: -1)
    ctx.draw(img, in: CGRect(x: 0, y: 0, width: CGFloat(W), height: imgH))
    ctx.restoreGState()
    ctx.restoreGState()

    // A soft edge between the caption and the screenshot.
    let grad = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: [white, CGColor(red: 1, green: 1, blue: 1, alpha: 0)] as CFArray, locations: [0, 1])!
    ctx.drawLinearGradient(grad, start: CGPoint(x: 0, y: headerH), end: CGPoint(x: 0, y: headerH + 28), options: [])

    // Pulsing ring + tap on the target.
    let ty = headerH - offset + tyImg
    let phase = (t.truncatingRemainder(dividingBy: 1.2)) / 1.2
    let r = 34 + CGFloat(phase) * 46
    ctx.setStrokeColor(blue.copy(alpha: CGFloat(0.85 * (1 - phase)))!)
    ctx.setLineWidth(6)
    ctx.strokeEllipse(in: CGRect(x: tx - r, y: ty - r, width: r * 2, height: r * 2))
    // A see-through fingertip, so the label under it stays readable; it presses in once per step.
    let press = t > 1.5 && t < 1.9 ? 0.8 : 1.0
    let dr = 30 * CGFloat(press)
    ctx.setFillColor(blue.copy(alpha: 0.22)!)
    ctx.fillEllipse(in: CGRect(x: tx - dr, y: ty - dr, width: dr * 2, height: dr * 2))
    ctx.setStrokeColor(blue); ctx.setLineWidth(4)
    ctx.strokeEllipse(in: CGRect(x: tx - dr, y: ty - dr, width: dr * 2, height: dr * 2))

    // Header: white band, step count, caption.
    ctx.setFillColor(white)
    ctx.fill(CGRect(x: 0, y: 0, width: CGFloat(W), height: headerH))
    ctx.restoreGState()

    // Text is drawn in CoreGraphics' own (bottom-up) space.
    ctx.saveGState(); ctx.setAlpha(alpha)
    let count = NSAttributedString(string: "STEP \(i + 1) OF \(spec.steps.count)", attributes: [
        NSAttributedString.Key(kCTFontAttributeName as String): CTFontCreateWithName("DMSans-Medium" as CFString, 24, nil),
        NSAttributedString.Key(kCTForegroundColorAttributeName as String): muted,
        NSAttributedString.Key(kCTKernAttributeName as String): 1.5,
    ])
    drawText(ctx, count, in: CGRect(x: 48, y: CGFloat(H) - 92, width: CGFloat(W) - 96, height: 36))
    drawText(ctx, attributed(s.caption, size: 42), in: CGRect(x: 48, y: CGFloat(H) - headerH - 4, width: CGFloat(W) - 96, height: headerH - 96))
    ctx.restoreGState()
}

try? FileManager.default.removeItem(at: outURL)
let writer = try AVAssetWriter(outputURL: outURL, fileType: .mp4)
let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
    AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: W, AVVideoHeightKey: H,
    AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 900_000, AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel],
])
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
    kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32ARGB, kCVPixelBufferWidthKey as String: W, kCVPixelBufferHeightKey as String: H,
])
writer.add(input)
writer.startWriting(); writer.startSession(atSourceTime: .zero)

let total = Int(Double(spec.steps.count) * stepSeconds * Double(FPS))
for f in 0..<total {
    while !input.isReadyForMoreMediaData { usleep(1000) }
    var pb: CVPixelBuffer?
    CVPixelBufferPoolCreatePixelBuffer(nil, adaptor.pixelBufferPool!, &pb)
    let buf = pb!
    CVPixelBufferLockBaseAddress(buf, [])
    let ctx = CGContext(data: CVPixelBufferGetBaseAddress(buf), width: W, height: H, bitsPerComponent: 8,
                        bytesPerRow: CVPixelBufferGetBytesPerRow(buf), space: CGColorSpaceCreateDeviceRGB(),
                        bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue)!
    ctx.setFillColor(white); ctx.fill(CGRect(x: 0, y: 0, width: W, height: H))
    let time = Double(f) / Double(FPS)
    let i = min(Int(time / stepSeconds), spec.steps.count - 1)
    let local = time - Double(i) * stepSeconds
    // Cross-fade into the next step over the last `fade` seconds (the last step fades back into the first: it loops).
    if local > stepSeconds - fade {
        let k = CGFloat((local - (stepSeconds - fade)) / fade)
        drawFrame(ctx, step: i, t: local, alpha: 1)
        drawFrame(ctx, step: (i + 1) % spec.steps.count, t: 0, alpha: k)
    } else {
        drawFrame(ctx, step: i, t: local, alpha: 1)
    }
    CVPixelBufferUnlockBaseAddress(buf, [])
    adaptor.append(buf, withPresentationTime: CMTime(value: CMTimeValue(f), timescale: FPS))
}
input.markAsFinished()
let done = DispatchSemaphore(value: 0)
writer.finishWriting { done.signal() }
done.wait()
print(writer.status == .completed ? "wrote \(outURL.path) (\(total) frames)" : "failed: \(String(describing: writer.error))")
