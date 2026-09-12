cmake_minimum_required(VERSION 3.20)
project(QtWebUI LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_AUTOMOC ON)

# 尝试查找 WebEngine（Linux/Qt6-WebEngine 环境）
find_package(Qt6 COMPONENTS WebEngineWidgets QUIET)

if(Qt6WebEngineWidgets_FOUND)
    message(STATUS "[QtWebUI] 使用 Qt6 WebEngine (Linux/系统UI)")
    set(USE_WEBENGINE TRUE)
    find_package(Qt6 REQUIRED COMPONENTS Core Gui WebEngineWidgets)
else()
    message(STATUS "[QtWebUI] 未找到 WebEngine，使用 Widgets + 浏览器模式 (Windows/交互软件)")
    set(USE_WEBENGINE FALSE)
    find_package(Qt6 REQUIRED COMPONENTS Core Gui Widgets)
endif()

set(SOURCES main.cpp)

add_executable(qt-webui ${SOURCES})

if(USE_WEBENGINE)
    target_link_libraries(qt-webui PRIVATE
        Qt6::Core
        Qt6::Gui
        Qt6::WebEngineWidgets
    )
    target_compile_definitions(qt-webui PRIVATE HAVE_WEBENGINE)
else()
    target_link_libraries(qt-webui PRIVATE
        Qt6::Core
        Qt6::Gui
        Qt6::Widgets
    )
endif()

# 安装
install(TARGETS qt-webui RUNTIME DESTINATION bin)