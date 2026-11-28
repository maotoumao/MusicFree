/** 静态图片资源（png/jpg/jpeg）经 metro 导入为 RN asset 号，供 Image source 用 */
declare module '*.png' {
    const value: number;
    export default value;
}
declare module '*.jpg' {
    const value: number;
    export default value;
}
declare module '*.jpeg' {
    const value: number;
    export default value;
}
