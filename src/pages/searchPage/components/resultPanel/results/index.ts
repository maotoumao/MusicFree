import React from 'react';
import AlbumResults from './albumResults';
import MusicResults from './musicResults';

const results: Array<{
    key: ICommon.SupportMediaType,
    title: string,
    component: React.FC<any>
}> = [
  {
    key: 'music',
    title: '单曲',
    component: MusicResults,
  },
  {
    key: 'album',
    title: '专辑',
    component: AlbumResults,
  },
];

const renderMap: Partial<Record<ICommon.SupportMediaType, React.FC<any>>> = {};
results.forEach(_ => (renderMap[_.key] = _.component));

export default results;
export {renderMap};

