# audiotags 的 JNI 契约：taglib_jni.cpp 里硬编码了下列类名 / 方法名 / 构造器签名，
# R8 改名或裁剪会导致 native 链接失败（UnsatisfiedLinkError）或载荷对象反向构造失败，读写 tag 直接失效。
# 放在 consumer 规则里，随 AAR 传递给任何接入方

# native 方法的符号名是 Java_<包>_<类>_<方法>，类名与方法名都必须原样保留
-keepclasseswithmembernames,includedescriptorclasses class fun.upup.musicfree.audiotags.TagLibNative {
    native <methods>;
}

# C++ 侧 FindClass + GetMethodID("<init>") 反向构造的结果类。
# NativeTagResult / CoverReadResult 的构造器描述符里内嵌了 AudioProps / CoverBytes 的类名，
# 所以这两个载荷类同样不能改名
-keep class fun.upup.musicfree.audiotags.AudioProps {
    <init>(...);
}
-keep class fun.upup.musicfree.audiotags.NativeTagResult {
    <init>(...);
}
-keep class fun.upup.musicfree.audiotags.CoverBytes {
    <init>(...);
}
-keep class fun.upup.musicfree.audiotags.CoverReadResult {
    <init>(...);
}
