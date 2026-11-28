cmake_minimum_required(VERSION 3.22)
project(taglib_engine CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# —— TagLib 构建裁剪 ——
# 用普通变量（非 CACHE），靠 CMP0077(≥3.13 NEW) 令 TagLib 内 option() 采纳，不污染全局 cache，
# 便于将来被更大的 iOS/C++ 工程 add_subdirectory 而不改写其通用开关
set(BUILD_SHARED_LIBS OFF)   # 静态链进本引擎
set(BUILD_FRAMEWORK   OFF)   # 防 Apple 上被 BUILD_FRAMEWORK 重新打开为 shared
set(BUILD_BINDINGS    OFF)   # 不要 C bindings（默认 ON）
set(BUILD_EXAMPLES    OFF)
set(BUILD_TESTING     OFF)
set(VISIBILITY_HIDDEN ON)    # TagLib 符号内敛，不再对外导出
set(WITH_ZLIB         ON)    # ID3v2 压缩帧（NDK 提供 libz）

# 保留目标格式，关无关格式压体积
foreach(fmt VORBIS MP4 RIFF APE ASF)
    set(WITH_${fmt} ON)      # FLAC/Ogg/Opus · M4A · WAV/AIFF · APE/MPC/WavPack · WMA
endforeach()
foreach(fmt DSF MATROSKA MOD SHORTEN TRUEAUDIO)
    set(WITH_${fmt} OFF)
endforeach()

add_subdirectory(third_party/taglib)             # 导出静态库 target `tag`

# TagLib 只对 INSTALL_INTERFACE 导出头目录，vendored(build-tree) 消费者拿不到头文件；
# 收集其源码头目录，仅作为本引擎的 PRIVATE include —— 本引擎公开头不含任何 TagLib 类型，
# 故 TagLib 是纯实现依赖，不向下游泄漏头路径
file(GLOB_RECURSE _taglib_hdrs LIST_DIRECTORIES false
     "${CMAKE_CURRENT_SOURCE_DIR}/third_party/taglib/taglib/*.h")
set(_taglib_inc_dirs "")
foreach(_h ${_taglib_hdrs})
    get_filename_component(_d "${_h}" DIRECTORY)
    list(APPEND _taglib_inc_dirs "${_d}")
endforeach()
list(REMOVE_DUPLICATES _taglib_inc_dirs)

add_library(taglib-engine STATIC TagEngine.cpp)
target_include_directories(taglib-engine
    PUBLIC  ${CMAKE_CURRENT_SOURCE_DIR}
    PRIVATE ${_taglib_inc_dirs}
            "${CMAKE_CURRENT_BINARY_DIR}/third_party/taglib")  # 生成的 taglib_config.h/config.h
# PUBLIC 链接以向下游传递 tag 静态库（符号）；tag 的 INTERFACE 头目录仅 INSTALL_INTERFACE，
# build-tree 下为空，故不会把 TagLib 头泄漏给下游
target_link_libraries(taglib-engine PUBLIC tag)
