#ifndef SPINEGLRENDERER_H
#define SPINEGLRENDERER_H

#include <QQuickFramebufferObject>
#include <QOpenGLShaderProgram>
#include <QOpenGLBuffer>
#include <QOpenGLVertexArrayObject>
#include <QElapsedTimer>
#include <memory>
#include <QSizeF>

#include <spine/spine.h>

class SpineGLRenderer : public QQuickFramebufferObject::Renderer
{
public:
    SpineGLRenderer();
    ~SpineGLRenderer();

    void render() override;
    void synchronize(QQuickFramebufferObject *item) override;

private:
    bool initSpine();
    void initShaders();
    void renderSpine();

    std::unique_ptr<spine::Atlas> m_atlas;
    std::unique_ptr<spine::SkeletonData> m_skeletonData;
    std::unique_ptr<spine::Skeleton> m_skeleton;
    std::unique_ptr<spine::AnimationStateData> m_stateData;
    std::unique_ptr<spine::AnimationState> m_state;

    std::unique_ptr<QOpenGLShaderProgram> m_program;
    std::unique_ptr<QOpenGLBuffer> m_vbo;
    std::unique_ptr<QOpenGLVertexArrayObject> m_vao;

    spine::Vector<float> m_worldVertices;
    spine::Vector<float> m_uvs;

    QString m_skeletonFile;
    QString m_atlasFile;
    QString m_animationName;
    float m_scale = 1.0f;
    bool m_initialized = false;
    QElapsedTimer m_timer;
    QSizeF m_viewportSize;
};

#endif
