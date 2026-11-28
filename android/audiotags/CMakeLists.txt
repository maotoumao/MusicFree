cmake_minimum_required(VERSION 3.22)
project(audiotags CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# 平台中立 C++ tag 引擎（仓库根）：导出静态库 target `taglib-engine`
add_subdirectory(
    "${CMAKE_CURRENT_SOURCE_DIR}/../../cpp/taglib-engine"
    "${CMAKE_CURRENT_BINARY_DIR}/taglib-engine")

add_library(audiotags SHARED src/main/cpp/taglib_jni.cpp)
target_link_libraries(audiotags PRIVATE taglib-engine)
# 只导出 JNI C 入口：version script 把其余符号（musicfree::tags::* / TagLib / 内联）设为 local
target_link_options(audiotags PRIVATE
    "-Wl,--version-script=${CMAKE_CURRENT_SOURCE_DIR}/src/main/cpp/audiotags.map")
