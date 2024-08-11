declare namespace IMedia {
    export interface ICommentItem {
        id?: string;
        // 用户名
        nickName: string;
        // 头像
        avatar?: string;
        // 评论内容
        comment: string;
        // 点赞数
        like?: number;
        // 评论时间
        createAt?: number;
        // 地址
        location?: string;
    }

    export interface IComment extends ICommentItem {
        // 回复
        replies?: IComment[];
    }
}
