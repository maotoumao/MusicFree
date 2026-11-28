#include "TagEngine.h"

#include <audioproperties.h>
#include <fileref.h>
#include <tbytevector.h>
#include <tfilestream.h>
#include <tlist.h>
#include <tpropertymap.h>
#include <tstring.h>
#include <tstringlist.h>
#include <tvariant.h>

#include <limits>

#ifdef _WIN32
#include <io.h>
#else
#include <unistd.h>
#endif

namespace musicfree::tags {

namespace {

void closeFd(int fd) {
#ifdef _WIN32
    _close(fd);
#else
    ::close(fd);
#endif
}

// fd RAII 兜底：FileStream 成功接管前若提前返回/抛异常则关闭 fd 防泄漏；
// 接管成功后调 release()，此后由 ~FileStream fclose 关闭
class FdGuard {
public:
    explicit FdGuard(int fd) : fd_(fd) {}
    ~FdGuard() {
        if (fd_ >= 0) {
            closeFd(fd_);
        }
    }
    void release() { fd_ = -1; }
    FdGuard(const FdGuard&) = delete;
    FdGuard& operator=(const FdGuard&) = delete;

private:
    int fd_;
};

std::string toUtf8(const TagLib::String& s) {
    return s.to8Bit(true);
}

TagLib::String fromUtf8(const std::string& s) {
    return TagLib::String(s, TagLib::String::UTF8);
}

// 拷出封面数据；无有效 data（缺 key / 空字节）返回 false
bool fillCover(const TagLib::VariantMap& pic, Cover& out) {
    const auto it = pic.find("data");
    if (it == pic.end()) {
        return false;
    }
    const TagLib::ByteVector data = it->second.toByteVector();
    if (data.isEmpty()) {
        return false;
    }
    out.data.assign(data.data(), data.data() + data.size());
    out.mime = toUtf8(pic.value("mimeType").toString());
    out.description = toUtf8(pic.value("description").toString());
    return true;
}

}  // namespace

ReadResult readTags(int fd) {
    ReadResult r;
    FdGuard guard(fd);
    TagLib::FileStream stream(fd, /*openReadOnly*/ true);
    if (!stream.isOpen()) {
        r.err = ErrorCode::NotOpen;
        return r;
    }
    guard.release();
    TagLib::FileRef f(&stream);  // readAudioProperties 默认 true
    if (f.isNull()) {
        r.err = ErrorCode::Unsupported;
        return r;
    }
    const TagLib::PropertyMap props = f.properties();
    for (const auto& kv : props) {
        std::vector<std::string> values;
        values.reserve(kv.second.size());
        for (const auto& v : kv.second) {
            values.push_back(toUtf8(v));
        }
        r.snapshot.fields.emplace(toUtf8(kv.first), std::move(values));
    }
    if (const TagLib::AudioProperties* ap = f.audioProperties()) {
        r.snapshot.audio.durationMs = ap->lengthInMilliseconds();
        r.snapshot.audio.bitrateKbps = ap->bitrate();
        r.snapshot.audio.sampleRateHz = ap->sampleRate();
        r.snapshot.audio.channels = ap->channels();
    }
    r.snapshot.hasCoverArt = f.complexPropertyKeys().contains("PICTURE");
    r.err = ErrorCode::Ok;
    return r;
}

CoverResult readPrimaryCover(int fd) {
    CoverResult r;
    FdGuard guard(fd);
    TagLib::FileStream stream(fd, /*openReadOnly*/ true);
    if (!stream.isOpen()) {
        r.err = ErrorCode::NotOpen;
        return r;
    }
    guard.release();
    TagLib::FileRef f(&stream, /*readAudioProperties*/ false);
    if (f.isNull()) {
        r.err = ErrorCode::Unsupported;
        return r;
    }
    const TagLib::List<TagLib::VariantMap> pics = f.complexProperties("PICTURE");
    if (pics.isEmpty()) {
        r.err = ErrorCode::Ok;  // present=false
        return r;
    }
    const TagLib::VariantMap* chosen = &pics.front();
    for (const auto& pic : pics) {
        if (pic.value("pictureType").toString() == "Front Cover") {
            chosen = &pic;
            break;
        }
    }
    r.present = fillCover(*chosen, r.cover);
    r.err = ErrorCode::Ok;
    return r;
}

ErrorCode writeTags(int fd,
                    const std::map<std::string, std::vector<std::string>>& setFields,
                    const std::vector<std::string>& removeFields,
                    CoverOp coverOp,
                    const uint8_t* cover, std::size_t coverLen, const char* coverMime) {
    FdGuard guard(fd);

    // 入参校验（fd 由 guard 兜底关闭）
    if (coverOp == CoverOp::Replace) {
        if (cover == nullptr || coverLen == 0 ||
            coverLen > std::numeric_limits<unsigned int>::max()) {
            return ErrorCode::InvalidArg;
        }
    } else if (coverOp != CoverOp::Unchanged && coverOp != CoverOp::Remove) {
        return ErrorCode::InvalidArg;
    }

    const bool hasTextPatch = !setFields.empty() || !removeFields.empty();
    const bool hasCoverPatch = coverOp != CoverOp::Unchanged;
    if (!hasTextPatch && !hasCoverPatch) {
        return ErrorCode::Ok;  // 空操作：不打开、不重写
    }

    TagLib::FileStream stream(fd, /*openReadOnly*/ false);
    if (!stream.isOpen()) {
        return ErrorCode::NotOpen;
    }
    guard.release();
    TagLib::FileRef f(&stream, /*readAudioProperties*/ false);
    if (f.isNull()) {
        return ErrorCode::Unsupported;
    }

    bool rejected = false;

    if (hasTextPatch) {
        TagLib::PropertyMap props = f.properties();
        for (const auto& key : removeFields) {
            props.erase(fromUtf8(key));
        }
        for (const auto& kv : setFields) {
            TagLib::StringList list;
            for (const auto& v : kv.second) {
                list.append(fromUtf8(v));
            }
            props.replace(fromUtf8(kv.first), list);
        }
        const TagLib::PropertyMap unsupported = f.setProperties(props);
        if (!unsupported.isEmpty()) {
            rejected = true;
        }
    }

    if (coverOp == CoverOp::Remove) {
        if (!f.setComplexProperties("PICTURE", TagLib::List<TagLib::VariantMap>())) {
            rejected = true;
        }
    } else if (coverOp == CoverOp::Replace) {
        TagLib::VariantMap pic;
        pic.insert("data",
                   TagLib::Variant(TagLib::ByteVector(
                       reinterpret_cast<const char*>(cover),
                       static_cast<unsigned int>(coverLen))));
        pic.insert("mimeType", TagLib::Variant(fromUtf8(coverMime ? coverMime : "")));
        pic.insert("pictureType", TagLib::Variant(TagLib::String("Front Cover")));
        TagLib::List<TagLib::VariantMap> pics;
        pics.append(pic);
        if (!f.setComplexProperties("PICTURE", pics)) {
            rejected = true;
        }
    }

    if (!f.save()) {
        return ErrorCode::Io;
    }
    return rejected ? ErrorCode::FieldsRejected : ErrorCode::Ok;
}

}  // namespace musicfree::tags
