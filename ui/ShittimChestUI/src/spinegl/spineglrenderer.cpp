#include "spineglrenderer.h"
#include "spineitem.h"
#include "qtopenglfunctions.h"
#include <QResource>
#include <QImage>
#include <QOpenGLTexture>
#include <QDebug>
#include <QFile>
#include <QOpenGLFunctions>
#include <QCoreApplication>
#include <QDir>

// ========== Qt texture loader ==========
class QtTextureLoader : public spine::TextureLoader
{
public:
    void load(spine::AtlasPage &page, const spine::String &path) override
    {
        QString filePath = QString::fromStdString(path.buffer());
        QImage image;

        QResource resource(filePath);
        if (resource.isValid()) {
            image.loadFromData(reinterpret_cast<const uchar*>(resource.data()), resource.size());
        } else {
            if (!image.load(filePath)) {
                qWarning() << "Failed to load texture:" << filePath;
                return;
            }
        }

        if (image.isNull()) {
            qWarning() << "Image is null:" << filePath;
            return;
        }

        QImage glImage = image.convertToFormat(QImage::Format_RGBA8888);
        QOpenGLTexture *texture = new QOpenGLTexture(glImage.flipped());
        texture->setMinificationFilter(QOpenGLTexture::LinearMipMapLinear);
        texture->setMagnificationFilter(QOpenGLTexture::Linear);
        texture->setWrapMode(QOpenGLTexture::ClampToEdge);

        page.texture = texture;
        page.width = texture->width();
        page.height = texture->height();

        qDebug() << "Loaded texture:" << filePath << page.width << "x" << page.height;
    }

    void unload(void *texture) override
    {
        delete static_cast<QOpenGLTexture*>(texture);
    }
};

// ========== SpineGLRenderer implementation ==========

SpineGLRenderer::SpineGLRenderer()
{
    m_timer.start();
}

SpineGLRenderer::~SpineGLRenderer()
{
    m_vao.reset();
    m_vbo.reset();
    m_program.reset();
}

void SpineGLRenderer::synchronize(QQuickFramebufferObject *item)
{
    qDebug() << "===== synchronize CALLED =====";

    SpineItem *spineItem = static_cast<SpineItem*>(item);
    if (!spineItem) {
        qDebug() << "spineItem is null!";
        return;
    }

    m_skeletonFile = spineItem->skeletonFile();
    m_atlasFile = spineItem->atlasFile();
    m_animationName = spineItem->animation();
    m_scale = spineItem->scale();

    qDebug() << "skeletonFile:" << m_skeletonFile;
    qDebug() << "atlasFile:" << m_atlasFile;
    qDebug() << "animation:" << m_animationName;

    m_viewportSize = QSizeF(item->width(), item->height());

    if (!m_initialized) {
        qDebug() << "Initializing Spine...";
        m_initialized = initSpine();
        if (m_initialized) {
            initShaders();
            qDebug() << "Spine initialized successfully!";
        } else {
            qDebug() << "Spine initialization FAILED!";
        }
    }
}

bool SpineGLRenderer::initSpine()
{
    qDebug() << "===== initSpine CALLED =====";
    qDebug() << "skeleton:" << m_skeletonFile;
    qDebug() << "atlas:" << m_atlasFile;

    if (m_skeletonFile.isEmpty() || m_atlasFile.isEmpty()) {
        qDebug() << "Skeleton or atlas file not set";
        return false;
    }

    try {
        // 1. Load textures via atlas
        auto textureLoader = new QtTextureLoader();
        m_atlas = std::unique_ptr<spine::Atlas>(
            new spine::Atlas(m_atlasFile.toStdString().c_str(), textureLoader)
        );
        qDebug() << "Atlas loaded";

        // 2. Load .skel file
        QString skelPath = m_skeletonFile;
        if (skelPath.startsWith("qrc:")) {
            skelPath = skelPath.mid(4);
        }
        qDebug() << "Looking for skeleton:" << skelPath;

        QByteArray fileData;
        bool loaded = false;

        // Method 1: Qt resources
        QResource skelResource(skelPath);
        if (skelResource.isValid()) {
            qDebug() << "Found in Qt resources";
            const uchar* data = reinterpret_cast<const uchar*>(skelResource.data());
            size_t size = skelResource.size();
            fileData = QByteArray(reinterpret_cast<const char*>(data), size);
            loaded = true;
            qDebug() << "Resource size:" << size;
        }

        // Method 2: filesystem fallback
        if (!loaded) {
            qDebug() << "Not in resources, searching filesystem...";

            QString appDir = QCoreApplication::applicationDirPath();
            qDebug() << "App dir:" << appDir;

            QStringList searchPaths;
            searchPaths << appDir;
            searchPaths << appDir + "/resources/spine/characters/plana";
            searchPaths << appDir + "/../resources/spine/characters/plana";
            searchPaths << appDir + "/../../resources/spine/characters/plana";
            searchPaths << QDir::currentPath();
            searchPaths << QDir::currentPath() + "/resources/spine/characters/plana";

            for (const QString& path : searchPaths) {
                QString fullPath = path + "/NP0035_spr.skel";
                qDebug() << "Trying:" << fullPath;
                QFile file(fullPath);
                if (file.open(QIODevice::ReadOnly)) {
                    fileData = file.readAll();
                    file.close();
                    loaded = true;
                    qDebug() << "Found at:" << fullPath << "size:" << fileData.size();
                    break;
                }
            }
        }

        if (!loaded || fileData.isEmpty()) {
            qWarning() << "Failed to find skeleton file";
            qWarning() << "Current directory:" << QDir::currentPath();
            qWarning() << "App directory:" << QCoreApplication::applicationDirPath();
            return false;
        }

        // 3. Parse skeleton data
        auto attachmentLoader = std::make_unique<spine::AtlasAttachmentLoader>(m_atlas.get());
        spine::SkeletonBinary binary(attachmentLoader.get());

        const uchar* skelData = reinterpret_cast<const uchar*>(fileData.constData());
        size_t skelSize = fileData.size();

        m_skeletonData = std::unique_ptr<spine::SkeletonData>(
            binary.readSkeletonData(skelData, skelSize)
        );

        if (!m_skeletonData) {
            qWarning() << "Failed to parse skeleton data";
            return false;
        }
        qDebug() << "Skeleton parsed successfully!";

        // 4. Create skeleton instance and animation state
        m_skeleton = std::make_unique<spine::Skeleton>(m_skeletonData.get());
        m_stateData = std::make_unique<spine::AnimationStateData>(m_skeletonData.get());
        m_state = std::make_unique<spine::AnimationState>(m_stateData.get());

        // 5. Print available animations
        qDebug() << "Available animations:";
        for (int i = 0; i < (int)m_skeletonData->getAnimations().size(); ++i) {
            qDebug() << "  -" << m_skeletonData->getAnimations()[i]->getName().buffer();
        }

        // 6. Set animation
        if (!m_animationName.isEmpty()) {
            auto animation = m_skeletonData->findAnimation(m_animationName.toStdString().c_str());
            if (animation) {
                m_state->setAnimation(0, animation, true);
                qDebug() << "Playing animation:" << m_animationName;
            } else {
                qDebug() << "Animation not found:" << m_animationName;
            }
        } else {
            qDebug() << "No animation name set, showing setup pose";
        }

        m_skeleton->setToSetupPose();
        m_skeleton->updateWorldTransform(spine::Physics_None);

        qDebug() << "Spine loaded successfully!";
        return true;

    } catch (const std::exception &e) {
        qWarning() << "Spine init exception:" << e.what();
        return false;
    }
}

void SpineGLRenderer::initShaders()
{
    m_program = std::make_unique<QOpenGLShaderProgram>();

    const char *vertexShader =
        "#version 330 core\n"
        "layout(location = 0) in vec2 aPosition;\n"
        "layout(location = 1) in vec2 aTexCoord;\n"
        "out vec2 vTexCoord;\n"
        "uniform vec2 uScreenSize;\n"
        "uniform vec2 uOffset;\n"
        "uniform float uScale;\n"
        "void main() {\n"
        "    vec2 pos = aPosition * uScale + uOffset;\n"
        "    vec2 ndc = (pos / uScreenSize) * 2.0 - 1.0;\n"
        "    ndc.y = -ndc.y;\n"
        "    gl_Position = vec4(ndc, 0.0, 1.0);\n"
        "    vTexCoord = aTexCoord;\n"
        "}\n";

    const char *fragmentShader =
        "#version 330 core\n"
        "in vec2 vTexCoord;\n"
        "out vec4 FragColor;\n"
        "uniform sampler2D uTexture;\n"
        "void main() {\n"
        "    FragColor = texture(uTexture, vTexCoord);\n"
        "    if (FragColor.a < 0.01) discard;\n"
        "}\n";

    m_program->addShaderFromSourceCode(QOpenGLShader::Vertex, vertexShader);
    m_program->addShaderFromSourceCode(QOpenGLShader::Fragment, fragmentShader);
    m_program->link();

    m_vbo = std::make_unique<QOpenGLBuffer>(QOpenGLBuffer::VertexBuffer);
    m_vbo->create();
    m_vbo->setUsagePattern(QOpenGLBuffer::DynamicDraw);
    m_vbo->release();

    m_vao = std::make_unique<QOpenGLVertexArrayObject>();
    m_vao->create();
}

static QOpenGLFunctions* getGL()
{
    return QOpenGLContext::currentContext()->functions();
}

void SpineGLRenderer::render()
{
    if (!m_initialized || !m_program || !m_skeleton || !m_state) {
        return;
    }

    QOpenGLFunctions *gl = getGL();
    if (!gl) return;

    gl->glClearColor(0.04f, 0.04f, 0.08f, 1.0f);
    gl->glClear(GL_COLOR_BUFFER_BIT);

    float delta = m_timer.elapsed() / 1000.0f;
    m_timer.restart();
    delta = qMin(delta, 0.05f);

    m_state->update(delta);
    m_state->apply(*m_skeleton);
    m_skeleton->updateWorldTransform(spine::Physics_None);

    renderSpine();
}

void SpineGLRenderer::renderSpine()
{
    if (!m_skeleton) return;

    QOpenGLFunctions *gl = getGL();
    if (!gl) return;

    m_program->bind();
    m_vao->bind();
    m_vbo->bind();

    m_program->setUniformValue("uScreenSize", QVector2D(m_viewportSize.width(), m_viewportSize.height()));
    m_program->setUniformValue("uOffset", QVector2D(m_viewportSize.width() * 0.4f, m_viewportSize.height() * 0.5f));
    m_program->setUniformValue("uScale", m_scale);

    auto &drawOrder = m_skeleton->getDrawOrder();

    for (int i = 0; i < (int)drawOrder.size(); ++i) {
        spine::Slot *slot = drawOrder[i];
        spine::Attachment *attachment = slot->getAttachment();
        if (!attachment) continue;

        if (attachment->getRTTI().isExactly(spine::RegionAttachment::rtti)) {
            spine::RegionAttachment *regionAttachment = static_cast<spine::RegionAttachment*>(attachment);

            auto *region = regionAttachment->getRegion();
            if (!region) continue;

            if (m_atlas->getPages().size() == 0) continue;

            spine::AtlasPage *page = m_atlas->getPages()[0];
            if (!page) continue;

            auto *texture = static_cast<QOpenGLTexture*>(page->texture);
            if (!texture) continue;

            m_worldVertices.setSize(8, 0.0f);
            regionAttachment->computeWorldVertices(*slot, m_worldVertices.buffer(), 0, 0);

            spine::Vector<float> &uvs = regionAttachment->getUVs();

            float vertices[16];
            for (int v = 0; v < 4; ++v) {
                vertices[v * 4 + 0] = m_worldVertices[v * 2];
                vertices[v * 4 + 1] = m_worldVertices[v * 2 + 1];
                vertices[v * 4 + 2] = uvs[v * 2];
                vertices[v * 4 + 3] = uvs[v * 2 + 1];
            }

            unsigned short indices[6] = {0, 1, 2, 2, 3, 0};

            m_vbo->allocate(vertices, sizeof(vertices));
            m_program->enableAttributeArray(0);
            m_program->enableAttributeArray(1);
            m_program->setAttributeBuffer(0, GL_FLOAT, 0, 2, 4 * sizeof(float));
            m_program->setAttributeBuffer(1, GL_FLOAT, 2 * sizeof(float), 2, 4 * sizeof(float));

            texture->bind();
            gl->glDrawElements(GL_TRIANGLES, 6, GL_UNSIGNED_SHORT, indices);
            texture->release();
        }
    }

    m_vbo->release();
    m_vao->release();
    m_program->release();
}
