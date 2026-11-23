import AppKit
import Darwin

private let chinese = Locale.preferredLanguages.first?.hasPrefix("zh") == true
private func local(_ zh: String, _ en: String) -> String { chinese ? zh : en }
private let gameName = local("像素维修站", "Pixel Repair Lab")

private final class Launcher: NSObject, NSApplicationDelegate {
    private let smokeTest = CommandLine.arguments.dropFirst().contains("--smoke-test")
    private var smokePassed = false
    private lazy var window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 440, height: 202),
                                  styleMask: [.titled, .closable, .miniaturizable],
                                  backing: .buffered, defer: false)
    private lazy var message = NSTextField(wrappingLabelWithString: "")
    private lazy var action = NSButton()
    private var server: Process?
    private var lifetime: Pipe?
    private var gameURL: URL?

    func launch() {
        if smokeTest {
            start()
            dispatchMain()
        } else {
            let app = NSApplication.shared
            app.setActivationPolicy(.regular)
            app.delegate = self
            app.run()
        }
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        let menu = NSMenu()
        let appItem = NSMenuItem()
        let appMenu = NSMenu(title: gameName)
        appMenu.addItem(withTitle: local("退出", "Quit") + " " + gameName,
                        action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu
        menu.addItem(appItem)
        NSApp.mainMenu = menu

        window.title = gameName
        window.isReleasedWhenClosed = false
        let title = NSTextField(labelWithString: gameName)
        title.font = .systemFont(ofSize: 22, weight: .semibold)
        message.maximumNumberOfLines = 3
        message.isSelectable = true
        action.target = self
        action.action = #selector(openOrRetry)
        action.bezelStyle = .rounded
        action.keyEquivalent = "\r"
        let quit = NSButton(title: local("退出", "Quit"), target: NSApp,
                            action: #selector(NSApplication.terminate(_:)))
        let buttons = NSStackView(views: [action, quit])
        let content = NSStackView(views: [title, message, buttons])
        content.orientation = .vertical
        content.alignment = .leading
        content.spacing = 15
        content.translatesAutoresizingMaskIntoConstraints = false
        if let view = window.contentView {
            view.addSubview(content)
            NSLayoutConstraint.activate([
                content.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 24),
                content.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -24),
                content.centerYAnchor.constraint(equalTo: view.centerYAnchor),
                message.widthAnchor.constraint(equalTo: content.widthAnchor),
            ])
        }
        window.center()
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        start()
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        window.makeKeyAndOrderFront(nil)
        if let url = gameURL { open(url) }
        return true
    }

    func applicationWillTerminate(_ notification: Notification) {
        stopOwnedServer()
    }

    private func stopOwnedServer() {
        let child = server
        server = nil
        gameURL = nil
        try? lifetime?.fileHandleForWriting.close()
        lifetime = nil
        if let child = child, child.isRunning { child.terminate() }
    }

    @objc private func openOrRetry() {
        if let url = gameURL { open(url) }
        else if server == nil { start() }
    }

    private func open(_ url: URL) {
        if !NSWorkspace.shared.open(url) {
            message.stringValue = local("请在浏览器打开 ", "Open this address in your browser: ") + url.absoluteString
        }
    }

    private func failed(_ explanation: String) {
        stopOwnedServer()
        if smokeTest {
            FileHandle.standardError.write(Data((explanation + "\n").utf8))
            exit(EXIT_FAILURE)
        }
        message.stringValue = explanation
        action.title = local("重新启动", "Try again")
        action.isEnabled = true
        window.makeKeyAndOrderFront(nil)
    }

    private func start() {
        let files = FileManager.default
        let contents = Bundle.main.bundleURL.appendingPathComponent("Contents")
        let game = contents.appendingPathComponent("Resources/game")
        let node = contents.appendingPathComponent("Helpers/node")
        let python = contents.appendingPathComponent("Frameworks/ClassroomPython.framework/Versions/Current/bin/python3.12")
        let entry = game.appendingPathComponent("server/index.mjs")
        guard files.isExecutableFile(atPath: node.path), files.isExecutableFile(atPath: python.path),
              files.isReadableFile(atPath: entry.path) else {
            failed(local("应用文件不完整。请从发布包重新拷贝整个应用。", "Some game files are missing. Copy the complete app from the distribution again."))
            return
        }

        let child = Process()
        let input = Pipe()
        let output = Pipe()
        do {
            var environment = ProcessInfo.processInfo.environment
            var envOption: [String] = []
            if smokeTest {
                environment["PORT"] = "0"
                child.currentDirectoryURL = files.temporaryDirectory
            } else {
                let support = try files.url(for: .applicationSupportDirectory, in: .userDomainMask,
                                            appropriateFor: nil, create: true).appendingPathComponent("PixelRepairLab")
                try files.createDirectory(at: support, withIntermediateDirectories: true,
                                          attributes: [.posixPermissions: 0o700])
                child.currentDirectoryURL = support
                let config = support.appendingPathComponent(".env")
                if files.fileExists(atPath: config.path) { envOption = ["--env-file=" + config.path] }
            }
            child.executableURL = node
            child.arguments = envOption + [entry.path, "--production", "--parent-stdin"]
            environment["PIXEL_REPAIR_PYTHON"] = python.path
            child.environment = environment
            child.standardInput = input
            child.standardOutput = output
            child.standardError = output
            try child.run()
            try? output.fileHandleForWriting.close()
        } catch {
            failed(local("游戏服务启动失败。", "The game could not start.") + " " + error.localizedDescription)
            return
        }
        server = child
        lifetime = input
        if !smokeTest {
            action.title = local("打开游戏", "Open game")
            action.isEnabled = false
            message.stringValue = local("正在启动维修站…", "Starting the repair station…")
        }
        monitor(child, output: output.fileHandleForReading)
        DispatchQueue.main.asyncAfter(deadline: .now() + 60) { [weak self, weak child] in
            guard let self = self, let child = child, self.server === child,
                  self.smokeTest || self.gameURL == nil else { return }
            self.failed(local("维修站启动超时。请重新启动。", "The repair station took too long to start. Try again."))
        }
    }

    private func ready(_ url: URL, from child: Process) {
        guard server === child, child.isRunning, gameURL == nil else { return }
        gameURL = url
        if smokeTest {
            var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 10)
            request.httpMethod = "GET"
            URLSession.shared.dataTask(with: request) { data, response, error in
                let served = error == nil && (response as? HTTPURLResponse)?.statusCode == 200 &&
                    data.map { String(decoding: $0, as: UTF8.self).contains("<html") } == true
                DispatchQueue.main.async {
                    guard self.server === child else { return }
                    guard served else { self.failed("The game home page did not load."); return }
                    self.smokePassed = true
                    try? self.lifetime?.fileHandleForWriting.close()
                    self.lifetime = nil
                }
            }.resume()
        } else {
            action.isEnabled = true
            message.stringValue = local("游戏已在本机启动。退出此应用时会关闭游戏服务。",
                                        "Your game is running locally. Quitting this app stops the game server.")
            open(url)
        }
    }

    // Follow only the server we launched. In particular, never open an unrelated
    // service that happens to be listening on the desired localhost port.
    private func monitor(_ child: Process, output: FileHandle) {
        DispatchQueue.global(qos: .utility).async { [weak self] in
            var pending = Data()
            var portConflict = false
            let readyPrefix = "Pixel Repair Lab is running at http://127.0.0.1:"
            var buffer = [UInt8](repeating: 0, count: 4096)
            while true {
                let count = buffer.withUnsafeMutableBytes { bytes in
                    Darwin.read(output.fileDescriptor, bytes.baseAddress!, bytes.count)
                }
                if count == -1 && errno == EINTR { continue }
                guard count > 0 else { break }
                pending.append(contentsOf: buffer.prefix(count))
                while let newline = pending.firstIndex(of: 10) {
                    let line = String(decoding: pending[..<newline], as: UTF8.self)
                    pending.removeSubrange(...newline)
                    if line.contains(" is in use.") { portConflict = true }
                    if line.hasPrefix(readyPrefix),
                       let port = UInt16(line.dropFirst(readyPrefix.count)), port != 0,
                       let url = URL(string: "http://127.0.0.1:\(port)") {
                        DispatchQueue.main.async { [weak self] in
                            self?.ready(url, from: child)
                        }
                    }
                }
                if pending.count > 8192 { pending.removeAll() }
            }
            try? output.close()
            child.waitUntilExit()
            let conflict = portConflict
            DispatchQueue.main.async { [weak self] in
                guard let self = self, self.server === child else { return }
                if self.smokeTest && self.smokePassed && child.terminationStatus == 0 {
                    print("Native launcher served the game and its child stopped on pipe closure.")
                    exit(EXIT_SUCCESS)
                }
                self.failed(conflict
                    ? local("游戏端口已被占用。请先退出正在使用这个端口的程序，再点「重新启动」。",
                            "The game port is already in use. Quit the other program using it, then try again.")
                    : local("游戏服务已停止。你可以重新启动维修站。", "The game server stopped. You can start it again."))
            }
        }
    }
}

private let launcher = Launcher()
launcher.launch()
