QT += quick opengl

CONFIG += c++17

# ========== Spine Runtime ==========
SPINE_ROOT = $$PWD/third_party/spine-cpp/spine-cpp

INCLUDEPATH += $$SPINE_ROOT/include

SOURCES += \
    $$SPINE_ROOT/src/spine/Animation.cpp \
    $$SPINE_ROOT/src/spine/AnimationState.cpp \
    $$SPINE_ROOT/src/spine/AnimationStateData.cpp \
    $$SPINE_ROOT/src/spine/Atlas.cpp \
    $$SPINE_ROOT/src/spine/AtlasAttachmentLoader.cpp \
    $$SPINE_ROOT/src/spine/Attachment.cpp \
    $$SPINE_ROOT/src/spine/AttachmentLoader.cpp \
    $$SPINE_ROOT/src/spine/AttachmentTimeline.cpp \
    $$SPINE_ROOT/src/spine/Bone.cpp \
    $$SPINE_ROOT/src/spine/BoneData.cpp \
    $$SPINE_ROOT/src/spine/BoundingBoxAttachment.cpp \
    $$SPINE_ROOT/src/spine/ClippingAttachment.cpp \
    $$SPINE_ROOT/src/spine/ColorTimeline.cpp \
    $$SPINE_ROOT/src/spine/ConstraintData.cpp \
    $$SPINE_ROOT/src/spine/CurveTimeline.cpp \
    $$SPINE_ROOT/src/spine/DeformTimeline.cpp \
    $$SPINE_ROOT/src/spine/DrawOrderTimeline.cpp \
    $$SPINE_ROOT/src/spine/Event.cpp \
    $$SPINE_ROOT/src/spine/EventData.cpp \
    $$SPINE_ROOT/src/spine/EventTimeline.cpp \
    $$SPINE_ROOT/src/spine/Extension.cpp \
    $$SPINE_ROOT/src/spine/IkConstraint.cpp \
    $$SPINE_ROOT/src/spine/IkConstraintData.cpp \
    $$SPINE_ROOT/src/spine/IkConstraintTimeline.cpp \
    $$SPINE_ROOT/src/spine/InheritTimeline.cpp \
    $$SPINE_ROOT/src/spine/Json.cpp \
    $$SPINE_ROOT/src/spine/LinkedMesh.cpp \
    $$SPINE_ROOT/src/spine/MathUtil.cpp \
    $$SPINE_ROOT/src/spine/MeshAttachment.cpp \
    $$SPINE_ROOT/src/spine/PathAttachment.cpp \
    $$SPINE_ROOT/src/spine/PathConstraint.cpp \
    $$SPINE_ROOT/src/spine/PathConstraintData.cpp \
    $$SPINE_ROOT/src/spine/PathConstraintMixTimeline.cpp \
    $$SPINE_ROOT/src/spine/PathConstraintPositionTimeline.cpp \
    $$SPINE_ROOT/src/spine/PathConstraintSpacingTimeline.cpp \
    $$SPINE_ROOT/src/spine/PhysicsConstraint.cpp \
    $$SPINE_ROOT/src/spine/PhysicsConstraintData.cpp \
    $$SPINE_ROOT/src/spine/PhysicsConstraintTimeline.cpp \
    $$SPINE_ROOT/src/spine/PointAttachment.cpp \
    $$SPINE_ROOT/src/spine/RTTI.cpp \
    $$SPINE_ROOT/src/spine/RegionAttachment.cpp \
    $$SPINE_ROOT/src/spine/RotateTimeline.cpp \
    $$SPINE_ROOT/src/spine/ScaleTimeline.cpp \
    $$SPINE_ROOT/src/spine/Sequence.cpp \
    $$SPINE_ROOT/src/spine/SequenceTimeline.cpp \
    $$SPINE_ROOT/src/spine/ShearTimeline.cpp \
    $$SPINE_ROOT/src/spine/Skeleton.cpp \
    $$SPINE_ROOT/src/spine/SkeletonBinary.cpp \
    $$SPINE_ROOT/src/spine/SkeletonBounds.cpp \
    $$SPINE_ROOT/src/spine/SkeletonClipping.cpp \
    $$SPINE_ROOT/src/spine/SkeletonData.cpp \
    $$SPINE_ROOT/src/spine/SkeletonJson.cpp \
    $$SPINE_ROOT/src/spine/SkeletonRenderer.cpp \
    $$SPINE_ROOT/src/spine/Skin.cpp \
    $$SPINE_ROOT/src/spine/Slot.cpp \
    $$SPINE_ROOT/src/spine/SlotData.cpp \
    $$SPINE_ROOT/src/spine/SpineObject.cpp \
    $$SPINE_ROOT/src/spine/TextureLoader.cpp \
    $$SPINE_ROOT/src/spine/Timeline.cpp \
    $$SPINE_ROOT/src/spine/TransformConstraint.cpp \
    $$SPINE_ROOT/src/spine/TransformConstraintData.cpp \
    $$SPINE_ROOT/src/spine/TransformConstraintTimeline.cpp \
    $$SPINE_ROOT/src/spine/TranslateTimeline.cpp \
    $$SPINE_ROOT/src/spine/Triangulator.cpp \
    $$SPINE_ROOT/src/spine/Updatable.cpp \
    $$SPINE_ROOT/src/spine/VertexAttachment.cpp

# ========== 项目源文件 ==========
SOURCES += \
    main.cpp \
    src/spinegl/spineitem.cpp \
    src/spinegl/spineglrenderer.cpp \
    src/spinegl/spineextension.cpp

HEADERS += \
    src/spinegl/spineitem.h \
    src/spinegl/spineglrenderer.h \
    src/spinegl/qtopenglfunctions.h

RESOURCES += qml.qrc

DESTDIR = $$PWD/bin

win32: LIBS += -lopengl32