import React, {useEffect, useState} from 'react';
import FastImage, {FastImageProps} from 'react-native-fast-image';

interface IFastImageProps {
    style: FastImageProps['style'];
    defaultSource?: FastImageProps['defaultSource'];
    emptySrc?: number;
    uri?: string;
}
export default function (props: IFastImageProps) {
    const {style, emptySrc, uri, defaultSource} = props ?? {};
    const [isError, setIsError] = useState(false);
    const source = uri
        ? {
              uri,
          }
        : emptySrc;

    useEffect(() => {
        setIsError(false);
    }, [uri]);
    return (
        <FastImage
            style={style}
            source={isError ? emptySrc : source}
            onError={() => {
                setIsError(true);
            }}
            defaultSource={defaultSource}
        />
    );
}
