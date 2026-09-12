#include "spineitem.h"
#include "spineglrenderer.h"
#include <QDebug>

SpineItem::SpineItem(QQuickItem *parent)
    : QQuickFramebufferObject(parent)
{
    setMirrorVertically(true);
    setFlag(QQuickItem::ItemHasContents, true);
    qDebug() << "===== SpineItem constructed =====";
}

void SpineItem::setSkeletonFile(const QString &path)
{
    if (m_skeletonFile == path) return;
    m_skeletonFile = path;
    emit skeletonFileChanged();
    update();
}

void SpineItem::setAtlasFile(const QString &path)
{
    if (m_atlasFile == path) return;
    m_atlasFile = path;
    emit atlasFileChanged();
    update();
}

void SpineItem::setAnimation(const QString &animation)
{
    if (m_animation == animation) return;
    m_animation = animation;
    emit animationChanged();
    update();
}

void SpineItem::setScale(float scale)
{
    if (qFuzzyCompare(m_scale, scale)) return;
    m_scale = scale;
    emit scaleChanged();
    update();
}

QQuickFramebufferObject::Renderer *SpineItem::createRenderer() const
{
    qDebug() << "===== createRenderer CALLED =====";
    return new SpineGLRenderer();
}
