import AlbumContentItem from "./albumContentItem";
import MusicContentItem from "./musicContentItem";

const content: Record<IArtist.ArtistMediaType, (...args: any) => JSX.Element> =
    {
        music: MusicContentItem,
        album: AlbumContentItem,
    } as const;

export default content;
