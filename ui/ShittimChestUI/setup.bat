@echo off
chcp 65001 >nul
echo ========================================
echo   ShittimChestUI 项目目录创建脚本
echo ========================================
echo.

set PROJECT_ROOT=D:\QtProjects\ShittimChestUI
cd /d %PROJECT_ROOT%

echo [1/4] 创建 Spine 渲染器源码目录...
mkdir src\spinegl 2>nul

echo [2/4] 创建资源目录...
mkdir resources\spine\arona 2>nul
mkdir resources\spine\plana 2>nul
mkdir resources\spine\backgrounds\daytime 2>nul
mkdir resources\spine\backgrounds\nighttime 2>nul
mkdir resources\spine\ui\buttons 2>nul
mkdir resources\spine\ui\frames 2>nul
mkdir resources\spine\ui\decorations 2>nul

echo [3/4] 创建 Spine GL 渲染器头文件...
(
echo #ifndef SPINEITEM_H
echo #define SPINEITEM_H
echo.
echo #include ^<QQuickFramebufferObject^>
echo.
echo class SpineGLRenderer;
echo.
echo class SpineItem : public QQuickFramebufferObject
echo {
echo     Q_OBJECT
echo     Q_PROPERTY(QString skeletonFile READ skeletonFile WRITE setSkeletonFile NOTIFY skeletonFileChanged)
echo     Q_PROPERTY(QString atlasFile READ atlasFile WRITE setAtlasFile NOTIFY atlasFileChanged)
echo     Q_PROPERTY(QString animation READ animation WRITE setAnimation NOTIFY animationChanged)
echo     Q_PROPERTY(float scale READ scale WRITE setScale NOTIFY scaleChanged)
echo.
echo public:
echo     SpineItem(QQuickItem *parent = nullptr);
echo.
echo     QString skeletonFile() const { return m_skeletonFile; }
echo     void setSkeletonFile(const QString ^&path);
echo.
echo     QString atlasFile() const { return m_atlasFile; }
echo     void setAtlasFile(const QString ^&path);
echo.
echo     QString animation() const { return m_animation; }
echo     void setAnimation(const QString ^&animation);
echo.
echo     float scale() const { return m_scale; }
echo     void setScale(float scale);
echo.
echo     Renderer *createRenderer() const override;
echo.
echo signals:
echo     void skeletonFileChanged();
echo     void atlasFileChanged();
echo     void animationChanged();
echo     void scaleChanged();
echo.
echo private:
echo     QString m_skeletonFile;
echo     QString m_atlasFile;
echo     QString m_animation = "idle";
echo     float m_scale = 1.0f;
echo };
echo.
echo #endif // SPINEITEM_H
) > src\spinegl\spineitem.h
echo     [OK] spineitem.h

(
echo #ifndef SPINEGLRENDERER_H
echo #define SPINEGLRENDERER_H
echo.
echo #include ^<QQuickFramebufferObject^>
echo #include ^<QOpenGLShaderProgram^>
echo #include ^<QOpenGLBuffer^>
echo #include ^<QOpenGLVertexArrayObject^>
echo #include ^<QElapsedTimer^>
echo #include ^<memory^>
echo.
echo #include ^<spine/spine.h^>
echo.
echo class SpineGLRenderer : public QQuickFramebufferObject::Renderer
echo {
echo public:
echo     SpineGLRenderer();
echo     ~SpineGLRenderer();
echo.
echo     void render() override;
echo     void synchronize(QQuickFramebufferObject *item) override;
echo.
echo private:
echo     bool initSpine();
echo     void initShaders();
echo     void renderSpine();
echo.
echo     std::unique_ptr^<spine::Atlas^> m_atlas;
echo     std::unique_ptr^<spine::SkeletonData^> m_skeletonData;
echo     std::unique_ptr^<spine::Skeleton^> m_skeleton;
echo     std::unique_ptr^<spine::AnimationStateData^> m_stateData;
echo     std::unique_ptr^<spine::AnimationState^> m_state;
echo.
echo     std::unique_ptr^<QOpenGLShaderProgram^> m_program;
echo     std::unique_ptr^<QOpenGLBuffer^> m_vbo;
echo     std::unique_ptr^<QOpenGLVertexArrayObject^> m_vao;
echo.
echo     spine::Vector^<float^> m_worldVertices;
echo     spine::Vector^<float^> m_uvs;
echo     spine::Vector^<unsigned short^> m_indices;
echo.
echo     QString m_skeletonFile;
echo     QString m_atlasFile;
echo     QString m_animationName;
echo     float m_scale = 1.0f;
echo     bool m_initialized = false;
echo     QElapsedTimer m_timer;
echo };
echo.
echo #endif // SPINEGLRENDERER_H
) > src\spinegl\spineglrenderer.h
echo     [OK] spineglrenderer.h

(
echo #ifndef QTOPENGLFUNCTIONS_H
echo #define QTOPENGLFUNCTIONS_H
echo.
echo #include ^<QOpenGLFunctions_3_3_Core^>
echo.
echo typedef QOpenGLFunctions_3_3_Core QtOpenGLFunctions;
echo.
echo #endif // QTOPENGLFUNCTIONS_H
) > src\spinegl\qtopenglfunctions.h
echo     [OK] qtopenglfunctions.h

echo [4/4] 创建 Spine GL 渲染器源文件...
(
echo #include "spineitem.h"
echo #include "spineglrenderer.h"
echo.
echo SpineItem::SpineItem(QQuickItem *parent^)
echo     : QQuickFramebufferObject(parent)
echo {
echo     setMirrorVertically(true);
echo }
echo.
echo void SpineItem::setSkeletonFile(const QString ^&path)
echo {
echo     if (m_skeletonFile == path) return;
echo     m_skeletonFile = path;
echo     emit skeletonFileChanged();
echo     update();
echo }
echo.
echo void SpineItem::setAtlasFile(const QString ^&path)
echo {
echo     if (m_atlasFile == path) return;
echo     m_atlasFile = path;
echo     emit atlasFileChanged();
echo     update();
echo }
echo.
echo void SpineItem::setAnimation(const QString ^&animation)
echo {
echo     if (m_animation == animation) return;
echo     m_animation = animation;
echo     emit animationChanged();
echo     update();
echo }
echo.
echo void SpineItem::setScale(float scale)
echo {
echo     if (qFuzzyCompare(m_scale, scale)) return;
echo     m_scale = scale;
echo     emit scaleChanged();
echo     update();
echo }
echo.
echo QQuickFramebufferObject::Renderer *SpineItem::createRenderer() const
echo {
echo     return new SpineGLRenderer();
echo }
) > src\spinegl\spineitem.cpp
echo     [OK] spineitem.cpp

(
echo #include "spineglrenderer.h"
echo #include "qtopenglfunctions.h"
echo #include ^<QFile^>
echo #include ^<QResource^>
echo #include ^<QOpenGLTexture^>
echo #include ^<QDebug^>
echo.
echo class QtTextureLoader : public spine::TextureLoader
echo {
echo public:
echo     void load(spine::AtlasPage ^&page, const spine::String ^&path) override
echo     {
echo         QString filePath = QString::fromStdString(path.buffer());
echo         QResource resource(filePath);
echo         if (!resource.isValid()) {
echo             QImage image(filePath);
echo             if (image.isNull()) {
echo                 qWarning() ^<^< "Failed to load texture:" ^<^< filePath;
echo                 return;
echo             }
echo             createTexture(page, image);
echo             return;
echo         }
echo         QImage image;
echo         if (!image.loadFromData(reinterpret_cast^<const uchar*^>(resource.data()), resource.size())) {
echo             qWarning() ^<^< "Failed to load texture from resource:" ^<^< filePath;
echo             return;
echo         }
echo         createTexture(page, image);
echo     }
echo.
echo     void unload(spine::AtlasPage ^&page) override
echo     {
echo         delete static_cast^<QOpenGLTexture*^>(page.rendererObject);
echo         page.rendererObject = nullptr;
echo     }
echo.
echo private:
echo     void createTexture(spine::AtlasPage ^&page, const QImage ^&image)
echo     {
echo         QImage glImage = image.convertToFormat(QImage::Format_RGBA8888);
echo         QOpenGLTexture *texture = new QOpenGLTexture(glImage.mirrored());
echo         texture->setMinificationFilter(QOpenGLTexture::LinearMipMapLinear);
echo         texture->setMagnificationFilter(QOpenGLTexture::Linear);
echo         texture->setWrapMode(QOpenGLTexture::ClampToEdge);
echo         page.rendererObject = texture;
echo         page.width = texture->width();
echo         page.height = texture->height();
echo         qDebug() ^<^< "Loaded texture:" ^<^< page.width ^<^< "x" ^<^< page.height;
echo     }
echo };
echo.
echo SpineGLRenderer::SpineGLRenderer() { m_timer.start(); }
echo.
echo SpineGLRenderer::~SpineGLRenderer()
echo {
echo     m_vao.reset(); m_vbo.reset(); m_program.reset();
echo }
echo.
echo void SpineGLRenderer::synchronize(QQuickFramebufferObject *item)
echo {
echo     SpineItem *spineItem = static_cast^<SpineItem*^>(item);
echo     if (!spineItem) return;
echo     m_skeletonFile = spineItem->skeletonFile();
echo     m_atlasFile = spineItem->atlasFile();
echo     m_animationName = spineItem->animation();
echo     m_scale = spineItem->scale();
echo     if (!m_initialized) {
echo         m_initialized = initSpine();
echo         if (m_initialized) initShaders();
echo     }
echo }
echo.
echo bool SpineGLRenderer::initSpine()
echo {
echo     if (m_skeletonFile.isEmpty() || m_atlasFile.isEmpty()) {
echo         qDebug() ^<^< "Skeleton or atlas file not set";
echo         return false;
echo     }
echo     try {
echo         auto textureLoader = std::make_unique^<QtTextureLoader^>();
echo         m_atlas = std::make_unique^<spine::Atlas^>(m_atlasFile.toStdString().c_str(), textureLoader.get());
echo         auto attachmentLoader = std::make_unique^<spine::AtlasAttachmentLoader^>(m_atlas.get());
echo         spine::SkeletonBinary binary(attachmentLoader.get());
echo         m_skeletonData = std::unique_ptr^<spine::SkeletonData^>(binary.readSkeletonDataFile(m_skeletonFile.toStdString().c_str()));
echo         if (!m_skeletonData) {
echo             qWarning() ^<^< "Failed to load skeleton:" ^<^< m_skeletonFile;
echo             return false;
echo         }
echo         m_skeleton = std::make_unique^<spine::Skeleton^>(m_skeletonData.get());
echo         m_stateData = std::make_unique^<spine::AnimationStateData^>(m_skeletonData.get());
echo         m_state = std::make_unique^<spine::AnimationState^>(m_stateData.get());
echo         if (!m_animationName.isEmpty()) {
echo             auto animation = m_skeletonData->findAnimation(m_animationName.toStdString().c_str());
echo             if (animation) {
echo                 m_state->setAnimation(0, animation, true);
echo             } else {
echo                 qDebug() ^<^< "Available animations:";
echo                 for (int i = 0; i ^< m_skeletonData->getAnimations().size(); ++i) {
echo                     qDebug() ^<^< "  -" ^<^< m_skeletonData->getAnimations()[i]->getName().buffer();
echo                 }
echo             }
echo         }
echo         m_skeleton->setToSetupPose();
echo         m_skeleton->updateWorldTransform(spine::Physics_None);
echo         qDebug() ^<^< "Spine loaded successfully!";
echo         return true;
echo     } catch (const std::exception ^&e) {
echo         qWarning() ^<^< "Spine init exception:" ^<^< e.what();
echo         return false;
echo     }
echo }
echo.
echo void SpineGLRenderer::initShaders()
echo {
echo     m_program = std::make_unique^<QOpenGLShaderProgram^>();
echo     const char *vertexShader =
echo         "#version 330 core\n"
echo         "layout(location = 0) in vec2 aPosition;\n"
echo         "layout(location = 1) in vec2 aTexCoord;\n"
echo         "out vec2 vTexCoord;\n"
echo         "uniform vec2 uScreenSize;\n"
echo         "uniform vec2 uPosition;\n"
echo         "uniform float uScale;\n"
echo         "void main() {\n"
echo         "    vec2 pos = (aPosition * uScale + uPosition);\n"
echo         "    vec2 ndc = (pos / uScreenSize) * 2.0 - 1.0;\n"
echo         "    ndc.y = -ndc.y;\n"
echo         "    gl_Position = vec4(ndc, 0.0, 1.0);\n"
echo         "    vTexCoord = aTexCoord;\n"
echo         "}\n";
echo     const char *fragmentShader =
echo         "#version 330 core\n"
echo         "in vec2 vTexCoord;\n"
echo         "out vec4 FragColor;\n"
echo         "uniform sampler2D uTexture;\n"
echo         "void main() {\n"
echo         "    FragColor = texture(uTexture, vTexCoord);\n"
echo         "    if (FragColor.a ^< 0.01) discard;\n"
echo         "}\n";
echo     m_program->addShaderFromSourceCode(QOpenGLShader::Vertex, vertexShader);
echo     m_program->addShaderFromSourceCode(QOpenGLShader::Fragment, fragmentShader);
echo     m_program->link();
echo     m_vbo = std::make_unique^<QOpenGLBuffer^>(QOpenGLBuffer::VertexBuffer);
echo     m_vbo->create();
echo     m_vbo->bind();
echo     m_vbo->setUsagePattern(QOpenGLBuffer::DynamicDraw);
echo     m_vbo->release();
echo     m_vao = std::make_unique^<QOpenGLVertexArrayObject^>();
echo     m_vao->create();
echo }
echo.
echo void SpineGLRenderer::render()
echo {
echo     if (!m_initialized || !m_program || !m_skeleton || !m_state) return;
echo     QOpenGLFunctions *gl = QOpenGLContext::currentContext()->functions();
echo     gl->glClearColor(0.04f, 0.04f, 0.08f, 1.0f);
echo     gl->glClear(GL_COLOR_BUFFER_BIT);
echo     float delta = m_timer.elapsed() / 1000.0f;
echo     m_timer.restart();
echo     delta = qMin(delta, 0.05f);
echo     m_state->update(delta);
echo     m_state->apply(*m_skeleton);
echo     m_skeleton->updateWorldTransform(spine::Physics_None);
echo     renderSpine();
echo }
echo.
echo void SpineGLRenderer::renderSpine()
echo {
echo     if (!m_skeleton) return;
echo     QOpenGLFunctions *gl = QOpenGLContext::currentContext()->functions();
echo     m_program->bind();
echo     m_vao->bind();
echo     m_vbo->bind();
echo     QSizeF size = this->size();
echo     m_program->setUniformValue("uScreenSize", QVector2D(size.width(), size.height()));
echo     m_program->setUniformValue("uPosition", QVector2D(size.width() * 0.3f, size.height() * 0.5f));
echo     m_program->setUniformValue("uScale", m_scale);
echo     auto ^&drawOrder = m_skeleton->getDrawOrder();
echo     for (int i = 0; i ^< drawOrder.size(); ++i) {
echo         spine::Slot *slot = drawOrder[i];
echo         spine::Attachment *attachment = slot->getAttachment();
echo         if (!attachment) continue;
echo         spine::AtlasRegion *region = nullptr;
echo         QOpenGLTexture *texture = nullptr;
echo         if (attachment->getRTTI().isExactly(spine::RegionAttachment::rtti)) {
echo             spine::RegionAttachment *regionAttachment = static_cast^<spine::RegionAttachment*^>(attachment);
echo             region = static_cast^<spine::AtlasRegion*^>(regionAttachment->getRendererObject());
echo             if (region ^&^& region->page) {
echo                 texture = static_cast^<QOpenGLTexture*^>(region->page->rendererObject);
echo             }
echo             if (!texture) continue;
echo             m_worldVertices.setSize(8);
echo             regionAttachment->computeWorldVertices(*slot, m_worldVertices.buffer(), 0, 0);
echo             m_uvs.setSize(8);
echo             regionAttachment->getUVs(m_uvs.buffer());
echo             float vertices[16];
echo             for (int v = 0; v ^< 4; ++v) {
echo                 vertices[v * 4 + 0] = m_worldVertices[v * 2];
echo                 vertices[v * 4 + 1] = m_worldVertices[v * 2 + 1];
echo                 vertices[v * 4 + 2] = m_uvs[v * 2];
echo                 vertices[v * 4 + 3] = m_uvs[v * 2 + 1];
echo             }
echo             unsigned short indices[6] = {0, 1, 2, 2, 3, 0};
echo             m_vbo->allocate(vertices, sizeof(vertices));
echo             m_program->enableAttributeArray(0);
echo             m_program->enableAttributeArray(1);
echo             m_program->setAttributeBuffer(0, GL_FLOAT, 0, 2, 4 * sizeof(float));
echo             m_program->setAttributeBuffer(1, GL_FLOAT, 2 * sizeof(float), 2, 4 * sizeof(float));
echo             texture->bind();
echo             gl->glDrawElements(GL_TRIANGLES, 6, GL_UNSIGNED_SHORT, indices);
echo             texture->release();
echo         }
echo     }
echo     m_vbo->release();
echo     m_vao->release();
echo     m_program->release();
echo }
) > src\spinegl\spineglrenderer.cpp
echo     [OK] spineglrenderer.cpp

echo.
echo ========================================
echo   所有目录和文件创建完成！
echo ========================================
echo.
echo 目录结构:
echo   src/spinegl/         - Spine 渲染器源码
echo   resources/spine/     - 角色和背景资源
echo.
echo 下一步: 在 Qt Creator 中打开项目并构建
echo.
pause