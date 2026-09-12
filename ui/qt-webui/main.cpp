// ============================================================
// AI OS Qt WebEngine 启动器
// Linux:    QWebEngineView 全屏嵌入 WebUI
// Windows:  QProcess 启动 Edge/Chrome kiosk 模式
// ============================================================
#include <QApplication>
#include <QDir>
#include <QFileInfo>

#ifdef HAVE_WEBENGINE
#include <QWebEngineView>
#include <QWebEnginePage>
#include <QScreen>

class WebPage : public QWebEnginePage {
public:
    using QWebEnginePage::QWebEnginePage;
protected:
    bool acceptNavigationRequest(const QUrl &url, QWebEnginePage::NavigationType type, bool isMainFrame) override {
        Q_UNUSED(type);
        if (isMainFrame) return true;
        return false;
    }
};
#else
#include <QProcess>
#include <QMessageBox>
#include <QWidget>
#include <QVBoxLayout>
#include <QLabel>
#include <QPushButton>
#include <QDesktopServices>
#include <QUrl>
#endif

// 查找 WebUI 目录（从可执行文件同级目录查找）
static QString findWebUIDir() {
    QString appDir = QDir::cleanPath(QCoreApplication::applicationDirPath());

    // 开发态：可执行文件在 qt-webui/build/ 下，可能 cd 到 ui/qt-webui/build
    // 检查 ../webui/login.html
    QStringList candidates = {
        appDir + "/login.html",                 // 部署态：exe 与 webui 同级
        appDir + "/../webui/login.html",        // 构建态：build/ 下 exec
        appDir + "/../../webui/login.html",     // 更深一层
        QDir::cleanPath(appDir + "/../webui") + "/login.html",
    };

    for (const auto &path : candidates) {
        QFileInfo fi(path);
        if (fi.exists()) {
            return fi.absolutePath(); // 返回 login.html 所在目录
        }
    }

    // 最后尝试：从环境变量 AIOS_WEBUI_DIR
    QString envDir = qEnvironmentVariable("AIOS_WEBUI_DIR");
    if (!envDir.isEmpty() && QFileInfo(envDir + "/login.html").exists()) {
        return envDir;
    }

    return appDir; // 兜底
}

int main(int argc, char *argv[]) {
    QApplication app(argc, argv);
    app.setApplicationName("AI OS");
    app.setOrganizationName("AIOS");

    QString webuiDir = findWebUIDir();
    QString loginUrl = QUrl::fromLocalFile(webuiDir + "/login.html").toString();

#ifdef HAVE_WEBENGINE
    // ===== Linux: QWebEngineView 全屏嵌入 =====
    QWebEngineView view;
    view.setPage(new WebPage(&view));
    view.setUrl(QUrl(loginUrl));
    view.showFullScreen();
    view.setWindowTitle("AI OS");
    view.setContextMenuPolicy(Qt::NoContextMenu);
    view.setAttribute(Qt::WA_AcceptTouchEvents, true);
#else
    // ===== Windows: 启动 Edge/Chrome kiosk 模式 =====
    // 查找可用浏览器: Edge > Chrome > 默认浏览器
    QString browser;
    QStringList kioskArgs;
    QStringList candidates = {"msedge.exe", "chrome.exe", "brave.exe"};

    for (const auto &exe : candidates) {
        QProcess proc;
        proc.start("where", QStringList() << exe);
        proc.waitForFinished(1000);
        if (proc.exitCode() == 0) {
            browser = exe;
            break;
        }
    }

    if (browser.isEmpty()) {
        // 无 Edge/Chrome，用默认浏览器（非 kiosk）
        QDesktopServices::openUrl(QUrl(loginUrl));
        return 0;
    }

    kioskArgs << "--kiosk" << "--no-first-run"
              << "--disable-infobars" << "--disable-session-crashed-bubble"
              << "--noerrdialogs" << "--disable-features=TranslateUI"
              << loginUrl;

    QProcess::startDetached(browser, kioskArgs);
#endif

    return app.exec();
}