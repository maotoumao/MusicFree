#include <jni.h>
#include <unistd.h>

#include <cstdint>
#include <map>
#include <string>
#include <vector>

#include "TagEngine.h"

namespace mt = musicfree::tags;

// wire 整数值须与 C++ enum 序号一致（一侧改动即触发编译期报错）
static_assert(static_cast<int>(mt::ErrorCode::Ok) == 0, "ErrorCode wire drift");
static_assert(static_cast<int>(mt::ErrorCode::Io) == 4, "ErrorCode wire drift");
static_assert(static_cast<int>(mt::ErrorCode::InvalidArg) == 5, "ErrorCode wire drift");
static_assert(static_cast<int>(mt::CoverOp::Unchanged) == 0, "CoverOp wire drift");
static_assert(static_cast<int>(mt::CoverOp::Replace) == 2, "CoverOp wire drift");

namespace {

constexpr jint kErrIo = static_cast<jint>(mt::ErrorCode::Io);

// —— UTF-8 ↔ UTF-16：绕开 JNI modified UTF-8 对 4 字节字符（emoji）与嵌入 NUL 的坑 ——
// 非法序列以 U+FFFD 替换，绝不产生非法输入让 CheckJNI abort 或让 TagLib 抛异常
std::u16string utf8ToUtf16(const std::string& s) {
    std::u16string out;
    out.reserve(s.size());
    size_t i = 0;
    const size_t n = s.size();
    while (i < n) {
        const auto c = static_cast<uint8_t>(s[i]);
        uint32_t cp;
        int len;
        if (c < 0x80) {
            cp = c;
            len = 1;
        } else if ((c >> 5) == 0x6) {
            cp = c & 0x1Fu;
            len = 2;
        } else if ((c >> 4) == 0xE) {
            cp = c & 0x0Fu;
            len = 3;
        } else if ((c >> 3) == 0x1E) {
            cp = c & 0x07u;
            len = 4;
        } else {
            out.push_back(0xFFFD);
            ++i;
            continue;
        }
        if (i + static_cast<size_t>(len) > n) {
            out.push_back(0xFFFD);
            break;
        }
        bool ok = true;
        for (int k = 1; k < len; ++k) {
            const auto cc = static_cast<uint8_t>(s[i + k]);
            if ((cc >> 6) != 0x2) {
                ok = false;
                break;
            }
            cp = (cp << 6) | (cc & 0x3Fu);
        }
        if (!ok) {
            out.push_back(0xFFFD);
            ++i;
            continue;
        }
        i += static_cast<size_t>(len);
        if (cp > 0x10FFFF || (cp >= 0xD800 && cp <= 0xDFFF)) {
            out.push_back(0xFFFD);
            continue;
        }
        if (cp <= 0xFFFF) {
            out.push_back(static_cast<char16_t>(cp));
        } else {
            cp -= 0x10000;
            out.push_back(static_cast<char16_t>(0xD800 + (cp >> 10)));
            out.push_back(static_cast<char16_t>(0xDC00 + (cp & 0x3FF)));
        }
    }
    return out;
}

std::string utf16ToUtf8(const jchar* u, jsize len) {
    std::string out;
    out.reserve(static_cast<size_t>(len));
    for (jsize i = 0; i < len; ++i) {
        uint32_t cp = u[i];
        if (cp >= 0xD800 && cp <= 0xDBFF && i + 1 < len) {
            const uint32_t lo = u[i + 1];
            if (lo >= 0xDC00 && lo <= 0xDFFF) {
                cp = 0x10000 + ((cp - 0xD800) << 10) + (lo - 0xDC00);
                ++i;
            }
        }
        if (cp < 0x80) {
            out.push_back(static_cast<char>(cp));
        } else if (cp < 0x800) {
            out.push_back(static_cast<char>(0xC0 | (cp >> 6)));
            out.push_back(static_cast<char>(0x80 | (cp & 0x3F)));
        } else if (cp < 0x10000) {
            out.push_back(static_cast<char>(0xE0 | (cp >> 12)));
            out.push_back(static_cast<char>(0x80 | ((cp >> 6) & 0x3F)));
            out.push_back(static_cast<char>(0x80 | (cp & 0x3F)));
        } else {
            out.push_back(static_cast<char>(0xF0 | (cp >> 18)));
            out.push_back(static_cast<char>(0x80 | ((cp >> 12) & 0x3F)));
            out.push_back(static_cast<char>(0x80 | ((cp >> 6) & 0x3F)));
            out.push_back(static_cast<char>(0x80 | (cp & 0x3F)));
        }
    }
    return out;
}

jstring toJString(JNIEnv* env, const std::string& s) {
    const std::u16string u16 = utf8ToUtf16(s);
    return env->NewString(reinterpret_cast<const jchar*>(u16.data()),
                          static_cast<jsize>(u16.size()));
}

std::string toStdString(JNIEnv* env, jstring s) {
    if (s == nullptr) {
        return {};
    }
    const jsize len = env->GetStringLength(s);
    const jchar* chars = env->GetStringChars(s, nullptr);
    if (chars == nullptr) {
        return {};
    }
    std::string r = utf16ToUtf8(chars, len);
    env->ReleaseStringChars(s, chars);
    return r;
}

// JNI 侧 fd 兜底：C++ 引擎接管前若抛异常/早返回则关闭 fd（引擎接管后 release）
class JniFdGuard {
public:
    explicit JniFdGuard(int fd) : fd_(fd) {}
    ~JniFdGuard() {
        if (fd_ >= 0) {
            ::close(fd_);
        }
    }
    void release() { fd_ = -1; }
    JniFdGuard(const JniFdGuard&) = delete;
    JniFdGuard& operator=(const JniFdGuard&) = delete;

private:
    int fd_;
};

jobjectArray makeStringArray(JNIEnv* env, jclass strCls, const std::vector<std::string>& v) {
    jobjectArray arr = env->NewObjectArray(static_cast<jsize>(v.size()), strCls, nullptr);
    if (arr == nullptr) {
        return nullptr;
    }
    for (jsize i = 0; i < static_cast<jsize>(v.size()); ++i) {
        jstring js = toJString(env, v[i]);
        env->SetObjectArrayElement(arr, i, js);
        env->DeleteLocalRef(js);
    }
    return arr;
}

}  // namespace

extern "C" {

JNIEXPORT jobject JNICALL
Java_fun_upup_musicfree_audiotags_TagLibNative_nativeReadTags(JNIEnv* env, jobject /*thiz*/, jint fd) {
    mt::ReadResult r;
    try {
        r = mt::readTags(static_cast<int>(fd));  // 无论成败，C++ 内 FileStream 析构关闭 fd
    } catch (...) {
        return nullptr;  // fd 已由 FileStream 析构在异常展开中关闭
    }
    try {
        jclass strCls = env->FindClass("java/lang/String");
        jclass strArrCls = env->FindClass("[Ljava/lang/String;");
        jclass apCls = env->FindClass("fun/upup/musicfree/audiotags/AudioProps");
        jclass resCls = env->FindClass("fun/upup/musicfree/audiotags/NativeTagResult");
        if (!strCls || !strArrCls || !apCls || !resCls) {
            env->ExceptionClear();
            return nullptr;
        }
        jmethodID apCtor = env->GetMethodID(apCls, "<init>", "(JJJI)V");
        jmethodID resCtor = env->GetMethodID(
            resCls, "<init>",
            "(I[Ljava/lang/String;[[Ljava/lang/String;Lfun/upup/musicfree/audiotags/AudioProps;Z)V");
        if (!apCtor || !resCtor) {
            env->ExceptionClear();
            return nullptr;
        }

        const auto count = static_cast<jsize>(r.snapshot.fields.size());
        jobjectArray keys = env->NewObjectArray(count, strCls, nullptr);
        jobjectArray values = env->NewObjectArray(count, strArrCls, nullptr);
        if (!keys || !values) {
            env->ExceptionClear();
            return nullptr;
        }
        jsize i = 0;
        for (const auto& kv : r.snapshot.fields) {
            jstring k = toJString(env, kv.first);
            env->SetObjectArrayElement(keys, i, k);
            env->DeleteLocalRef(k);
            jobjectArray vArr = makeStringArray(env, strCls, kv.second);
            env->SetObjectArrayElement(values, i, vArr);
            env->DeleteLocalRef(vArr);
            ++i;
        }

        jobject ap = env->NewObject(apCls, apCtor,
                                    static_cast<jlong>(r.snapshot.audio.durationMs),
                                    static_cast<jlong>(r.snapshot.audio.bitrateKbps),
                                    static_cast<jlong>(r.snapshot.audio.sampleRateHz),
                                    static_cast<jint>(r.snapshot.audio.channels));
        jobject result = env->NewObject(resCls, resCtor,
                                        static_cast<jint>(r.err), keys, values, ap,
                                        static_cast<jboolean>(r.snapshot.hasCoverArt));
        if (env->ExceptionCheck()) {
            env->ExceptionClear();
            return nullptr;
        }
        return result;
    } catch (...) {
        if (env->ExceptionCheck()) {
            env->ExceptionClear();
        }
        return nullptr;
    }
}

JNIEXPORT jobject JNICALL
Java_fun_upup_musicfree_audiotags_TagLibNative_nativeReadPrimaryCover(
    JNIEnv* env, jobject /*thiz*/, jint fd) {
    mt::CoverResult r;
    try {
        r = mt::readPrimaryCover(static_cast<int>(fd));  // 无论成败 C++ 关闭 fd
    } catch (...) {
        return nullptr;  // Kotlin 侧把 null 视作 Io
    }
    try {
        jclass crCls = env->FindClass("fun/upup/musicfree/audiotags/CoverReadResult");
        if (!crCls) {
            env->ExceptionClear();
            return nullptr;
        }
        jmethodID crCtor = env->GetMethodID(
            crCls, "<init>", "(ILfun/upup/musicfree/audiotags/CoverBytes;)V");
        if (!crCtor) {
            env->ExceptionClear();
            return nullptr;
        }

        jobject coverObj = nullptr;
        if (r.err == mt::ErrorCode::Ok && r.present) {
            jclass cbCls = env->FindClass("fun/upup/musicfree/audiotags/CoverBytes");
            jmethodID cbCtor =
                cbCls ? env->GetMethodID(cbCls, "<init>",
                                         "([BLjava/lang/String;Ljava/lang/String;)V")
                      : nullptr;
            if (!cbCls || !cbCtor) {
                env->ExceptionClear();
                return nullptr;
            }
            jbyteArray data = env->NewByteArray(static_cast<jsize>(r.cover.data.size()));
            if (!data) {
                env->ExceptionClear();
                return nullptr;
            }
            env->SetByteArrayRegion(data, 0, static_cast<jsize>(r.cover.data.size()),
                                    reinterpret_cast<const jbyte*>(r.cover.data.data()));
            jstring mime = toJString(env, r.cover.mime);
            jstring desc = toJString(env, r.cover.description);
            coverObj = env->NewObject(cbCls, cbCtor, data, mime, desc);
            env->DeleteLocalRef(data);
            env->DeleteLocalRef(mime);
            env->DeleteLocalRef(desc);
        }

        jobject result = env->NewObject(crCls, crCtor, static_cast<jint>(r.err), coverObj);
        if (env->ExceptionCheck()) {
            env->ExceptionClear();
            return nullptr;
        }
        return result;
    } catch (...) {
        if (env->ExceptionCheck()) {
            env->ExceptionClear();
        }
        return nullptr;
    }
}

JNIEXPORT jint JNICALL
Java_fun_upup_musicfree_audiotags_TagLibNative_nativeWriteTags(
    JNIEnv* env, jobject /*thiz*/, jint fd,
    jobjectArray setKeys, jobjectArray setValues, jobjectArray removeFields,
    jint coverOp, jbyteArray cover, jstring coverMime) {
    JniFdGuard guard(static_cast<int>(fd));
    try {
        std::map<std::string, std::vector<std::string>> setFields;
        const jsize nk = setKeys ? env->GetArrayLength(setKeys) : 0;
        const jsize nvk = setValues ? env->GetArrayLength(setValues) : 0;
        if (nk != nvk) {
            return static_cast<jint>(mt::ErrorCode::InvalidArg);  // guard 关闭 fd
        }
        for (jsize i = 0; i < nk; ++i) {
            auto k = static_cast<jstring>(env->GetObjectArrayElement(setKeys, i));
            auto vArr = static_cast<jobjectArray>(env->GetObjectArrayElement(setValues, i));
            std::vector<std::string> vals;
            const jsize nv = vArr ? env->GetArrayLength(vArr) : 0;
            vals.reserve(static_cast<size_t>(nv));
            for (jsize j = 0; j < nv; ++j) {
                auto v = static_cast<jstring>(env->GetObjectArrayElement(vArr, j));
                vals.push_back(toStdString(env, v));
                if (v) {
                    env->DeleteLocalRef(v);
                }
            }
            setFields.emplace(toStdString(env, k), std::move(vals));
            if (k) {
                env->DeleteLocalRef(k);
            }
            if (vArr) {
                env->DeleteLocalRef(vArr);
            }
        }

        std::vector<std::string> removeVec;
        const jsize nr = removeFields ? env->GetArrayLength(removeFields) : 0;
        removeVec.reserve(static_cast<size_t>(nr));
        for (jsize i = 0; i < nr; ++i) {
            auto rk = static_cast<jstring>(env->GetObjectArrayElement(removeFields, i));
            removeVec.push_back(toStdString(env, rk));
            if (rk) {
                env->DeleteLocalRef(rk);
            }
        }

        std::vector<uint8_t> coverBuf;
        const uint8_t* coverPtr = nullptr;
        size_t coverLen = 0;
        if (cover != nullptr) {
            const jsize cl = env->GetArrayLength(cover);
            coverBuf.resize(static_cast<size_t>(cl));
            if (cl > 0) {
                env->GetByteArrayRegion(cover, 0, cl, reinterpret_cast<jbyte*>(coverBuf.data()));
            }
            coverPtr = coverBuf.data();
            coverLen = static_cast<size_t>(cl);
        }
        const std::string mimeStr = toStdString(env, coverMime);
        const char* mimePtr = (coverMime != nullptr) ? mimeStr.c_str() : nullptr;

        guard.release();  // fd 交由 C++ 引擎接管（其内部 FdGuard 负责关闭）
        const mt::ErrorCode err = mt::writeTags(static_cast<int>(fd), setFields, removeVec,
                                                static_cast<mt::CoverOp>(coverOp),
                                                coverPtr, coverLen, mimePtr);
        return static_cast<jint>(err);
    } catch (...) {
        return kErrIo;  // guard 关闭 fd
    }
}

}  // extern "C"
