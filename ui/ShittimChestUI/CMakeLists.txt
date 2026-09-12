                                    cmake_minimum_required(VERSION 3.16)

project(ShittimChestUI VERSION 0.1 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD_REQUIRED ON)

find_package(Qt6 REQUIRED COMPONENTS Quick)

qt_standard_project_setup(REQUIRES 6.10)

# Spine runtime wrapper source files
set(SpineSrc
    src/spinegl/spineitem.h
    src/spinegl/spineitem.cpp
    src/spinegl/spineglrenderer.h
    src/spinegl/spineglrenderer.cpp
    src/spinegl/qtopenglfunctions.h
)

# Spine-CPP third-party library (auto-collect all .cpp files)
set(SpineCppRoot third_party/spine-cpp/spine-cpp)
file(GLOB SpineCppSrc
    ${SpineCppRoot}/src/spine/*.cpp
    ${SpineCppRoot}/src/spine/*.h
)
list(APPEND SpineCppSrc
    ${SpineCppRoot}/../spine-cpp-lite/spine-cpp-lite.cpp
)

# Add executable
qt_add_executable(appShittimChestUI
    main.cpp
    ${SpineSrc}
    ${SpineCppSrc}
)

qt_add_qml_module(appShittimChestUI
    URI ShittimChestUI
    QML_FILES
        Main.qml
    RESOURCES
        qml.qrc
)

set_target_properties(appShittimChestUI PROPERTIES
    WIN32_EXECUTABLE TRUE
)

target_include_directories(appShittimChestUI PRIVATE
    ${SpineCppRoot}/include
    src
)

target_link_libraries(appShittimChestUI
    PRIVATE Qt6::Quick
)

install(TARGETS appShittimChestUI
    RUNTIME DESTINATION ${CMAKE_INSTALL_BINDIR}
)
