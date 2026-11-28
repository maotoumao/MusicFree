#pragma once

#include <cstddef>
#include <cstdint>
#include <map>
#include <string>
#include <vector>

namespace musicfree::tags {

enum class ErrorCode {
    Ok = 0,
    NotOpen = 1,         // fd 无法打开 / stream 未就绪
    Unsupported = 2,     // 非受支持或无法解析的音频文件
    FieldsRejected = 3,  // 已写入受支持的子集，但部分字段/封面被该格式拒绝
    Io = 4,              // 保存失败
    InvalidArg = 5,      // 入参非法（如非法封面数据）
};

/** 音频技术属性，单位随名；固定宽度以免跨 ABI 布局歧义 */
struct AudioProps {
    int64_t durationMs = 0;
    int64_t bitrateKbps = 0;
    int64_t sampleRateHz = 0;
    int32_t channels = 0;
};

/** 一次读取的 tag 快照；fields 为大写 key、UTF-8 多值 */
struct TagSnapshot {
    std::map<std::string, std::vector<std::string>> fields;
    AudioProps audio;
    bool hasCoverArt = false;
};

struct ReadResult {
    ErrorCode err = ErrorCode::Ok;
    TagSnapshot snapshot;
};

/** 单张封面 */
struct Cover {
    std::vector<uint8_t> data;
    std::string mime;
    std::string description;
};

struct CoverResult {
    ErrorCode err = ErrorCode::Ok;
    bool present = false;
    Cover cover;
};

/** 封面写操作 */
enum class CoverOp {
    Unchanged = 0,
    Remove = 1,
    Replace = 2,
};

// fd 契约：内部用 TagLib FileStream 接管 fd（fdopen），正常路径由 ~FileStream fclose 关闭；
// 调用方 detach 后不得再 close。fdopen 失败 / 提前返回 / 抛异常时由内部 RAII 兜底关闭 fd

/** 只读打开，读 tag 与技术属性 */
ReadResult readTags(int fd);

/** 只读打开，取主封面（Front Cover 优先，否则第一张） */
CoverResult readPrimaryCover(int fd);

/**
 * 读写打开（fd 须 O_RDWR），按需写文本字段与封面后 save
 * 空 patch（无字段改动且 coverOp==Unchanged）为 no-op，不重写文件
 */
ErrorCode writeTags(int fd,
                    const std::map<std::string, std::vector<std::string>>& setFields,
                    const std::vector<std::string>& removeFields,
                    CoverOp coverOp,
                    const uint8_t* cover, std::size_t coverLen, const char* coverMime);

}  // namespace musicfree::tags
