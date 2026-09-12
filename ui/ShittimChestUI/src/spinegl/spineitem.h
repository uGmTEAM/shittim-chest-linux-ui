#ifndef SPINEITEM_H
#define SPINEITEM_H

#include <QQuickFramebufferObject>

class SpineGLRenderer;

class SpineItem : public QQuickFramebufferObject
{
    Q_OBJECT
    Q_PROPERTY(QString skeletonFile READ skeletonFile WRITE setSkeletonFile NOTIFY skeletonFileChanged)
    Q_PROPERTY(QString atlasFile READ atlasFile WRITE setAtlasFile NOTIFY atlasFileChanged)
    Q_PROPERTY(QString animation READ animation WRITE setAnimation NOTIFY animationChanged)
    Q_PROPERTY(float scale READ scale WRITE setScale NOTIFY scaleChanged)

public:
    SpineItem(QQuickItem *parent = nullptr);

    QString skeletonFile() const { return m_skeletonFile; }
    void setSkeletonFile(const QString &path);

    QString atlasFile() const { return m_atlasFile; }
    void setAtlasFile(const QString &path);

    QString animation() const { return m_animation; }
    void setAnimation(const QString &animation);

    float scale() const { return m_scale; }
    void setScale(float scale);

    Renderer *createRenderer() const override;

signals:
    void skeletonFileChanged();
    void atlasFileChanged();
    void animationChanged();
    void scaleChanged();

private:
    QString m_skeletonFile;
    QString m_atlasFile;
    QString m_animation = "idle";
    float m_scale = 1.0f;
};

#endif
