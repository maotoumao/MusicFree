declare namespace IArtist {
  export interface IArtistItem {
    name: string;
    id: string;
    fans?: number;
    description?: string;
    platform?: string;
    avatar: string;
    worksNum: number;
    [k: string]: any;
  }
}
