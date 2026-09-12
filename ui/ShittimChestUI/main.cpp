#include <QGuiApplication>
#include <QQmlApplicationEngine>
#include <QQuickWindow>
#include <QSurfaceFormat>
#include <QDebug>
#include <QDir>
#include "src/spinegl/spineitem.h"

int main(int argc, char *argv[])
{
    // Force OpenGL 3.3 Core
    QSurfaceFormat format;
    format.setVersion(3, 3);
    format.setProfile(QSurfaceFormat::CoreProfile);
    format.setDepthBufferSize(24);
    format.setStencilBufferSize(8);
    QSurfaceFormat::setDefaultFormat(format);

    // Force Qt to use OpenGL backend
    qputenv("QSG_RHI_BACKEND", "opengl");

    QGuiApplication app(argc, argv);

    app.setApplicationName("ShittimChestUI");
    app.setOrganizationName("YourStudio");

    // Set working directory to exe directory
    QDir::setCurrent(QCoreApplication::applicationDirPath());

    qDebug() << "===== Working directory:" << QDir::currentPath();
    qDebug() << "===== Registering Spine type =====";

    qmlRegisterType<SpineItem>("Spine", 1, 0, "SpineItem");

    qDebug() << "===== Spine type registered =====";

    QQmlApplicationEngine engine;
    engine.load(QUrl("qrc:/Main.qml"));
    qDebug() << "===== QML loaded =====";

    return app.exec();
}
