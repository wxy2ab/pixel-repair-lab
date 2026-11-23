像素维修站 · Mac 发布工具包

本工具包供持有签名身份的发布者使用。将整个目录解压到可写位置。发布成功后，给孩子的是 output 目录中的 .dmg。孩子打开磁盘映像，将应用拖进「应用程序」，双击图标即可开始。首次打开时，macOS 可能显示常规的下载确认。

发布者在 Mac 上准备
  • 有效的 Apple Developer Program 团队。使用双重认证的 Apple 账户。
  • 安装 Xcode 及其命令行工具。在钥匙串保存 Developer ID Application 证书和与之配对的私钥。可用 security find-identity -v -p codesigning 查看签名身份。
  • 使用账户的专用密码和 Team ID 配置一次公证凭据。在终端执行以下命令并根据提示输入，密码会存入本机钥匙串。

    xcrun notarytool store-credentials "PixelRepairLab-notary" --apple-id "YOUR_APPLE_ID" --team-id "YOUR_TEAM_ID"

在本目录的终端执行（把引号里的签名身份换成上一步显示的证书名称或 40 位指纹）

    export MAC_SIGN_IDENTITY='Developer ID Application: YOUR NAME (TEAMID)'
    export MAC_NOTARY_PROFILE='PixelRepairLab-notary'
    /bin/sh ./publish.sh

以上命令会签名、运行实验自检、将应用和磁盘映像提交给 Apple 公证，并装订回执。发布 Mac 须联网，并能运行目标架构。Apple 芯片 Mac 构建 Intel 版时，自检需要 Rosetta。output 中的签名、公证、验证全部通过后才会生成最终 DMG。可以设置 MAC_BUNDLE_ID 使用自己的反向域名标识符，同一应用后续版本应沿用它。用 /bin/sh ./publish.sh --help 查看帮助。

应用使用默认浏览器打开本机游戏。保留应用在运行中即可继续玩。在程序坞退出应用会停止本机服务。在线 AI 可在 ~/Library/Application Support/PixelRepairLab/.env 中配置，模板随应用提供。学习记录仍由浏览器按本机地址和端口保存。

Apple 官方说明
https://developer.apple.com/help/account/certificates/create-developer-id-certificates
https://developer.apple.com/documentation/security/customizing-the-notarization-workflow

Mac publisher kit

Use Xcode on a Mac, an active Apple Developer Program team, a Developer ID Application signing identity with its private key, and a notarytool profile in the local keychain. In the extracted directory, run the commands above. The release Mac must be able to execute the target architecture and reach Apple for notarization. Only distribute the verified DMG in output. Children drag the app to Applications and open it normally. The terminal and developer credentials are used only by the publisher.
