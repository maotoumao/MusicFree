import MusicContent from './musicContent';

const content: Record<IArtist.ArtistMediaType, (...args: any) => JSX.Element> =
  {
    music: MusicContent,
    album: MusicContent,
  } as const;

export default content;
